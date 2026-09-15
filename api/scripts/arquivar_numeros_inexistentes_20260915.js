/**
 * Chamados #60 e #70 (Panteras, 15/09/2026): leads da "Entrada de Leads" do funil
 * Escola Empreendedorismo que não recebem disparo porque o número não existe no WhatsApp.
 * A Débora pediu no #60: "se for problema de número, arquivar o lead".
 *
 * Candidatos: leads do estágio cujo disparo SÓ falhou com "não tem conta no WhatsApp",
 * mais os números incompletos citados no #70. Cada um é reconferido AGORA na instância
 * (`/check-number`, sem enviar nada), com e sem o 9º dígito — só é arquivado quem não
 * existe em forma nenhuma. Arquiva por `leadsService.arquivar` (cancela a cadência e
 * registra a atividade no card).
 *
 *   node scripts/arquivar_numeros_inexistentes_20260915.js            # simula
 *   node scripts/arquivar_numeros_inexistentes_20260915.js --aplicar  # arquiva
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');
const { query } = require('../dist/config/database');
const { leadsService } = require('../dist/modules/crm/leads/leads.service');
const { variantesTelefone } = require('../dist/modules/crm/_shared/telefone');

const EMPRESA = 5;
const ESTAGIO_ENTRADA = 208;
const INCOMPLETOS = [562, 1522]; // Andréa Cervellini (sem o 9) e Melissa Braz (sem DDD)
const PORTA_CONSULTA = Number(process.env.PORTA_CONSULTA || 3014); // qualquer chip conectado serve
const USUARIO_SUPORTE = 12; // master@gestao.com — quem atende o suporte
const APLICAR = process.argv.includes('--aplicar');

async function existeNoWhatsApp(numero) {
  const r = await axios.get(`http://localhost:${PORTA_CONSULTA}/check-number/${numero}`, { timeout: 10000 });
  return r.data?.exists === true;
}

(async () => {
  const cand = await query(
    `SELECT l.id, l.nome, l.telefone
       FROM leads l
      WHERE l.empresa_id = $1 AND l.estagio_id = $2 AND l.arquivado = false
        AND (l.id = ANY($3::int[]) OR (
          EXISTS (SELECT 1 FROM disparo_leads dl WHERE dl.lead_id = l.id AND dl.erro ILIKE '%não tem conta%')
          AND NOT EXISTS (SELECT 1 FROM disparo_leads dl WHERE dl.lead_id = l.id AND dl.status = 'enviado')))
      ORDER BY l.nome`,
    [EMPRESA, ESTAGIO_ENTRADA, INCOMPLETOS]
  );

  const arquivar = [];
  const manter = [];
  for (const l of cand.rows) {
    const digitos = String(l.telefone || '').replace(/\D/g, '');
    // Com DDI: o check-number precisa dele, e as variantes sem 55 dariam falso "não existe".
    const formas = [...new Set(variantesTelefone(digitos).map((v) => (v.length <= 11 ? `55${v}` : v)))];
    let existe = false;
    for (const f of formas) {
      if (await existeNoWhatsApp(f)) { existe = true; break; }
    }
    (existe ? manter : arquivar).push({ ...l, formas: formas.join(' / ') });
  }

  console.log(`Candidatos: ${cand.rows.length} · arquivar: ${arquivar.length} · existem (manter): ${manter.length}\n`);
  for (const l of arquivar) console.log(`  ARQUIVAR #${l.id} ${l.nome} — ${l.formas}`);
  for (const l of manter) console.log(`  manter   #${l.id} ${l.nome} — existe em ${l.formas}`);

  if (!APLICAR) {
    console.log('\nSimulação. Rode com --aplicar para arquivar.');
    process.exit(0);
  }
  for (const l of arquivar) await leadsService.arquivar(l.id, EMPRESA, USUARIO_SUPORTE);
  console.log(`\n${arquivar.length} lead(s) arquivado(s).`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
