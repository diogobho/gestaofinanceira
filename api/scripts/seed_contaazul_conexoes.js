#!/usr/bin/env node
/**
 * Semeia/atualiza as conexões do Conta Azul (migration 066). Idempotente:
 * a chave é o client_id, então rodar de novo só atualiza nome/secret/ordem.
 *
 * Uso (as credenciais vêm do ambiente, nunca hardcoded aqui):
 *   CA_EMPRESA=5 \
 *   CA1_NOME=Panteras CA1_CLIENT_ID=… CA1_CLIENT_SECRET=… [CA1_REFRESH_TOKEN=…] \
 *   CA2_NOME=Totem CA2_CLIENT_ID=… CA2_CLIENT_SECRET=… \
 *   node scripts/seed_contaazul_conexoes.js
 *
 * CAn_REFRESH_TOKEN é opcional e serve para reaproveitar um refresh_token que já
 * existia antes da 066 — sem ele, basta autorizar a conexão pelo /authorize.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const empresaId = Number(process.env.CA_EMPRESA || process.env.CONTAAZUL_EMPRESA_ID || 5);

async function upsertConexao(cli, { nome, client_id, client_secret, ordem }) {
  const { rows } = await cli.query(
    `INSERT INTO contaazul_conexoes (empresa_id, nome, client_id, client_secret, ordem)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (client_id) DO UPDATE SET
       nome = EXCLUDED.nome, client_secret = EXCLUDED.client_secret,
       ordem = EXCLUDED.ordem, empresa_id = EXCLUDED.empresa_id, updated_at = now()
     RETURNING id, nome, client_id`,
    [empresaId, nome, client_id, client_secret, ordem]
  );
  return rows[0];
}

/** Liga um token órfão (pré-066) à conexão certa, ou grava um refresh_token conhecido. */
async function ligarToken(cli, conexao, refreshToken) {
  const { rows: orfaos } = await cli.query(
    `SELECT id FROM contaazul_tokens WHERE empresa_id = $1 AND conexao_id IS NULL`,
    [empresaId]
  );
  if (orfaos.length === 1 && !refreshToken) {
    await cli.query(`UPDATE contaazul_tokens SET conexao_id = $1, updated_at = now() WHERE id = $2`,
      [conexao.id, orfaos[0].id]);
    return 'token pré-066 vinculado';
  }
  if (refreshToken) {
    await cli.query(
      `INSERT INTO contaazul_tokens
         (empresa_id, conexao_id, access_token, refresh_token, expira_em, renovacao_falhas)
       VALUES ($1, $2, '', $3, now() - interval '1 minute', 0)
       ON CONFLICT (conexao_id) DO UPDATE SET
         refresh_token = EXCLUDED.refresh_token, renovacao_falhas = 0,
         ultimo_erro = NULL, updated_at = now()`,
      [empresaId, conexao.id, refreshToken]
    );
    return 'refresh_token gravado (access_token vence na hora, será renovado no 1º uso)';
  }
  return 'sem token — precisa autorizar pelo /authorize';
}

(async () => {
  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');
    for (const n of ['1', '2']) {
      const client_id = process.env[`CA${n}_CLIENT_ID`];
      const client_secret = process.env[`CA${n}_CLIENT_SECRET`];
      const nome = process.env[`CA${n}_NOME`];
      if (!client_id || !client_secret || !nome) {
        console.log(`· conexão ${n}: pulada (falta CA${n}_NOME/CLIENT_ID/CLIENT_SECRET)`);
        continue;
      }
      const conexao = await upsertConexao(cli, { nome, client_id, client_secret, ordem: Number(n) });
      const info = await ligarToken(cli, conexao, process.env[`CA${n}_REFRESH_TOKEN`] || null);
      console.log(`✓ conexão ${conexao.id} "${conexao.nome}" (client ${client_id.slice(0, 8)}…) — ${info}`);
    }
    await cli.query('COMMIT');

    const { rows } = await cli.query(
      `SELECT c.id, c.nome, c.ordem, c.ativo,
              (t.id IS NOT NULL) AS tem_token,
              t.expira_em, t.renovacao_falhas
         FROM contaazul_conexoes c
         LEFT JOIN contaazul_tokens t ON t.conexao_id = c.id
        WHERE c.empresa_id = $1
        ORDER BY c.ordem, c.id`,
      [empresaId]
    );
    console.log('\nEstado final:');
    for (const r of rows) {
      console.log(`  [${r.id}] ${r.nome} — ativo=${r.ativo} token=${r.tem_token} falhas=${r.renovacao_falhas ?? '-'}`);
    }
  } catch (err) {
    await cli.query('ROLLBACK');
    console.error('ERRO:', err.message);
    process.exitCode = 1;
  } finally {
    cli.release();
    await pool.end();
  }
})();
