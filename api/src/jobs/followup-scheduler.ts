/**
 * Job: Follow-up Scheduler
 *
 * Roda a cada minuto, busca follow-ups pendentes cujo horário (agendado_para) já passou
 * e os processa: envia mensagem manual/personalizada ou aciona o agente IA.
 *
 * O instante de disparo já vem calculado no padrão único (após X dias OU data fixa,
 * em horário exato, rolado para o próximo dia da semana válido). O scheduler ainda
 * re-checa dias_semana como segurança: se um follow-up estiver atrasado e o dia atual
 * não for permitido, ele aguarda o próximo dia válido.
 *
 * Após o envio, se a origem for 'estagio' e o estágio tiver estagio_apos_envio_id,
 * o lead é movido automaticamente para esse estágio.
 */

import cron from 'node-cron';
import { followupsService } from '../modules/crm/followups/followups.service';
import { agenteIaService } from '../modules/agente-ia/agente-ia.service';
import { contatosService } from '../modules/crm/contatos/contatos.service';
import { query } from '../config/database';
import { aplicarVariaveisLead, diaSemanaPermitido } from '../modules/crm/_shared/agendamento';

/**
 * Após enviar um follow-up de origem 'estagio', move o lead para o estágio
 * configurado em estagios_funil.estagio_apos_envio_id (se houver e for diferente do atual).
 */
async function moverLeadAposEnvio(followup: any): Promise<void> {
  if (followup.origem !== 'estagio') return;
  // Numa cadência de vários passos, só o último move o lead (intermediários não).
  if (followup.mover_apos_envio === false) return;
  const r = await query(
    `SELECT ef.estagio_apos_envio_id, ef2.nome AS destino_nome
     FROM estagios_funil ef
     LEFT JOIN estagios_funil ef2 ON ef2.id = ef.estagio_apos_envio_id
     WHERE ef.id = $1`,
    [followup.estagio_id]
  );
  const info = r.rows[0];
  if (!info?.estagio_apos_envio_id || info.estagio_apos_envio_id === followup.estagio_id) return;

  await query(`UPDATE leads SET estagio_id = $1 WHERE id = $2`, [info.estagio_apos_envio_id, followup.lead_id]);
  await query(
    `INSERT INTO atividades_lead (lead_id, usuario_id, empresa_id, tipo, descricao, dados)
     VALUES ($1, $2, $3, 'mudanca_estagio', $4, $5::jsonb)`,
    [
      followup.lead_id, followup.usuario_id, followup.empresa_id,
      `Movido automaticamente para "${info.destino_nome || '?'}" após envio da mensagem agendada`,
      JSON.stringify({ automatico: true, trigger: 'apos_envio', novo_estagio_id: info.estagio_apos_envio_id }),
    ]
  );
  console.log(`[FollowUp Scheduler] Lead #${followup.lead_id} movido para estágio #${info.estagio_apos_envio_id} após envio`);
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
          // Segurança: se atrasado e o dia atual não é permitido, aguarda o próximo dia válido.
          if (!diaSemanaPermitido(followup.dias_semana)) {
            console.log(`[FollowUp Scheduler] #${followup.id} fora dos dias permitidos — aguardando próximo dia válido`);
            continue;
          }

          if (followup.tipo === 'manual') {
            const leadRow = (await query(`SELECT * FROM leads WHERE id = $1`, [followup.lead_id])).rows[0];
            if (!leadRow) {
              await followupsService.marcarFalhou(followup.id, 'Lead não encontrado');
              continue;
            }
            // A mensagem sai SEMPRE pelo WhatsApp do RESPONSÁVEL do lead (dono da relação),
            // não por quem criou/moveu o lead nem pelo usuario_id do registro.
            const remetenteId = leadRow.responsavel_id || followup.usuario_id;
            // Se o lead ainda não tem contato vinculado (ex.: lead novo da Hotmart que
            // nunca conversou), resolve/cria um a partir do telefone (sob o responsável) e vincula.
            let contatoId = leadRow.contato_whatsapp_id;
            if (!contatoId) {
              contatoId = await contatosService.resolverContatoParaLead(
                followup.lead_id, remetenteId, followup.empresa_id
              );
            }
            if (!contatoId) {
              await followupsService.marcarFalhou(followup.id, 'Lead sem telefone válido para envio no WhatsApp');
              continue;
            }
            // Personalização: substitui [Nome], [Telefone] e demais atributos do lead.
            const texto = aplicarVariaveisLead(followup.mensagem || '', leadRow);
            if (followup.media_url) {
              // Anexo: envia a mídia via /send-media; o texto (com variáveis) vira a legenda.
              await contatosService.enviarMediaArmazenada(
                remetenteId,
                followup.empresa_id,
                contatoId,
                followup.media_url,
                followup.media_mimetype || 'application/octet-stream',
                followup.media_filename || 'arquivo',
                texto || undefined,
                followup.lead_id
              );
            } else {
              await contatosService.enviarMensagem(
                remetenteId,
                followup.empresa_id,
                contatoId,
                texto,
                followup.lead_id
              );
            }
            await followupsService.marcarEnviado(followup.id);
            await moverLeadAposEnvio(followup);
            console.log(`[FollowUp Scheduler] Manual enviado: follow-up #${followup.id} → lead #${followup.lead_id} (remetente user #${remetenteId})${followup.media_url ? ' (com mídia)' : ''}`);
          } else {
            // agente_ia
            if (!followup.contato_whatsapp_id) {
              await followupsService.marcarFalhou(followup.id, 'Lead sem contato WhatsApp vinculado');
              continue;
            }
            const resultado = await agenteIaService.processarFollowUpIA(followup);
            if (resultado === 'enviado') {
              await followupsService.marcarEnviado(followup.id);
              await moverLeadAposEnvio(followup);
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
