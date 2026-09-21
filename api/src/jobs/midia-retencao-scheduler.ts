/**
 * Job: cota de mídia do WhatsApp por empresa (migration 076).
 *
 * Diário, 04:30 de Brasília — depois do backup das 03:00 (`api/scripts/backup_diario.sh`,
 * cron do sistema). Se o backup não terminou bem nas últimas 26h, não apaga nada e diz
 * por quê no log: arquivo apagado sem backup não tem volta. Só na instância 0.
 */

import cron from 'node-cron';
import { aplicarRetencaoMidia } from '../modules/midia/retencao';
import { isMainInstance } from '../shared/utils';

const PREFIXO = '[RetencaoMidia]';

if (isMainInstance) {
  cron.schedule('30 4 * * *', async () => {
    try {
      const r = await aplicarRetencaoMidia();
      if (r.bloqueado) {
        console.warn(`${PREFIXO} ${r.bloqueado}`);
        return;
      }
      const cortes = r.empresas.filter((e) => e.arquivos_apagados > 0);
      if (r.grupos.arquivos || cortes.length || r.falhas) {
        console.log(`${PREFIXO} grupos: ${r.grupos.arquivos} arquivo(s), ${r.grupos.liberado_mb} MB · ` +
          cortes.map((e) => `empresa ${e.empresa_id}: ${e.arquivos_apagados} arquivo(s), ${e.liberado_mb} MB`).join(' · ') +
          (r.falhas ? ` · ${r.falhas} falha(s)` : ''));
      }
    } catch (err: any) {
      console.error(`${PREFIXO} Erro:`, err?.message || err);
    }
  }, { timezone: 'America/Sao_Paulo' });
  console.log(`${PREFIXO} Cron registrado (diário, 04:30 de Brasília).`);
} else {
  console.log(`${PREFIXO} Instância #${process.env.NODE_APP_INSTANCE} — cron desativado (apenas instância 0 processa).`);
}
