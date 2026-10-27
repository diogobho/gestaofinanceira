// Primeira leitura do extrato do Asaas (114): lança as taxas que o cálculo antigo deixava de
// fora (WhatsApp, mensageria, nota fiscal, antecipação, cartão na confirmação). Graciele (39) pediu.
// Uso: npx tsx scripts/asaas_taxas_extrato_20261026.ts <empresa_id>
const eco = require('/var/www/apps/gestao_financeira/ecosystem.config.js');
const app = eco.apps.find((a: any) => a.name === 'gestao-financeira-api');
require('dotenv').config({ path: '/var/www/apps/gestao_financeira/api/.env' });
Object.assign(process.env, app.env || {});
process.env.NODE_APP_INSTANCE = '9'; // não registra os crons da API neste processo

(async () => {
  const svc = await import('/var/www/apps/gestao_financeira/api/src/modules/asaas-receitas/asaas-receitas.service');
  const r = await svc.sincronizarDaEmpresa(Number(process.argv[2]));
  console.log('sync:', JSON.stringify(r));
  process.exit(0);
})().catch(e => { console.error('ERRO', e.message); process.exit(1); });
