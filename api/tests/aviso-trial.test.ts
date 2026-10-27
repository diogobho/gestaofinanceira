/**
 * Aviso de fim do teste grátis: o recorte de data e a idempotência.
 *
 * O que estes testes protegem é UMA coisa: `assinaturas.trial_expira_em` é um
 * `timestamp` naive que guarda o instante em UTC, e o cliente vive em Brasília.
 * Sem a conversão, um teste que acaba às 23:30 é lido como sendo do dia seguinte
 * (e o aviso nunca sai) e um que acaba hoje à noite é anunciado como "termina
 * amanhã" no próprio dia em que acaba.
 *
 * Roda contra o banco do DATABASE_URL, sempre dentro de uma transação revertida.
 * Sem banco alcançável, a suíte é pulada em vez de falhar.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool, PoolClient } from 'pg';
import * as dotenv from 'dotenv';
import { SQL_TRIAL_TERMINA_AMANHA, SQL_EM_BRASILIA } from '../src/modules/onboarding/aviso-trial';

dotenv.config();

let pool: Pool | null = null;
let c: PoolClient | null = null;
let temBanco = false;

before(async () => {
  try {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
    c = await pool.connect();
    await c.query('BEGIN');
    temBanco = true;
  } catch {
    console.warn('[aviso-trial] sem banco alcançável — suíte pulada.');
  }
});

after(async () => {
  if (c) { await c.query('ROLLBACK'); c.release(); }
  if (pool) await pool.end();
});

/** O instante UTC que corresponde a uma hora de Brasília em um dia relativo a hoje. */
async function gravadoPara(diasAFrente: number, hora: string): Promise<string> {
  const r = await c!.query(
    `SELECT (((now() AT TIME ZONE 'America/Sao_Paulo')::date + $1::int + $2::time)
              AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC' AS gravado`,
    [diasAFrente, hora]
  );
  return r.rows[0].gravado;
}

async function avisaHoje(gravado: string): Promise<boolean> {
  const r = await c!.query(
    `SELECT ${SQL_TRIAL_TERMINA_AMANHA('$1::timestamp')} AS avisa`,
    [gravado]
  );
  return r.rows[0].avisa;
}

describe('recorte "termina amanhã" em horário de Brasília', () => {
  test('acaba amanhã de manhã → avisa hoje', async (t) => {
    if (!temBanco) return t.skip();
    assert.equal(await avisaHoje(await gravadoPara(1, '08:00')), true);
  });

  test('acaba amanhã às 23:30 → avisa hoje (em UTC já é depois de amanhã)', async (t) => {
    if (!temBanco) return t.skip();
    const gravado = await gravadoPara(1, '23:30');
    // A prova de que a conversão importa: o valor gravado cai no dia SEGUINTE.
    const cru = await c!.query(
      `SELECT $1::timestamp::date AS dia_cru,
              ${SQL_EM_BRASILIA('$1::timestamp')}::date AS dia_brt,
              (now() AT TIME ZONE 'America/Sao_Paulo')::date + 1 AS amanha_brt`,
      [gravado]
    );
    assert.notDeepEqual(cru.rows[0].dia_cru, cru.rows[0].dia_brt,
      'o caso perde a graça se o dia cru e o dia de Brasília coincidirem');
    assert.deepEqual(cru.rows[0].dia_brt, cru.rows[0].amanha_brt);
    assert.equal(await avisaHoje(gravado), true);
  });

  test('acaba hoje à noite → NÃO avisa (já é tarde para dizer "amanhã")', async (t) => {
    if (!temBanco) return t.skip();
    assert.equal(await avisaHoje(await gravadoPara(0, '23:59')), false);
  });

  test('acaba depois de amanhã → ainda não avisa', async (t) => {
    if (!temBanco) return t.skip();
    assert.equal(await avisaHoje(await gravadoPara(2, '10:00')), false);
  });

  test('acaba amanhã às 00:10 → avisa hoje', async (t) => {
    if (!temBanco) return t.skip();
    assert.equal(await avisaHoje(await gravadoPara(1, '00:10')), true);
  });
});

describe('idempotência do carimbo', () => {
  test('o segundo claim da mesma assinatura volta vazio', async (t) => {
    if (!temBanco) return t.skip();

    const emp = await c!.query(
      `INSERT INTO empresas (nome, slug) VALUES ('Teste Aviso Trial', 'teste-aviso-trial-' || gen_random_uuid())
       RETURNING id`
    );
    const empresaId = emp.rows[0].id;
    await c!.query(
      `INSERT INTO assinaturas (empresa_id, status, trial_expira_em)
       VALUES ($1, 'trial', $2)`,
      [empresaId, await gravadoPara(1, '09:00')]
    );

    const claim = `UPDATE assinaturas SET aviso_trial_em = now()
                    WHERE empresa_id = $1 AND status = 'trial' AND aviso_trial_em IS NULL
                    RETURNING empresa_id`;

    const primeiro = await c!.query(claim, [empresaId]);
    const segundo = await c!.query(claim, [empresaId]);

    assert.equal(primeiro.rowCount, 1, 'o primeiro claim tem que ganhar a linha');
    assert.equal(segundo.rowCount, 0, 'o segundo não pode gerar um e-mail a mais');
  });
});
