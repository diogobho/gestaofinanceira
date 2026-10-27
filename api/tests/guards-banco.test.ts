/**
 * Cenário 4 (grupo) e as demais garantias que só o BANCO pode dar: o claim atômico,
 * o reaper por evidência e o espaçamento que ignora conversa manual.
 *
 * Roda contra o banco configurado em DATABASE_URL, sempre dentro de uma transação
 * revertida no final — nenhuma linha sobrevive ao teste. Se não houver banco
 * alcançável, a suíte é pulada em vez de falhar (a máquina de CI pode não ter um).
 */

import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Pool, PoolClient } from 'pg';
import * as dotenv from 'dotenv';
import {
  SQL_EVIDENCIA_ENVIO_FOLLOWUP, JANELA_EVIDENCIA_MS,
} from '../src/modules/crm/followups/followups.service';

dotenv.config();

let pool: Pool | null = null;
let c: PoolClient | null = null;
let temBanco = false;

// Fixtures criadas dentro da transação.
let empresaId: number, usuarioId: number, funilId: number, estagioId: number;
let leadId: number, contatoId: number;

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

  // Reaproveita uma empresa/usuário/funil reais para não brigar com FKs e CHECKs.
  const base = await c!.query(
    `SELECT l.id AS lead_id, l.empresa_id, l.estagio_id, l.funil_id,
            COALESCE(l.responsavel_id, l.usuario_id) AS usuario_id
       FROM leads l
      WHERE l.arquivado = false AND l.estagio_id IS NOT NULL
      LIMIT 1`
  );
  const b = base.rows[0];
  empresaId = b.empresa_id; usuarioId = b.usuario_id;
  funilId = b.funil_id; estagioId = b.estagio_id; leadId = b.lead_id;

  const ct = await c!.query(
    `INSERT INTO contatos_whatsapp (empresa_id, usuario_id, numero, whatsapp_id, nome)
     VALUES ($1, $2, '5511900000000', '5511900000000@c.us', 'Teste Guards')
     RETURNING id`,
    [empresaId, usuarioId]
  );
  contatoId = ct.rows[0].id;
});

after(async () => {
  if (c) { await c.query('ROLLBACK'); c.release(); }
  if (pool) await pool.end();
});

/**
 * Isolamento por teste. Todos compartilham as mesmas fixtures (lead, contato) dentro
 * de UMA transação, então o que um teste escreve em `historico_mensagens` é visível
 * ao próximo. Nos testes do reaper isso é fatal: a saída 'followup' inserida por um
 * cenário cai dentro da janela de evidência do cenário seguinte e o predicado acha
 * prova que não é dele. SAVEPOINT por teste devolve o banco ao estado das fixtures.
 */
beforeEach(async () => {
  if (temBanco) await c!.query('SAVEPOINT teste_atual');
});

afterEach(async () => {
  if (temBanco) await c!.query('ROLLBACK TO SAVEPOINT teste_atual');
});

const pular = () => !temBanco;

async function criarFollowup(over: Record<string, any> = {}): Promise<number> {
  const r = await c!.query(
    `INSERT INTO followups_agendados
       (lead_id, usuario_id, empresa_id, agendado_para, tipo, mensagem, origem, status)
     VALUES ($1, $2, $3, COALESCE($4, NOW() - INTERVAL '1 minute'), 'manual', 'oi', 'estagio',
             COALESCE($5, 'pendente'))
     RETURNING id`,
    [leadId, usuarioId, empresaId, over.agendado_para ?? null, over.status ?? null]
  );
  return r.rows[0].id;
}

/** O UPDATE condicional que dá exclusão mútua ao claim. */
async function reclamar(id: number): Promise<boolean> {
  const r = await c!.query(
    `UPDATE followups_agendados SET status='processando', claim_at=NOW(), updated_at=NOW()
      WHERE id=$1 AND status='pendente'`, [id]);
  return (r.rowCount ?? 0) > 0;
}

/** Grava uma saída no histórico do lead/contato de teste, com a origem informada. */
async function inserirSaida(conteudo: string, origem: string): Promise<void> {
  await c!.query(
    `INSERT INTO historico_mensagens
       (lead_id, contato_whatsapp_id, usuario_id, empresa_id, direcao, tipo, conteudo, origem, enviado_at, created_at)
     VALUES ($1,$2,$3,$4,'saida','texto',$5,$6,NOW(),NOW())`,
    [leadId, contatoId, usuarioId, empresaId, conteudo, origem]
  );
}

