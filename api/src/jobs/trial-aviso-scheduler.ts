/**
 * Job: aviso de fim do teste grátis (migration 079).
 *
 * Diário, 09:00 de Brasília — o fuso vai no `cron.schedule`, senão o job roda
 * às 09:00 UTC (06:00 aqui) e o e-mail chega antes de a pessoa acordar.
 * Só na instância 0; a idempotência mesmo é do banco (`aviso_trial_em`).
 */

import cron from 'node-cron';
import { enviarAvisosTrial } from '../modules/onboarding/aviso-trial';
import { isMainInstance } from '../shared/utils';

const PREFIXO = '[AvisoTrial]';

if (isMainInstance) {
  cron.schedule('0 9 * * *', async () => {
    try {
      const r = await enviarAvisosTrial(true);
      if (!r.length) return;
      for (const c of r) {
        if (c.enviado) {
          console.log(`${PREFIXO} empresa ${c.empresa_id} (${c.empresa_nome}) → ${c.email} · teste termina ${c.expira_em_brt}`);
        } else {
          console.error(`${PREFIXO} FALHOU empresa ${c.empresa_id} (${c.empresa_nome}) → ${c.email}: ${c.erro}`);
        }
      }
    } catch (err: any) {
      console.error(`${PREFIXO} Erro:`, err?.message || err);
    }
  }, { timezone: 'America/Sao_Paulo' });
  console.log(`${PREFIXO} Cron registrado (diário, 09:00 de Brasília).`);
} else {
  console.log(`${PREFIXO} Instância #${process.env.NODE_APP_INSTANCE} — cron desativado (apenas instância 0 processa).`);
}
