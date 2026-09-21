import type { CampoDisponivel, DefinicaoIntegracao, LeadIntegracao } from '@/api/integracoes'

/**
 * Agregações do dashboard de integrações — funções puras, sem React e sem rede.
 *
 * Tudo aqui roda sobre a lista que o backend devolveu inteira. Trocar um filtro
 * é recalcular estas funções, não uma requisição nova: são ~1.100 linhas na maior
 * empresa, e é isso que faz o painel responder no mesmo quadro.
 */

export type Granularidade = 'dia' | 'semana' | 'mes'
export type Situacao = 'todos' | 'abertos' | 'ganhos' | 'perdidos'

export interface Filtros {
  integracoes: string[]
  funis: number[]
  responsaveis: number[]
  dataInicio: string
  dataFim: string
  situacao: Situacao
  incluirArquivados: boolean
  busca: string
  /**
   * Filtro por resposta: `chave` do campo (ex.: `caixa_rapido.origem_url`) e o
   * valor exato. É genérico de propósito — o parser de notas não tem lista de
   * campos, e um filtro chumbado num campo teria que ser reescrito a cada rótulo
   * novo no WordPress. Vale só para campo categórico (`ehCategorico`): num texto
   * livre, escolher "o valor exato" numa lista de 41 respostas não é um filtro.
   */
  campoChave: string
  campoValor: string
}

export const FILTROS_VAZIOS: Filtros = {
  integracoes: [],
  funis: [],
  responsaveis: [],
  dataInicio: '',
  dataFim: '',
  situacao: 'todos',
  incluirArquivados: false,
  busca: '',
  campoChave: '',
  campoValor: '',
}

export const ID_OUTRAS = '__outras__'

/**
 * O filtro por integração casa contra `integracoes` (todos os toques), não contra
 * `integracao` (só a origem).
 *
 * É a diferença que o dashboard existe para mostrar: 8 dos 41 cards com o
 * formulário do Caixa Rápido entraram por OUTRA integração e receberam o
 * formulário anexado depois. Filtrar pela origem esconderia justamente esses.
 */
export function aplicarFiltros(leads: LeadIntegracao[], f: Filtros): LeadIntegracao[] {
  const busca = f.busca.trim().toLowerCase()

  return leads.filter((l) => {
    if (!f.incluirArquivados && l.arquivado) return false
    if (f.integracoes.length && !l.integracoes.some((i) => f.integracoes.includes(i))) return false
    if (f.funis.length && (l.funil_id === null || !f.funis.includes(l.funil_id))) return false
    if (f.responsaveis.length && (l.responsavel_id === null || !f.responsaveis.includes(l.responsavel_id)))
      return false
    if (f.dataInicio && l.criado_em_dia < f.dataInicio) return false
    if (f.dataFim && l.criado_em_dia > f.dataFim) return false
    if (f.situacao === 'ganhos' && !l.ganho) return false
    if (f.situacao === 'perdidos' && !l.perdido) return false
    if (f.situacao === 'abertos' && (l.ganho || l.perdido)) return false

    // Campo sem valor escolhido não filtra nada: é o estado em que a pessoa
    // selecionou o campo e ainda não disse qual resposta quer ver.
    if (f.campoChave && f.campoValor) {
      const valores = l.campos[f.campoChave]
      if (!valores?.some((v) => v.trim() === f.campoValor)) return false
    }

    if (busca) {
      const alvo = [
        l.nome,
        l.telefone,
        l.email,
        l.empresa,
        l.origem,
        l.estagio_nome,
        l.responsavel_nome,
        ...Object.values(l.campos).flat(),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!alvo.includes(busca)) return false
    }

    return true
  })
}

/**
 * Integrações do conjunto INTEIRO, da maior para a menor.
 *
 * Alimenta o mapa de cores, e por isso é calculada sobre os dados sem filtro:
 * a cor de uma integração não pode depender do recorte que está na tela.
 */
