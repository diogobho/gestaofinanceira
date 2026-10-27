import type { EventoFinanceiro, TipoEvento } from '@/api/contaazul'

/**
 * Filtros e agregações do dashboard Conta Azul.
 *
 * Tudo aqui é função pura sobre a lista que o backend entregou — trocar um
 * filtro não vai à rede. Duas regras valem para o arquivo inteiro:
 *
 *  1. Dinheiro é somado por SITUAÇÃO, não por status bruto. Um título PARTIAL
 *     tem parte quitada e parte em aberto; contá-lo inteiro em qualquer um dos
 *     dois lados infla o número. Por isso `pago` e `aberto` entram em baldes
 *     diferentes.
 *
 *     Atenção ao denominador: `pago + nao_pago` NÃO é igual a `total` quando o
 *     título foi quitado com juros ou desconto — nos dados da Panteras isso
 *     acontece em 26 títulos e desloca ~R$ 7,6 mil. Por isso existe `base`
 *     (a soma dos baldes) separado de `total` (a soma dos valores de face):
 *     percentual de composição usa `base`, senão a barra não fecha 100%.
 *  2. Todo recorte de data usa o VENCIMENTO, porque é o único filtro que a API
 *     do Conta Azul aceita e é a data que o payload garante. Não há data de
 *     pagamento no retorno — daí "recebido" significar sempre "valor já quitado
 *     de títulos que vencem no período", e não "dinheiro que entrou no período".
 */

export type SituacaoValor = 'quitado' | 'aVencer' | 'atrasado' | 'perdido'

export interface FiltrosContaAzul {
  /** Conexões (produtos) visíveis. Vazio = todas — é o consolidado. */
  conexoes: number[]
  tipos: TipoEvento[]
  situacoes: SituacaoValor[]
  categorias: string[]
  centrosCusto: string[]
  partes: string[]
  busca: string
  valorMin: string
  valorMax: string
}

export const FILTROS_VAZIOS: FiltrosContaAzul = {
  conexoes: [],
  tipos: ['receber', 'pagar'],
  situacoes: ['quitado', 'aVencer', 'atrasado', 'perdido'],
  categorias: [],
  centrosCusto: [],
  partes: [],
  busca: '',
  valorMin: '',
  valorMax: '',
}

export const ROTULO_SITUACAO: Record<SituacaoValor, string> = {
  quitado: 'Quitado',
  aVencer: 'A vencer',
  atrasado: 'Atrasado',
  perdido: 'Perdido',
}

/**
 * Situação predominante do título — usada para filtrar linhas e colorir a tabela.
 * Um PARTIAL vencido conta como "atrasado" porque é o saldo em aberto que importa
 * para a régua de cobrança.
 */
export function situacaoDoItem(item: EventoFinanceiro): SituacaoValor {
  if (item.status === 'LOST') return 'perdido'
  if (item.dias_atraso > 0) return 'atrasado'
  if (item.aberto > 0) return 'aVencer'
  return 'quitado'
}

/** Valor ainda não realizado. Em título perdido, o que sobrou é a perda. */
export function valorEmAberto(item: EventoFinanceiro): number {
  if (item.status === 'LOST') return Math.max(0, item.total - item.pago)
  return item.aberto
}

export function aplicarFiltros(
  itens: EventoFinanceiro[],
  f: FiltrosContaAzul
): EventoFinanceiro[] {
  const busca = f.busca.trim().toLowerCase()
  const min = f.valorMin === '' ? null : Number(f.valorMin)
  const max = f.valorMax === '' ? null : Number(f.valorMax)

  return itens.filter((item) => {
    if (f.conexoes.length && !f.conexoes.includes(item.conexao_id)) return false
    if (!f.tipos.includes(item.tipo)) return false
    if (!f.situacoes.includes(situacaoDoItem(item))) return false
    if (f.categorias.length && !f.categorias.includes(item.categoria)) return false
    if (f.centrosCusto.length && !f.centrosCusto.includes(item.centro_custo)) return false
    if (f.partes.length && !f.partes.includes(item.parte)) return false

    if (min !== null && Number.isFinite(min) && item.total < min) return false
    if (max !== null && Number.isFinite(max) && item.total > max) return false

    if (busca) {
      const alvo = `${item.descricao} ${item.parte} ${item.categoria} ${item.centro_custo}`.toLowerCase()
      if (!alvo.includes(busca)) return false
    }
    return true
  })
}

