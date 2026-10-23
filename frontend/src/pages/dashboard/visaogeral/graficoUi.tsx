import React from 'react'
import { formatCurrency } from '@/utils'
import type { PaletaViz } from '../contaazul/paleta'

/**
 * Peças comuns dos gráficos da Visão Geral.
 *
 * - `TooltipGrafico`: a caixinha do hover/toque como cartão do tema — título,
 *   uma linha por série com a marca colorida AO LADO do texto (o texto fica na
 *   cor de texto, nunca na cor da série) e o valor alinhado à direita.
 * - `TabelaDoGrafico`: os mesmos números em tabela, dentro de um <details>.
 *   Gráfico não é lido por leitor de tela; a tabela é, e o <details> já é
 *   acessível pelo teclado sem JavaScript nenhum.
 */

interface ItemTooltip {
  name?: string
  value?: number | string
  color?: string
  dataKey?: string | number
  payload?: any
}

interface TooltipProps {
  active?: boolean
  payload?: ItemTooltip[]
  label?: string | number
  paleta: PaletaViz
  /** Título no lugar do `label` do eixo (ex.: data por extenso). */
  titulo?: (payload: any, label?: string | number) => string
  /** Linhas extras no rodapé (ex.: "Saldo acumulado"). */
  rodape?: (payload: any) => React.ReactNode
  /** Formato do valor; padrão moeda (o CRM conta leads). */
  formatar?: (v: number) => string
}

// Só a primeira letra: `capitalize` do CSS faria "Seg., 19 De Out.".
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

export const TooltipGrafico: React.FC<TooltipProps> = ({ active, payload, label, paleta, titulo, rodape, formatar = formatCurrency }) => {
  if (!active || !payload?.length) return null
  const dados = payload[0]?.payload
  return (
    <div
      className="min-w-[11rem] rounded-xl px-3 py-2 text-xs shadow-lg"
      style={{ background: paleta.tooltipBg, border: `1px solid ${paleta.tooltipBorda}`, color: paleta.tooltipTexto }}
    >
      <p className="mb-1.5 font-semibold">{maiuscula(String(titulo ? titulo(dados, label) : label ?? ''))}</p>
      <ul className="space-y-1">
        {payload.map((item) => (
          <li key={String(item.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} aria-hidden />
              {item.name}
            </span>
            <span className="font-semibold tabular-nums">{formatar(Number(item.value) || 0)}</span>
          </li>
        ))}
      </ul>
      {rodape && <div className="mt-1.5 border-t pt-1.5" style={{ borderColor: paleta.tooltipBorda }}>{rodape(dados)}</div>}
    </div>
  )
}

interface ColunaTabela<T> {
  titulo: string
  valor: (linha: T) => React.ReactNode
  numero?: boolean
}

export function TabelaDoGrafico<T>({
  resumo = 'Ver os números em tabela',
  legenda,
  colunas,
  linhas,
}: {
  resumo?: string
  legenda: string
  colunas: ColunaTabela<T>[]
  linhas: T[]
}) {
  if (linhas.length === 0) return null
  return (
    <details className="group mt-3 text-sm">
      <summary className="cursor-pointer select-none text-xs font-medium text-primary-700 hover:underline dark:text-primary-300">
        {resumo}
      </summary>
      <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-xs">
          <caption className="sr-only">{legenda}</caption>
          <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900">
            <tr>
              {colunas.map((c) => (
                <th
                  key={c.titulo}
                  scope="col"
                  className={`px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 ${c.numero ? 'text-right' : 'text-left'}`}
                >
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                {colunas.map((c, j) =>
                  j === 0 ? (
                    <th key={c.titulo} scope="row" className="px-3 py-1.5 text-left font-normal capitalize text-gray-700 dark:text-gray-200">
                      {c.valor(l)}
                    </th>
                  ) : (
                    <td key={c.titulo} className={`px-3 py-1.5 tabular-nums text-gray-700 dark:text-gray-200 ${c.numero ? 'text-right' : ''}`}>
                      {c.valor(l)}
                    </td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

/**
 * Mini linha de tendência do cartão (um valor por mês do período). Sem eixo,
 * sem número: é contexto — o valor está no cartão e na tabela. Escondida do
 * leitor de tela pelo mesmo motivo.
 */
export const Sparkline: React.FC<{ valores: number[]; cor: string }> = ({ valores, cor }) => {
  if (valores.length < 2) return null
  const L = 96
  const A = 28
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const amp = max - min || 1
  const pts = valores.map((v, i) => [(i / (valores.length - 1)) * L, A - 3 - ((v - min) / amp) * (A - 6)] as const)
  const linha = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const id = `spark-${cor.replace('#', '')}`
  const [ux, uy] = pts[pts.length - 1]
  return (
    <svg width={L} height={A} viewBox={`0 0 ${L} ${A}`} aria-hidden className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity={0.25} />
          <stop offset="100%" stopColor={cor} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${linha} L${L},${A} L0,${A} Z`} fill={`url(#${id})`} />
      <path d={linha} fill="none" stroke={cor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ux} cy={uy} r={3} fill={cor} />
    </svg>
  )
}
