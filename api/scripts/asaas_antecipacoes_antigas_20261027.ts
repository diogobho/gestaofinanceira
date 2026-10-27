// Taxas de antecipação da Graciele (39) de antes de importar_desde (07/10): o extrato da 114 só
// lia dali em diante. Lê o extrato desde <desde> e lança SÓ as RECEIVABLE_ANTICIPATION_FEE (e
// os estornos delas) — as outras linhas antigas ficam de fora, e importar_desde não muda, para
// as cobranças antigas (antecipadas que ela apagou por duplicidade) não voltarem.
// Uso: npx tsx scripts/asaas_antecipacoes_antigas_20261027.ts <empresa_id> <desde AAAA-MM-DD> [--gravar]
const eco = require('/var/www/apps/gestao_financeira/ecosystem.config.js');
const app = eco.apps.find((a: any) => a.name === 'gestao-financeira-api');
require('dotenv').config({ path: '/var/www/apps/gestao_financeira/api/.env' });
Object.assign(process.env, app.env || {});
process.env.NODE_APP_INSTANCE = '9'; // não registra os crons da API neste processo

(async () => {
  const axios = (await import('axios')).default;
  const { query } = await import('/var/www/apps/gestao_financeira/api/src/config/database');
  const { decrypt } = await import('/var/www/apps/gestao_financeira/api/src/utils/crypto');
  const svc = await import('/var/www/apps/gestao_financeira/api/src/modules/asaas-receitas/asaas-receitas.service');
  const [empresaId, desde] = [Number(process.argv[2]), process.argv[3]];
  const gravar = process.argv.includes('--gravar');
  const c = (await query(
    'SELECT *, importar_desde::text AS desde, extrato_ate::text AS extrato_ate FROM asaas_conexoes WHERE empresa_id = $1',
    [empresaId])).rows[0];
  if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(desde || '')) throw new Error('empresa sem Asaas ou data inválida');
  const ate = c.desde;
  const ehAntecipacao = (t: any) => String(t.type).startsWith('RECEIVABLE_ANTICIPATION_FEE');

  const http = axios.create({
    baseURL: 'https://api.asaas.com/v3',
    headers: { access_token: decrypt(c.api_key_enc), 'User-Agent': 'Duo-CRM' }, timeout: 30000,
  });
  // Só antecipação, e só antes de importar_desde (dali em diante a 114 já leu).
  http.interceptors.response.use(r => {
    if (r.config.url === '/financialTransactions') {
      r.data.data = (r.data.data || []).filter((t: any) => ehAntecipacao(t) && t.date < ate);
    }
    return r;
  });

  if (!gravar) {
    const linhas: any[] = [];
    for (let offset = 0; ; offset += 100) {
      const { data } = await http.get('/financialTransactions', { params: { startDate: desde, finishDate: ate, offset, limit: 100 } });
      linhas.push(...data.data);
      if (!data.hasMore) break;
    }
    const porMes: Record<string, { n: number; total: number }> = {};
    for (const t of linhas) {
      const m = t.date.slice(0, 7);
      porMes[m] = porMes[m] || { n: 0, total: 0 };
      porMes[m].n++; porMes[m].total += Number(t.value);
    }
    console.log('simulação (nada gravado):', JSON.stringify(porMes));
    process.exit(0);
  }

  // extrato_ate nulo + importar_saidas falso: lê desde <desde> e só lança taxa.
  const r = await svc.sincronizarExtrato({ ...c, desde, extrato_ate: null, importar_saidas: false }, http);
  await query('UPDATE asaas_conexoes SET extrato_ate = $1 WHERE id = $2', [c.extrato_ate, c.id]);
  console.log('gravado:', JSON.stringify(r));
  process.exit(0);
})().catch(e => { console.error('ERRO', e.message); process.exit(1); });
