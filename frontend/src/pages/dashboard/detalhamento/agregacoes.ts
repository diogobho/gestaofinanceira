/**
 * Detalhamento do dashboard — "quem pagou" e "com o que foi gasto".
 *
 * Funções puras sobre as parcelas que o dashboard já baixa
 * (`/parcelas/receitas` e `/parcelas/despesas`, mesmo filtro de período): a
 * tela e o PDF agregam pelo mesmo caminho, e trocar agrupamento ou situação
 * não vai à rede.
 */

export type Situacao = 'pago' | 'aberto' | 'tudo'

export interface Lancamento {
  id: string
  valor: number
  /** PAGO | PENDENTE | ATRASADO — maiúsculo, como na parcela */
  status: string
  /** YYYY-MM-DD */
  vencimento: string
  /** YYYY-MM-DD, só quando pago */
  pagamento: string | null
  descricao: string
  /** "2/12"; null quando é à vista (1 de 1) */
  parcela: string | null
  /** valor de cada agrupamento possível: cliente, produto, categoria, descricao */
  grupos: Record<string, string>
}

export interface Grupo {
  nome: string
  valor: number
  quantidade: number
}

export interface OpcaoAgrupamento {
  chave: string
  rotulo: string
  /** plural para o resumo: "12 clientes" */
  plural: string
}

export const AGRUPAMENTOS_RECEITA: OpcaoAgrupamento[] = [
  { chave: 'cliente', rotulo: 'Cliente', plural: 'clientes' },
  { chave: 'produto', rotulo: 'Produto', plural: 'produtos' },
  { chave: 'descricao', rotulo: 'Descrição', plural: 'descrições' },
]

export const AGRUPAMENTOS_DESPESA: OpcaoAgrupamento[] = [
  { chave: 'categoria', rotulo: 'Categoria', plural: 'categorias' },
  { chave: 'descricao', rotulo: 'Descrição', plural: 'descrições' },
]

/*
  DATE do Postgres chega serializado como `2026-09-01T00:00:00.000Z` (a API
  roda em UTC). `new Date(...)` no navegador em UTC-3 devolve 31/08 21:00 — a
  parcela do dia 1º cairia no mês anterior. A parte da data é a verdade.
*/
export const dataPura = (v: unknown): string => String(v ?? '').slice(0, 10)

const texto = (v: unknown, padrao: string) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s || padrao
}

const parcelaTexto = (p: any): string | null =>
  Number(p.total_parcelas) > 1 ? `${p.numero_parcela}/${p.total_parcelas}` : null

export function normalizarReceitas(parcelas: any[] | undefined): Lancamento[] {
  return (parcelas ?? []).map((p) => {
    const descricao = texto(p.receita_descricao, 'Sem descrição')
    return {
      id: p.id,
      valor: Number(p.valor) || 0,
      status: p.status,
      vencimento: dataPura(p.data_vencimento),
      pagamento: p.data_pagamento ? dataPura(p.data_pagamento) : null,
      descricao,
      parcela: parcelaTexto(p),
      grupos: {
        cliente: texto(p.cliente_nome, 'Sem cliente vinculado'),
        // Na tela de Receitas o campo `fonte` é rotulado "Produto".
        produto: texto(p.receita_fonte, 'Outros'),
        descricao,
      },
    }
  })
}

export function normalizarDespesas(parcelas: any[] | undefined): Lancamento[] {
  return (parcelas ?? []).map((p) => {
    const descricao = texto(p.despesa_descricao, 'Sem descrição')
    return {
      id: p.id,
      valor: Number(p.valor) || 0,
      status: p.status,
      vencimento: dataPura(p.data_vencimento),
      pagamento: p.data_pagamento ? dataPura(p.data_pagamento) : null,
      descricao,
      parcela: parcelaTexto(p),
      grupos: {
        categoria: texto(p.despesa_categoria, 'Outros'),
        descricao,
      },
    }
  })
}

export function filtrarSituacao(lancamentos: Lancamento[], situacao: Situacao): Lancamento[] {
  if (situacao === 'tudo') return lancamentos
  if (situacao === 'pago') return lancamentos.filter((l) => l.status === 'PAGO')
  return lancamentos.filter((l) => l.status !== 'PAGO')
}

