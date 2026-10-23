/**
 * Job: agenda externa (103). A cada 5 minutos, só na instância 0, concilia as reuniões do
 * CRM com o Google Agenda / Microsoft 365 — o que a sincronização imediata não conseguiu.
 */
import cron from 'node-cron';
import { conciliar } from '../modules/agenda-externa/agenda-externa.service';
import { isMainInstance } from '../shared/utils';

let rodando = false;
if (isMainInstance) {
  cron.schedule('*/5 * * * *', async () => {
    if (rodando) return;
    rodando = true;
    try { await conciliar(); } catch (e: any) { console.error('[AgendaExterna] Erro:', e?.message || e); } finally { rodando = false; }
  }, { timezone: 'America/Sao_Paulo' });
  console.log('[AgendaExterna] Cron registrado (a cada 5 minutos).');
}
