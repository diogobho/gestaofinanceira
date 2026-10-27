/**
 * Conta institucional da DuoFuturo = master@gestao.com (usuário 12, empresa 1).
 *
 * Decisão de 13/09/2026: é por esta conta que a equipe configura e acompanha as
 * boas-vindas. Ela já era o super_admin do sistema; faltava a empresa dela ter
 * identidade, SMTP e assinatura — os três moravam na empresa 32
 * (suporte@duofuturo.tech).
 *
 * Renomear a empresa 1 NÃO é cosmético: o nome dela entra na assinatura gerada
 * automaticamente e no cabeçalho dos relatórios em PDF — as boas-vindas sairiam
 * assinadas por "Empresa Demo".
 *
 * O SMTP é copiado da empresa 32 com o `smtp_pass_enc` COMO ESTÁ: a cifra usa uma
 * chave global do processo (utils/crypto), então o texto cifrado vale em qualquer
 * empresa. É a mesma conta Brevo ("Instituto", login a6f319001), a única onde
 * duofuturo.tech está autenticado (brevo-code + DKIM + DMARC) e onde o remetente
 * suporte@duofuturo.tech existe — a do .env é outra (Futuron) e o recusaria.
 *
 * Idempotente. A assinatura só é gravada se ainda não houver uma: quem editar em
 * /gestao/perfil não perde o trabalho ao rodar isto de novo.
 *
 *   node api/scripts/seed_conta_institucional_20260913.js           (simula)
 *   node api/scripts/seed_conta_institucional_20260913.js --aplicar
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const { Pool } = require('pg');

const APLICAR = process.argv.includes('--aplicar');
const EMPRESA = 1;
const USUARIO = 12;
const ORIGEM_SMTP = 32; // empresa do suporte@duofuturo.tech
const ASSINATURA = '/var/www/apps/landing/signature/assinatura-duofuturo.html';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const empresa = await cliente.query(
      `UPDATE empresas
          SET nome = 'DuoFuturo',
              email = 'suporte@duofuturo.tech',
              telefone = '(24) 98834-4048',
              cor_primaria = '#13264C',
              updated_at = now()
        WHERE id = $1
        RETURNING id, nome, email, telefone, cor_primaria`,
      [EMPRESA]
    );
    console.log('empresa:', empresa.rows[0]);

    const smtp = await cliente.query(
      `INSERT INTO configuracoes_smtp
         (empresa_id, smtp_host, smtp_port, smtp_user, smtp_pass_enc, email_from, email_from_name, ativo)
       SELECT $1, smtp_host, smtp_port, smtp_user, smtp_pass_enc, email_from, 'DuoFuturo', true
         FROM configuracoes_smtp WHERE empresa_id = $2
       ON CONFLICT (empresa_id) DO UPDATE
          SET smtp_host = EXCLUDED.smtp_host, smtp_port = EXCLUDED.smtp_port,
              smtp_user = EXCLUDED.smtp_user, smtp_pass_enc = EXCLUDED.smtp_pass_enc,
              email_from = EXCLUDED.email_from, email_from_name = EXCLUDED.email_from_name,
              ativo = true, updated_at = now()
       RETURNING empresa_id, smtp_user, email_from, email_from_name`,
      [EMPRESA, ORIGEM_SMTP]
    );
    console.log('smtp:', smtp.rows[0] || '(a empresa de origem não tem SMTP — nada copiado)');

    let assinatura = null;
    try {
      assinatura = fs.readFileSync(ASSINATURA, 'utf-8').trim();
    } catch {
      console.warn('assinatura não encontrada em', ASSINATURA, '— o sistema vai gerar uma dos dados da empresa');
    }
    if (assinatura) {
      const r = await cliente.query(
        `UPDATE usuarios SET assinatura_email = $2
          WHERE id = $1 AND (assinatura_email IS NULL OR btrim(assinatura_email) = '')
          RETURNING id`,
        [USUARIO, assinatura]
      );
      console.log('assinatura:', r.rowCount ? 'gravada' : 'já existia — preservada');
    }

    if (APLICAR) {
      await cliente.query('COMMIT');
      console.log('\n✔ aplicado');
    } else {
      await cliente.query('ROLLBACK');
      console.log('\n(simulação — nada gravado; rode com --aplicar)');
    }
  } catch (err) {
    await cliente.query('ROLLBACK');
    console.error('ERRO:', err.message);
    process.exitCode = 1;
  } finally {
    cliente.release();
    await pool.end();
  }
})();