/** Soma por agrupamento, do maior para o menor. */
export function agrupar(lancamentos: Lancamento[], chave: string): Grupo[] {
  const mapa = new Map<string, Grupo>()
  for (const l of lancamentos) {
    const nome = l.grupos[chave] ?? '—'
    const g = mapa.get(nome) ?? { nome, valor: 0, quantidade: 0 }
    g.valor += l.valor
    g.quantidade += 1
    mapa.set(nome, g)
  }
  return [...mapa.values()].sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome))
}

/** Um grupo aberto pelas três situações da parcela. */
export interface SomaSituacao {
  quantidade: number
  pago: number
  /** PENDENTE: ainda dentro do prazo */
  aVencer: number
  /** ATRASADO: venceu sem baixa */
  atrasado: number
  total: number
}

export interface GrupoSituacao extends SomaSituacao {
  nome: string
}

const somaVazia = (): SomaSituacao => ({ quantidade: 0, pago: 0, aVencer: 0, atrasado: 0, total: 0 })

function acumular(s: SomaSituacao, l: Lancamento) {
  s.quantidade += 1
  s.total += l.valor
  if (l.status === 'PAGO') s.pago += l.valor
  else if (l.status === 'ATRASADO') s.atrasado += l.valor
  else s.aVencer += l.valor
}

export function somarPorSituacao(lancamentos: Lancamento[]): SomaSituacao {
  const s = somaVazia()
  for (const l of lancamentos) acumular(s, l)
  return s
}

/*
  Agrupa SEM filtrar a situação. O relatório antigo listava só o que tinha
  status PAGO: numa conta que não dá baixa nas parcelas (a Panteras tinha
  27 de 27 em atraso em 09/2026) as tabelas saíam vazias logo abaixo de um
  faturamento de R$ 259 mil. Aberto por situação, o mesmo quadro responde
  "quem pagou" e "quem está devendo".
*/
export function agruparPorSituacao(lancamentos: Lancamento[], chave: string): GrupoSituacao[] {
  const mapa = new Map<string, GrupoSituacao>()
  for (const l of lancamentos) {
    const nome = l.grupos[chave] ?? '—'
    const g = mapa.get(nome) ?? { nome, ...somaVazia() }
    acumular(g, l)
    mapa.set(nome, g)
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome))
}

/*
  A conversão de lead do CRM grava a receita como "Conversão CRM - <nome>"
  (leads.service.ts): numa tabela que já tem a coluna Cliente, o nome sai duas
  vezes por linha e empurra cada uma para duas alturas. Tira-se só o sufixo
  " - <cliente>"; a descrição que não termina no nome do cliente fica intacta.
*/
export function descricaoSemCliente(l: Lancamento): string {
  const sufixo = ` - ${l.grupos.cliente}`
  return l.descricao.endsWith(sufixo) && l.descricao.length > sufixo.length
    ? l.descricao.slice(0, -sufixo.length)
    : l.descricao
}

/** Dias corridos entre duas datas `YYYY-MM-DD` (as duas lidas em UTC: diferença exata). */
export const diasEntre = (de: string, ate: string) =>
  Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000)

/** Data que importa para a linha: quando foi pago; se não foi, quando vence. */
export const dataReferencia = (l: Lancamento) => l.pagamento ?? l.vencimento

/** Mais recente primeiro. */
export function ordenarPorData(lancamentos: Lancamento[]): Lancamento[] {
  return [...lancamentos].sort(
    (a, b) => dataReferencia(b).localeCompare(dataReferencia(a)) || b.valor - a.valor
  )
}

/**
 * Vencimento mais recente primeiro. É a ordem do extrato do PDF, cuja coluna de
 * data é o vencimento: por `dataReferencia` uma parcela de junho paga em agosto
 * aparecia no meio das de agosto.
 */
export function ordenarPorVencimento(lancamentos: Lancamento[]): Lancamento[] {
  return [...lancamentos].sort(
    (a, b) => b.vencimento.localeCompare(a.vencimento) || b.valor - a.valor
  )
}

export const somar = (lancamentos: Lancamento[]) =>
  lancamentos.reduce((acc, l) => acc + l.valor, 0)