/**
 * Roda o MESMO predicado de evidência que o reaper usa, importado do service.
 * Reimplementar a condição aqui é o que deixaria o teste verde sobre a regra errada.
 */
async function temEvidencia(followupId: number): Promise<boolean> {
  const o = await c!.query(
    `SELECT f.lead_id, f.claim_at, l.contato_whatsapp_id
       FROM followups_agendados f JOIN leads l ON l.id = f.lead_id
      WHERE f.id = $1 AND f.status = 'processando'`, [followupId]);
  assert.equal(o.rows.length, 1, 'o follow-up precisa estar reclamado para o reaper avaliá-lo');
  const r = await c!.query(SQL_EVIDENCIA_ENVIO_FOLLOWUP,
    [o.rows[0].lead_id, o.rows[0].contato_whatsapp_id ?? contatoId,
     o.rows[0].claim_at, String(JANELA_EVIDENCIA_MS)]);
  return r.rows.length > 0;
}

describe('Cenário 4 — mensagem de grupo não controla o follow-up', () => {
  test('o guard de conversa viva ignora mensagem de grupo', async (t) => {
    if (pular()) return t.skip('sem banco alcançável');

    // Uma mensagem de grupo, recém-chegada, do MESMO contato.
    await c!.query(
      `INSERT INTO historico_mensagens
         (lead_id, contato_whatsapp_id, usuario_id, empresa_id, direcao, tipo, conteudo,
          grupo_whatsapp_id, grupo_nome, origem, enviado_at, created_at)
       VALUES ($1,$2,$3,$4,'entrada','texto','oi pessoal','1203@g.us','Grupo X','recebida',NOW(),NOW())`,
      [leadId, contatoId, usuarioId, empresaId]
    );

    const guard = await c!.query(
      `SELECT 1 FROM historico_mensagens
        WHERE (lead_id = $1 OR ($2::int IS NOT NULL AND contato_whatsapp_id = $2))
          AND direcao = 'entrada'
          AND grupo_whatsapp_id IS NULL
          AND created_at > NOW() - INTERVAL '60 minutes'
        LIMIT 1`,
      [leadId, contatoId]
    );
    assert.equal(guard.rows.length, 0, 'grupo não conta como conversa viva');
  });

  test('a mesma mensagem no privado BLOQUEIA (o guard não está simplesmente quebrado)', async (t) => {
    if (pular()) return t.skip('sem banco alcançável');

    await c!.query(
      `INSERT INTO historico_mensagens
         (lead_id, contato_whatsapp_id, usuario_id, empresa_id, direcao, tipo, conteudo,
          origem, enviado_at, created_at)
       VALUES ($1,$2,$3,$4,'entrada','texto','oi','recebida',NOW(),NOW())`,
      [leadId, contatoId, usuarioId, empresaId]
    );

    const guard = await c!.query(
      `SELECT 1 FROM historico_mensagens
        WHERE (lead_id = $1 OR ($2::int IS NOT NULL AND contato_whatsapp_id = $2))
          AND direcao = 'entrada' AND grupo_whatsapp_id IS NULL
          AND created_at > NOW() - INTERVAL '60 minutes'
        LIMIT 1`,
      [leadId, contatoId]
    );
    assert.equal(guard.rows.length, 1, 'conversa 1:1 recente adia o follow-up, como deve');
  });
});

describe('Anti-ban: conversa manual não segura a automação', () => {
  test('o espaçamento por chip só enxerga mensagem automática', async (t) => {
    if (pular()) return t.skip('sem banco alcançável');

    // Operador conversando agora (manual) + uma automação de 40 min atrás.
    await c!.query(
      `INSERT INTO historico_mensagens
         (lead_id, contato_whatsapp_id, usuario_id, empresa_id, direcao, tipo, conteudo, origem, enviado_at, created_at)
       VALUES ($1,$2,$3,$4,'saida','texto','resposta do operador','manual',NOW(),NOW()),
              ($1,$2,$3,$4,'saida','texto','follow-up antigo','followup',
               NOW() - INTERVAL '40 minutes', NOW() - INTERVAL '40 minutes')`,
      [leadId, contatoId, usuarioId, empresaId]
    );

    const r = await c!.query(
      `SELECT MAX(enviado_at) AS ultimo
         FROM historico_mensagens
        WHERE direcao='saida' AND erro IS NULL
          AND origem IS NOT NULL AND origem <> 'manual'
          AND usuario_id = $1
          AND enviado_at > NOW() - INTERVAL '1 hour'`,
      [usuarioId]
    );
    const ultimo = new Date(r.rows[0].ultimo).getTime();
    const minutosAtras = (Date.now() - ultimo) / 60000;
    assert.ok(minutosAtras > 30,
      `o último AUTOMÁTICO é o de 40min atrás (veio ${minutosAtras.toFixed(0)}min) — a mensagem manual de agora não conta`);
  });
});

