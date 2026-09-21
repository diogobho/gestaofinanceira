import { descreverErroFollowup, esgotouTentativas } from './followupErros'
import type { FollowupErroCategoria } from '@/types/crm'

/**
 * Apresentação de um agendamento na tela de Agendamentos.
 *
 * ── Por que o estado da tela não é a coluna `status` ─────────────────────────
 * O banco guarda 5 status (`pendente`, `processando`, `enviado`, `falhou`,
 * `cancelado`), mas o operador precisa distinguir 7 situações. Duas delas não
 * existem como status e sim como combinação:
 *
 *   - ATRASADO      = `pendente` cujo `agendado_para` já passou. O motor ainda vai
 *                     pegá-lo; o que houve foi o horário escorregar (janela de envio,
 *                     conversa viva, espaçamento anti-ban). Não é falha.
 *   - CONFLITO      = `falhou` com `erro_categoria = 'conflito_config'`. Não é uma
 *                     falha de envio: é configuração impossível (os dias do passo não
 *                     têm nenhum dia em comum com a janela da empresa). A ação é
 *                     outra — mexer na configuração, não reagendar.
 *
 * Misturar os dois no balde genérico de "pendente"/"falhou" era o que fazia a tela
 * não responder "o que aconteceu?". Nada aqui altera o motor: é leitura.
 */

export type EstadoAgendamento =
  | 'agendado'
  | 'atrasado'
  | 'processando'
  | 'enviado'
  | 'cancelado'
  | 'falhou'
  | 'conflito'

/**
 * Forma mínima que esta camada precisa. Tipagem ESTRUTURAL de propósito: o projeto
 * tem dois types de follow-up quase iguais (`Followup` em `api/crm.ts` e
 * `FollowupAgendado` em `types/crm.ts`), e amarrar a um deles obrigaria a converter
 * no outro — mesma decisão já tomada em `FollowupFalhadoItem`.
 */
export interface AgendamentoMinimo {
  status: 'pendente' | 'processando' | 'enviado' | 'falhou' | 'cancelado'
  agendado_para: string
  erro?: string | null
  erro_categoria?: FollowupErroCategoria | string | null
}

export function resolverEstado(f: AgendamentoMinimo, agora: Date = new Date()): EstadoAgendamento {
  if (f.status === 'falhou') {
    return f.erro_categoria === 'conflito_config' ? 'conflito' : 'falhou'
  }
  if (f.status === 'processando') return 'processando'
  if (f.status === 'enviado') return 'enviado'
  if (f.status === 'cancelado') return 'cancelado'
  return new Date(f.agendado_para) < agora ? 'atrasado' : 'agendado'
}

export interface ApresentacaoEstado {
  rotulo: string
  /** Uma frase sobre o que esse estado significa para a operação. */
  significado: string
  /** Classes do badge. `border-[1px]` e não `border`: ver nota de modo escuro abaixo. */
  badge: string
  /** Cor da faixa lateral do card. */
  faixa: string
  /** Já terminou? Define se o card oferece cancelar ou reagendar. */
  terminal: boolean
}

/*
 * NOTA DE MODO ESCURO — os badges usam `border-[1px]`, nunca a classe `border`.
 * `index.css` tem `html.dark .border { border-color: … }` FORA de @layer, com
 * especificidade (0,2,1); uma variante `dark:border-amber-500/40` é (0,2,0) e PERDE.
 * Resultado: toda borda colorida viraria cinza-700 no escuro. `border-[1px]` é outra
 * classe, que o seletor global não alcança — a cor passa a valer nos dois modos.
 */
export const APRESENTACAO: Record<EstadoAgendamento, ApresentacaoEstado> = {
  agendado: {
    rotulo: 'Agendado',
    significado: 'Vai sair no horário previsto.',
    badge: 'border-[1px] bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/40',
    faixa: 'bg-sky-400 dark:bg-sky-500',
    terminal: false,
  },
  atrasado: {
    rotulo: 'Atrasado',
    significado: 'O horário passou e ainda não saiu — o motor tenta a cada minuto, respeitando a janela de envio e o intervalo entre mensagens.',
    badge: 'border-[1px] bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40',
    faixa: 'bg-amber-400 dark:bg-amber-500',
    terminal: false,
  },
  processando: {
    rotulo: 'Em processamento',
    significado: 'Reservado por um ciclo do motor neste instante. Se o processo cair, volta sozinho para a fila.',
    badge: 'border-[1px] bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/40',
    faixa: 'bg-indigo-400 dark:bg-indigo-500',
    terminal: false,
  },
  enviado: {
    rotulo: 'Enviado',
    significado: 'A mensagem saiu pelo WhatsApp do responsável.',
    badge: 'border-[1px] bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/40',
    faixa: 'bg-emerald-400 dark:bg-emerald-500',
    terminal: true,
  },
  cancelado: {
    rotulo: 'Cancelado',
    significado: 'Não será enviado. O registro fica no histórico.',
    badge: 'border-[1px] bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/40',
    faixa: 'bg-slate-300 dark:bg-slate-600',
    terminal: true,
  },
  falhou: {
    rotulo: 'Falhou',
    significado: 'O envio não foi possível. Veja o motivo antes de reagendar.',
    badge: 'border-[1px] bg-red-100 text-red-800 border-red-300 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/40',
    faixa: 'bg-red-400 dark:bg-red-500',
    terminal: true,
  },
  conflito: {
    rotulo: 'Conflito de configuração',
    significado: 'Não existe dia possível para este passo. Precisa de ajuste na configuração, não de reagendamento.',
    badge: 'border-[1px] bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/40',
    faixa: 'bg-purple-400 dark:bg-purple-500',
    terminal: true,
  },
}