export function ordemPorVolume(leads: LeadIntegracao[]): string[] {
  const total = new Map<string, number>()
  for (const l of leads) for (const id of l.integracoes) total.set(id, (total.get(id) ?? 0) + 1)
  return [...total.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
}

export interface ResumoIntegracao {
  id: string
  definicao: DefinicaoIntegracao | undefined
  leads: number
  ganhos: number
  perdidos: number
  valor: number
  /** Cards em que ela foi um toque ANEXADO, não a origem. */
  anexados: number
  primeiro: string | null
  ultimo: string | null
}

export function resumoPorIntegracao(
  leads: LeadIntegracao[],
  catalogo: DefinicaoIntegracao[]
): ResumoIntegracao[] {
  const mapa = new Map<string, ResumoIntegracao>()
  const def = new Map(catalogo.map((d) => [d.id, d]))

  for (const l of leads) {
    for (const id of l.integracoes) {
      const r =
        mapa.get(id) ??
        {
          id,
          definicao: def.get(id),
          leads: 0,
          ganhos: 0,
          perdidos: 0,
          valor: 0,
          anexados: 0,
          primeiro: null,
          ultimo: null,
        }
      r.leads++
      if (l.ganho) r.ganhos++
      if (l.perdido) r.perdidos++
      r.valor += l.valor_potencial
      if (l.integracao !== id) r.anexados++
      if (!r.primeiro || l.criado_em_dia < r.primeiro) r.primeiro = l.criado_em_dia
      if (!r.ultimo || l.criado_em_dia > r.ultimo) r.ultimo = l.criado_em_dia
      mapa.set(id, r)
    }
  }

  return [...mapa.values()].sort((a, b) => b.leads - a.leads)
}

/** Segunda-feira da semana de `iso`, no padrão ISO-8601 (o mesmo do DATE_TRUNC do Postgres). */
function segundaDaSemana(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(a, m - 1, d))
  const diaSemana = (dt.getUTCDay() + 6) % 7 // 0 = segunda
  dt.setUTCDate(dt.getUTCDate() - diaSemana)
  return dt.toISOString().slice(0, 10)
}

export function periodoDe(iso: string, g: Granularidade): string {
  if (g === 'mes') return iso.slice(0, 7)
  if (g === 'semana') return segundaDaSemana(iso)
  return iso
}

export interface PontoSerie {
  periodo: string
  total: number
  [integracao: string]: string | number
}

/**
 * Série temporal empilhada, uma coluna por período.
 *
 * `seriesVisiveis` são as integrações que ganham barra própria; o resto soma em
 * `__outras__`. Nunca mais de seis empilhados: acima disso o olho não distingue
 * as fatias e a pilha vira decoração.
 *
 * Períodos sem lead entram com zero, senão a linha do tempo mente sobre o ritmo —
 * três dias seguidos sem nada apareceriam colados.
 */
export function serieTemporal(
  leads: LeadIntegracao[],
  g: Granularidade,
  seriesVisiveis: string[]
): PontoSerie[] {
  if (leads.length === 0) return []
  const visiveis = new Set(seriesVisiveis)
  const porPeriodo = new Map<string, PontoSerie>()

  const vazio = (periodo: string): PontoSerie => {
    const p: PontoSerie = { periodo, total: 0 }
    for (const id of seriesVisiveis) p[id] = 0
    p[ID_OUTRAS] = 0
    return p
  }

  for (const l of leads) {
    const chave = periodoDe(l.criado_em_dia, g)
    const ponto = porPeriodo.get(chave) ?? vazio(chave)
    // O lead conta uma vez por integração que o tocou: um card que entrou pelo
    // SendFlow e depois respondeu o formulário aparece nas duas barras. A soma da
    // pilha é de TOQUES; o total de leads sem duplicação está nos cartões acima.
    for (const id of l.integracoes) {
      const alvo = visiveis.has(id) ? id : ID_OUTRAS
      ponto[alvo] = (ponto[alvo] as number) + 1
      ponto.total++
    }
    porPeriodo.set(chave, ponto)
  }

  const chaves = [...porPeriodo.keys()].sort()
  const preenchido: PontoSerie[] = []
  let cursor = chaves[0]
  const fim = chaves[chaves.length - 1]
  let guarda = 0

  while (cursor <= fim && guarda++ < 2000) {
    preenchido.push(porPeriodo.get(cursor) ?? vazio(cursor))
    cursor = proximoPeriodo(cursor, g)
  }

  return preenchido
}

