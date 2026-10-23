import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toInputDate } from '@/utils'

/**
 * Período da Visão Geral do dashboard — mora na URL, para o F5 e o link
 * reabrirem no mesmo recorte (`?periodo=mes-passado`, `?de=…&ate=…`).
 *
 * Atalho vai para a URL pelo NOME, não pelas datas: um link de "este mês"
 * aberto no mês seguinte continua mostrando o mês corrente. Só o personalizado
 * grava `de` e `ate`. O padrão (3 meses) não vai para a URL.
 */

export type Atalho = 'hoje' | '7dias' | '30dias' | 'mes' | 'mes-passado' | '3meses' | 'ano' | 'tudo' | 'personalizado'
export type AtalhoFixo = Exclude<Atalho, 'personalizado'>
export interface OpcaoAtalho {
  chave: AtalhoFixo
  rotulo: string
}

/** Atalhos do Dashboard financeiro: meses inteiros, que é como o dinheiro é lido. */
export const ATALHOS: OpcaoAtalho[] = [
  { chave: 'mes', rotulo: 'Este mês' },
  { chave: 'mes-passado', rotulo: 'Mês passado' },
  { chave: '3meses', rotulo: 'Últimos 3 meses' },
  { chave: 'ano', rotulo: 'Este ano' },
  { chave: 'tudo', rotulo: 'Tudo' },
]

/** Atalhos do CRM Dashboard: a equipe comercial olha o dia e a semana também. */
export const ATALHOS_CRM: OpcaoAtalho[] = [
  { chave: 'hoje', rotulo: 'Hoje' },
  { chave: '7dias', rotulo: '7 dias' },
  { chave: '30dias', rotulo: '30 dias' },
  { chave: 'mes', rotulo: 'Este mês' },
  { chave: 'mes-passado', rotulo: 'Mês passado' },
  { chave: 'tudo', rotulo: 'Tudo' },
]

const VALIDOS: Atalho[] = ['hoje', '7dias', '30dias', 'mes', 'mes-passado', '3meses', 'ano', 'tudo']

export interface Intervalo {
  de?: string
  ate?: string
}

/** 'YYYY-MM-DD' → Date local (meia-noite no fuso do navegador). */
const paraData = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d)
}

const ultimoDiaDoMes = (a: number, m: number) => new Date(a, m + 1, 0)

/**
 * Meses inteiros, inclusive o corrente até o último dia: o que vence no resto
 * do mês faz parte do mês. O que vem depois tem o cartão "A receber daqui para
 * frente", que não depende do filtro.
 */
export function intervaloDoAtalho(atalho: Atalho, hoje = new Date()): Intervalo {
  const a = hoje.getFullYear()
  const m = hoje.getMonth()
  const d = hoje.getDate()
  switch (atalho) {
    // Janelas que TERMINAM HOJE, contando hoje: "7 dias" = hoje e os 6 anteriores.
    case 'hoje':
      return { de: toInputDate(hoje), ate: toInputDate(hoje) }
    case '7dias':
      return { de: toInputDate(new Date(a, m, d - 6)), ate: toInputDate(hoje) }
    case '30dias':
      return { de: toInputDate(new Date(a, m, d - 29)), ate: toInputDate(hoje) }
    case 'mes':
      return { de: toInputDate(new Date(a, m, 1)), ate: toInputDate(ultimoDiaDoMes(a, m)) }
    case 'mes-passado':
      return { de: toInputDate(new Date(a, m - 1, 1)), ate: toInputDate(ultimoDiaDoMes(a, m - 1)) }
    case '3meses':
      return { de: toInputDate(new Date(a, m - 2, 1)), ate: toInputDate(ultimoDiaDoMes(a, m)) }
    case 'ano':
      return { de: toInputDate(new Date(a, 0, 1)), ate: toInputDate(new Date(a, 11, 31)) }
    default:
      return {}
  }
}

/**
 * O período de comparação. Recorte que começa no dia 1º volta o mesmo número
 * de meses — setembro compara com agosto, não com os 30 dias antes de 1º de
 * setembro, que pegariam um pedaço de julho. Qualquer outro recorte compara
 * com os mesmos tantos dias imediatamente antes.
 */