export interface ResumoTipo {
  /** soma dos valores de face dos títulos */
  total: number
  /** valor efetivamente liquidado (com juros/desconto embutidos) */
  quitado: number
  aVencer: number
  atrasado: number
  perdido: number
  /** aVencer + atrasado — o que ainda deve entrar (ou sair) */
  emAberto: number
  /** quitado + aVencer + atrasado + perdido — denominador dos percentuais */
  base: number
  quantidade: number
  quantidadeAtrasada: number
}

function resumoVazio(): ResumoTipo {
  return {
    total: 0, quitado: 0, aVencer: 0, atrasado: 0, perdido: 0,
    emAberto: 0, base: 0, quantidade: 0, quantidadeAtrasada: 0,
  }
}

/** Reparte cada título entre os baldes de valor. */
export function resumir(itens: EventoFinanceiro[]): ResumoTipo {
  const r = resumoVazio()

  for (const item of itens) {
    r.quantidade++
    r.total += item.total
    r.quitado += item.pago

    const aberto = valorEmAberto(item)
    if (item.status === 'LOST') {
      r.perdido += aberto
    } else if (item.dias_atraso > 0) {
      r.atrasado += aberto
      r.quantidadeAtrasada++
    } else {
      r.aVencer += aberto
    }
  }

  r.emAberto = r.aVencer + r.atrasado
  r.base = r.quitado + r.aVencer + r.atrasado + r.perdido
  return r
}

/**
 * Resumo de cada produto, na ordem em que as conexões vêm do backend.
 * Roda sobre os itens JÁ filtrados: se o usuário isolar uma categoria, os cards
 * por produto passam a falar daquela categoria — é o comportamento esperado de
 * um comparativo dentro de um filtro.
 */
export function resumirPorConexao(
  itens: EventoFinanceiro[]
): Array<{ conexao_id: number; nome: string; porTipo: Record<TipoEvento, ResumoTipo> }> {
  const ordem: number[] = []
  const grupos = new Map<number, { nome: string; itens: EventoFinanceiro[] }>()

  for (const item of itens) {
    let grupo = grupos.get(item.conexao_id)
    if (!grupo) {
      grupo = { nome: item.conexao_nome, itens: [] }
      grupos.set(item.conexao_id, grupo)
      ordem.push(item.conexao_id)
    }
    grupo.itens.push(item)
  }

  return ordem.map((id) => {
    const g = grupos.get(id)!
    return { conexao_id: id, nome: g.nome, porTipo: resumirPorTipo(g.itens) }
  })
}

export function resumirPorTipo(itens: EventoFinanceiro[]): Record<TipoEvento, ResumoTipo> {
  return {
    receber: resumir(itens.filter((i) => i.tipo === 'receber')),
    pagar: resumir(itens.filter((i) => i.tipo === 'pagar')),
  }
}

/**
 * Taxa de inadimplência: quanto do que já venceu não foi honrado.
 * O denominador é só o que já venceu — dividir pelo total do período diluiria
 * o índice com títulos que ainda nem chegaram no prazo.
 */
export function taxaInadimplencia(itens: EventoFinanceiro[], hoje: string): number {
  let vencido = 0
  let naoHonrado = 0

  for (const item of itens) {
    if (item.vencimento > hoje) continue
    vencido += item.total
    if (item.dias_atraso > 0 || item.status === 'LOST') naoHonrado += valorEmAberto(item)
  }

  return vencido > 0 ? (naoHonrado / vencido) * 100 : 0
}

