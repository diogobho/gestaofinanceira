/**
 * Job: Follow-up Scheduler
 *
 * Roda a cada minuto, busca follow-ups pendentes cujo horário já passou
 * e os processa: envia mensagem manual ou aciona o agente IA.
 *
 * Respeita janela de horário (hora_inicio/hora_fim) e dias da semana
 * configurados no follow-up. Se fora da janela, o registro permanece
 * pendente e será tentado novamente no próximo minuto dentro da janela.
 */

import cron from 'node-cron';
import { followupsService } from '../modules/crm/followups/followups.service';
import { agenteIaService } from '../modules/agente-ia/agente-ia.service';
import { contatosService } from '../modules/crm/contatos/contatos.service';

/** Retorna true se o horário atual (fuso São Paulo) está dentro da janela */
function dentroJanelaHorario(
  horaInicio: string | null,
  horaFim: string | null,
  diasSemana: number[] | null
): boolean {
  const agora = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  );
  const diaSemanaAtual = agora.getDay(); // 0=Dom..6=Sáb
  const horaAtual = agora.getHours();
  const minutoAtual = agora.getMinutes();

  // Verificar dia da semana
  if (diasSemana && diasSemana.length > 0) {
    if (!diasSemana.includes(diaSemanaAtual)) return false;
  }

  // Verificar janela de hora
  if (horaInicio || horaFim) {
    const minutosAgora = horaAtual * 60 + minutoAtual;

    if (horaInicio) {
      const [hI, mI] = horaInicio.split(':').map(Number);
      if (minutosAgora < hI * 60 + mI) return false;
    }
    if (horaFim) {
      const [hF, mF] = horaFim.split(':').map(Number);
      if (minutosAgora >= hF * 60 + mF) return false;
    }
  }

  return true;
}

// Em cluster PM2 cada instância recebe NODE_APP_INSTANCE (0, 1, 2...).
// O scheduler deve rodar apenas na instância 0 para evitar processamento duplicado.
const isMainInstance = !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0';

if (isMainInstance) {
  cron.schedule('* * * * *', async () => {
    try {
      const pendentes = await followupsService.buscarPendentes();
      if (pendentes.length === 0) return;

      console.log(`[FollowUp Scheduler] ${pendentes.length} follow-up(s) para processar`);

      for (const followup of pendentes) {
        try {
          // Verificar janela de horário configurada no follow-up
          if (!dentroJanelaHorario(followup.hora_inicio, followup.hora_fim, followup.dias_semana)) {
            console.log(`[FollowUp Scheduler] #${followup.id} fora da janela de horário — aguardando`);
            continue;
          }

          if (followup.tipo === 'manual') {
            if (!followup.contato_whatsapp_id) {
              await followupsService.marcarFalhou(followup.id, 'Lead sem contato WhatsApp vinculado');
              continue;
            }
            await contatosService.enviarMensagem(
              followup.usuario_id,
              followup.empresa_id,
              followup.contato_whatsapp_id,
              followup.mensagem,
              followup.lead_id
            );
            await followupsService.marcarEnviado(followup.id);
            console.log(`[FollowUp Scheduler] Manual enviado: follow-up #${followup.id} → lead #${followup.lead_id}`);
          } else {
            // agente_ia
            if (!followup.contato_whatsapp_id) {
              await followupsService.marcarFalhou(followup.id, 'Lead sem contato WhatsApp vinculado');
              continue;
            }
            const resultado = await agenteIaService.processarFollowUpIA(followup);
            if (resultado === 'enviado') {
              await followupsService.marcarEnviado(followup.id);
              console.log(`[FollowUp Scheduler] IA enviado: follow-up #${followup.id} → lead #${followup.lead_id}`);
            } else if (resultado === 'cancelado') {
              await followupsService.cancelar(followup.id, followup.empresa_id);
              console.log(`[FollowUp Scheduler] IA cancelado: follow-up #${followup.id} → agente inativo para lead #${followup.lead_id}`);
            } else {
              // 'adiado': conversa ativa, deixar pendente e tentar no próximo ciclo
              console.log(`[FollowUp Scheduler] IA adiado: follow-up #${followup.id} → tentará novamente em 1min`);
            }
          }
        } catch (err: any) {
          console.error(`[FollowUp Scheduler] Erro no follow-up #${followup.id}:`, err.message);
          await followupsService.marcarFalhou(followup.id, err.message || 'Erro desconhecido');
        }
      }
    } catch (err: any) {
      console.error('[FollowUp Scheduler] Erro no cron:', err.message);
    }
  });
  console.log('[FollowUp Scheduler] Cron registrado (a cada 1 min).');
} else {
  console.log(`[FollowUp Scheduler] Instância #${process.env.NODE_APP_INSTANCE} — cron desativado (apenas instância 0 processa).`);
}
