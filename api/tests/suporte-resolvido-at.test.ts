/**
 * `resolvido_at` acompanha o status do chamado — nunca sobra de um ciclo anterior.
 *
 * O bug apareceu na validação da fase 0 em produção (chamado #11): o chamado foi
 * resolvido às 23:20, o cliente respondeu, o status voltou para `aguardando_suporte`
 * e `resolvido_at` continuou preenchido. Só `alterarStatus` mexia na coluna; a
 * transição por mensagem nova (`adicionarMensagem`) e a devolução à fila
 * (`marcarParaEquipe`) atualizavam apenas `status`. Métrica de tempo-até-resolução
 * contaria chamado reaberto como resolvido.
 *
 * Roda contra o banco de `DATABASE_URL`, dentro de uma transação revertida no fim —
 * nenhuma linha sobrevive. Sem banco alcançável, a suíte é pulada em vez de falhar.
 *
 * Usa o SQL EXPORTADO do service (`SQL_STATUS_POR_MENSAGEM`) em vez de reescrever a
 * condição: cópia divergente daria teste verde sobre regra errada, que foi
 * exatamente como o reaper do follow-up passou batido.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool, PoolClient } from 'pg';
import * as dotenv from 'dotenv';
import { SQL_STATUS_POR_MENSAGEM } from '../src/modules/suporte/suporte.service';

dotenv.config();

let pool: Pool | null = null;
let c: PoolClient | null = null;
let temBanco = false;
let empresaId: number, usuarioId: number, ticketId: number;

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

  // Reaproveita uma empresa/usuário reais para não brigar com as FKs.
  const base = await c!.query(
    `SELECT id AS usuario_id, empresa_id FROM usuarios WHERE empresa_id IS NOT NULL LIMIT 1`
  );
  usuarioId = base.rows[0].usuario_id;
  empresaId = base.rows[0].empresa_id;

  const t = await c!.query(
    `INSERT INTO tickets (empresa_id, usuario_id, assunto, categoria, prioridade, status)
     VALUES ($1, $2, 'teste resolvido_at', 'duvida', 'normal', 'aguardando_suporte')
     RETURNING id`,
    [empresaId, usuarioId]
  );
  ticketId = t.rows[0].id;
});

after(async () => {
  if (c) { await c.query('ROLLBACK'); c.release(); }
  if (pool) await pool.end();
});

const pular = () => !temBanco;

/** O que `alterarStatus` faz: resolver GRAVA a data (e re-resolver renova). */
async function resolverComoEquipe() {
  await c!.query(
    `UPDATE tickets
        SET status = $2::varchar,
            resolvido_at = CASE WHEN $2::varchar IN ('resolvido','fechado') THEN now() ELSE NULL END,
            updated_at = now()
      WHERE id = $1`,
    [ticketId, 'resolvido']
  );
}

async function ler(): Promise<{ status: string; resolvido_at: Date | null }> {
  const r = await c!.query(`SELECT status, resolvido_at FROM tickets WHERE id = $1`, [ticketId]);
  return r.rows[0];
}

describe('Suporte — resolvido_at acompanha o status', () => {
  test('1. o chamado nasce na fila da equipe, sem data de resolução', async (t) => {
    if (pular()) return t.skip('sem banco alcançável');
    const s = await ler();
    assert.equal(s.status, 'aguardando_suporte');
    assert.equal(s.resolvido_at, null);
  });

  test('2. resolvido → resolvido_at preenchido', async (t) => {
    if (pular()) return t.skip('sem banco alcançável');
    await resolverComoEquipe();
    const s = await ler();
    assert.equal(s.status, 'resolvido');
    assert.ok(s.resolvido_at instanceof Date, 'a data da resolução tem de estar gravada');
  });

  test('3. cliente responde → reabre e LIMPA resolvido_at', async (t) => {
    if (pular()) return t.skip('sem banco alcançável');
    // É o caminho de `responderComoCliente` → `adicionarMensagem`.
    await c!.query(SQL_STATUS_POR_MENSAGEM, [ticketId, 'aguardando_suporte']);
    const s = await ler();
    assert.equal(s.status, 'aguardando_suporte');
    assert.equal(s.resolvido_at, null,
      'chamado reaberto não pode carregar a data da resolução anterior');
  });

  test('4. resolvido de novo → nova data', async (t) => {
    if (pular()) return t.skip('sem banco alcançável');
    await resolverComoEquipe();
    const s = await ler();
    assert.equal(s.status, 'resolvido');
    assert.ok(s.resolvido_at instanceof Date, 'a segunda resolução grava data nova');
  });

  test('5. resposta da equipe (aguardando_cliente) também limpa a data', async (t) => {
    if (pular()) return t.skip('sem banco alcançável');
    await c!.query(SQL_STATUS_POR_MENSAGEM, [ticketId, 'aguardando_cliente']);
    const s = await ler();
    assert.equal(s.status, 'aguardando_cliente');
    assert.equal(s.resolvido_at, null, 'aguardando o cliente não é chamado resolvido');
  });

  test('6. mensagem num chamado JÁ resolvido preserva a data original', async (t) => {
    if (pular()) return t.skip('sem banco alcançável');
    await resolverComoEquipe();
    const antes = (await ler()).resolvido_at as Date;
    await c!.query(SQL_STATUS_POR_MENSAGEM, [ticketId, 'resolvido']);
    const depois = (await ler()).resolvido_at as Date;
    assert.equal(depois.getTime(), antes.getTime(),
      'o COALESCE existe para a data da resolução original não ser reescrita');
  });

  test('7. chamado FECHADO não muda de status por mensagem nova', async (t) => {
    if (pular()) return t.skip('sem banco alcançável');
    await c!.query(`UPDATE tickets SET status = 'fechado' WHERE id = $1`, [ticketId]);
    await c!.query(SQL_STATUS_POR_MENSAGEM, [ticketId, 'aguardando_suporte']);
    const s = await ler();
    assert.equal(s.status, 'fechado', 'fechado é terminal: abre-se um chamado novo');
  });
});
