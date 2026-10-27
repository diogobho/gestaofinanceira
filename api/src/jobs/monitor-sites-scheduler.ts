/**
 * Job: monitoramento de sites (102). A cada minuto, só na instância 0, lê os sites cujo
 * intervalo venceu e avisa no WhatsApp quando o estado muda (monitor-sites.service).
 */
import cron from 'node-cron';
import { verificarDevidos } from '../modules/monitor-sites/monitor-sites.service';
import { isMainInstance } from '../shared/utils';

const PREFIXO = '[MonitorSites]';
let rodando = false;

if (isMainInstance) {
  cron.schedule('* * * * *', async () => {
    if (rodando) return;
    rodando = true;
    try {
      await verificarDevidos();
    } catch (err: any) {
      console.error(`${PREFIXO} Erro:`, err?.message || err);
    } finally {
      rodando = false;
    }
  }, { timezone: 'America/Sao_Paulo' });
  console.log(`${PREFIXO} Cron registrado (a cada minuto).`);
}