function proximoPeriodo(atual: string, g: Granularidade): string {
  if (g === 'mes') {
    const [a, m] = atual.split('-').map(Number)
    return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
  }
  const [a, m, d] = atual.split('-').map(Number)
  const dt = new Date(Date.UTC(a, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + (g === 'semana' ? 7 : 1))
  return dt.toISOString().slice(0, 10)
}

export interface FatiaValor {
  valor: string
  leads: number
  pct: number
}

/**
 * Distribuição dos valores de um campo.
 *
 * Conta LEADS, não ocorrências: quem entrou em dois grupos do SendFlow aparece
 * uma vez em cada grupo, e nunca duas vezes no mesmo. Por isso a soma das fatias
 * pode passar do número de leads — o rodapé do bloco diz isso na tela.
 */
export function distribuicaoDeCampo(leads: LeadIntegracao[], chave: string): FatiaValor[] {
  const contagem = new Map<string, number>()
  let comCampo = 0

  for (const l of leads) {
    const valores = l.campos[chave]
    if (!valores?.length) continue
    comCampo++
    for (const v of new Set(valores.map((x) => x.trim()).filter(Boolean))) {
      contagem.set(v, (contagem.get(v) ?? 0) + 1)
    }
  }

  return [...contagem.entries()]
    .map(([valor, n]) => ({ valor, leads: n, pct: comCampo ? (n / comCampo) * 100 : 0 }))
    .sort((a, b) => b.leads - a.leads || a.valor.localeCompare(b.valor))
}

/**
 * Um campo é categórico o bastante para virar gráfico?
 *
 * "Faturamento hoje" tem 4 valores em 41 leads e é uma barra excelente. "Maior
 * desafio" tem 41 valores em 41 leads — é texto livre, e desenhar 41 barras de
 * altura 1 seria um gráfico que não diz nada. O corte é a razão entre valores
 * distintos e leads; acima dele o bloco vira lista de respostas.
 */
export function ehCategorico(campo: Pick<CampoDisponivel, 'leads' | 'valores'>): boolean {
  if (campo.leads < 3) return false
  if (campo.valores <= 12) return true
  return campo.valores / campo.leads < 0.5
}

export function contagemPor(
  leads: LeadIntegracao[],
  seletor: (l: LeadIntegracao) => string | null
): { rotulo: string; leads: number }[] {
  const mapa = new Map<string, number>()
  for (const l of leads) {
    const k = seletor(l) || '—'
    mapa.set(k, (mapa.get(k) ?? 0) + 1)
  }
  return [...mapa.entries()]
    .map(([rotulo, n]) => ({ rotulo, leads: n }))
    .sort((a, b) => b.leads - a.leads)
}

/** Campos que aparecem no recorte atual, na ordem em que compensa explorá-los. */
export function camposDoRecorte(
  leads: LeadIntegracao[],
  disponiveis: CampoDisponivel[]
): CampoDisponivel[] {
  const presentes = new Map<string, { leads: number; valores: Set<string> }>()
  for (const l of leads) {
    for (const [chave, valores] of Object.entries(l.campos)) {
      const acc = presentes.get(chave) ?? { leads: 0, valores: new Set<string>() }
      acc.leads++
      valores.forEach((v) => acc.valores.add(v))
      presentes.set(chave, acc)
    }
  }
  return disponiveis
    .filter((c) => presentes.has(c.chave))
    .map((c) => ({
      ...c,
      leads: presentes.get(c.chave)!.leads,
      valores: presentes.get(c.chave)!.valores.size,
    }))
    .sort((a, b) => b.leads - a.leads)
}

/**
 * Campos que dá para filtrar no recorte: os categóricos do conjunto inteiro.
 *
 * Sai dos leads SEM o filtro de campo aplicado — senão escolher "semana2"
 * apagaria "semana1" da própria lista e não haveria como voltar. É a mesma
 * armadilha do card que sumia levando junto o seletor que o controlava.
 */
export function camposFiltraveis(
  leads: LeadIntegracao[],
  disponiveis: CampoDisponivel[]
): CampoDisponivel[] {
  return camposDoRecorte(leads, disponiveis).filter(ehCategorico)
}
