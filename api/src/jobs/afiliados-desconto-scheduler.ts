/**
 * Job: abater recompensas de indicação na próxima cobrança (113).
 *
 * O caminho principal é o webhook PAYMENT_CREATED do Asaas, que chega quando a cobrança
 * do ciclo nasce. Este job, de hora em hora, cobre o webhook que não veio (evento não
 * habilitado na conta, queda): procura quem escolheu "abater" e ainda não teve abatimento.
 * Só na instância 0, como os outros crons.
 */

import cron from 'node-cron';
import { query } from '../config/database';
import { afiliadosService } from '../modules/afiliados/afiliados.service';
import { isMainInstance } from '../shared/utils';

const PREFIXO = '[AfiliadosDesconto]';

if (isMainInstance) {
  cron.schedule('23 * * * *', async () => {
    try {
      const r = await query(`SELECT DISTINCT afiliado_empresa_id AS id FROM afiliado_comissoes WHERE status = 'desconto_pendente'`);
      for (const e of r.rows) await afiliadosService.aplicarDescontos(Number(e.id));
    } catch (err: any) {
      console.error(`${PREFIXO} Erro:`, err?.message || err);
    }
  });
  console.log(`${PREFIXO} Cron registrado (de hora em hora, :23).`);
}
