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
import { leadsService } from '../modules/crm/leads/leads.service';
import { query } from '../config/database';
import { aplicarVariaveisLead, diaSemanaPermitido } from '../modules/crm/_shared/agendamento';
import { isMainInstance } from '../shared/utils';

/**
 * Após enviar um follow-up de origem 'estagio', move o lead para o estágio
 * configurado em estagios_funil.estagio_apos_envio_id (se houver e for diferente do atual).
 * O moverPorAutomacao também encerra a cadência antiga e inicia a do estágio destino.
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

  const moveu = await leadsService.moverPorAutomacao(
    followup.lead_id, followup.empresa_id, followup.usuario_id, info.estagio_apos_envio_id,
    `Movido automaticamente para "${info.destino_nome || '?'}" após envio da mensagem agendada`,
    { trigger: 'apos_envio' }
  );
  if (moveu) {
    console.log(`[FollowUp Scheduler] Lead #${followup.lead_id} movido para estágio #${info.estagio_apos_envio_id} após envio (cadência do destino iniciada)`);
  }
}


const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// Quanto empurrar pra frente um follow-up com conversa viva (evita retry/log a cada 1min).
const ADIAR_CONVERSA_ATIVA_MIN = 15;

// Estado de SISTEMA (saldo zerado, credencial inválida, agente desligado) não é falha do
// lead: o follow-up é pausado (adiado) em vez de queimado. Backoff maior que o de conversa
// ativa porque recarregar crédito ou religar o agente é intervenção humana, não coisa de minutos.
const ADIAR_PAUSA_SISTEMA_MIN = 60;

// Detecta erro de saldo zerado / credencial inválida do provedor de IA.
// Em 07/2026 o saldo da Anthropic zerou e, por cair no ramo "não transitório",
// 235 follow-ups de 158 leads foram marcados como falhou — status terminal, sem retry —
// congelando a cadência em silêncio. Esses erros agora pausam em vez de queimar.
// (O agente desligado na empresa é tratado antes, via retorno 'pausado' do processarFollowUpIA.)
function isErroDeCredencialOuSaldo(status: number | undefined, msg: string): boolean {
  if (status === 401 || status === 403) return true;
  return /credit balance is too low|insufficient[_ ]quota|invalid x-api-key|authentication[_ ]error|permission[_ ]error/i.test(msg);
}

// Impede que um ciclo lento se sobreponha ao próximo (evita envio duplicado).
let processando = false;

if (isMainInstance) {
  cron.schedule('* * * * *', async () => {
    if (processando) {
      console.log('[FollowUp Scheduler] Ciclo anterior ainda em andamento — pulando.');
      return;
    }
    processando = true;
    try {
      const pendentes = await followupsService.buscarPendentes();
      if (pendentes.length === 0) return;

      console.log(`[FollowUp Scheduler] ${pendentes.length} follow-up(s) para processar`);

      // Anti-ban global por empresa: no máximo UM envio por empresa por ciclo,
      // respeitando o intervalo (mín/máx, aleatório) desde o último follow-up
      // enviado daquela empresa.
      const intervalos = await followupsService.intervalosFollowupPorEmpresa();
      const ultimoEnvio = await followupsService.ultimoEnvioPorEmpresa();
      const enviadoNesteCiclo = new Set<number>(); // empresa_id que já enviou neste ciclo
      // Empresa com o agente pausado (sem saldo/credencial ou desligado): os demais
      // follow-ups dela cairiam igual neste ciclo — pula todos e tenta de novo no próximo.
      const pausadoNesteCiclo = new Set<number>();

      for (const followup of pendentes) {
        try {
          const empresaId: number | null = followup.empresa_id ?? null;

          // Já enviou para esta empresa neste ciclo → espera o próximo ciclo.
          if (empresaId != null && enviadoNesteCiclo.has(empresaId)) {
            continue;
          }

          // Agente da empresa já acusou pausa (sem saldo/credencial ou desligado) neste ciclo.
          if (empresaId != null && pausadoNesteCiclo.has(empresaId)) {
            continue;
          }

          // Espaçamento: se o último envio desta empresa foi há menos que o intervalo
          // sorteado, adia este follow-up para um próximo ciclo.
          if (empresaId != null) {
            const iv = intervalos[empresaId] || { min: 45, max: 90 };
            const ult = ultimoEnvio[empresaId];
            if (ult) {
              const alvoMs = randInt(iv.min, iv.max) * 1000;
              if (Date.now() - ult < alvoMs) {
                continue;
              }
            }
          }

          // Segurança: se atrasado e o dia atual não é permitido, aguarda o próximo dia válido.
          if (!diaSemanaPermitido(followup.dias_semana)) {
            console.log(`[FollowUp Scheduler] #${followup.id} fora dos dias permitidos — aguardando próximo dia válido`);
            continue;
          }

          // Ordem + no máx. 1 toque de cadência por dia por lead: impede que dois passos
          // (ex.: passo 0 e passo 1 que colidiram na segunda após o fim de semana) saiam
          // empilhados/fora de ordem na mesma manhã. Espera o próximo ciclo/dia.
          if (followup.origem === 'estagio'
              && !(await followupsService.podeEnviarPassoEstagio(followup.lead_id, followup.passo_ordem))) {
            continue;
          }

          if (followup.tipo === 'manual') {
            // Conversa viva: se o LEAD mandou mensagem nos últimos 60min, não atropela
            // com mensagem de script — fica pendente e tenta no próximo ciclo.
            // Checa por CONTATO: a entrada pode estar gravada no lead de outro funil.
            const respostaRecente = await query(
              `SELECT 1 FROM historico_mensagens
               WHERE (lead_id = $1 OR ($2::int IS NOT NULL AND contato_whatsapp_id = $2))
                 AND direcao = 'entrada'
                 AND created_at > NOW() - INTERVAL '60 minutes'
               LIMIT 1`,
              [followup.lead_id, followup.contato_whatsapp_id ?? null]
            );
            if (respostaRecente.rows.length > 0) {
              await followupsService.adiar(followup.id, ADIAR_CONVERSA_ATIVA_MIN);
              console.log(`[FollowUp Scheduler] Manual adiado ${ADIAR_CONVERSA_ATIVA_MIN}min: follow-up #${followup.id} → lead #${followup.lead_id} respondeu há <60min`);
              continue;
            }
            // responsavel_nome alimenta a variável [Responsavel] do template.
            const leadRow = (await query(
              `SELECT l.*, u.nome AS responsavel_nome
                 FROM leads l LEFT JOIN usuarios u ON u.id = l.responsavel_id
                WHERE l.id = $1`,
              [followup.lead_id]
            )).rows[0];
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
            // Sem texto e sem mídia não há o que enviar (mandaria mensagem vazia no WhatsApp).
            if (!texto.trim() && !followup.media_url) {
              await followupsService.marcarFalhou(followup.id, 'Mensagem vazia — follow-up sem texto e sem mídia');
              continue;
            }
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
              // Lança em falha de envio → cai no catch e o follow-up é marcado como falhou.
              await contatosService.enviarMensagemOuFalhar(
                remetenteId,
                followup.empresa_id,
                contatoId,
                texto,
                followup.lead_id
              );
            }
            await followupsService.marcarEnviado(followup.id);
            await moverLeadAposEnvio(followup);
            if (empresaId != null) { enviadoNesteCiclo.add(empresaId); ultimoEnvio[empresaId] = Date.now(); }
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
              if (empresaId != null) { enviadoNesteCiclo.add(empresaId); ultimoEnvio[empresaId] = Date.now(); }
              console.log(`[FollowUp Scheduler] IA enviado: follow-up #${followup.id} → lead #${followup.lead_id}`);
            } else if (resultado === 'cancelado') {
              await followupsService.cancelar(followup.id, followup.empresa_id);
              console.log(`[FollowUp Scheduler] IA cancelado: follow-up #${followup.id} → agente inativo para lead #${followup.lead_id}`);
            } else if (resultado === 'pausado') {
              // Agente desligado / sem key na empresa: mantém 'pendente' e volta sozinho
              // quando religarem. Pula o resto da empresa neste ciclo.
              await followupsService.adiar(followup.id, ADIAR_PAUSA_SISTEMA_MIN);
              if (empresaId != null) pausadoNesteCiclo.add(empresaId);
              console.warn(`[FollowUp Scheduler] IA pausado: follow-ups da empresa ${empresaId} adiados ${ADIAR_PAUSA_SISTEMA_MIN}min — agente desligado ou sem API key.`);
            } else {
              // 'adiado': conversa ativa — empurra pra frente em vez de re-tentar a cada 1min
              await followupsService.adiar(followup.id, ADIAR_CONVERSA_ATIVA_MIN);
              console.log(`[FollowUp Scheduler] IA adiado ${ADIAR_CONVERSA_ATIVA_MIN}min: follow-up #${followup.id} → conversa ativa`);
            }
          }
        } catch (err: any) {
          // Erro transitório (API sobrecarregada, timeout de rede) NÃO é falha definitiva:
          // adia e tenta de novo, em vez de queimar o follow-up. Créditos zerados/400 e
          // demais erros continuam marcando falhou (para o problema aparecer, não repetir infinito).
          const msgErro = err?.message || '';
          // `enviarMensagemOuFalhar` re-lança o erro do axios como Error simples
          // ("Request failed with status code 503"), perdendo err.status e err.response.status.
          // Sem extrair o código do texto, uma instância de WhatsApp fora do ar (503)
          // queimava o follow-up em vez de adiá-lo.
          const statusDoTexto = Number(/status code (\d{3})/i.exec(msgErro)?.[1]) || undefined;
          const status = err?.status ?? err?.response?.status ?? statusDoTexto;
          const transitorio = status === 503 || status === 529 || status === 429
            || /overloaded|too many requests|timeout|etimedout|econnreset|socket hang up/i.test(msgErro);
          if (isErroDeCredencialOuSaldo(status, msgErro)) {
            // Pausa em vez de queimar: o follow-up continua 'pendente' e volta sozinho
            // assim que a key for recarregada/corrigida.
            await followupsService.adiar(followup.id, ADIAR_PAUSA_SISTEMA_MIN);
            if (followup.empresa_id != null) pausadoNesteCiclo.add(followup.empresa_id);
            console.error(
              `[FollowUp Scheduler] #${followup.id} SEM SALDO/CREDENCIAL na API de IA (${status ?? 's/status'}) — ` +
              `follow-ups da empresa ${followup.empresa_id} pausados ${ADIAR_PAUSA_SISTEMA_MIN}min. Recarregue a API key.`
            );
          } else if (transitorio) {
            await followupsService.adiar(followup.id, ADIAR_CONVERSA_ATIVA_MIN);
            console.warn(`[FollowUp Scheduler] #${followup.id} erro transitório (${status || err.message}) — adiado ${ADIAR_CONVERSA_ATIVA_MIN}min`);
          } else {
            console.error(`[FollowUp Scheduler] Erro no follow-up #${followup.id}:`, err.message);
            await followupsService.marcarFalhou(followup.id, err.message || 'Erro desconhecido');
          }
        }
      }
    } catch (err: any) {
      console.error('[FollowUp Scheduler] Erro no cron:', err.message);
    } finally {
      processando = false;
    }
  });
  console.log('[FollowUp Scheduler] Cron registrado (a cada 1 min).');
} else {
  console.log(`[FollowUp Scheduler] Instância #${process.env.NODE_APP_INSTANCE} — cron desativado (apenas instância 0 processa).`);
}
