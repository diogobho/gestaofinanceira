import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { dataPura } from '../detalhamento/agregacoes'

/**
 * Filtros da Visão Geral além do período — moram na URL junto com ele
 * (`?cliente=…&situacao=atraso`), para o F5 e o link manterem o recorte.
 *
 * Aplicados NO NAVEGADOR sobre as parcelas que a página já baixa: trocar um
 * filtro não vai à rede, e os cartões, gráficos e detalhamento leem a mesma
 * lista filtrada — nenhum número fica fora do recorte.
 *
 * Cliente e produto só existem em receita; categoria só em despesa. Com um
 * deles ativo o outro lado não é filtrado, e o Resultado deixa de fazer
 * sentido (receita de UMA cliente menos TODAS as despesas) — a tela mostra "—".
 */

export type SituacaoFiltro = 'pago' | 'a-vencer' | 'atraso'

export interface Filtros {
  cliente?: string
  produto?: string
  categoria?: string
  origem?: string
  situacao?: SituacaoFiltro
}

export type ChaveFiltro = keyof Filtros

export const CHAVES: ChaveFiltro[] = ['cliente', 'produto', 'categoria', 'origem', 'situacao']

export const ROTULO_FILTRO: Record<ChaveFiltro, string> = {
  cliente: 'Cliente',
  produto: 'Produto',
  categoria: 'Categoria',
  origem: 'Origem',
  situacao: 'Situação',
}

export const ROTULO_SITUACAO: Record<SituacaoFiltro, string> = {
  pago: 'Pago / recebido',
  'a-vencer': 'A vencer',
  atraso: 'Em atraso',
}

const ROTULO_ORIGEM: Record<string, string> = {
  manual: 'Lançado no Duo',
  asaas: 'Asaas',
  contaazul: 'Conta Azul',
  pluggy: 'Open Finance',
}
export const rotuloOrigem = (o: string) => ROTULO_ORIGEM[o] ?? o

/** Texto do valor de um filtro, para a etiqueta removível. */
export function rotuloValor(chave: ChaveFiltro, valor: string): string {
  if (chave === 'situacao') return ROTULO_SITUACAO[valor as SituacaoFiltro] ?? valor
  if (chave === 'origem') return rotuloOrigem(valor)
  return valor
}

const texto = (v: unknown, padrao: string) => (typeof v === 'string' && v.trim()) || padrao

// Os mesmos nomes do detalhamento (`normalizarReceitas`/`normalizarDespesas`):
// clicar num nome lá e filtrar aqui têm de casar.
export const clienteDa = (p: any) => texto(p.cliente_nome, 'Sem cliente vinculado')
export const produtoDa = (p: any) => texto(p.receita_fonte, 'Outros')
export const categoriaDa = (p: any) => texto(p.despesa_categoria, 'Outros')
export const origemDa = (p: any) => texto(p.origem, 'manual')

/** Situação pela DATA: o job que marca ATRASADO roda uma vez por dia. */
export function situacaoDa(p: any, hojeISO: string): SituacaoFiltro {
  if (p.status === 'PAGO') return 'pago'
  return dataPura(p.data_vencimento) < hojeISO ? 'atraso' : 'a-vencer'
}

export function filtrarReceitas(parcelas: any[] | undefined, f: Filtros, hojeISO: string): any[] {
  return (parcelas ?? []).filter(
    (p) =>
      (!f.cliente || clienteDa(p) === f.cliente) &&
      (!f.produto || produtoDa(p) === f.produto) &&
      (!f.origem || origemDa(p) === f.origem) &&
      (!f.situacao || situacaoDa(p, hojeISO) === f.situacao)
  )
}

export function filtrarDespesas(parcelas: any[] | undefined, f: Filtros, hojeISO: string): any[] {
  return (parcelas ?? []).filter(
    (p) =>
      (!f.categoria || categoriaDa(p) === f.categoria) &&
      (!f.origem || origemDa(p) === f.origem) &&
      (!f.situacao || situacaoDa(p, hojeISO) === f.situacao)
  )
}

/** Filtro que só existe de um lado (cliente/produto × categoria) torna o Resultado sem sentido. */
export const filtroDeUmLado = (f: Filtros) => !!(f.cliente || f.produto || f.categoria)

const unicos = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b, 'pt-BR'))

/** Opções de cada filtro, do período (sem os outros filtros: escolher um não some com os demais). */
export function opcoesDosFiltros(receitas: any[] | undefined, despesas: any[] | undefined) {
  const r = receitas ?? []
  const d = despesas ?? []
  return {
    cliente: unicos(r.map(clienteDa)),
    produto: unicos(r.map(produtoDa)),
    categoria: unicos(d.map(categoriaDa)),
    origem: unicos([...r, ...d].map(origemDa)),
    situacao: ['pago', 'a-vencer', 'atraso'] as SituacaoFiltro[],
  }
}

export type OpcoesFiltros = ReturnType<typeof opcoesDosFiltros>

export interface FiltrosNaUrl {
  filtros: Filtros
  ativos: number
  definir: (chave: ChaveFiltro, valor: string | undefined) => void
  limpar: () => void
}

export function useFiltrosNaUrl(): FiltrosNaUrl {
  const [params, setParams] = useSearchParams()

  const brutos = CHAVES.map((c) => params.get(c) ?? '').join('\u0000')
  const filtros = useMemo(() => {
    const f: Filtros = {}
    for (const c of CHAVES) {
      const v = params.get(c)
      if (!v) continue
      if (c === 'situacao') {
        if (v in ROTULO_SITUACAO) f.situacao = v as SituacaoFiltro
      } else f[c] = v
    }
    return f
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brutos])

  // Updater funcional: a URL também leva período e `aba`.
  const definir = useCallback(
    (chave: ChaveFiltro, valor: string | undefined) =>
      setParams(
        (atual) => {
          const p = new URLSearchParams(atual)
          if (valor) p.set(chave, valor)
          else p.delete(chave)
          return p
        },
        { replace: true }
      ),
    [setParams]
  )

  const limpar = useCallback(
    () =>
      setParams(
        (atual) => {
          const p = new URLSearchParams(atual)
          CHAVES.forEach((c) => p.delete(c))
          return p
        },
        { replace: true }
      ),
    [setParams]
  )

  return { filtros, ativos: Object.keys(filtros).length, definir, limpar }
}
