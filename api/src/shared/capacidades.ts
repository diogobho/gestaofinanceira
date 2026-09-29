/**
 * Capacidades por plano — o que cada assinatura PODE fazer.
 *
 * ── Por que existe ───────────────────────────────────────────────────────────
 * A landing vende três produtos e a linha que os separa não é "quantos recursos",
 * é QUAL CANAL de WhatsApp: QR Code serve para RESPONDER, a API Oficial da Meta
 * serve para PROSPECTAR. O que a Meta pune não é a funcionalidade — é falar
 * primeiro com quem não te conhece. Medido na própria base: disparo e follow-up
 * frio são ~15% dos envios e quase todo o risco de bloqueio.
 *
 * Até 20/09/2026 nada disso era verificado: não havia guard por plano na API nem
 * no menu. Este módulo é a fonte ÚNICA da resposta — a mesma pergunta feita no
 * middleware de rota, no serviço e na tela sai daqui, senão as três divergem.
 *
 * ── Três camadas, nesta ordem ───────────────────────────────────────────────
 *   1. CAPACIDADE  — a empresa contratou isto?        ← este módulo
 *   2. PERMISSÃO   — o master liberou para o usuário? ← rbac.middleware / PrivateRoute
 *   3. CANAL       — tecnicamente já dá?              ← whatsapp/canal/contas.ts
 *
 * As três são independentes e nenhuma substitui a outra. O erro clássico é
 * confundir 1 com 3: um Enterprise recém-assinado TEM direito ao canal oficial e
 * ainda não tem número ligado — quem responde isso é o canal, não o plano, e a
 * tela precisa dizer "conecte o número", não "faça upgrade".
 *
 * ── Capacidade some da tela? Não. ───────────────────────────────────────────
 * Fora do plano, o botão aparece DESABILITADO com o motivo e o caminho do
 * upgrade. Esconder não vende upgrade, e quem leu a landing vai procurar o botão
 * — não achar parece defeito. Por isso todo item aqui carrega `motivo`: é o texto
 * que a tela mostra, escrito uma vez, no mesmo lugar da regra.
 */

import { query } from '../config/database';

export type Capacidade =
  // — comuns a todos os planos —
  | 'financeiro'        // receitas, despesas, parcelas, clientes
  | 'relatorios'        // dashboard e PDF
  | 'duo_chat'          // assistente financeiro
  // — a partir do Profissional —
  | 'crm'               // funil, cards, conversa no card
  | 'whatsapp_qr'       // conectar o próprio número por QR Code
  | 'agente_reativo'    // o agente responde quem escreveu
  | 'followup_morno'    // cadência para quem JÁ respondeu alguma vez
  | 'disparo_email'     // disparo em massa por e-mail
  | 'grupos_whatsapp'   // aba Grupos e importação de participantes
  // — só Enterprise —
  | 'whatsapp_oficial'  // número pela Cloud API da Meta
  | 'disparo_whatsapp'  // disparo em massa por WhatsApp
  | 'conversa_fria'     // primeiro toque em quem nunca escreveu
  | 'agente_proativo'   // o agente inicia conversa
  | 'modelos_meta'      // criar e usar modelos aprovados
  | 'smtp_proprio'      // e-mail com o domínio do cliente
  | 'grupos_campanhas'; // campanhas de grupo: link único, grupos automáticos, entrada vira lead (089)

interface ItemCatalogo {
  rotulo: string;
  /** Por que não está disponível. Vai direto para a tela — escreva para o cliente. */
  motivo: string;
  /** Plano que a destrava, pelo nome, para a tela oferecer o upgrade certo. */
  planoMinimo: 'Starter' | 'Profissional' | 'Enterprise';
}

/**
 * O catálogo é a documentação executável: chave nova entra aqui e na migration,
 * e a tela descobre rótulo e motivo sozinha. Nada de string solta no meio do código.
 */
