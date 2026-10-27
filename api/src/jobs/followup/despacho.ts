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
import { leadFalouRecentemente, contatoJaEscreveuAlgumaVez, leadEhComprador } from '../../modules/crm/_shared/conversa';
import { ResultadoDespacho } from './motor';
import { contaAtivaDoUsuario, enviaPeloOficial } from '../../modules/whatsapp/canal/contas';
import { estadoJanela } from '../../modules/whatsapp/canal/janela';
import { marcarOrigemErro } from '../../shared/erros';
import { temCapacidade } from '../../shared/capacidades';
import { fraseDaOrigem, modeloDaOrigem, modeloSemNome, temNomeDeVerdade, varianteDoLead } from './origem';
import { idsDasTags } from '../../modules/crm/tags/tags-origem';
import { leadSaiu } from '../../modules/crm/optout/optout.service';

/**
 * Número oficial com a janela de 24h FECHADA: texto livre (e a resposta do agente de
 * IA) não sai — a Meta só entrega modelo aprovado. Se o passo da cadência tem um
 * "modelo de reserva" (`followup_config.passos[i].modelo_whatsapp`; no avulso do card,
 * `followups_agendados.modelo_whatsapp`), ele sai no lugar da mensagem; senão o follow-up falha AGORA, com o motivo escrito, em vez de
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
  let modelo: any = null;
  if (followup.origem === 'estagio' && followup.passo_ordem != null) {
    const r = await query(`SELECT followup_config FROM estagios_funil WHERE id = $1`, [followup.estagio_id]);
    const passos = r.rows[0]?.followup_config?.passos;
    modelo = Array.isArray(passos) ? passos[followup.passo_ordem]?.modelo_whatsapp : null;
  } else {
    // Avulso do card: a reserva foi escolhida no agendamento e mora no registro (098).
    modelo = followup.modelo_whatsapp;
  }
  // `sempre_modelo` (09/10/2026): a abertura do funil oficial sai como modelo mesmo com a
  // janela aberta — os botões "Já sei"/"Quero entender" são o que aciona as respostas da
  // Conexão, e o texto livre não tem botão nem a versão da origem.
  const janela = await estadoJanela(followup.empresa_id, destino);
  if (janela.aberta && !modelo?.sempre_modelo) return null;
  // Sem modelo o passo não tem como sair, mas é configuração, não destino: vira
  // `conflito_config` (reagendável) no motor, e sai assim que ganhar a reserva.
  if (!modelo?.nome) return 'sem_modelo';

  const leadRow = (await query(
    `SELECT l.*, u.nome AS responsavel_nome, e.config->'origem_frases' AS origem_frases
       FROM leads l
       LEFT JOIN usuarios u ON u.id = l.responsavel_id
       LEFT JOIN empresas e ON e.id = l.empresa_id
      WHERE l.id = $1`,
    [followup.lead_id]
  )).rows[0] || {};
  leadRow.origem_frase = fraseDaOrigem(leadRow.origem_frases, leadRow.origem);
  // A abertura tem uma versão por origem (`por_origem` no passo), com e sem o nome.
  modelo = modeloDaOrigem(modelo, leadRow.origem, temNomeDeVerdade(leadRow.nome));
  const ab = varianteDoLead(modelo, followup.lead_id);
  modelo = modeloSemNome(ab.modelo, temNomeDeVerdade(leadRow.nome));
  // "[IA:assunto]", "[IA:pergunta]": a IA escreve lendo a conversa (modelos de retomada).
  const camposIA = (modelo.variaveis || [])
    .map((v: string) => /^\[IA:([a-z_]+)\]$/i.exec(String(v ?? ''))?.[1]?.toLowerCase())
    .filter(Boolean) as string[];
  let escritoPelaIA: Record<string, string> = {};
  if (camposIA.length) {
    const r = await agenteIaService.gerarCamposDoModelo(followup, [...new Set(camposIA)]);
    if (!r) return 'pausado';
    escritoPelaIA = r;
  }
  const valorDe = (v: string) => {
    const ia = /^\[IA:([a-z_]+)\]$/i.exec(String(v ?? ''))?.[1]?.toLowerCase();
    return ia ? escritoPelaIA[ia] : aplicarVariaveisLead(String(v ?? ''), leadRow);
  };
  const valores = {
    corpo: (modelo.variaveis || []).map(valorDe),
    cabecalho: modelo.cabecalho ? aplicarVariaveisLead(String(modelo.cabecalho), leadRow) : null,
  };
  // Campo do card vazio não vira "-" no meio da frase ("seu objetivo de -"): o modelo
  // não sai e o motivo diz qual campo preencher. Token que o CRM não conhece (ex.:
  // [Objetivo] antes de o campo existir) também barra, em vez de ir escrito ao lead.
  const faltando = (modelo.variaveis || [])
    .map((v: string, i: number) => {
      const r = String(valores.corpo[i] ?? '').trim();
      return !r || /\[[a-zA-ZÀ-ÿ_]+\]/.test(r) ? String(v) : null;
    })
    .filter(Boolean);
  if (faltando.length) {
    const campos = faltando.map((f: string) => f.replace(/^\[|\]$/g, '')).join(', ');
    // A falha sozinha ninguém vê: vira tarefa do responsável para preencher e mandar
    // à mão. Uma por lead enquanto houver tarefa pendente com o mesmo título.
    const dono = leadRow.responsavel_id || leadRow.usuario_id;
    if (dono) {
      const titulo = `Preencher ${campos} no card e mandar a mensagem`;
      await query(
        `INSERT INTO tarefas_lead (lead_id, empresa_id, responsavel_id, criado_por_id, tipo, titulo, descricao, data_vencimento, prioridade)
         SELECT $1, $2, $3, $3, 'follow_up', $4, $5, NOW(), 'alta'
          WHERE NOT EXISTS (SELECT 1 FROM tarefas_lead WHERE lead_id = $1 AND status = 'pendente' AND titulo = $4)`,
        [followup.lead_id, followup.empresa_id, dono, titulo,
         `O modelo ${modelo.nome} não saiu porque o card está sem ${campos} (Perfil do lead).`]
      ).catch((e: any) => console.warn(`[Followup] lead #${followup.lead_id}: tarefa de campo vazio não criada — ${e.message}`));
    }
    // Sem origem de propósito: é dado do card, não falha do chip — não pode contar
    // como canal bloqueado. Cai na falha explícita do motor, com esta frase.
    throw new Error(`Modelo "${modelo.nome}" não enviado: preencha no card ${faltando.join(', ')}`);
  }
  const envio = await contatosService.enviarModeloWhatsApp(
    remetenteId,
    followup.empresa_id,
    contatoId,
    { nome: modelo.nome, idioma: modelo.idioma, valores },
    followup.lead_id,
    'followup'
  );
  if (envio.success && ab.variante) {
    // Etiqueta da variante no card, para medir a taxa de resposta de A contra B.
    try {
      const ids = await idsDasTags(followup.empresa_id, [`Variante ${ab.variante}`]);
      await query(`INSERT INTO lead_tags (lead_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [followup.lead_id, ids.get(`Variante ${ab.variante}`)]);
    } catch (e: any) {
      console.warn(`[Followup] lead #${followup.lead_id}: etiqueta da variante não aplicada — ${e.message}`);
    }
  }
  if (!envio.success) {
    const erro: any = new Error(envio.error || 'Falha ao enviar o modelo');
    if (envio.status) erro.status = envio.status;
    throw marcarOrigemErro(erro, 'whatsapp');
  }
  return 'enviado';
}

export async function despachar(followup: any): Promise<ResultadoDespacho> {
  // Pediu para parar de receber (botão do modelo ou "parar"): nenhuma automação sai mais.
  if (await leadSaiu(followup.lead_id)) return 'cancelado';
  // Primeiro contato com quem nunca escreveu é `conversa_fria` — capacidade do
  // plano Enterprise, que fala pela API Oficial da Meta. Num número comum é
  // exatamente o que causa bloqueio, e a cadência é a porta dos fundos do
  // disparo: bloquear só o botão de disparar deixaria o mesmo envio sair daqui,
  // um lead por vez. A checagem é feita ANTES dos dois ramos porque a regra é do
  // plano, não do tipo de follow-up.
  //
  // E a regra é também do CANAL de quem envia (28/09/2026): no Enterprise, quem ainda
  // está no QR fala só com quem já escreveu. Pela empresa, os chips QR da Panteras
  // mandaram 693 primeiros contatos em 30 dias — o risco que o plano existe para tirar.
  // Comprador da Hotmart fica fora: boas-vindas a quem pagou não é contato frio (#231).
  if (!(await contatoJaEscreveuAlgumaVez(followup.lead_id, followup.contato_whatsapp_id))
      && !(await leadEhComprador(followup.lead_id))) {
    if (!(await temCapacidade(followup.empresa_id, 'conversa_fria'))) return 'sem_capacidade';
    const remetente = followup.remetente_id ?? followup.usuario_id;
    if (!(await enviaPeloOficial(remetente))) return 'so_oficial';
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
  // A resposta volta no contato do chip que envia; o card tem que estar nele (#425).
  contatoId = await contatosService.contatoDoRemetente(followup.lead_id, contatoId, remetenteId, followup.empresa_id);

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
