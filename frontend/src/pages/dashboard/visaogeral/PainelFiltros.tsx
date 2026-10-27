import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTermoCliente } from '@/hooks/useTermoCliente'
import {
  ROTULO_FILTRO,
  rotuloValor,
  type ChaveFiltro,
  type FiltrosNaUrl,
  type OpcoesFiltros,
} from './filtros'
import type { PeriodoNaUrl } from './periodo'

/**
 * Campos dos filtros (cliente, produto, categoria, origem, situação) e as
 * etiquetas removíveis do que está ativo.
 *
 * No computador o painel abre embaixo da barra; no celular é uma gaveta que
 * sobe da parte de baixo da tela. A gaveta vai por PORTAL para o `body`: a
 * barra tem `backdrop-blur`, e `backdrop-filter` faz o `position: fixed` dos
 * filhos se prender a ela em vez da tela.
 */

interface CamposProps {
  filtros: FiltrosNaUrl
  opcoes: OpcoesFiltros
  /** Prefixo dos ids — o painel e a gaveta coexistem no DOM. */
  idBase: string
}

const DICA: Partial<Record<ChaveFiltro, string>> = {
  cliente: 'Só receitas',
  produto: 'Só receitas',
  categoria: 'Só despesas',
}

const CamposFiltros: React.FC<CamposProps> = ({ filtros, opcoes, idBase }) => {
  const { Cliente } = useTermoCliente()
  const rotulos = { ...ROTULO_FILTRO, cliente: Cliente }
  return (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
    {(Object.keys(ROTULO_FILTRO) as ChaveFiltro[]).map((chave) => {
      const id = `${idBase}-${chave}`
      const valor = filtros.filtros[chave] ?? ''
      const lista: string[] = opcoes[chave]
      // Valor vindo de um link que não existe no período continua escolhível.
      const itens = valor && !lista.includes(valor) ? [valor, ...lista] : lista
      return (
        <div key={chave} className="flex flex-col">
          <label htmlFor={id} className="text-xs font-medium text-gray-600 dark:text-gray-300">
            {rotulos[chave]}
            {DICA[chave] && <span className="ml-1 font-normal text-gray-400">({DICA[chave]})</span>}
          </label>
          <select
            id={id}
            value={valor}
            onChange={(e) => filtros.definir(chave, e.target.value || undefined)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="">Todos</option>
            {itens.map((v) => (
              <option key={v} value={v}>
                {rotuloValor(chave, v)}
              </option>
            ))}
          </select>
        </div>
      )
    })}
  </div>
  )
}

export const EtiquetasFiltros: React.FC<{ filtros: FiltrosNaUrl }> = ({ filtros }) => {
  const { Cliente } = useTermoCliente()
  if (filtros.ativos === 0) return null
  const rotulos = { ...ROTULO_FILTRO, cliente: Cliente }
  return (
    <ul className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Filtros ativos">
      {(Object.keys(filtros.filtros) as ChaveFiltro[]).map((chave) => {
        const texto = `${rotulos[chave]}: ${rotuloValor(chave, filtros.filtros[chave]!)}`
        return (
          <li key={chave}>
            <button
              type="button"
              onClick={() => filtros.definir(chave, undefined)}
              aria-label={`Remover filtro ${texto}`}
              className="inline-flex max-w-[16rem] items-center gap-1 rounded-full bg-primary-50 py-1 pl-3 pr-2 text-xs font-medium text-primary-800 hover:bg-primary-100 dark:bg-primary-900/40 dark:text-primary-200 dark:hover:bg-primary-900/60"
            >
              <span className="truncate" title={texto}>{texto}</span>
              <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </button>
          </li>
        )
      })}
      <li>
        <button
          type="button"
          onClick={filtros.limpar}
          className="px-2 py-1 text-xs font-medium text-gray-600 underline-offset-2 hover:underline dark:text-gray-300"
        >
          Limpar filtros
        </button>
      </li>
    </ul>
  )
}

interface PainelProps {
  aberto: boolean
  fechar: () => void
  filtros: FiltrosNaUrl
  opcoes: OpcoesFiltros
  periodo: PeriodoNaUrl
}

export const PainelFiltros: React.FC<PainelProps> = ({ aberto, fechar, filtros, opcoes, periodo }) => {
  useEffect(() => {
    if (!aberto) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aberto, fechar])

  if (!aberto) return null

  return (
    <>
      {/* Computador: embaixo da barra */}
      <div id="painel-filtros" className="mt-3 hidden border-t border-gray-200 pt-3 sm:block dark:border-gray-700">
        <CamposFiltros filtros={filtros} opcoes={opcoes} idBase="filtro" />
      </div>

      {/* Celular: gaveta */}
      {createPortal(
        <div className="fixed inset-0 z-50 sm:hidden" role="dialog" aria-modal="true" aria-labelledby="gaveta-filtros-titulo">
          <div className="absolute inset-0 bg-black/40" onClick={fechar} aria-hidden />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4 pb-6 shadow-xl dark:bg-gray-800">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden />
            <div className="mb-3 flex items-center justify-between">
              <h2 id="gaveta-filtros-titulo" className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Filtros
              </h2>
              {filtros.ativos > 0 && (
                <button type="button" onClick={filtros.limpar} className="text-sm font-medium text-primary-700 dark:text-primary-300">
                  Limpar
                </button>
              )}
            </div>
            {/* No computador estes dois ficam na própria barra */}
            <fieldset className="mb-4">
              <legend className="text-xs font-medium text-gray-600 dark:text-gray-300">Contar pela data de</legend>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {([
                  ['vencimento', 'Vencimento'],
                  ['pagamento', 'Pagamento'],
                ] as const).map(([valor, rotulo]) => (
                  <label
                    key={valor}
                    className={`flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium ${
                      periodo.base === valor
                        ? 'border-primary-600 bg-primary-600 text-white dark:border-primary-500 dark:bg-primary-500'
                        : 'border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="gaveta-base"
                      value={valor}
                      checked={periodo.base === valor}
                      onChange={() => periodo.escolherBase(valor)}
                      className="sr-only"
                    />
                    {rotulo}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="mb-4 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                checked={periodo.comparar}
                disabled={!periodo.de}
                onChange={(e) => periodo.alternarComparacao(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600"
              />
              Comparar com o período anterior
            </label>
            <CamposFiltros filtros={filtros} opcoes={opcoes} idBase="gaveta" />
            <button
              type="button"
              onClick={fechar}
              className="mt-4 w-full rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white dark:bg-primary-500"
            >
              Ver resultados
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
