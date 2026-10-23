/**
 * Job: receitas do Asaas (105). De 6 em 6 horas, só na instância 0, repassa as cobranças de
 * cada conexão — cobre o que o webhook perder (fila pausada no Asaas, API fora do ar).
 */
import cron from 'node-cron';
import { sincronizarTodas } from '../modules/asaas-receitas/asaas-receitas.service';
import { isMainInstance } from '../shared/utils';

let rodando = false;
if (isMainInstance) {
  cron.schedule('17 */6 * * *', async () => {
    if (rodando) return;
    rodando = true;
    try { await sincronizarTodas(); } catch (e: any) { console.error('[AsaasReceitas] Erro:', e?.message || e); } finally { rodando = false; }
  }, { timezone: 'America/Sao_Paulo' });
  console.log('[AsaasReceitas] Cron registrado (a cada 6 horas).');
}