const NOME_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/**
 * O PLANO desenhado, em português — "Após 3 dias, às 09:00, seg a sex".
 *
 * Deliberadamente NÃO recalculamos aqui a data original a partir de `created_at`:
 * isso exigiria uma cópia de `calcularAgendadoPara` (fuso de São Paulo, roll-forward
 * de dia da semana, encadeamento de passos) no cliente, e uma segunda implementação
 * de regra de data é exatamente o tipo de duplicação que diverge com o tempo. A regra
 * já está guardada em colunas; mostrá-la é mais útil ao operador do que um timestamp,
 * porque explica POR QUE a próxima data é aquela.
 */
export function descreverPlano(f: {
  modo?: 'dias' | 'data' | null
  atraso_dias?: number | null
  atraso_unidade?: 'minuto' | 'hora' | 'dia' | null
  data_fixa?: string | null
  hora_envio?: string | null
  dias_semana?: number[] | null
}): string {
  const partes: string[] = []

  if (f.modo === 'data' && f.data_fixa) {
    const [y, m, d] = f.data_fixa.split('-')
    partes.push(`Na data fixa ${d}/${m}/${y}`)
  } else {
    const qtd = Number(f.atraso_dias ?? 0)
    const unidade = f.atraso_unidade || 'dia'
    const plural = qtd === 1 ? '' : 's'
    const nome = unidade === 'dia' ? `dia${plural}` : unidade === 'hora' ? `hora${plural}` : `minuto${plural}`
    partes.push(qtd === 0 ? 'Imediatamente na entrada' : `Após ${qtd} ${nome}`)
  }

  if (f.hora_envio) partes.push(`às ${f.hora_envio}`)
  if (f.dias_semana?.length && f.dias_semana.length < 7) {
    partes.push(`somente ${f.dias_semana.map((d) => NOME_DIA[d]).join(', ')}`)
  }
  return partes.join(', ')
}

export interface EventoCicloVida {
  rotulo: string
  quando?: string | null
  detalhe?: string
  /** Cor do marcador na trilha. */
  tom: 'neutro' | 'ok' | 'alerta' | 'erro'
}

/**
 * Ciclo de vida do agendamento, DERIVADO das colunas que já existem
 * (`created_at`, `tentativas`, `claim_at`, `enviado_at`, `updated_at`, `erro`).
 *
 * Não existe tabela de eventos e não é para existir: a pergunta que o operador faz
 * é "por que isto ainda não saiu?", e essas colunas respondem. O que NÃO dá para
 * afirmar — a lista exata de adiamentos e seus horários — não é inventado aqui;
 * `tentativas` diz quantas vezes falhou, e é isso que a trilha mostra.
 */
export function montarCicloVida(f: {
  status: string
  created_at: string
  agendado_para: string
  updated_at?: string | null
  enviado_at?: string | null
  claim_at?: string | null
  tentativas?: number | null
  erro?: string | null
  erro_categoria?: FollowupErroCategoria | string | null
}): EventoCicloVida[] {
  const eventos: EventoCicloVida[] = [
    { rotulo: 'Criado', quando: f.created_at, tom: 'neutro' },
  ]

  const tentativas = Number(f.tentativas ?? 0)
  if (tentativas > 0) {
    eventos.push({
      rotulo: `${tentativas} tentativa${tentativas === 1 ? '' : 's'} sem sucesso`,
      detalhe: esgotouTentativas(f.erro)
        ? 'O limite de tentativas foi atingido — o sistema parou de tentar sozinho.'
        : 'Cada falha recuperável adia o envio em vez de encerrá-lo.',
      tom: 'alerta',
    })
  }

  // 'processando' encerra a trilha por si: a reserva É o estado atual. Empilhar
  // "Aguardando envio" depois dela — como acontecia — dizia duas coisas contrárias
  // na mesma lista ("está saindo agora" e "ainda não começou").
  if (f.status === 'processando') {
    eventos.push({
      rotulo: 'Reservado pelo motor',
      quando: f.claim_at,
      detalhe: 'Um ciclo pegou este envio agora. Se o processo cair, volta para a fila automaticamente.',
      tom: 'neutro',
    })
    return eventos
  }

  if (f.status === 'enviado') {
    eventos.push({ rotulo: 'Enviado', quando: f.enviado_at || f.updated_at, tom: 'ok' })
  } else if (f.status === 'falhou') {
    const desc = descreverErroFollowup(f.erro_categoria)
    eventos.push({ rotulo: `Falhou — ${desc.rotulo}`, quando: f.updated_at, detalhe: desc.explicacao, tom: 'erro' })
  } else if (f.status === 'cancelado') {
    // Sem categoria não dá para afirmar quem cancelou: além da tela, a cadência é
    // encerrada por mudança de estágio (`cancelarEstagiosPorLead`) e por limpeza de
    // lead arquivado. Registros anteriores ao motivo na tela também caem aqui —
    // dizer "cancelado por um usuário" seria inventar autoria.
    const detalhe = f.erro_categoria === 'cancelado_usuario'
      ? (f.erro ? `Motivo informado: "${f.erro}"` : 'Cancelado na tela, sem motivo informado.')
      : f.erro_categoria
        ? descreverErroFollowup(f.erro_categoria).explicacao
        : 'Encerrado sem registro de autoria — normalmente porque o lead mudou de estágio e a cadência anterior deixou de valer.'
    eventos.push({ rotulo: 'Cancelado', quando: f.updated_at, detalhe, tom: 'neutro' })
  } else {
    eventos.push({ rotulo: 'Aguardando envio', quando: f.agendado_para, tom: 'neutro' })
  }

  return eventos
}
