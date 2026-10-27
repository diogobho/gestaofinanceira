#!/usr/bin/env node
/**
 * Aviso de fim do teste grátis — conferência e envio manual.
 *
 *   node api/scripts/aviso_trial.js              # só lista quem receberia (nada sai)
 *   node api/scripts/aviso_trial.js --previa     # imprime o e-mail em texto puro
 *   node api/scripts/aviso_trial.js --aplicar    # envia de verdade e carimba
 *
 * O job de 09:00 (Brasília) faz o mesmo sozinho. Este script existe para
 * conferir a lista antes do dia e para reenviar se algum envio falhar.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { contasParaAvisar, montarAviso, enviarAvisosTrial } =
  require('../dist/modules/onboarding/aviso-trial');

const aplicar = process.argv.includes('--aplicar');
const previa = process.argv.includes('--previa');

(async () => {
  const contas = await contasParaAvisar();

  if (!contas.length) {
    console.log('Nenhuma conta com teste terminando amanhã (fuso de Brasília).');
    process.exit(0);
  }

  console.log(`${contas.length} conta(s) com teste terminando amanhã:\n`);
  for (const c of contas) {
    console.log(`  empresa ${c.empresa_id} · ${c.empresa_nome}`);
    console.log(`    para:   ${c.usuario_nome} <${c.email}>`);
    console.log(`    plano:  ${c.plano_nome || '—'}`);
    console.log(`    acaba:  ${c.expira_em_brt} (Brasília)\n`);
  }

  if (previa) {
    const { assunto, texto } = await montarAviso(contas[0]);
    console.log('─'.repeat(70));
    console.log(`Assunto: ${assunto}\n`);
    console.log(texto);
    console.log('─'.repeat(70) + '\n');
  }

  if (!aplicar) {
    console.log('Simulação — nada foi enviado. Rode com --aplicar para enviar.');
    process.exit(0);
  }

  const r = await enviarAvisosTrial(true);
  for (const c of r) {
    console.log(c.enviado ? `✅ ${c.empresa_nome} → ${c.email}` : `❌ ${c.empresa_nome} → ${c.email}: ${c.erro}`);
  }
  process.exit(0);
})().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
