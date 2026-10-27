/**
 * Regras das fases 1, 4, 6 e 7 do suporte que só o BANCO garante.
 *
 * Transação revertida no fim, SAVEPOINT por teste — nenhuma linha sobrevive. Sem
 * banco alcançável, a suíte é pulada em vez de falhar.
 */

import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Pool, PoolClient } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

let pool: Pool | null = null;
let c: PoolClient | null = null;
let temBanco = false;
let empresaId: number, usuarioId: number, ticketId: number, outraEmpresaId: number;

before(async () => {
  try {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
    c = await pool.connect();
    await c.query('BEGIN');
    temBanco = true;
  } catch {
    temBanco = false;
    return;
  }

  const base = await c!.query(
    `SELECT id AS usuario_id, empresa_id FROM usuarios WHERE empresa_id IS NOT NULL LIMIT 1`
  );
  usuarioId = base.rows[0].usuario_id;
  empresaId = base.rows[0].empresa_id;

  const outra = await c!.query(`SELECT id FROM empresas WHERE id <> $1 LIMIT 1`, [empresaId]);
  outraEmpresaId = outra.rows[0].id;

  const t = await c!.query(
    `INSERT INTO tickets (empresa_id, usuario_id, assunto, categoria, prioridade, status)
     VALUES ($1,$2,'teste fases','duvida','normal','aguardando_suporte') RETURNING id`,
    [empresaId, usuarioId]
  );
  ticketId = t.rows[0].id;
});

after(async () => {
  if (c) { await c.query('ROLLBACK'); c.release(); }
  if (pool) await pool.end();
});

beforeEach(async () => { if (temBanco) await c!.query('SAVEPOINT t'); });
afterEach(async () => { if (temBanco) await c!.query('ROLLBACK TO SAVEPOINT t'); });

const pular = () => !temBanco;

async function inserirMensagem(tipo: string, visivel: boolean, conteudo = 'x'): Promise<number> {
  const r = await c!.query(
    `INSERT INTO ticket_mensagens (ticket_id, autor, usuario_id, conteudo, tipo, visivel_cliente)
     VALUES ($1,'suporte',$2,$3,$4,$5) RETURNING id`,
    [ticketId, usuarioId, conteudo, tipo, visivel]
  );
  return r.rows[0].id;
}

describe('Fase 1 — histórico tipado', () => {
  test('o padrão de uma mensagem é visível ao cliente', async (t) => {
    if (pular()) return t.skip('sem banco');
    const r = await c!.query(
      `INSERT INTO ticket_mensagens (ticket_id, autor, usuario_id, conteudo)
       VALUES ($1,'cliente',$2,'oi') RETURNING tipo, visivel_cliente`,
      [ticketId, usuarioId]
    );
    assert.equal(r.rows[0].tipo, 'mensagem');
    assert.equal(r.rows[0].visivel_cliente, true);
  });

  test('nota interna VISÍVEL é recusada pelo banco', async (t) => {
    if (pular()) return t.skip('sem banco');
    // A regra não pode depender de ninguém lembrar dela na próxima rota escrita.
    await assert.rejects(
      () => c!.query(
        `INSERT INTO ticket_mensagens (ticket_id, autor, usuario_id, conteudo, tipo, visivel_cliente)
         VALUES ($1,'suporte',$2,'segredo','nota_interna',true)`,
        [ticketId, usuarioId]
      ),
      /ticket_mensagens_nota_privada/
    );
  });

  test('tipo desconhecido é recusado', async (t) => {
    if (pular()) return t.skip('sem banco');
    await assert.rejects(
      () => c!.query(
        `INSERT INTO ticket_mensagens (ticket_id, autor, usuario_id, conteudo, tipo)
         VALUES ($1,'suporte',$2,'x','qualquer_coisa')`,
        [ticketId, usuarioId]
      ),
      /ticket_mensagens_tipo_check/
    );
  });

  test('a leitura do cliente esconde nota interna e evento interno', async (t) => {
    if (pular()) return t.skip('sem banco');
    await inserirMensagem('mensagem', true, 'visível');
    await inserirMensagem('nota_interna', false, 'nota da equipe');
    await inserirMensagem('evento', false, 'prioridade alterada');
    await inserirMensagem('evento', true, 'chamado resolvido');

    const cliente = await c!.query(
      `SELECT conteudo FROM ticket_mensagens
        WHERE ticket_id = $1 AND visivel_cliente = true ORDER BY id`, [ticketId]);
    const textos = cliente.rows.map((r: any) => r.conteudo);
    assert.ok(textos.includes('visível'));
    assert.ok(textos.includes('chamado resolvido'), 'evento marcado como visível aparece');
    assert.ok(!textos.includes('nota da equipe'), 'nota interna NUNCA chega ao cliente');
    assert.ok(!textos.includes('prioridade alterada'), 'evento interno também não');

    const equipe = await c!.query(
      `SELECT COUNT(*)::int AS n FROM ticket_mensagens WHERE ticket_id = $1`, [ticketId]);
    assert.equal(equipe.rows[0].n, 4, 'a equipe vê tudo');
  });
});