export function periodoAnterior({ de, ate }: Intervalo): Intervalo | null {
  if (!de || !ate) return null
  const ini = paraData(de)
  const fim = paraData(ate)

  // Começa no dia 1º: volta em meses. Termina no último dia → último dia do mês
  // de lá; senão o mesmo dia, limitado ao fim do mês (1º a 08/10 → 1º a 08/09;
  // 1º a 31/03 → 1º a 28/02).
  if (ini.getDate() === 1) {
    const n = (fim.getFullYear() - ini.getFullYear()) * 12 + fim.getMonth() - ini.getMonth() + 1
    const fimDeMes = fim.getDate() === ultimoDiaDoMes(fim.getFullYear(), fim.getMonth()).getDate()
    const ultimoLa = ultimoDiaDoMes(fim.getFullYear(), fim.getMonth() - n)
    return {
      de: toInputDate(new Date(ini.getFullYear(), ini.getMonth() - n, 1)),
      ate: toInputDate(
        fimDeMes ? ultimoLa : new Date(ultimoLa.getFullYear(), ultimoLa.getMonth(), Math.min(fim.getDate(), ultimoLa.getDate()))
      ),
    }
  }

  const dias = Math.round((fim.getTime() - ini.getTime()) / 86_400_000) + 1
  const ateAnterior = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() - 1)
  const deAnterior = new Date(ateAnterior.getFullYear(), ateAnterior.getMonth(), ateAnterior.getDate() - dias + 1)
  return { de: toInputDate(deAnterior), ate: toInputDate(ateAnterior) }
}

const dataValida = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

/**
 * Base de data do período. `vencimento` (padrão, competência): o que venceu no
 * período, pago ou não. `pagamento` (caixa): o que de fato entrou e saiu, pelo
 * dia em que foi pago — só parcelas pagas.
 */
export type BaseData = 'vencimento' | 'pagamento'

export interface PeriodoNaUrl extends Intervalo {
  atalho: Atalho
  base: BaseData
  escolherBase: (b: BaseData) => void
  comparar: boolean
  escolherAtalho: (a: Exclude<Atalho, 'personalizado'>) => void
  escolherDatas: (de: string, ate: string) => void
  alternarComparacao: (ligar: boolean) => void
}

/** `padrao`: o atalho de quando a URL não diz nada — ele não vai para a URL. */
export function usePeriodoNaUrl(padrao: AtalhoFixo = '3meses'): PeriodoNaUrl {
  const [params, setParams] = useSearchParams()

  const deUrl = params.get('de')
  const ateUrl = params.get('ate')
  let atalho: Atalho
  let intervalo: Intervalo
  if (dataValida(deUrl) && dataValida(ateUrl)) {
    atalho = 'personalizado'
    // Link com as datas trocadas vale do mesmo jeito.
    intervalo = deUrl <= ateUrl ? { de: deUrl, ate: ateUrl } : { de: ateUrl, ate: deUrl }
  } else {
    const bruto = params.get('periodo') as Atalho | null
    atalho = bruto && VALIDOS.includes(bruto) ? bruto : padrao
    intervalo = intervaloDoAtalho(atalho)
  }
  const comparar = params.get('comparar') !== '0'
  const base: BaseData = params.get('base') === 'pagamento' ? 'pagamento' : 'vencimento'

  // Sempre o updater funcional: a mesma URL carrega `aba` do DashboardComAbas.
  const mudar = useCallback(
    (fn: (p: URLSearchParams) => void) =>
      setParams(
        (atual) => {
          const proximo = new URLSearchParams(atual)
          fn(proximo)
          return proximo
        },
        { replace: true }
      ),
    [setParams]
  )

  const escolherAtalho = useCallback(
    (a: AtalhoFixo) =>
      mudar((p) => {
        p.delete('de')
        p.delete('ate')
        if (a === padrao) p.delete('periodo')
        else p.set('periodo', a)
      }),
    [mudar, padrao]
  )

  const escolherDatas = useCallback(
    (de: string, ate: string) =>
      mudar((p) => {
        if (!dataValida(de) || !dataValida(ate)) return
        p.delete('periodo')
        p.set('de', de <= ate ? de : ate)
        p.set('ate', de <= ate ? ate : de)
      }),
    [mudar]
  )

  const alternarComparacao = useCallback(
    (ligar: boolean) =>
      mudar((p) => {
        if (ligar) p.delete('comparar')
        else p.set('comparar', '0')
      }),
    [mudar]
  )

  const escolherBase = useCallback(
    (b: BaseData) =>
      mudar((p) => {
        if (b === 'pagamento') p.set('base', b)
        else p.delete('base')
      }),
    [mudar]
  )

  return { atalho, ...intervalo, base, escolherBase, comparar, escolherAtalho, escolherDatas, alternarComparacao }
}
