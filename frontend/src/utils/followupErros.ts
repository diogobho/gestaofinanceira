import type { FollowupErroCategoria } from '@/types/crm'

/**
 * Tradução de `followups_agendados.erro_categoria` para linguagem de operador.
 *
 * Existe porque a categoria era gravada no banco desde a migration 070 e **nunca
 * chegava à tela**: o campo não estava nem no type. O usuário via só o texto cru do
 * erro, truncado, e não tinha como saber se aquilo ia se resolver sozinho, se
 * dependia de reconectar um número ou se era configuração errada dele.
 *
 * `acaoDoUsuario` é o que separa as categorias na prática: reagendar um follow-up cujo
 * chip está banido só produz outra falha. A tela usa isso para dizer o que fazer
 * ANTES de oferecer o botão.
 */

export interface DescricaoErroFollowup {
  /** Rótulo curto, para o badge. */
  rotulo: string
  /** O que aconteceu, em uma frase. */
  explicacao: string
  /** O que a pessoa precisa fazer antes de reagendar. Vazio = nada, só reagendar. */
  acaoDoUsuario: string
  /** Cor do badge (classes Tailwind, com par para o modo escuro). */
  tom: string
  /**
   * Reagendar agora tende a funcionar? `false` não bloqueia o botão — a decisão é da
   * pessoa —, mas a tela avisa que o problema de fundo continua lá.
   */
  reagendarResolve: boolean
}

const AMBAR = 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40'
const VERMELHO = 'bg-red-100 text-red-800 border-red-300 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/40'
const CINZA = 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-500/15 dark:text-gray-300 dark:border-gray-500/40'
const ROXO = 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/40'

const MAPA: Record<FollowupErroCategoria, DescricaoErroFollowup> = {
  transitorio: {
    rotulo: 'Instabilidade',
    explicacao: 'Falha temporária de rede ou sobrecarga do provedor. O sistema tentou várias vezes e desistiu.',
    acaoDoUsuario: '',
    tom: AMBAR,
    reagendarResolve: true,
  },
  canal_indefinido: {
    rotulo: 'WhatsApp indisponível',
    explicacao: 'A instância do WhatsApp não respondeu no momento do envio.',
    acaoDoUsuario: 'Confira em WhatsApp se o número do responsável está conectado.',
    tom: AMBAR,
    reagendarResolve: true,
  },
  canal_bloqueado: {
    rotulo: 'Número desconectado',
    explicacao: 'O número do responsável está deslogado, com sessão inválida ou bloqueado pelo WhatsApp.',
    acaoDoUsuario: 'Reconecte o número em WhatsApp. Com ele de volta, a cadência retoma deste passo sozinha (falhas de até 15 dias).',
    tom: VERMELHO,
    reagendarResolve: false,
  },
  destino_invalido: {
    rotulo: 'Número sem WhatsApp',
    explicacao: 'O telefone do lead não tem conta no WhatsApp, ou está em formato inválido.',
    acaoDoUsuario: 'Corrija o telefone do lead. Reagendar sem corrigir dá a mesma falha.',
    tom: VERMELHO,
    reagendarResolve: false,
  },
  ia_credencial: {
    rotulo: 'IA sem saldo/chave',
    explicacao: 'O provedor de IA recusou a chamada por credencial inválida ou saldo insuficiente.',
    acaoDoUsuario: 'Atualize a chave de API em Agente IA → Configurar Agente.',
    tom: ROXO,
    reagendarResolve: false,
  },
  config_ausente: {
    rotulo: 'Agente não configurado',
    explicacao: 'A empresa não tem agente de IA configurado, então esta mensagem nunca teria como ser escrita.',
    acaoDoUsuario: 'Configure o agente em Agente IA → Configurar Agente.',
    tom: ROXO,
    reagendarResolve: false,
  },
  conflito_config: {
    rotulo: 'Conflito de configuração',
    explicacao: 'Os dias permitidos neste passo da cadência não têm nenhum dia em comum com a janela de envio da empresa.',
    acaoDoUsuario: 'Ajuste os dias do passo, ou a janela em Agendamentos → Horário de envio.',
    tom: VERMELHO,
    reagendarResolve: false,
  },
  lead_arquivado: {
    rotulo: 'Lead arquivado',
    explicacao: 'O lead foi arquivado, então a régua de follow-up deixou de valer.',
    acaoDoUsuario: 'Reative o lead se quiser retomar a cadência.',
    tom: CINZA,
    reagendarResolve: false,
  },
  desconhecido: {
    rotulo: 'Falha não classificada',
    explicacao: 'O erro não casou com nenhuma categoria conhecida — provavelmente um problema interno.',
    acaoDoUsuario: 'Se repetir, abra um chamado em Suporte com o horário e o nome do lead.',
    tom: CINZA,
    reagendarResolve: true,
  },
}

/**
 * Descrição de uma categoria. Categoria ausente (registro anterior à 070) ou
 * desconhecida cai em 'desconhecido' em vez de quebrar a tela — o campo é opcional no
 * banco de propósito e sempre vai existir linha antiga sem ele.
 */
export function descreverErroFollowup(
  categoria?: FollowupErroCategoria | string | null
): DescricaoErroFollowup {
  if (categoria && categoria in MAPA) return MAPA[categoria as FollowupErroCategoria]
  return MAPA.desconhecido
}

/**
 * Um follow-up que estourou o teto de tentativas continua com a categoria do último
 * erro (`transitorio`, `canal_indefinido`…), e é o texto do erro que registra o teto.
 * Para a tela, "esgotou as tentativas" é a informação mais útil das duas.
 */
export function esgotouTentativas(erro?: string | null): boolean {
  return !!erro && /Encerrado após \d+ tentativas/i.test(erro)
}
