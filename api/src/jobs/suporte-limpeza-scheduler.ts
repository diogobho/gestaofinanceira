/**
 * Job: limpeza de anexos órfãos do suporte.
 *
 * Uma vez por dia, às 04:00 — fora do horário de atendimento, e o trabalho é
 * pequeno o bastante para não precisar de janela negociada. Roda só na instância 0
 * do cluster, como os outros crons: três processos apagando os mesmos arquivos
 * gerariam erro de `unlink` em dois deles sem nenhum ganho.
 *
 * Órfão = anexo sem mensagem, com mais de 48h. Desde que o anexo de ABERTURA passou
 * a ser vinculado no próprio upload, "órfão" só acontece quando o envio falhou entre
 * subir o arquivo e gravar a mensagem — ou seja, é resíduo, não caso legítimo.
 */

import cron from 'node-cron';
import { suporteService } from '../modules/suporte/suporte.service';
import { isMainInstance } from '../shared/utils';

const PREFIXO = '[SuporteLimpeza]';

if (isMainInstance) {
  cron.schedule('0 4 * * *', async () => {
    try {
      const r = await suporteService.limparAnexosOrfaos();
      // Silêncio quando não há nada: log diário de "0 removidos" só treina a
      // equipe a ignorar a linha.
      if (r.removidos || r.falhas) {
        console.log(`${PREFIXO} ${r.removidos} anexo(s) órfão(s) removido(s), ${r.falhas} falha(s).`);
      }
    } catch (err: any) {
      console.error(`${PREFIXO} Erro na limpeza:`, err?.message || err);
    }
  });
  console.log(`${PREFIXO} Cron registrado (diário, 04:00).`);
} else {
  console.log(`${PREFIXO} Instância #${process.env.NODE_APP_INSTANCE} — cron desativado (apenas instância 0 processa).`);
}
