/**
 * O lado sujo do follow-up: o que de fato conversa com o banco, o WhatsApp e o
 * agente de IA. O motor não conhece nada disto — só a interface `despachar`.
 */

import { query } from '../../config/database';
import { followupsService } from '../../modules/crm/followups/followups.service';
import { agenteIaService } from '../../modules/agente-ia/agente-ia.service';
import { contatosService } from '../../modules/crm/contatos/contatos.service';
import { leadsService } from '../../modules/crm/leads/leads.service';
import { aplicarVariaveisLead } from '../../modules/crm/_shared/agendamento';
import { leadFalouRecentemente } from '../../modules/crm/_shared/conversa';
import { ResultadoDespacho } from './motor';

export async function despachar(followup: any): Promise<ResultadoDespacho> {
  return followup.tipo === 'manual' ? despacharManual(followup) : despacharIA(followup);
}

async function despacharManual(followup: any): Promise<ResultadoDespacho> {
  // Conversa viva: regra única em `_shared/conversa.ts`, a mesma que o ramo de IA usa.
  if (await leadFalouRecentemente(followup.lead_id, followup.contato_whatsapp_id)) return 'adiado';

  // responsavel_nome alimenta a variável [Responsavel] do template.
  const leadRow = (await query(
    `SELECT l.*, u.nome AS responsavel_nome
       FROM leads l LEFT JOIN usuarios u ON u.id = l.responsavel_id
      WHERE l.id = $1`,
    [followup.lead_id]
  )).rows[0];
  if (!leadRow) return 'sem_destino';

  // A mensagem sai SEMPRE pelo WhatsApp do RESPONSÁVEL do lead (dono da relação).
  // É o mesmo chip pelo qual o motor agrupou a fila e mediu o espaçamento.
  const remetenteId = leadRow.responsavel_id || followup.usuario_id;

  // Lead importado nasce sem contato vinculado: resolve/cria pelo telefone.
  let contatoId = leadRow.contato_whatsapp_id;
  if (!contatoId) {
    contatoId = await contatosService.resolverContatoParaLead(
      followup.lead_id, remetenteId, followup.empresa_id
    );
  }
  if (!contatoId) return 'sem_destino';

  const texto = aplicarVariaveisLead(followup.mensagem || '', leadRow);
  if (!texto.trim() && !followup.media_url) return 'sem_conteudo';

  if (followup.media_url) {
    await contatosService.enviarMediaArmazenada(
      remetenteId, followup.empresa_id, contatoId,
      followup.media_url,
      followup.media_mimetype || 'application/octet-stream',
      followup.media_filename || 'arquivo',
      texto || undefined,
      followup.lead_id,
      'followup'
    );
  } else {
    await contatosService.enviarMensagemOuFalhar(
      remetenteId, followup.empresa_id, contatoId, texto, followup.lead_id, 'followup'
    );
  }
  return 'enviado';
}

async function despacharIA(followup: any): Promise<ResultadoDespacho> {
  // Lead importado nasce sem contato vinculado — o ramo manual resolve isso e aqui
  // o follow-up simplesmente morria. Resolve sob o RESPONSÁVEL (dono do chip).
  if (!followup.contato_whatsapp_id) {
    const respId = followup.remetente_id || (await query(
      `SELECT COALESCE(responsavel_id, $2) AS remetente_id FROM leads WHERE id = $1`,
      [followup.lead_id, followup.usuario_id]
    )).rows[0]?.remetente_id || followup.usuario_id;
    followup.contato_whatsapp_id = await contatosService.resolverContatoParaLead(
      followup.lead_id, respId, followup.empresa_id
    );
  }
  if (!followup.contato_whatsapp_id) return 'sem_destino';

  return await agenteIaService.processarFollowUpIA(followup);
}

/**
 * Após enviar um follow-up de origem 'estagio', move o lead para o estágio
 * configurado em `estagios_funil.estagio_apos_envio_id`. O moverPorAutomacao também
 * encerra a cadência antiga e inicia a do destino.
 */
export async function aposEnvio(followup: any): Promise<void> {
  if (followup.origem !== 'estagio') return;
  // Numa cadência de vários passos, só o último move o lead.
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
    console.log(`[FollowUp] Lead #${followup.lead_id} movido para estágio #${info.estagio_apos_envio_id} após envio (cadência do destino iniciada)`);
  }
}

/** Implementação real das portas do motor. */
export const portasReais = {
  followups: followupsService,
  despachar,
  aposEnvio,
};
