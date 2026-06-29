/**
 * Job: Disparo Scheduler
 *
 * Roda a cada minuto, busca disparos (WhatsApp e e-mail) agendados
 * cujo horário já chegou, muda status para 'processando' e executa.
 */

import cron from 'node-cron';
import { query } from '../config/database';
import { disparosService } from '../modules/crm/disparos/disparos.service';
import { disparosEmailService } from '../modules/crm/disparos-email/disparos-email.service';

// Só a instância 0 do cluster PM2 processa, evitando execução duplicada
const isMainInstance = !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0';

if (!isMainInstance) {
  console.log(`[DisparoScheduler] Instância #${process.env.NODE_APP_INSTANCE} — cron desativado (apenas instância 0 processa).`);
}

if (isMainInstance) cron.schedule('* * * * *', async () => {
  try {
    // Buscar disparos agendados cujo horário já chegou
    const result = await query(
      `UPDATE disparos_crm
       SET status = 'processando'
       WHERE status = 'agendado'
         AND agendado_para <= NOW()
       RETURNING id, empresa_id, usuario_id, tipo`,
      []
    );

    if (result.rows.length === 0) return;

    for (const row of result.rows) {
      const { id, empresa_id, usuario_id, tipo } = row;
      console.log(`[DisparoScheduler] Executando disparo #${id} (${tipo || 'whatsapp'})`);

      try {
        if (tipo === 'email') {
          await disparosEmailService.executarAgendado(id, empresa_id, usuario_id);
        } else {
          await disparosService.executarAgendado(id, empresa_id, usuario_id);
        }
      } catch (err: any) {
        console.error(`[DisparoScheduler] Erro ao executar disparo #${id}:`, err.message);
        await query(
          `UPDATE disparos_crm SET status='concluido', finished_at=NOW(),
           erros=jsonb_build_array(jsonb_build_object('erro', $1::text))
           WHERE id=$2`,
          [err.message, id]
        );
      }
    }
  } catch (err: any) {
    console.error('[DisparoScheduler] Erro no job:', err.message);
  }
});