export type BaseData = 'vencimento' | 'competencia'

export interface PontoMensal {
  mes: string
  rotulo: string
  receber: number
  pagar: number
  saldo: number
}

/** Série mensal de entradas x saídas previstas, mais o saldo do mês. */
export function serieMensal(itens: EventoFinanceiro[], base: BaseData): PontoMensal[] {
  const meses = new Map<string, PontoMensal>()

  for (const item of itens) {
    const data = (base === 'competencia' ? item.competencia : item.vencimento) || item.vencimento
    if (!data) continue
    const chave = data.slice(0, 7)

    let ponto = meses.get(chave)
    if (!ponto) {
      const [ano, mes] = chave.split('-')
      ponto = {
        mes: chave,
        // Date puro daria off-by-one em UTC-3; monta o rótulo a partir do texto.
        rotulo: `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(mes) - 1]}/${ano.slice(2)}`,
        receber: 0,
        pagar: 0,
        saldo: 0,
      }
      meses.set(chave, ponto)
    }

    if (item.tipo === 'receber') ponto.receber += item.total
    else ponto.pagar += item.total
  }

  return [...meses.values()]
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map((p) => ({ ...p, saldo: p.receber - p.pagar }))
}

export interface FaixaAtraso {
  faixa: string
  valor: number
  quantidade: number
}

const LIMITES_ATRASO = [
  { faixa: '1–30 dias', ate: 30 },
  { faixa: '31–60 dias', ate: 60 },
  { faixa: '61–90 dias', ate: 90 },
  { faixa: 'Mais de 90 dias', ate: Infinity },
]

/** Aging da inadimplência — só o que está vencido e em aberto. */
export function faixasDeAtraso(itens: EventoFinanceiro[]): FaixaAtraso[] {
  const faixas = LIMITES_ATRASO.map((l) => ({ faixa: l.faixa, valor: 0, quantidade: 0 }))

  for (const item of itens) {
    if (item.dias_atraso <= 0) continue
    const indice = LIMITES_ATRASO.findIndex((l) => item.dias_atraso <= l.ate)
    if (indice < 0) continue
    faixas[indice].valor += valorEmAberto(item)
    faixas[indice].quantidade++
  }

  return faixas
}

export interface LinhaRanking {
  nome: string
  valor: number
  quantidade: number
}

/** Top N por soma de um campo, com o resto dobrado em "Outros". */
export function ranking(
  itens: EventoFinanceiro[],
  campo: 'categoria' | 'centro_custo' | 'parte',
  valorDe: (item: EventoFinanceiro) => number,
  limite = 8
): LinhaRanking[] {
  const mapa = new Map<string, LinhaRanking>()

  for (const item of itens) {
    const valor = valorDe(item)
    if (valor <= 0) continue
    const nome = item[campo]
    const linha = mapa.get(nome) ?? { nome, valor: 0, quantidade: 0 }
    linha.valor += valor
    linha.quantidade++
    mapa.set(nome, linha)
  }

  const ordenado = [...mapa.values()].sort((a, b) => b.valor - a.valor)
  if (ordenado.length <= limite) return ordenado

  const topo = ordenado.slice(0, limite)
  const resto = ordenado.slice(limite)
  topo.push({
    nome: `Outros (${resto.length})`,
    valor: resto.reduce((s, l) => s + l.valor, 0),
    quantidade: resto.reduce((s, l) => s + l.quantidade, 0),
  })
  return topo
}

/** Valores distintos de um campo, para alimentar os seletores de filtro. */
export function opcoesDe(
  itens: EventoFinanceiro[],
  campo: 'categoria' | 'centro_custo' | 'parte'
): string[] {
  return [...new Set(itens.map((i) => i[campo]))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR')
  )
}
