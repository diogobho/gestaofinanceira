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
import { leadFalouRecentemente, contatoJaEscreveuAlgumaVez } from '../../modules/crm/_shared/conversa';
import { ResultadoDespacho } from './motor';
import { contaAtivaDoUsuario } from '../../modules/whatsapp/canal/contas';
import { estadoJanela, mensagemJanelaFechada } from '../../modules/whatsapp/canal/janela';
import { erroNoFormatoDaInstancia } from '../../modules/whatsapp/canal/instancia';
import { marcarOrigemErro } from '../../shared/erros';
import { temCapacidade } from '../../shared/capacidades';

/**
 * Número oficial com a janela de 24h FECHADA: texto livre (e a resposta do agente de
 * IA) não sai — a Meta só entrega modelo aprovado. Se o passo da cadência tem um
 * "modelo de reserva" (`followup_config.passos[i].modelo_whatsapp`), ele sai no
 * lugar da mensagem; senão o follow-up falha AGORA, com o motivo escrito, em vez de
 * ser marcado enviado e a recusa (131047) chegar depois pelo webhook.
 *
 * Devolve null quando o caminho normal vale (empresa no QR Code, ou janela aberta).
 */
async function viaModeloSeJanelaFechada(
  followup: any,
  remetenteId: number,
  contatoId: number
): Promise<ResultadoDespacho | null> {
  // Pelo REMETENTE, não pela empresa: quem decide se a janela de 24h vale é o
  // número que vai enviar. Numa empresa com parte da equipe já no oficial, perguntar
  // pela empresa faria o operador do QR ser cobrado por uma regra que não é dele.
  const conta = await contaAtivaDoUsuario(remetenteId, followup.empresa_id);
  if (!conta) return null;

  const c = await query(`SELECT whatsapp_id, numero FROM contatos_whatsapp WHERE id = $1`, [contatoId]);
  const destino = c.rows[0]?.whatsapp_id || c.rows[0]?.numero;
  if (!destino) return null;
  const janela = await estadoJanela(followup.empresa_id, destino);
  if (janela.aberta) return null;

  let modelo: any = null;
  if (followup.origem === 'estagio' && followup.passo_ordem != null) {
    const r = await query(`SELECT followup_config FROM estagios_funil WHERE id = $1`, [followup.estagio_id]);
    const passos = r.rows[0]?.followup_config?.passos;
    modelo = Array.isArray(passos) ? passos[followup.passo_ordem]?.modelo_whatsapp : null;
  }
  if (!modelo?.nome) {
    throw marcarOrigemErro(
      erroNoFormatoDaInstancia(
        422,
        mensagemJanelaFechada(janela) +
          (followup.origem === 'estagio'
            ? ' Escolha um modelo de reserva neste passo da cadência para ele sair mesmo assim.'
            : '')
      ),
      'whatsapp'
    );
  }

  const leadRow = (await query(
    `SELECT l.*, u.nome AS responsavel_nome FROM leads l LEFT JOIN usuarios u ON u.id = l.responsavel_id WHERE l.id = $1`,
    [followup.lead_id]
  )).rows[0] || {};
  const envio = await contatosService.enviarModeloWhatsApp(
    remetenteId,
    followup.empresa_id,
    contatoId,
    {
      nome: modelo.nome,
      idioma: modelo.idioma,
      valores: {
        corpo: (modelo.variaveis || []).map((v: string) => aplicarVariaveisLead(String(v ?? ''), leadRow)),
        cabecalho: modelo.cabecalho ? aplicarVariaveisLead(String(modelo.cabecalho), leadRow) : null,
      },
    },
    followup.lead_id,
    'followup'
  );
  if (!envio.success) {
    const erro: any = new Error(envio.error || 'Falha ao enviar o modelo');
    if (envio.status) erro.status = envio.status;
    throw marcarOrigemErro(erro, 'whatsapp');
  }
  return 'enviado';
}

export async function despachar(followup: any): Promise<ResultadoDespacho> {
  // Primeiro contato com quem nunca escreveu é `conversa_fria` — capacidade do
  // plano Enterprise, que fala pela API Oficial da Meta. Num número comum é
  // exatamente o que causa bloqueio, e a cadência é a porta dos fundos do
  // disparo: bloquear só o botão de disparar deixaria o mesmo envio sair daqui,
  // um lead por vez. A checagem é feita ANTES dos dois ramos porque a regra é do
  // plano, não do tipo de follow-up.
  if (!(await temCapacidade(followup.empresa_id, 'conversa_fria'))
      && !(await contatoJaEscreveuAlgumaVez(followup.lead_id, followup.contato_whatsapp_id))) {
    return 'sem_capacidade';
  }
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

  const viaModelo = await viaModeloSeJanelaFechada(followup, remetenteId, contatoId);
  if (viaModelo) return viaModelo;

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

  const remetenteIA = followup.remetente_id || (await query(
    `SELECT COALESCE(responsavel_id, $2) AS remetente_id FROM leads WHERE id = $1`,
    [followup.lead_id, followup.usuario_id]
  )).rows[0]?.remetente_id || followup.usuario_id;
  const viaModelo = await viaModeloSeJanelaFechada(followup, remetenteIA, followup.contato_whatsapp_id);
  if (viaModelo) return viaModelo;

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
