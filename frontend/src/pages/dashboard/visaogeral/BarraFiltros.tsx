import React, { useCallback, useState } from 'react'
import { CalendarRange, SlidersHorizontal } from 'lucide-react'
import { formatDate } from '@/utils'
import { ATALHOS, intervaloDoAtalho, type AtalhoFixo, type OpcaoAtalho, type PeriodoNaUrl } from './periodo'
import type { FiltrosNaUrl, OpcoesFiltros } from './filtros'
import { EtiquetasFiltros, PainelFiltros } from './PainelFiltros'

/**
 * Barra de filtros da Visão Geral. Fica PRESA no topo da área que rola
 * (`sticky top-0`): antes o período ficava no meio da página, depois de oito
 * cartões, e no celular a pessoa trocava o filtro sem ver os números que
 * acabavam de mudar lá em cima.
 */

interface Props {
  periodo: PeriodoNaUrl
  /** Filtros com painel/gaveta (Dashboard financeiro). Sem eles, a barra não mostra o botão Filtros. */
  filtros?: FiltrosNaUrl
  opcoes?: OpcoesFiltros
  /** Texto do período de comparação, quando há um. */
  anteriorTexto?: string
  /** Atalhos de período desta página. */
  atalhos?: OpcaoAtalho[]
  /** Escolha Vencimento × Pagamento (só faz sentido no financeiro). */
  mostrarBase?: boolean
  /** Controles próprios da página (ex.: funil e proprietário no CRM), na mesma linha. */
  extra?: React.ReactNode
  /** O que a data do período significa, depois do intervalo. */
  referencia?: string
  /** Atalho de onde parte o "Personalizado" quando o período é Tudo. */
  basePersonalizado?: AtalhoFixo
  'data-tour'?: string
}

const botao =
  'px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500'
const ativo = 'bg-primary-600 text-white dark:bg-primary-500'
const inativo =
  'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'