export const CATALOGO: Record<Capacidade, ItemCatalogo> = {
  financeiro:       { rotulo: 'Financeiro',                 planoMinimo: 'Starter',      motivo: 'Disponível em todos os planos.' },
  relatorios:       { rotulo: 'Relatórios e dashboard',     planoMinimo: 'Starter',      motivo: 'Disponível em todos os planos.' },
  duo_chat:         { rotulo: 'Assistente Duo',             planoMinimo: 'Starter',      motivo: 'Disponível em todos os planos.' },

  crm:              { rotulo: 'CRM e funil',                planoMinimo: 'Profissional', motivo: 'O CRM entra a partir do plano Profissional.' },
  whatsapp_qr:      { rotulo: 'WhatsApp por QR Code',       planoMinimo: 'Profissional', motivo: 'Conectar o seu número ao CRM entra a partir do plano Profissional.' },
  agente_reativo:   { rotulo: 'Agente de IA que responde',  planoMinimo: 'Profissional', motivo: 'O agente de IA entra a partir do plano Profissional.' },
  followup_morno:   { rotulo: 'Follow-up de quem respondeu', planoMinimo: 'Profissional', motivo: 'As cadências entram a partir do plano Profissional.' },
  disparo_email:    { rotulo: 'Disparo de e-mail',          planoMinimo: 'Profissional', motivo: 'O disparo de e-mail entra a partir do plano Profissional.' },
  grupos_whatsapp:  { rotulo: 'Grupos do WhatsApp',         planoMinimo: 'Profissional', motivo: 'Os grupos entram a partir do plano Profissional.' },

  whatsapp_oficial: { rotulo: 'WhatsApp Oficial (Meta)',    planoMinimo: 'Enterprise',
    motivo: 'O número oficial da Meta é do plano Enterprise. Ele é o canal que pode iniciar conversa sem expor o seu número a bloqueio.' },
  disparo_whatsapp: { rotulo: 'Disparo de WhatsApp',        planoMinimo: 'Enterprise',
    motivo: 'O disparo em massa no WhatsApp é do plano Enterprise, que usa a API Oficial da Meta. Num número comum, ele é o que mais causa bloqueio.' },
  conversa_fria:    { rotulo: 'Primeiro contato em massa',  planoMinimo: 'Enterprise',
    motivo: 'Iniciar conversa com quem nunca escreveu para você é do plano Enterprise, pela API Oficial da Meta. No seu plano a cadência fala com quem já respondeu.' },
  agente_proativo:  { rotulo: 'Agente de IA proativo',      planoMinimo: 'Enterprise',
    motivo: 'O agente que inicia conversa é do plano Enterprise.' },
  modelos_meta:     { rotulo: 'Modelos aprovados pela Meta', planoMinimo: 'Enterprise',
    motivo: 'Os modelos de mensagem são do plano Enterprise, que usa a API Oficial da Meta.' },
  smtp_proprio:     { rotulo: 'SMTP próprio',               planoMinimo: 'Enterprise',
    motivo: 'Enviar e-mail com o seu domínio é do plano Enterprise.' },
  grupos_campanhas: { rotulo: 'Campanhas de grupo',        planoMinimo: 'Enterprise',
    motivo: 'As campanhas de grupo (link único, grupos que abrem sozinhos e quem entra virando lead) são do plano Enterprise.' },
};

export const ehCapacidade = (v: unknown): v is Capacidade =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(CATALOGO, v);

/**
 * Cache curto por processo. São 3 instâncias no cluster e a pergunta é feita em
 * toda requisição do CRM: sem cache, cada uma vira um SELECT. 30s é curto o
 * bastante para uma troca de plano aparecer sozinha e longo o bastante para não
 * pesar — e `limparCacheCapacidades()` zera na hora para quem acabou de mudar.
 */
const TTL_MS = 30_000;
const cache = new Map<number, { em: number; caps: Set<Capacidade> }>();

export function limparCacheCapacidades(empresaId?: number) {
  if (empresaId === undefined) cache.clear();
  else cache.delete(Number(empresaId));
}

function listaValida(v: unknown): Capacidade[] {
  return Array.isArray(v) ? v.filter(ehCapacidade) : [];
}

/**
 * O que ESTA empresa pode. É a união do plano com a cortesia da empresa
 * (`empresas.capacidades_extras`) — nunca a subtração: retirar algo de uma
 * empresa é mudar o plano dela, e isso é conversa comercial, não configuração.
 *
 * Empresa sem assinatura ou sem plano fica com as capacidades do Starter, não com
 * lista vazia: conta em cadastro, conta de teste e conta antiga sem linha em
 * `assinaturas` existem, e nenhuma delas deve perder o financeiro por omissão de
 * dado. O que barra quem não pagou é o status da assinatura, não isto aqui.
 */
export async function capacidadesDaEmpresa(empresaId: number): Promise<Set<Capacidade>> {
  const id = Number(empresaId);
  const guardado = cache.get(id);
  if (guardado && Date.now() - guardado.em < TTL_MS) return guardado.caps;

  const r = await query(
    `SELECT p.capacidades AS plano_caps, e.capacidades_extras AS extras
       FROM empresas e
       LEFT JOIN assinaturas a ON a.empresa_id = e.id
       LEFT JOIN planos p      ON p.id = a.plano_id
      WHERE e.id = $1`,
    [id]
  );
  const linha = r.rows[0];
  const doPlano = listaValida(linha?.plano_caps);
  const extras = listaValida(linha?.extras);

  const caps = new Set<Capacidade>(
    doPlano.length || extras.length
      ? [...doPlano, ...extras]
      : ['financeiro', 'relatorios', 'duo_chat']
  );
  cache.set(id, { em: Date.now(), caps });
  return caps;
}

export async function temCapacidade(empresaId: number, cap: Capacidade): Promise<boolean> {
  return (await capacidadesDaEmpresa(empresaId)).has(cap);
}

/** Corpo do 403, montado num lugar só para a tela sempre receber o mesmo formato. */
export function recusa(cap: Capacidade) {
  const item = CATALOGO[cap];
  return {
    code: 'PLANO_SEM_CAPACIDADE' as const,
    capacidade: cap,
    recurso: item.rotulo,
    plano_minimo: item.planoMinimo,
    message: item.motivo,
  };
}
