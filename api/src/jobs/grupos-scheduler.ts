/**
 * Job da página de Grupos (migration 088): a cada minuto, na instância 0.
 *
 * - Mensagens vencidas: uma rodada por chip de cada vez (`ocupados`), em paralelo
 *   entre chips. A rodada pode levar minutos (intervalo entre grupos), então roda
 *   solta: o minuto seguinte pega as de outros chips sem esperar.
 * - Boas-vindas: a fila vencida de cada grupo vira UMA mensagem.
 */

import cron from 'node-cron';
import { isMainInstance } from '../shared/utils';
import { executarRodada, proximaVencida, processarBoasVindas } from '../modules/grupos/grupos.service';

const PREFIXO = '[Grupos]';
const ocupados = new Set<number>();

async function rodarMensagens() {
  for (;;) {
    const m = await proximaVencida(ocupados);
    if (!m) return;
    ocupados.add(m.usuario_id);
    executarRodada(m)
      .then((r) => console.log(`${PREFIXO} mensagem #${m.id} "${m.titulo}": ${r.enviados} enviado(s), ${r.falhas} falha(s)`))
      .catch((e) => console.error(`${PREFIXO} mensagem #${m.id}:`, e?.message || e))
      .finally(() => ocupados.delete(m.usuario_id));
  }
}

if (isMainInstance) {
  cron.schedule('* * * * *', async () => {
    try {
      await rodarMensagens();
      const n = await processarBoasVindas();
      if (n) console.log(`${PREFIXO} ${n} boas-vindas enviada(s)`);
    } catch (e: any) {
      console.error(`${PREFIXO} erro no job:`, e?.message || e);
    }
  });
}