export const BarraFiltros: React.FC<Props> = ({
  periodo,
  filtros,
  opcoes,
  anteriorTexto,
  atalhos = ATALHOS,
  mostrarBase = true,
  extra,
  referencia,
  basePersonalizado = '3meses',
  'data-tour': dataTour = 'dash-periodo',
}) => {
  // Sem gaveta de filtros, comparar fica visível também no celular.
  const comGaveta = !!(filtros && opcoes)
  const [abrirDatas, setAbrirDatas] = useState(periodo.atalho === 'personalizado')
  const [abrirFiltros, setAbrirFiltros] = useState(false)
  const fecharFiltros = useCallback(() => setAbrirFiltros(false), [])
  const mostrarDatas = abrirDatas || periodo.atalho === 'personalizado'

  // Abrir o personalizado a partir de "Tudo" (sem datas) parte do padrão.
  const base = periodo.de && periodo.ate ? { de: periodo.de, ate: periodo.ate } : intervaloDoAtalho(basePersonalizado)

  const textoPeriodo =
    periodo.de && periodo.ate ? `${formatDate(periodo.de)} a ${formatDate(periodo.ate)}` : 'Todo o histórico'

  return (
    <div
      className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 dark:border-gray-700 dark:bg-gray-800/95"
      data-tour={dataTour}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Celular: uma lista de escolha. Seis botões quebrados em duas linhas
            deixavam a barra presa com um terço da altura da tela. */}
        <select
          aria-label="Período"
          value={mostrarDatas ? 'personalizado' : periodo.atalho}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'personalizado') setAbrirDatas(true)
            else {
              setAbrirDatas(false)
              periodo.escolherAtalho(v as AtalhoFixo)
            }
          }}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 sm:hidden dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        >
          {atalhos.map((a) => (
            <option key={a.chave} value={a.chave}>
              {a.rotulo}
            </option>
          ))}
          <option value="personalizado">Personalizado</option>
        </select>

        <div role="group" aria-label="Período" className="hidden flex-wrap items-center gap-1.5 sm:flex">
          {atalhos.map((a) => {
            const marcado = periodo.atalho === a.chave
            return (
              <button
                key={a.chave}
                type="button"
                aria-pressed={marcado}
                onClick={() => {
                  setAbrirDatas(false)
                  periodo.escolherAtalho(a.chave)
                }}
                className={`${botao} ${marcado ? ativo : inativo}`}
              >
                {a.rotulo}
              </button>
            )
          })}
          <button
            type="button"
            aria-pressed={mostrarDatas}
            aria-expanded={mostrarDatas}
            onClick={() => setAbrirDatas((v) => !v)}
            className={`${botao} inline-flex items-center gap-1.5 ${mostrarDatas ? ativo : inativo}`}
          >
            <CalendarRange className="h-4 w-4" aria-hidden />
            Personalizado
          </button>
        </div>

        {/* Competência × caixa: o mesmo período lido pelo vencimento ou pelo dia do pagamento */}
        {/* No celular, base e comparação moram na gaveta de Filtros: a barra presa tem de ser baixa. */}
        {mostrarBase && (
        <div role="radiogroup" aria-label="Contar pela data de" className="hidden rounded-lg border border-gray-300 p-0.5 sm:inline-flex dark:border-gray-600">
          {([
            ['vencimento', 'Vencimento'],
            ['pagamento', 'Pagamento'],
          ] as const).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={periodo.base === valor}
              onClick={() => periodo.escolherBase(valor)}
              title={valor === 'pagamento' ? 'O que de fato entrou e saiu, pelo dia em que foi pago' : 'O que venceu no período, pago ou não'}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition sm:text-sm ${
                periodo.base === valor ? ativo : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        )}

        <label className={`${comGaveta ? 'hidden sm:inline-flex' : 'inline-flex'} cursor-pointer items-center gap-2 text-xs text-gray-700 sm:text-sm dark:text-gray-200`}>
          <input
            type="checkbox"
            checked={periodo.comparar}
            disabled={!periodo.de}
            onChange={(e) => periodo.alternarComparacao(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-50"
          />
          <span className="sm:hidden">Comparar</span>
          <span className="hidden sm:inline">Comparar com o período anterior</span>
        </label>

        {/* Depois do Comparar: no celular, período + Comparar ficam numa linha e os
            controles da página (funil, proprietário) na seguinte. */}
        {extra}

        {filtros && (
        <button
          type="button"
          onClick={() => setAbrirFiltros((v) => !v)}
          aria-expanded={abrirFiltros}
          aria-controls="painel-filtros"
          className={`${botao} inline-flex items-center gap-1.5 border ${
            filtros.ativos > 0
              ? 'border-primary-300 bg-primary-50 text-primary-800 dark:border-primary-700 dark:bg-primary-900/40 dark:text-primary-200'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Filtros
          {filtros.ativos > 0 && (
            <span className="rounded-full bg-primary-600 px-1.5 text-[11px] text-white dark:bg-primary-500">
              <span className="sr-only">, </span>
              {filtros.ativos}
              <span className="sr-only"> ativos</span>
            </span>
          )}
        </button>
        )}
      </div>

      {filtros && opcoes && (
        <PainelFiltros aberto={abrirFiltros} fechar={fecharFiltros} filtros={filtros} opcoes={opcoes} periodo={periodo} />
      )}

      {mostrarDatas && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <label className="flex flex-col text-xs text-gray-500 dark:text-gray-400">
            De
            <input
              type="date"
              value={base.de}
              onChange={(e) => e.target.value && periodo.escolherDatas(e.target.value, base.ate!)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </label>
          <label className="flex flex-col text-xs text-gray-500 dark:text-gray-400">
            Até
            <input
              type="date"
              value={base.ate}
              onChange={(e) => e.target.value && periodo.escolherDatas(base.de!, e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </label>
        </div>
      )}

      {/* aria-live: quem usa leitor de tela ouve o novo período ao trocar o filtro. */}
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
        <span className="font-medium text-gray-700 dark:text-gray-200">{textoPeriodo}</span>
        <span className="hidden sm:inline">
          {referencia !== undefined
            ? referencia && ` · ${referencia}`
            : periodo.base === 'pagamento'
              ? ' · pelo dia em que foi pago (só o que já entrou e saiu)'
              : ' · pela data de vencimento das parcelas'}
        </span>
        {periodo.comparar && anteriorTexto && <> · comparando com {anteriorTexto}</>}
      </p>

      {filtros && <EtiquetasFiltros filtros={filtros} />}
    </div>
  )
}
