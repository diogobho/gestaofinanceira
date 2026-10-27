/**
 * Espelho do catálogo de `api/src/shared/capacidades.ts`.
 *
 * Quem MANDA é o backend: ele recusa com 403 e o corpo já traz recurso, plano
 * mínimo e motivo prontos para a tela. Este arquivo existe só para a tela não
 * piscar — desabilitar o botão antes de o clique ir até a API é diferente de
 * decidir permissão no cliente, que nunca é permissão.
 *
 * É a mesma divisão de trabalho de `utils/roles.ts` e do dashboard do Conta Azul:
 * o frontend usa o perfil para não mostrar o que vai ser negado; quem nega é o
 * servidor.
 *
 * Capacidade nova entra em TRÊS lugares — a migration, o catálogo da API e aqui.
 * O teste `api/tests/capacidades.test.ts` prende os dois primeiros; este arquivo
 * é preso pelo TypeScript no momento em que alguém usa uma chave que não existe.
 */

export type Capacidade =
  | 'financeiro' | 'relatorios' | 'duo_chat'
  | 'crm' | 'whatsapp_qr' | 'agente_reativo' | 'followup_morno'
  | 'disparo_email' | 'grupos_whatsapp'
  | 'whatsapp_oficial' | 'disparo_whatsapp' | 'conversa_fria'
  | 'agente_proativo' | 'modelos_meta' | 'smtp_proprio'
  | 'grupos_campanhas'

interface ItemCatalogo {
  rotulo: string
  motivo: string
  planoMinimo: 'Starter' | 'Profissional' | 'Enterprise'
}

export const CATALOGO: Record<Capacidade, ItemCatalogo> = {
  financeiro:       { rotulo: 'Financeiro',                  planoMinimo: 'Starter',      motivo: 'Disponível em todos os planos.' },
  relatorios:       { rotulo: 'Relatórios e dashboard',      planoMinimo: 'Starter',      motivo: 'Disponível em todos os planos.' },
  duo_chat:         { rotulo: 'Assistente Duo',              planoMinimo: 'Starter',      motivo: 'Disponível em todos os planos.' },

  crm:              { rotulo: 'CRM e funil',                 planoMinimo: 'Profissional', motivo: 'O CRM entra a partir do plano Profissional.' },
  whatsapp_qr:      { rotulo: 'WhatsApp por QR Code',        planoMinimo: 'Profissional', motivo: 'Conectar o seu número ao CRM entra a partir do plano Profissional.' },
  agente_reativo:   { rotulo: 'Agente de IA que responde',   planoMinimo: 'Profissional', motivo: 'O agente de IA entra a partir do plano Profissional.' },
  followup_morno:   { rotulo: 'Follow-up de quem respondeu', planoMinimo: 'Profissional', motivo: 'As cadências entram a partir do plano Profissional.' },
  disparo_email:    { rotulo: 'Disparo de e-mail',           planoMinimo: 'Profissional', motivo: 'O disparo de e-mail entra a partir do plano Profissional.' },
  grupos_whatsapp:  { rotulo: 'Grupos do WhatsApp',          planoMinimo: 'Profissional', motivo: 'Os grupos entram a partir do plano Profissional.' },

  whatsapp_oficial: { rotulo: 'WhatsApp Oficial (Meta)',     planoMinimo: 'Enterprise',
    motivo: 'O número oficial da Meta é do plano Enterprise. Ele é o canal que pode iniciar conversa sem expor o seu número a bloqueio.' },
  disparo_whatsapp: { rotulo: 'Disparo de WhatsApp',         planoMinimo: 'Enterprise',
    motivo: 'O disparo em massa no WhatsApp é do plano Enterprise, que usa a API Oficial da Meta. Num número comum, ele é o que mais causa bloqueio.' },
  conversa_fria:    { rotulo: 'Primeiro contato em massa',   planoMinimo: 'Enterprise',
    motivo: 'Iniciar conversa com quem nunca escreveu para você é do plano Enterprise, pela API Oficial da Meta. No seu plano a cadência fala com quem já respondeu.' },
  agente_proativo:  { rotulo: 'Agente de IA proativo',       planoMinimo: 'Enterprise',
    motivo: 'O agente que inicia conversa é do plano Enterprise.' },
  modelos_meta:     { rotulo: 'Modelos aprovados pela Meta', planoMinimo: 'Enterprise',
    motivo: 'Os modelos de mensagem são do plano Enterprise, que usa a API Oficial da Meta.' },
  smtp_proprio:     { rotulo: 'SMTP próprio',                planoMinimo: 'Enterprise',
    motivo: 'Enviar e-mail com o seu domínio é do plano Enterprise.' },
  grupos_campanhas: { rotulo: 'Campanhas de grupo',          planoMinimo: 'Enterprise',
    motivo: 'As campanhas de grupo (link único, grupos que abrem sozinhos e quem entra virando lead) são do plano Enterprise.' },
}

/** Texto curto para `title`/tooltip do controle desabilitado. */
export const motivoDe = (cap: Capacidade): string => CATALOGO[cap].motivo
export const planoQueDestrava = (cap: Capacidade): string => CATALOGO[cap].planoMinimo
