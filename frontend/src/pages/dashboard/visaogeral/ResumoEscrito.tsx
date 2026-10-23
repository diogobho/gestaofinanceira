import React from 'react'
import { FileText } from 'lucide-react'
import { formatCurrency } from '@/utils'
import type { BaseData } from './periodo'

/**
 * O dashboard em frases, no topo da página. Gráfico não é lido por leitor de
 * tela; um parágrafo é — e quem enxerga também ganha a leitura pronta antes de
 * olhar os números. As frases saem dos MESMOS valores dos cartões.
 */

export interface DadosResumo {
  periodoTexto: string
  filtrosTexto: string
  base: BaseData
  faturamento: number
  recebido: number
  aReceber: number
  despesas: number
  resultado: number
  /** Filtro de um lado só (cliente/produto × categoria): o resultado não se aplica. */
  semResultado: boolean
  faturamentoAnterior: number | null
  despesasAnteriores: number | null
  atrasado: number
  clientesEmAtraso: number
  /** [singular, plural] em minúsculas — a conta pode chamar o cliente de outro nome */
  termoCliente?: [string, string]
  proximos30: { entradas: number; saidas: number } | null
}

const variacao = (atual: number, anterior: number | null, palavraMais: string, palavraMenos: string) => {
  if (anterior === null || anterior <= 0) return ''
  const pct = ((atual - anterior) / anterior) * 100
  if (Math.abs(pct) < 0.5) return ', praticamente igual ao período anterior'
  const n = Math.abs(pct).toLocaleString('pt-BR', { maximumFractionDigits: Math.abs(pct) < 10 ? 1 : 0 })
  return `, ${n}% ${pct > 0 ? palavraMais : palavraMenos} que no período anterior`
}

export function frasesDoResumo(d: DadosResumo): string[] {
  const caixa = d.base === 'pagamento'
  // "De 01/04/2026 a 31/07/2026" — mas "Em todo o histórico", "A partir de…".
  const t = d.periodoTexto
  const quando = /^\d/.test(t) ? `De ${t}` : /^(a partir|até)/.test(t) ? t.charAt(0).toUpperCase() + t.slice(1) : `Em ${t}`
  const recorte = d.filtrosTexto ? ` (${d.filtrosTexto})` : ''
  const frases: string[] = []

  if (d.faturamento === 0 && d.despesas === 0) {
    return [`Não há lançamentos ${/^\d/.test(d.periodoTexto) ? `de ${d.periodoTexto}` : `em ${d.periodoTexto}`}${recorte}.`]
  }

  frases.push(
    caixa
      ? `${quando}${recorte}, entraram ${formatCurrency(d.faturamento)} no caixa${variacao(d.faturamento, d.faturamentoAnterior, 'a mais', 'a menos')}.`
      : `${quando}${recorte}, o faturamento foi de ${formatCurrency(d.faturamento)}${variacao(d.faturamento, d.faturamentoAnterior, 'a mais', 'a menos')}. Já entraram ${formatCurrency(d.recebido)} e faltam receber ${formatCurrency(d.aReceber)}.`
  )

  frases.push(
    `${caixa ? 'Saíram' : 'As despesas somaram'} ${formatCurrency(d.despesas)}${variacao(d.despesas, d.despesasAnteriores, 'a mais', 'a menos')}.`
  )

  if (!d.semResultado) {
    const margem = d.faturamento > 0 ? (d.resultado / d.faturamento) * 100 : 0
    frases.push(
      d.resultado >= 0
        ? `Sobraram ${formatCurrency(d.resultado)}, uma margem de ${margem.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%.`
        : `As despesas passaram do faturamento em ${formatCurrency(-d.resultado)}.`
    )
  }

  if (!caixa) {
    frases.push(
      d.atrasado > 0
        ? `${formatCurrency(d.atrasado)} em receitas está em atraso, com ${d.clientesEmAtraso} ${d.clientesEmAtraso === 1 ? (d.termoCliente?.[0] ?? 'cliente') : (d.termoCliente?.[1] ?? 'clientes')}.`
        : 'Nenhuma receita do período está em atraso.'
    )
  }

  if (d.proximos30 && (d.proximos30.entradas > 0 || d.proximos30.saidas > 0)) {
    frases.push(
      `Nos próximos 30 dias, devem entrar ${formatCurrency(d.proximos30.entradas)} e sair ${formatCurrency(d.proximos30.saidas)}.`
    )
  }
  return frases
}

export const ResumoEscrito: React.FC<{ dados: DadosResumo }> = ({ dados }) => (
  <CaixaResumo frases={frasesDoResumo(dados)} />
)

/** A caixa do resumo, para qualquer dashboard que monte as próprias frases. */
export const CaixaResumo: React.FC<{ frases: string[]; titulo?: string }> = ({ frases, titulo = 'Resumo do período' }) => {
  return (
    <section
      aria-labelledby="resumo-titulo"
      className="rounded-lg border border-primary-100 bg-gradient-to-br from-primary-50 to-white p-4 sm:p-5 dark:border-gray-700 dark:from-gray-800 dark:to-gray-800"
    >
      <h2 id="resumo-titulo" className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-primary-800 dark:text-primary-200">
        <FileText className="h-4 w-4" aria-hidden />
        {titulo}
      </h2>
      <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200" aria-live="polite">
        {frases.join(' ')}
      </p>
    </section>
  )
}
