import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { parcelasApi } from '@/api'
import { toInputDate } from '@/utils'
import { dataPura } from '../detalhamento/agregacoes'
import { filtrarDespesas, filtrarReceitas, type Filtros } from './filtros'

/**
 * Fluxo de caixa previsto — o que ainda vai entrar e sair de HOJE até 90 dias,
 * dia a dia, e a sobra acumulada.
 *
 * Não é saldo bancário: o Duo não sabe quanto a empresa tem no banco hoje. A
 * linha parte de zero e responde "daqui para frente, sobra ou falta?" — a
 * pergunta mais comum do dono de pequena empresa.
 *
 * - Não segue o período do filtro (é sempre de hoje em diante), mas segue os
 *   filtros de cliente, produto, categoria e origem. Situação não: a previsão é,
 *   por definição, o que está a vencer.
 * - Parcela já paga com vencimento futuro fica de fora: o dinheiro já entrou.
 * - Receita em atraso fica de fora: ninguém sabe se nem quando ela entra.
 */

export const HORIZONTES = [30, 60, 90] as const
export type Horizonte = (typeof HORIZONTES)[number]

export interface DiaFluxo {
  /** YYYY-MM-DD */
  data: string
  entradas: number
  saidas: number
  /** acumulado desde hoje */
  saldo: number
}

const somarDias = (base: Date, n: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + n)

export function useFluxoCaixa(filtros: Filtros) {
  const hoje = new Date()
  const de = toInputDate(hoje)
  const ate = toInputDate(somarDias(hoje, 90))
  const intervalo = { data_ini: de, data_fim: ate }

  const { data: receitas } = useQuery({
    queryKey: ['parcelas-receitas-dash', intervalo],
    queryFn: () => parcelasApi.getParcelasReceitas(intervalo),
  })
  const { data: despesas } = useQuery({
    queryKey: ['parcelas-despesas-dash', intervalo],
    queryFn: () => parcelasApi.getParcelasDespesas(intervalo),
  })

  const semSituacao = useMemo(() => ({ ...filtros, situacao: undefined }), [filtros])

  // 91 dias (hoje + 90), cada um com o que entra, o que sai e o acumulado.
  const dias = useMemo<DiaFluxo[] | null>(() => {
    if (!receitas || !despesas) return null
    const porDia = new Map<string, { entradas: number; saidas: number }>()
    const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
    for (let i = 0; i <= 90; i++) porDia.set(toInputDate(somarDias(base, i)), { entradas: 0, saidas: 0 })

    for (const p of filtrarReceitas(receitas, semSituacao, de)) {
      if (p.status === 'PAGO') continue
      const d = porDia.get(dataPura(p.data_vencimento))
      if (d) d.entradas += Number(p.valor) || 0
    }
    for (const p of filtrarDespesas(despesas, semSituacao, de)) {
      if (p.status === 'PAGO') continue
      const d = porDia.get(dataPura(p.data_vencimento))
      if (d) d.saidas += Number(p.valor) || 0
    }

    let saldo = 0
    return [...porDia.entries()].map(([data, v]) => {
      saldo += v.entradas - v.saidas
      return { data, ...v, saldo }
    })
    // `hoje` muda a cada render; o dia (`de`) é o que importa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receitas, despesas, semSituacao, de])

  return { dias }
}

/** Recorte de N dias e os totais dele. */
export function recorteFluxo(dias: DiaFluxo[], horizonte: Horizonte) {
  const serie = dias.slice(0, horizonte + 1)
  const entradas = serie.reduce((t, d) => t + d.entradas, 0)
  const saidas = serie.reduce((t, d) => t + d.saidas, 0)
  // Pior momento: o dia em que a sobra acumulada está mais baixa.
  const pior = serie.reduce((m, d) => (d.saldo < m.saldo ? d : m), serie[0])
  return { serie, entradas, saidas, saldo: entradas - saidas, pior }
}
