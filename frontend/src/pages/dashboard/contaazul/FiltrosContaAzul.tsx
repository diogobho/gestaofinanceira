import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import type { TipoEvento } from '@/api/contaazul'
import {
  FILTROS_VAZIOS,
  ROTULO_SITUACAO,
  type FiltrosContaAzul as Filtros,
  type SituacaoValor,
} from './agregacoes'

/** Dropdown de seleção múltipla com busca — o design system não tem um. */
interface SelecaoMultiplaProps {
  rotulo: string
  opcoes: string[]
  selecionados: string[]
  onChange: (valores: string[]) => void
}

const SelecaoMultipla: React.FC<SelecaoMultiplaProps> = ({
  rotulo,
  opcoes,
  selecionados,
  onChange,
}) => {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return opcoes
    return opcoes.filter((o) => o.toLowerCase().includes(termo))
  }, [opcoes, busca])

  const alternar = (valor: string) => {
    onChange(
      selecionados.includes(valor)
        ? selecionados.filter((v) => v !== valor)
        : [...selecionados, valor]
    )
  }

  const resumo =
    selecionados.length === 0
      ? 'Todos'
      : selecionados.length === 1
        ? selecionados[0]
        : `${selecionados.length} selecionados`

  return (
    <div className="relative" ref={caixa}>
      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
        {rotulo}
      </label>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:border-gray-500"
      >
        <span className={`truncate ${selecionados.length ? 'font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
          {resumo}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>

      {aberto && (
        <div className="absolute z-30 mt-1 w-full min-w-[240px] rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-100 p-2 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar…"
                className="w-full rounded border border-gray-200 py-1.5 pl-7 pr-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {filtradas.length === 0 && (
              <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Nada encontrado</p>
            )}
            {filtradas.map((opcao) => {
              const marcado = selecionados.includes(opcao)
              return (
                <button
                  key={opcao}
                  type="button"
                  onClick={() => alternar(opcao)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      marcado
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-gray-300 dark:border-gray-500'
                    }`}
                  >
                    {marcado && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate text-gray-700 dark:text-gray-200">{opcao}</span>
                </button>
              )
            })}
          </div>

          {selecionados.length > 0 && (
            <div className="border-t border-gray-100 p-2 dark:border-gray-700">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Limpar seleção
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const TIPOS: { chave: TipoEvento; rotulo: string }[] = [
  { chave: 'receber', rotulo: 'A receber' },
  { chave: 'pagar', rotulo: 'A pagar' },
]

const SITUACOES: SituacaoValor[] = ['quitado', 'aVencer', 'atrasado', 'perdido']

interface Props {
  filtros: Filtros
  onChange: (f: Filtros) => void
  /** Contas do Conta Azul consolidadas. Com uma só, o filtro de produto não aparece. */
  opcoesConexao: Array<{ id: number; nome: string }>
  opcoesCategoria: string[]
  opcoesCentroCusto: string[]
  opcoesParte: string[]
}

export const FiltrosContaAzul: React.FC<Props> = ({
  filtros,
  onChange,
  opcoesConexao,
  opcoesCategoria,
  opcoesCentroCusto,
  opcoesParte,
}) => {
  const set = <K extends keyof Filtros>(chave: K, valor: Filtros[K]) =>
    onChange({ ...filtros, [chave]: valor })

  /** Alterna mantendo pelo menos um marcado — lista vazia não mostraria nada. */
  const alternarLista = <T extends string>(lista: T[], valor: T): T[] => {
    if (lista.includes(valor)) {
      const restante = lista.filter((v) => v !== valor)
      return restante.length ? restante : lista
    }
    return [...lista, valor]
  }

  const temFiltroFino =
    filtros.conexoes.length > 0 ||
    filtros.categorias.length > 0 ||
    filtros.centrosCusto.length > 0 ||
    filtros.partes.length > 0 ||
    filtros.busca !== '' ||
    filtros.valorMin !== '' ||
    filtros.valorMax !== '' ||
    filtros.tipos.length !== 2 ||
    filtros.situacoes.length !== 4

  return (
    <div className="space-y-3">
      {/* Produto — só existe quando a empresa tem mais de uma conta no Conta Azul.
          Lista vazia significa "todos": é o consolidado, o estado padrão. */}
      {opcoesConexao.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Produto</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => set('conexoes', [])}
              aria-pressed={filtros.conexoes.length === 0}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                filtros.conexoes.length === 0
                  ? 'border-primary-700 bg-primary-700 text-white dark:border-primary-400 dark:bg-primary-600'
                  : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400'
              }`}
            >
              {filtros.conexoes.length === 0 && <Check className="h-3 w-3" />}
              Todos (consolidado)
            </button>
            {opcoesConexao.map((c) => {
              const ativo = filtros.conexoes.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    set(
                      'conexoes',
                      ativo
                        ? filtros.conexoes.filter((id) => id !== c.id)
                        : [...filtros.conexoes, c.id]
                    )
                  }
                  aria-pressed={ativo}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    ativo
                      ? 'border-primary-700 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-900/40 dark:text-primary-200'
                      : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400'
                  }`}
                >
                  {ativo && <Check className="h-3 w-3" />}
                  {c.nome}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        {/* Tipo — segmentado, é o corte mais usado */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Tipo</span>
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600">
            {TIPOS.map(({ chave, rotulo }) => {
              const ativo = filtros.tipos.includes(chave)
              return (
                <button
                  key={chave}
                  type="button"
                  onClick={() => set('tipos', alternarLista(filtros.tipos, chave))}
                  aria-pressed={ativo}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    ativo
                      ? 'bg-primary-700 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800'
                  }`}
                >
                  {rotulo}
                </button>
              )
            })}
          </div>
        </div>

        {/* Situação — chips com marca de seleção, cor nunca sozinha */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Situação</span>
          <div className="flex flex-wrap gap-1.5">
            {SITUACOES.map((s) => {
              const ativo = filtros.situacoes.includes(s)
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => set('situacoes', alternarLista(filtros.situacoes, s))}
                  aria-pressed={ativo}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    ativo
                      ? 'border-primary-700 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-900/40 dark:text-primary-200'
                      : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400'
                  }`}
                >
                  {ativo && <Check className="h-3 w-3" />}
                  {ROTULO_SITUACAO[s]}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SelecaoMultipla
          rotulo="Categoria"
          opcoes={opcoesCategoria}
          selecionados={filtros.categorias}
          onChange={(v) => set('categorias', v)}
        />
        <SelecaoMultipla
          rotulo="Centro de custo"
          opcoes={opcoesCentroCusto}
          selecionados={filtros.centrosCusto}
          onChange={(v) => set('centrosCusto', v)}
        />
        <SelecaoMultipla
          rotulo="Cliente / Fornecedor"
          opcoes={opcoesParte}
          selecionados={filtros.partes}
          onChange={(v) => set('partes', v)}
        />

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Buscar na descrição
          </label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={filtros.busca}
              onChange={(e) => set('busca', e.target.value)}
              placeholder="Descrição, cliente, categoria…"
              className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            Valor de (R$)
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={filtros.valorMin}
            onChange={(e) => set('valorMin', e.target.value)}
            placeholder="0"
            className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
            até (R$)
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={filtros.valorMax}
            onChange={(e) => set('valorMax', e.target.value)}
            placeholder="sem limite"
            className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>

        {temFiltroFino && (
          <button
            type="button"
            onClick={() => onChange({ ...FILTROS_VAZIOS })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <X className="h-4 w-4" />
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  )
}
