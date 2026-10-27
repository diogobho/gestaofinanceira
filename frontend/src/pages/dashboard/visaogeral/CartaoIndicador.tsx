import React from 'react'
import { formatCurrency } from '@/utils'
import { Sparkline } from './graficoUi'

/**
 * Cartão de número do topo da Visão Geral, com a comparação ao período
 * anterior ESCRITA ("Subiu 12%, antes R$ 3.000,00"), não só seta e cor: a
 * frase é o que o leitor de tela lê, e cor sozinha não diz nada a quem não a
 * distingue.
 */

export interface Comparacao {
  atual: number
  anterior: number
  /** Despesa subir é ruim; receita subir é bom. */
  bomQuandoSobe: boolean
  /** `percentual` para valores sempre positivos; `diferenca` para o resultado, que pode trocar de sinal. */
  modo?: 'percentual' | 'diferenca'
  /** Formata o valor anterior; padrão moeda. */
  formatar?: (v: number) => string
  /** O período anterior não tem lançamento nenhum (o resultado zero ali não é "zero de lucro"). */
  anteriorVazio?: boolean
}

interface Props {
  titulo: string
  valor: string
  corValor?: string
  detalhe?: React.ReactNode
  comparacao?: Comparacao | null
  icone: React.ReactNode
  corIcone: string
  /** Um valor por mês do período, para a mini linha de tendência. */
  tendencia?: { valores: number[]; cor: string }
}

const pct = (v: number) =>
  `${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: v !== 0 && Math.abs(v) < 10 ? 1 : 0 })}%`

function textoComparacao(c: Comparacao): { texto: string; tom: 'bom' | 'ruim' | 'neutro' } {
  const fmt = c.formatar ?? formatCurrency
  if (c.anteriorVazio) return { texto: 'Nada no período anterior', tom: 'neutro' }
  const antes = `antes ${fmt(c.anterior)}`
  const diff = c.atual - c.anterior
  if (Math.abs(diff) < 0.005) return { texto: `Igual ao período anterior`, tom: 'neutro' }
  const subiu = diff > 0
  const tom = subiu === c.bomQuandoSobe ? 'bom' : 'ruim'

  if (c.modo === 'diferenca' || c.anterior <= 0) {
    if (c.anterior === 0 && c.modo !== 'diferenca') return { texto: 'Nada no período anterior', tom: 'neutro' }
    return { texto: `${subiu ? 'Subiu' : 'Caiu'} ${fmt(Math.abs(diff))}, ${antes}`, tom }
  }
  return { texto: `${subiu ? 'Subiu' : 'Caiu'} ${pct((diff / c.anterior) * 100)}, ${antes}`, tom }
}

const corTom = {
  bom: 'text-emerald-700 dark:text-emerald-400',
  ruim: 'text-red-700 dark:text-red-400',
  neutro: 'text-gray-500 dark:text-gray-400',
}

export const CartaoIndicador: React.FC<Props> = ({ titulo, valor, corValor, detalhe, comparacao, icone, corIcone, tendencia }) => {
  const cmp = comparacao ? textoComparacao(comparacao) : null
  return (
    <section
      aria-label={titulo}
      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5 dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs font-medium text-gray-600 sm:text-sm dark:text-gray-300">{titulo}</h3>
        <span className={`hidden rounded-full p-2 sm:inline-flex ${corIcone}`} aria-hidden>
          {icone}
        </span>
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className={`text-lg font-bold tabular-nums sm:text-2xl ${corValor ?? 'text-gray-900 dark:text-gray-100'}`}>
          {valor}
        </p>
        {tendencia && (
          <span className="hidden shrink-0 sm:block">
            <Sparkline valores={tendencia.valores} cor={tendencia.cor} />
          </span>
        )}
      </div>
      {detalhe && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detalhe}</div>}
      {cmp && <p className={`mt-2 text-xs font-medium ${corTom[cmp.tom]}`}>{cmp.texto}</p>}
    </section>
  )
}