describe('Claim atômico e reaper', () => {
  test('dois claims concorrentes: só um vence', async (t) => {
    if (pular()) return t.skip('sem banco alcançável');
    const id = await criarFollowup();
    const primeiro = await reclamar(id);
    const segundo = await reclamar(id);
    assert.equal(primeiro, true);
    assert.equal(segundo, false, 'o segundo ciclo não pega o mesmo registro');
  });

  test('registro cancelado não pode ser reclamado', async (t) => {
    if (pular()) return t.skip('sem banco alcançável');
    const id = await criarFollowup({ status: 'cancelado' });
    assert.equal(await reclamar(id), false);
  });

  test('reaper fecha como ENVIADO quando há evidência no histórico', async (t) => {
    if (pular()) return t.skip('sem banco alcançável');
    const id = await criarFollowup();
    await reclamar(id);
    // A mensagem saiu logo depois do claim — o processo morreu antes de marcar.
    await inserirSaida('follow-up que saiu', 'followup');

    assert.equal(await temEvidencia(id), true,
      'há evidência: o reaper marca enviado em vez de mandar de novo');
  });

  test('sem evidência, o reaper devolve à fila', async (t) => {
    if (pular()) return t.skip('sem banco alcançável');
    const id = await criarFollowup();
    await reclamar(id);
    assert.equal(await temEvidencia(id), false);

    await c!.query(
      `UPDATE followups_agendados SET status='pendente', claim_at=NULL WHERE id=$1 AND status='processando'`, [id]);
    const dep = await c!.query(`SELECT status FROM followups_agendados WHERE id=$1`, [id]);
    assert.equal(dep.rows[0].status, 'pendente', 'volta para a fila, sem duplicar');
  });

  // ── Cenário obrigatório: mensagem MANUAL não é prova de envio ──────────────
  // 1. follow-up em 'processando'; 2. processo morre; 3. o operador responde no card
  // depois do claim; 4. reaper roda. Ele NÃO pode concluir que o follow-up saiu.
  // Antes disso o predicado aceitava qualquer saída sem erro e o follow-up ficava
  // 'enviado' sem nunca ter saído — o lead não recebia nada e ninguém via.
  test('mensagem MANUAL do operador depois do claim NÃO é evidência', async (t) => {
    if (pular()) return t.skip('sem banco alcançável');
    const id = await criarFollowup();
    await reclamar(id);
    await inserirSaida('respondi eu mesmo aqui no card', 'manual');

    assert.equal(await temEvidencia(id), false,
      'manual não prova envio de follow-up: o registro tem de voltar para a fila');
  });

  test('agente reativo, disparo e lembrete também não são evidência', async (t) => {
    if (pular()) return t.skip('sem banco alcançável');
    for (const origem of ['agente_ia', 'disparo', 'lembrete']) {
      const id = await criarFollowup();
      await reclamar(id);
      await inserirSaida(`saida de ${origem}`, origem);
      assert.equal(await temEvidencia(id), false,
        `origem '${origem}' não pode ser lida como envio deste follow-up`);
    }
  });

  // Um passo POSTERIOR da cadência sai normalmente enquanto o anterior está órfão
  // (órfão está em 'processando', não em 'pendente'). Sem teto de tempo, o envio
  // dele virava prova do passo órfão.
  test('envio de follow-up muito depois do claim não é evidência (janela fechada)', async (t) => {
    if (pular()) return t.skip('sem banco alcançável');
    const id = await criarFollowup();
    await reclamar(id);
    await c!.query(
      `INSERT INTO historico_mensagens
         (lead_id, contato_whatsapp_id, usuario_id, empresa_id, direcao, tipo, conteudo, origem, enviado_at, created_at)
       VALUES ($1,$2,$3,$4,'saida','texto','passo seguinte da cadência','followup',
               NOW() + INTERVAL '20 minutes', NOW())`,
      [leadId, contatoId, usuarioId, empresaId]
    );

    assert.equal(await temEvidencia(id), false,
      'fora da janela de evidência: é outra mensagem, não este follow-up');
  });

  test('saída com erro registrado não é evidência de envio', async (t) => {
    if (pular()) return t.skip('sem banco alcançável');
    const id = await criarFollowup();
    await reclamar(id);
    await c!.query(
      `INSERT INTO historico_mensagens
         (lead_id, contato_whatsapp_id, usuario_id, empresa_id, direcao, tipo, conteudo, origem, erro, enviado_at, created_at)
       VALUES ($1,$2,$3,$4,'saida','texto','tentativa que falhou','followup','422 sem conta',NOW(),NOW())`,
      [leadId, contatoId, usuarioId, empresaId]
    );

    assert.equal(await temEvidencia(id), false, 'balão de falha não é prova de entrega');
  });

  // ── Reagendamento manual (a tela de follow-up falhado) ────────────────────
  test('reagendar limpa erro E erro_categoria, e preserva tentativas', async (t) => {
    if (pular()) return t.skip('sem banco alcançável');
    const id = await criarFollowup();
    // Simula o estado real de um follow-up queimado pelo motor.
    await c!.query(
      `UPDATE followups_agendados
          SET status = 'falhou', erro = 'Canal de WhatsApp indisponível: chip BANIDO',
              erro_categoria = 'canal_bloqueado', tentativas = 3, claim_at = now()
        WHERE id = $1`, [id]);

    // Mesmo UPDATE de `followupsService.reagendar`.
    await c!.query(
      `UPDATE followups_agendados
          SET agendado_para = now() + INTERVAL '1 hour', status = 'pendente',
              erro = NULL, erro_categoria = NULL, claim_at = NULL, updated_at = NOW()
        WHERE id = $1 AND status IN ('falhou','cancelado')`, [id]);

    const r = await c!.query(
      `SELECT status, erro, erro_categoria, tentativas, claim_at
         FROM followups_agendados WHERE id = $1`, [id]);
    const f = r.rows[0];
    assert.equal(f.status, 'pendente');
    assert.equal(f.erro, null, 'a mensagem de erro anterior sai');
    assert.equal(f.erro_categoria, null,
      'a CATEGORIA também sai — antes ficava obsoleta num registro pendente');
    assert.equal(f.claim_at, null, 'claim de um ciclo morto não pode voltar para a fila');
    assert.equal(f.tentativas, 3,
      'tentativas NÃO zera: é o histórico que impede um registro problemático de circular para sempre');
  });

  test('reagendar não toca em follow-up pendente ou enviado', async (t) => {
    if (pular()) return t.skip('sem banco alcançável');
    for (const status of ['pendente', 'enviado', 'processando']) {
      const id = await criarFollowup();
      await c!.query(`UPDATE followups_agendados SET status = $2 WHERE id = $1`, [id, status]);
      const r = await c!.query(
        `UPDATE followups_agendados SET status = 'pendente', erro = NULL, erro_categoria = NULL
          WHERE id = $1 AND status IN ('falhou','cancelado')`, [id]);
      assert.equal(r.rowCount, 0, `status '${status}' não é reagendável`);
    }
  });

  test("o status 'processando' é aceito pela constraint", async (t) => {
    if (pular()) return t.skip('sem banco alcançável');
    const id = await criarFollowup();
    await c!.query(`UPDATE followups_agendados SET status='processando' WHERE id=$1`, [id]);
    const r = await c!.query(`SELECT status FROM followups_agendados WHERE id=$1`, [id]);
    assert.equal(r.rows[0].status, 'processando');
  });

  test('a fila não enxerga registros reclamados', async (t) => {
    if (pular()) return t.skip('sem banco alcançável');
    const id = await criarFollowup();
    await reclamar(id);
    const fila = await c!.query(
      `SELECT 1 FROM followups_agendados
        WHERE id = $1 AND status = 'pendente' AND agendado_para <= NOW()`, [id]);
    assert.equal(fila.rows.length, 0);
  });
});
