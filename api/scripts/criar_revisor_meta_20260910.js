/**
 * Cria a conta do analista do App Review da Meta.
 *
 *   node api/scripts/criar_revisor_meta_20260910.js            # simulação
 *   node api/scripts/criar_revisor_meta_20260910.js --aplicar
 *
 * Por que: o vídeo e o teste do App Review acontecem em `/gestao/whatsapp/meta`,
 * que opera a conta Meta da DuoFuturo e era só do `super_admin` — e super_admin
 * enxerga todas as empresas do banco. Entregar esse login a quem é de fora
 * exporia dado de cliente (LGPD).
 *
 * O analista ganha uma EMPRESA SÓ DELE, vazia, e o painel é liberado para o id
 * dele por `META_PAINEL_REVISORES` no api/.env (ver whatsapp/meta/acesso.ts).
 * Não usa a demo 31: a assinatura dela foi cancelada pelo administrador em
 * 09/09/2026, e reativá-la desfaria uma decisão alheia.
 *
 * A assinatura vence em 31/12/2027 sozinha: a Meta exige credencial de teste
 * válida por UM ANO depois do envio e volta a analisar o app periodicamente, mas
 * conta de analista esquecida não fica aberta para sempre. Idempotente: se o
 * e-mail já existe, só informa o id.
 *
 * Depois de aplicar:
 *   1. META_PAINEL_REVISORES=<id impresso> no api/.env
 *   2. pm2 restart gestao-financeira-api
 *   3. guardar a senha impressa no CREDENCIAIS.md
 */
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const EMAIL = 'revisor.meta@duofuturo.tech';
const NOME = 'Meta App Reviewer';
const EMPRESA = 'DuoFuturo — Meta App Review (Demo)';
const PLANO_ENTERPRISE = 3;
const VENCE_EM = '2027-12-31';

const aplicar = process.argv.includes('--aplicar');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function gerarSenha() {
  // sem 0/O/1/l/I: o analista vai digitar isso a partir de um formulário
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  let s = '';
  for (const b of bytes) s += alfabeto[b % alfabeto.length];
  return `Meta-${s}!`;
}

async function main() {
  const existente = await pool.query(
    'SELECT id, empresa_id FROM usuarios WHERE email = $1', [EMAIL]
  );
  if (existente.rows.length) {
    const u = existente.rows[0];
    console.log(`Já existe: usuário ${u.id}, empresa ${u.empresa_id}. Nada a fazer.`);
    console.log(`META_PAINEL_REVISORES=${u.id}`);
    return;
  }

  if (!aplicar) {
    console.log(`[simulação] criaria a empresa "${EMPRESA}", o usuário ${EMAIL} (creator)`);
    console.log(`[simulação] e uma assinatura Enterprise ativa até ${VENCE_EM}.`);
    console.log('Rode com --aplicar para gravar.');
    return;
  }

  const senha = gerarSenha();
  const hash = await bcrypt.hash(senha, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const e = await client.query(
      `INSERT INTO empresas (nome, slug, email, created_at, updated_at)
       VALUES ($1, 'meta-app-review-demo', 'suporte@duofuturo.tech', now(), now())
       RETURNING id`,
      [EMPRESA]
    );
    const empresaId = e.rows[0].id;

    const u = await client.query(
      `INSERT INTO usuarios (nome, email, senha, nivel, tipo_usuario, empresa_id, created_at,
                             aceite_termos_versao, aceite_termos_em)
       VALUES ($1, $2, $3, 'admin_empresa', 'creator', $4, now(), '1.0', now())
       RETURNING id`,
      [NOME, EMAIL, hash, empresaId]
    );
    const usuarioId = u.rows[0].id;

    await client.query(
      `INSERT INTO assinaturas (empresa_id, plano_id, status, plano_ativo_ate, ciclo, updated_at)
       VALUES ($1, $2, 'ativa', $3, 'mensal', now())`,
      [empresaId, PLANO_ENTERPRISE, VENCE_EM]
    );
    await client.query('COMMIT');

    console.log(`Empresa ${empresaId} e usuário ${usuarioId} criados.`);
    console.log('');
    console.log(`  E-mail: ${EMAIL}`);
    console.log(`  Senha:  ${senha}`);
    console.log('');
    console.log(`META_PAINEL_REVISORES=${usuarioId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch(err => { console.error(err.message); process.exitCode = 1; })
  .finally(() => pool.end());
