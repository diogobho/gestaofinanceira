/**
 * Modelos da empresa em todos os números dela (14/10/2026): a cada hora, o que foi
 * aprovado na conta do dono da conta e ainda falta nas contas da equipe (números do app
 * WhatsApp Business, cada um com a sua WABA) é copiado. A conexão já copia na hora;
 * isto leva o que não coube no limite da Meta e o que for aprovado depois.
 */

import cron from 'node-cron';
import { isMainInstance } from '../shared/utils';
import { sincronizarModelosDasEmpresas } from '../modules/whatsapp/canal/copiar-modelos';

if (isMainInstance) {
  cron.schedule('17 * * * *', () => {
    sincronizarModelosDasEmpresas().catch((e) => console.error('[Modelos] erro no job:', e?.message || e));
  });
}
