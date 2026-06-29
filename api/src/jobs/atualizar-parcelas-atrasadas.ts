/**
 * Job: Atualizar Parcelas Atrasadas
 *
 * Roda diariamente às 00:05 (horário de Brasília).
 * Marca como ATRASADO todas as parcelas PENDENTE cujo data_vencimento < hoje.
 */

import cron from 'node-cron';
import { query } from '../config/database';

async function atualizarParcelasAtrasadas() {
  try {
    const receitasResult = await query(`
      UPDATE parcelas_receitas
      SET status = 'ATRASADO', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'PENDENTE'
        AND data_vencimento < CURRENT_DATE
    `);

    const despesasResult = await query(`
      UPDATE parcelas_despesas
      SET status = 'ATRASADO', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'PENDENTE'
        AND data_vencimento < CURRENT_DATE
    `);

    const totalReceitas = receitasResult.rowCount ?? 0;
    const totalDespesas = despesasResult.rowCount ?? 0;

    if (totalReceitas > 0 || totalDespesas > 0) {
      console.log(`[parcelas-atrasadas] Atualizadas: ${totalReceitas} receitas, ${totalDespesas} despesas`);
    }
  } catch (err) {
    console.error('[parcelas-atrasadas] Erro ao atualizar parcelas:', err);
  }
}

// Executar imediatamente na inicialização para corrigir estado atual
atualizarParcelasAtrasadas();

// Rodar todo dia às 00:05 horário de Brasília
cron.schedule('5 0 * * *', atualizarParcelasAtrasadas, {
  timezone: 'America/Sao_Paulo'
});
