/**
 * Job: trial vencido vira `suspensa` (25/09/2026).
 *
 * De hora em hora, só na instância 0. O bloqueio em si não depende dele — o guard
 * já barra trial com a data passada —; o que ele faz é deixar o status VERDADEIRO
 * no banco e no /admin, onde o dono acompanha quem está sem acesso.
 */

import cron from 'node-cron';
import { suspenderTrialsVencidos } from '../modules/assinaturas/assinaturas.service';
import { isMainInstance } from '../shared/utils';

const PREFIXO = '[TrialSuspensao]';

if (isMainInstance) {
  cron.schedule('5 * * * *', async () => {
    try {
      const suspensas = await suspenderTrialsVencidos();
      for (const e of suspensas) {
        console.log(`${PREFIXO} empresa ${e.empresa_id} (${e.nome}) → suspensa: teste grátis encerrado`);
      }
    } catch (err: any) {
      console.error(`${PREFIXO} Erro:`, err?.message || err);
    }
  }, { timezone: 'America/Sao_Paulo' });
  console.log(`${PREFIXO} Cron registrado (de hora em hora, minuto 5).`);
} else {
  console.log(`${PREFIXO} Instância #${process.env.NODE_APP_INSTANCE} — cron desativado (apenas instância 0 processa).`);
}