describe('Fase 4 — anexos', () => {
  async function inserirAnexo(mensagemId: number | null, empresa = empresaId): Promise<number> {
    const r = await c!.query(
      `INSERT INTO ticket_anexos
         (ticket_id, mensagem_id, empresa_id, usuario_id, caminho, nome_original, mimetype, tamanho_bytes)
       VALUES ($1,$2,$3,$4,$5,'print.png','image/png',1234) RETURNING id`,
      [ticketId, mensagemId, empresa, usuarioId, `/uploads/suporte/${empresa}/${Math.random()}.png`]
    );
    return r.rows[0].id;
  }

  test('anexo órfão (sem mensagem) é permitido — o upload vem depois da abertura', async (t) => {
    if (pular()) return t.skip('sem banco');
    const id = await inserirAnexo(null);
    const r = await c!.query(`SELECT mensagem_id FROM ticket_anexos WHERE id = $1`, [id]);
    assert.equal(r.rows[0].mensagem_id, null);
  });

  test('tamanho zero é recusado', async (t) => {
    if (pular()) return t.skip('sem banco');
    await assert.rejects(
      () => c!.query(
        `INSERT INTO ticket_anexos
           (ticket_id, empresa_id, usuario_id, caminho, nome_original, mimetype, tamanho_bytes)
         VALUES ($1,$2,$3,'/uploads/suporte/x/vazio.png','vazio.png','image/png',0)`,
        [ticketId, empresaId, usuarioId]
      ),
      /ticket_anexos_tamanho_positivo/
    );
  });

  test('caminho é único — dois anexos não podem apontar para o mesmo arquivo', async (t) => {
    if (pular()) return t.skip('sem banco');
    const caminho = '/uploads/suporte/1/mesmo-arquivo.png';
    await c!.query(
      `INSERT INTO ticket_anexos (ticket_id, empresa_id, usuario_id, caminho, nome_original, mimetype, tamanho_bytes)
       VALUES ($1,$2,$3,$4,'a.png','image/png',10)`, [ticketId, empresaId, usuarioId, caminho]);
    await assert.rejects(
      () => c!.query(
        `INSERT INTO ticket_anexos (ticket_id, empresa_id, usuario_id, caminho, nome_original, mimetype, tamanho_bytes)
         VALUES ($1,$2,$3,$4,'b.png','image/png',10)`, [ticketId, empresaId, usuarioId, caminho]),
      /idx_ticket_anexos_caminho/
    );
  });

  test('a autorização do download é pela empresa do TICKET, não pelo caminho', async (t) => {
    if (pular()) return t.skip('sem banco');
    const id = await inserirAnexo(null);
    // Mesma consulta que `getAnexoParaDownload` usa.
    const doDono = await c!.query(
      `SELECT 1 FROM ticket_anexos a JOIN tickets t ON t.id = a.ticket_id
        WHERE a.id = $1 AND t.empresa_id = $2`, [id, empresaId]);
    const deOutro = await c!.query(
      `SELECT 1 FROM ticket_anexos a JOIN tickets t ON t.id = a.ticket_id
        WHERE a.id = $1 AND t.empresa_id = $2`, [id, outraEmpresaId]);
    assert.equal(doDono.rows.length, 1, 'a empresa do chamado baixa');
    assert.equal(deOutro.rows.length, 0, 'outra empresa não');
  });

  test('apagar a mensagem leva o anexo dela (ON DELETE CASCADE)', async (t) => {
    if (pular()) return t.skip('sem banco');
    const msg = await inserirMensagem('mensagem', true);
    const anexo = await inserirAnexo(msg);
    await c!.query(`DELETE FROM ticket_mensagens WHERE id = $1`, [msg]);
    const r = await c!.query(`SELECT 1 FROM ticket_anexos WHERE id = $1`, [anexo]);
    assert.equal(r.rows.length, 0);
  });
});

describe('Fase 7 — métricas', () => {
  test('primeira_resposta_at é carimbada UMA vez', async (t) => {
    if (pular()) return t.skip('sem banco');
    const carimbar = () => c!.query(
      `UPDATE tickets SET primeira_resposta_at = now()
        WHERE id = $1 AND primeira_resposta_at IS NULL`, [ticketId]);

    await carimbar();
    const primeira = (await c!.query(`SELECT primeira_resposta_at FROM tickets WHERE id=$1`, [ticketId])).rows[0].primeira_resposta_at;
    assert.ok(primeira instanceof Date);

    await carimbar(); // segunda resposta da equipe
    const depois = (await c!.query(`SELECT primeira_resposta_at FROM tickets WHERE id=$1`, [ticketId])).rows[0].primeira_resposta_at;
    assert.equal(depois.getTime(), primeira.getTime(), 'a segunda resposta não reescreve a primeira');
  });

  test('a média ignora chamado sem resposta em vez de contá-lo como zero', async (t) => {
    if (pular()) return t.skip('sem banco');
    await c!.query(
      `UPDATE tickets SET primeira_resposta_at = created_at + INTERVAL '30 minutes' WHERE id = $1`,
      [ticketId]
    );
    await c!.query(
      `INSERT INTO tickets (empresa_id, usuario_id, assunto, status)
       VALUES ($1,$2,'sem resposta ainda','aguardando_suporte')`,
      [empresaId, usuarioId]
    );
    const r = await c!.query(
      `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (primeira_resposta_at - created_at))/60.0)
                    FILTER (WHERE primeira_resposta_at IS NOT NULL))::int AS media,
              COUNT(*) FILTER (WHERE primeira_resposta_at IS NULL
                                 AND status NOT IN ('resolvido','fechado'))::int AS sem_resposta
         FROM tickets WHERE id = $1 OR (empresa_id = $2 AND assunto = 'sem resposta ainda')`,
      [ticketId, empresaId]
    );
    assert.equal(r.rows[0].media, 30, 'a média é 30min, não 15min — o sem-resposta fica fora');
    assert.ok(r.rows[0].sem_resposta >= 1, 'e é contado à parte');
  });
});
