import { useState, useMemo } from 'react'
import {
  TrendingUp,
  Users,
  DollarSign,
  Target,
  Clock,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Activity,
  RefreshCw,
  BarChart3,
  Thermometer,
  Globe,
  Bell,
  XCircle
} from 'lucide-react'
import { useCRMDashboard, useFunis, useCRMFunilAnalytics, useFollowupMetricas, useUsuariosEmpresa } from '@/hooks/useCRM'
import { Link } from 'react-router-dom'
import { TourHelpButton } from '@/components/tour/TourHelpButton'
import type { FunilAnalytics } from '@/types/crm'
import { useNumeroNaUrl } from '@/hooks/useEstadoNaUrl'
import { BarraFiltros } from '@/pages/dashboard/visaogeral/BarraFiltros'
import { ATALHOS_CRM, periodoAnterior, usePeriodoNaUrl } from '@/pages/dashboard/visaogeral/periodo'
import { CartaoIndicador } from '@/pages/dashboard/visaogeral/CartaoIndicador'
import { CaixaResumo } from '@/pages/dashboard/visaogeral/ResumoEscrito'
import { TooltipGrafico } from '@/pages/dashboard/visaogeral/graficoUi'
import { formatDate } from '@/utils'
import ProdutividadeFunil from './ProdutividadeFunil'
import type { Granularidade } from '@/api/crm'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts'
// A paleta do dashboard do Conta Azul é a única do projeto que passou pelo
// validador contra as superfícies reais — reusar em vez de escolher hex novo.
import { usePaletaViz } from '@/pages/dashboard/contaazul/paleta'

/** Uma linha de `leadsPorMes` do endpoint /crm/dashboard. */
interface LeadsPorMes { mes: string; total: number; ganhos: number; perdidos: number }

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

/**
 * Rótulo de um período da série temporal, na tabela.
 *
 * Desde que o agrupamento virou configurável, a chave `mes` pode ser
 * '2026-08-25' (dia/semana), '2026-08' (mês) ou '2026' (ano) — a versão antiga
 * assumia sempre `YYYY-MM` e imprimia "undefined/26" no agrupamento anual.
 * A forma é deduzida do próprio valor, então tabela e gráfico nunca divergem.
 */
const formatMonth = (mes: string) => {
  const partes = String(mes).split('-')
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  if (partes.length === 1) return partes[0]                                  // 2026
  const [ano, mesNum, dia] = partes
  const nome = months[parseInt(mesNum) - 1] ?? mesNum
  if (partes.length === 2) return `${nome}/${ano.slice(2)}`                  // Ago/26
  return `${dia}/${mesNum}/${ano.slice(2)}`                                  // 25/08/26
}

const temperaturaLabels: Record<string, string> = {
  frio: 'Frio',
  morno: 'Morno',
  quente: 'Quente'
}

const origemLabels: Record<string, string> = {
  manual: 'Manual',
  whatsapp: 'WhatsApp',
  importacao: 'Importacao',
  indicacao: 'Indicacao',
  networking: 'Networking',
  parceria: 'Parceria',
  instagram: 'Instagram',
  lancamento: 'Lancamento',
  forms: 'Forms',
  desconhecido: 'Desconhecido'
}

// Agrupa estágios de mesmo nome (case-insensitive) somando leads_passaram
// Usado quando "Todos os Funis" está selecionado
function agruparFunilPorNome(data: FunilAnalytics): FunilAnalytics {
  const { acumulado, diario } = data
  // Laterais (perda, nutrição) somam pelo nome, como as etapas
  const lateraisPorNome = new Map<string, NonNullable<FunilAnalytics['laterais']>[number]>()
  for (const l of data.laterais || []) {
    const k = l.estagio_nome.toLowerCase().trim()
    const atual = lateraisPorNome.get(k)
    lateraisPorNome.set(k, atual ? { ...atual, leads: atual.leads + l.leads } : { ...l })
  }
  data = { ...data, laterais: [...lateraisPorNome.values()] }
  if (acumulado.length === 0) return data

  // Agrupa acumulado por nome normalizado
  const grupos = new Map<string, FunilAnalytics['acumulado']>()
  for (const e of acumulado) {
    const key = e.estagio_nome.toLowerCase().trim()
    if (!grupos.has(key)) grupos.set(key, [])
    grupos.get(key)!.push(e)
  }

  // Monta cada grupo somando leads e usando a menor ordem
  let agrupado = Array.from(grupos.values()).map(grupo => ({
    estagio_id: grupo[0].estagio_id,
    estagio_nome: grupo[0].estagio_nome,
    estagio_cor: grupo[0].estagio_cor,
    estagio_ordem: Math.min(...grupo.map(e => e.estagio_ordem)),
    is_entrada: grupo.some(e => e.is_entrada),
    is_ganho: grupo.some(e => e.is_ganho),
    leads_passaram: grupo.reduce((s, e) => s + e.leads_passaram, 0),
    taxa_etapa: null as number | null,
    taxa_geral: 0,
  }))

  // Ordena pela menor ordem do grupo
  agrupado.sort((a, b) => a.estagio_ordem - b.estagio_ordem)

  // Recalcula taxas dentro do agrupamento.
  // Ao mesclar vários funis ("Todos os Funis"), estágios de funis distintos têm volumes
  // muito diferentes — usar o estágio de entrada como base gera taxas > 100%. Por isso a
  // base (100%) é o maior estágio, garantindo um funil coerente (taxa_geral sempre ≤ 100%).
  const bocaEntrada = agrupado.find(e => e.is_entrada)?.leads_passaram ?? 0
  const bocaFunil = Math.max(bocaEntrada, ...agrupado.map(e => e.leads_passaram), 0)

  agrupado = agrupado.map((e, i) => ({
    ...e,
    taxa_etapa:
      i > 0 && agrupado[i - 1].leads_passaram > 0
        ? Math.round((e.leads_passaram / agrupado[i - 1].leads_passaram) * 1000) / 10
        : null,
    taxa_geral:
      bocaFunil > 0
        ? Math.round((e.leads_passaram / bocaFunil) * 1000) / 10
        : 100,
  }))

  const ganhoGrupo = agrupado.find(e => e.is_ganho)
  const taxaConversaoGeral =
    bocaFunil > 0 && ganhoGrupo
      ? Math.round((ganhoGrupo.leads_passaram / bocaFunil) * 1000) / 10
      : 0

  // Agrupa diário: para cada dia, soma totais de estágios com mesmo nome
  const diarioAgrupado = diario.map(entry => {
    const somaPorNome = new Map<string, { estagio_id: number; estagio_nome: string; total: number }>()
    for (const s of entry.por_estagio) {
      const key = s.estagio_nome.toLowerCase().trim()
      if (!somaPorNome.has(key)) {
        somaPorNome.set(key, { estagio_id: s.estagio_id, estagio_nome: s.estagio_nome, total: 0 })
      }
      somaPorNome.get(key)!.total += s.total
    }
    return { ...entry, por_estagio: Array.from(somaPorNome.values()) }
  })

  return {
    laterais: data.laterais,
    acumulado: agrupado,
    diario: diarioAgrupado,
    boca_funil: bocaFunil,
    taxa_conversao_geral: taxaConversaoGeral,
  }
}

function FunilAcumulado({ data }: { data: FunilAnalytics }) {
  const { acumulado, boca_funil, taxa_conversao_geral, laterais = [] } = data

  if (acumulado.length === 0) {
    return <p className="text-center text-gray-400 py-6 text-sm">Nenhum estágio configurado</p>
  }

  return (
    <div className="space-y-0.5">
      {acumulado.map((estagio, i) => {
        const proxTaxaEtapa = i < acumulado.length - 1 ? acumulado[i + 1].taxa_etapa : null
        const barColor = estagio.is_ganho ? '#10B981' : (estagio.estagio_cor || '#6B7280')

        return (
          <div key={estagio.estagio_id}>
            {/* Linha do estágio */}
            <div className="flex items-center gap-2 py-1.5">
              {/* Ícone + nome */}
              <div className="flex items-center gap-1.5 w-36 flex-shrink-0">
                {estagio.is_ganho ? (
                  <CheckCircle size={13} className="text-green-500 flex-shrink-0" />
                ) : (
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: barColor }}
                  />
                )}
                <span className="text-xs text-gray-700 truncate" title={estagio.estagio_nome}>
                  {estagio.estagio_nome}
                </span>
              </div>

              {/* Contagem */}
              <span className="text-sm font-bold text-gray-800 w-8 text-right flex-shrink-0">
                {estagio.leads_passaram}
              </span>

              {/* Barra proporcional */}
              <div className="flex-1 bg-gray-100 rounded-full h-3.5 overflow-hidden">
                <div
                  className="h-3.5 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(estagio.taxa_geral, estagio.leads_passaram > 0 ? 1 : 0))}%`,
                    backgroundColor: barColor,
                    opacity: estagio.leads_passaram === 0 ? 0 : 1
                  }}
                />
              </div>

              {/* % geral */}
              <span className="text-xs text-gray-500 w-11 text-right flex-shrink-0">
                {estagio.taxa_geral}%
              </span>
            </div>

            {/* Seta de conversão para o próximo estágio */}
            {proxTaxaEtapa !== null && (
              <div className="flex items-center pl-36 py-0 h-5">
                <span className="text-gray-300 text-xs mr-1 ml-2">↓</span>
                <span className={`text-xs font-medium ${
                  proxTaxaEtapa >= 50 ? 'text-green-500' :
                  proxTaxaEtapa >= 25 ? 'text-amber-500' :
                  'text-red-500'
                }`}>
                  {proxTaxaEtapa}%
                </span>
              </div>
            )}
          </div>
        )
      })}

      {/* Fora da sequência: perda e etapas depois do ganho (ex.: Nutrição) */}
      {laterais.length > 0 && (
        <div className="mt-2 pt-2 border-t flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <span className="text-gray-400">Fora da sequência:</span>
          {laterais.map(l => (
            <span key={l.estagio_id} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.estagio_cor || '#6B7280' }} />
              {l.estagio_nome}: <strong className="text-gray-700">{l.leads}</strong>
            </span>
          ))}
        </div>
      )}

      {/* Rodapé com totais */}
      {boca_funil > 0 && (
        <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-gray-500">
          <span>Boca do funil: <strong className="text-gray-700">{boca_funil}</strong> leads</span>
          <span>
            Conversão geral:{' '}
            <strong className={taxa_conversao_geral >= 10 ? 'text-green-600' : taxa_conversao_geral >= 5 ? 'text-amber-600' : 'text-red-500'}>
              {taxa_conversao_geral}%
            </strong>
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * Evolução mensal do funil — criados, ganhos e perdidos.
 *
 * Escolha da forma: são três séries sobre o tempo, mas a base costuma ter poucos
 * meses (e a conta nova tem UM). Linha com um ponto não desenha nada; barra
 * agrupada lê bem com um mês e continua legível com doze.
 *
 * As cores saem de `paleta.ts`, que passou no validador contra as superfícies
 * reais do app — este trio (azul/verde/laranja) é exatamente o conjunto de 3
 * que foi aprovado, com ΔE 9,2 no pior par sob deuteranopia. Não trocar hex sem
 * rodar o validador de novo.
 *
 * A tabela logo abaixo permanece de propósito: é ela que atende quem não
 * distingue as cores e quem precisa do número exato.
 */
const ROTULO_EVOLUCAO: Record<Granularidade, string> = {
  dia: 'Evolução diária',
  semana: 'Evolução semanal',
  mes: 'Evolução mensal',
  ano: 'Evolução anual',
}

const OPCOES_GRANULARIDADE: { valor: Granularidade; rotulo: string }[] = [
  { valor: 'dia', rotulo: 'Dia' },
  { valor: 'semana', rotulo: 'Semana' },
  { valor: 'mes', rotulo: 'Mês' },
  { valor: 'ano', rotulo: 'Ano' },
]

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/**
 * Rótulo do eixo por granularidade. O backend devolve sempre na chave `mes`,
 * mas o conteúdo muda: '2026-08-25' (dia e semana), '2026-08' (mês) ou '2026'.
 * A semana mostra o dia em que ela começa — `DATE_TRUNC('week')` no Postgres
 * começa na segunda.
 */
function rotuloPeriodo(valor: string, g: Granularidade): string {
  const [ano, mes, dia] = String(valor).split('-')
  const mesCurto = MESES_CURTOS[Number(mes) - 1] ?? mes
  if (g === 'ano') return ano
  if (g === 'mes') return `${mesCurto}/${ano.slice(2)}`
  if (g === 'semana') return `${dia}/${mes}`
  return `${dia}/${mes}`
}

function GraficoEvolucaoMensal({
  dados,
  granularidade,
  onGranularidade,
}: {
  dados: LeadsPorMes[]
  granularidade: Granularidade
  onGranularidade: (g: Granularidade) => void
}) {
  const paleta = usePaletaViz()

  const series = [
    { chave: 'total' as const, nome: 'Criados', cor: paleta.saldo },
    { chave: 'ganhos' as const, nome: 'Ganhos', cor: paleta.receber },
    { chave: 'perdidos' as const, nome: 'Perdidos', cor: paleta.pagar },
  ]

  const dadosGrafico = dados.map(d => ({ ...d, rotulo: rotuloPeriodo(d.mes, granularidade) }))

  return (
    <div className="mb-5">
      {/* Seletor de agrupamento. Mesmo padrão do seletor de fidelidade dos
          planos: abas segmentadas, 2x2 no celular para o alvo de toque não
          encolher demais. */}
      <div className="mb-3 flex justify-end">
        <div className="inline-grid grid-cols-4 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-700" role="tablist" aria-label="Agrupar por">
          {OPCOES_GRANULARIDADE.map(o => (
            <button
              key={o.valor}
              type="button"
              role="tab"
              aria-selected={granularidade === o.valor}
              onClick={() => onGranularidade(o.valor)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                granularidade === o.valor
                  ? 'bg-white text-primary-700 shadow-sm dark:bg-gray-800 dark:text-primary-300'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-300'
              }`}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
      </div>

      {dados.length === 0 ? (
        /* Mesma altura do gráfico: se o vazio fosse mais curto, o card encolheria
           ao trocar de agrupamento e o navegador puxaria o scroll junto. */
        <div className="flex items-center justify-center text-center" style={{ height: 260 }}>
          <p className="max-w-xs text-sm text-gray-400">
            Sem movimentação no período com este agrupamento.
            <span className="mt-1 block text-xs text-gray-300">
              Tente um agrupamento maior ou amplie o período acima.
            </span>
          </p>
        </div>
      ) : (
      <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dadosGrafico} margin={{ top: 18, right: 8, left: -18, bottom: 0 }} barGap={2}>
          {/* Grade recessiva: só horizontal, para o olho comparar altura. */}
          <CartesianGrid strokeDasharray="3 3" stroke={paleta.grid} vertical={false} />
          <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: paleta.eixo }} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: paleta.eixo }} tickLine={false} axisLine={false} width={38} />
          <Tooltip
            cursor={{ fill: paleta.grid, opacity: 0.45 }}
            content={(p: any) => (
              <TooltipGrafico {...p} paleta={paleta} formatar={(v) => `${v} lead${v === 1 ? '' : 's'}`} />
            )}
          />
          {/* O texto da legenda usa cor de TEXTO, não a cor da série — quem
              carrega a identidade é a bolinha ao lado. Colorir a palavra deixa
              o rótulo com contraste ruim e some para quem não distingue a cor. */}
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            iconType="circle"
            iconSize={8}
            formatter={(valor: any) => <span style={{ color: paleta.eixo }}>{valor}</span>}
          />
          {series.map(s => (
            <Bar key={s.chave} dataKey={s.chave} name={s.nome} fill={s.cor} radius={[4, 4, 0, 0]} maxBarSize={38}>
              {/* Rótulo direto: com o aviso de contraste da paleta, o número
                  visível é o alívio exigido — a cor nunca responde sozinha. */}
              {/* Rótulo só até 8 colunas: com mais, os números se atropelam e a
                  tabela abaixo já dá o valor exato. */}
              {dadosGrafico.length <= 8 && (
              <LabelList
                dataKey={s.chave}
                position="top"
                style={{ fontSize: 10, fill: paleta.eixo, fontWeight: 600 }}
                formatter={(v: any) => (Number(v) > 0 ? v : '')}
              />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      </div>
      )}
    </div>
  )
}

function FunilDiario({ data }: { data: FunilAnalytics }) {
  const { acumulado, diario } = data

  if (diario.length === 0) {
    return <p className="text-center text-gray-400 py-6 text-sm">Sem movimentações no período</p>
  }

  const totaisPorEstagio = acumulado.map(e =>
    diario.reduce((acc, d) => {
      const s = d.por_estagio.find(s => s.estagio_id === e.estagio_id)
      return acc + (s?.total || 0)
    }, 0)
  )

  const totalGeral = totaisPorEstagio.reduce((s, t) => s + t, 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="text-left py-2 px-2 font-medium text-gray-500 whitespace-nowrap border-b sticky left-0 bg-white">
              Data
            </th>
            {acumulado.map(e => (
              <th
                key={e.estagio_id}
                className="text-center py-2 px-2 font-medium whitespace-nowrap border-b"
                style={{ color: e.is_ganho ? '#10B981' : (e.estagio_cor || '#6B7280') }}
              >
                {e.estagio_nome}
              </th>
            ))}
            <th className="text-center py-2 px-2 font-medium whitespace-nowrap border-b text-gray-700 bg-gray-50">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {diario.map(dia => {
            const totalDia = dia.por_estagio.reduce((s, e) => s + e.total, 0)
            return (
              <tr key={dia.dia} className="hover:bg-gray-50">
                <td className="py-1.5 px-2 font-medium text-gray-600 whitespace-nowrap border-b sticky left-0 bg-white">
                  {new Date(dia.dia + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                </td>
                {acumulado.map(e => {
                  const s = dia.por_estagio.find(s => s.estagio_id === e.estagio_id)
                  return (
                    <td
                      key={e.estagio_id}
                      className={`py-1.5 px-2 text-center border-b ${s ? 'font-semibold text-gray-800' : 'text-gray-300'}`}
                    >
                      {s ? s.total : '-'}
                    </td>
                  )
                })}
                <td className="py-1.5 px-2 text-center border-b font-bold text-gray-700 bg-gray-50">
                  {totalDia > 0 ? totalDia : '-'}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 font-semibold">
            <td className="py-1.5 px-2 text-gray-600 sticky left-0 bg-gray-50">Total</td>
            {totaisPorEstagio.map((total, i) => (
              <td key={acumulado[i].estagio_id} className="py-1.5 px-2 text-center text-gray-700">
                {total > 0 ? total : '-'}
              </td>
            ))}
            <td className="py-1.5 px-2 text-center text-gray-800 font-bold bg-gray-100">
              {totalGeral > 0 ? totalGeral : '-'}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/**
 * Barras horizontais em HTML (não recharts): o teclado e o leitor de tela
 * alcançam, o nome longo trunca com o inteiro no `title`, e cada linha diz o
 * número e a parte em texto — a cor nunca responde sozinha.
 */
function BarrasHorizontais({
  itens,
  vazio,
}: {
  itens: { chave: string; rotulo: string; valor: number; detalhe?: string; cor: string }[]
  vazio: string
}) {
  const total = itens.reduce((s, i) => s + i.valor, 0)
  const maior = Math.max(1, ...itens.map((i) => i.valor))
  if (itens.length === 0 || total === 0) {
    return <p className="py-6 text-center text-sm text-gray-400">{vazio}</p>
  }
  return (
    <ul className="space-y-2.5">
      {itens.map((i) => {
        const pct = Math.round((i.valor / total) * 100)
        return (
          <li key={i.chave}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-gray-700 dark:text-gray-200" title={i.rotulo}>{i.rotulo}</span>
              <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                <strong className="font-semibold text-gray-800 dark:text-gray-100">{i.valor}</strong> · {pct}%
                {i.detalhe && <span className="ml-1 hidden sm:inline">· {i.detalhe}</span>}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700" aria-hidden>
              <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${Math.max(2, (i.valor / maior) * 100)}%`, background: i.cor }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** Variação em texto para o resumo: ", 12% a mais que no período anterior". */
const variacaoTexto = (atual: number, anterior: number | undefined) => {
  if (anterior === undefined || anterior <= 0) return ''
  const pct = ((atual - anterior) / anterior) * 100
  if (Math.abs(pct) < 0.5) return ', praticamente igual ao período anterior'
  const n = Math.abs(pct).toLocaleString('pt-BR', { maximumFractionDigits: Math.abs(pct) < 10 ? 1 : 0 })
  return `, ${n}% ${pct > 0 ? 'a mais' : 'a menos'} que no período anterior`
}

export default function CRMDashboard() {
  // Funil, proprietário e período moram na URL: o F5 e o link reabrem no mesmo recorte.
  const [selectedFunilId, setSelectedFunilId] = useNumeroNaUrl('funil')
  const [selectedResponsavelId, setSelectedResponsavelId] = useNumeroNaUrl('responsavel')
  const periodo = usePeriodoNaUrl('tudo')
  const dataInicio = periodo.de ?? ''
  const dataFim = periodo.ate ?? ''

  const [visaoFunil, setVisaoFunil] = useState<'acumulado' | 'diario'>('acumulado')
  const [diasDiario, setDiasDiario] = useState(30)

  const dateFilters = useMemo(
    () => ({
      data_inicio: dataInicio || undefined,
      data_fim: dataFim || undefined,
      responsavel_id: selectedResponsavelId,
    }),
    [dataInicio, dataFim, selectedResponsavelId]
  )

  // Período anterior do mesmo tamanho, só para a comparação dos cartões.
  const anterior = useMemo(
    () => (periodo.comparar ? periodoAnterior({ de: periodo.de, ate: periodo.ate }) : null),
    [periodo.comparar, periodo.de, periodo.ate]
  )
  const filtrosAnteriores = useMemo(
    () => ({ data_inicio: anterior?.de, data_fim: anterior?.ate, responsavel_id: selectedResponsavelId }),
    [anterior, selectedResponsavelId]
  )

  const { data: funis } = useFunis()
  const { data: usuarios } = useUsuariosEmpresa()
  /* Granularidade da série temporal. Fica aqui, e não dentro do gráfico, porque
     quem refaz a consulta é o hook — agregar dia/semana/mês/ano no cliente
     exigiria baixar lead a lead. */
  const [granularidade, setGranularidade] = useState<Granularidade>('mes')
  const { data: metricas, isLoading, isFetching, refetch } = useCRMDashboard(selectedFunilId, dateFilters, granularidade)
  // Sem período (Tudo), não há anterior: a consulta não roda.
  const { data: metricasAnteriores } = useCRMDashboard(selectedFunilId, filtrosAnteriores, granularidade, {
    comparacao: true,
    enabled: !!anterior,
  })
  const ant = anterior && metricasAnteriores ? metricasAnteriores : null
  const { data: funilAnalyticsRaw, isLoading: isLoadingFunil } = useCRMFunilAnalytics(selectedFunilId, diasDiario, dateFilters)
  const { data: followupMetricas } = useFollowupMetricas(selectedFunilId, dateFilters)

  // Quando "Todos os Funis", agrupa estágios de mesmo nome somando os leads
  const funilAnalytics = useMemo(() => {
    if (!funilAnalyticsRaw) return undefined
    if (selectedFunilId) return funilAnalyticsRaw
    return agruparFunilPorNome(funilAnalyticsRaw)
  }, [funilAnalyticsRaw, selectedFunilId])

  const paleta = usePaletaViz()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="animate-spin text-primary-500" size={32} />
      </div>
    )
  }

  if (!metricas) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Nenhum dado disponível
      </div>
    )
  }

  const textoPeriodo = periodo.de && periodo.ate ? `${formatDate(periodo.de)} a ${formatDate(periodo.ate)}` : 'todo o histórico'
  const anteriorTexto = anterior ? `${formatDate(anterior.de!)} a ${formatDate(anterior.ate!)}` : undefined
  const nomeFunil = funis?.find((f) => f.id === selectedFunilId)?.nome
  const nomeResp = usuarios?.find((u) => u.id === selectedResponsavelId)?.nome
  const recorte = [nomeFunil && `funil ${nomeFunil}`, nomeResp && `de ${nomeResp}`].filter(Boolean).join(', ')

  // O dashboard em frases: o leitor de tela lê o parágrafo, não o gráfico.
  const frases: string[] = []
  {
    const quando = /^\d/.test(textoPeriodo) ? `De ${textoPeriodo}` : `Em ${textoPeriodo}`
    frases.push(
      `${quando}${recorte ? ` (${recorte})` : ''}, entraram ${plural(metricas.totalLeads, 'lead novo', 'leads novos')}${variacaoTexto(metricas.totalLeads, ant?.totalLeads)}.`
    )
    frases.push(
      metricas.leadsGanhos > 0
        ? `Foram ${plural(metricas.leadsGanhos, 'venda', 'vendas')}${metricas.valorGanho > 0 ? `, somando ${formatCurrency(metricas.valorGanho)}` : ''}, e ${plural(metricas.leadsPerdidos, 'perda', 'perdas')}.`
        : metricas.leadsPerdidos > 0
          ? `Nenhuma venda registrada no período, e ${plural(metricas.leadsPerdidos, 'perda', 'perdas')}.`
          : 'Nenhuma venda nem perda registrada no período.'
    )
    if (metricas.totalLeads > 0) frases.push(`A taxa de conversão foi de ${metricas.taxaConversao.toLocaleString('pt-BR')}%.`)
    if (metricas.tempoMedioConversao) frases.push(`Do cadastro à venda, a média foi de ${metricas.tempoMedioConversao.toLocaleString('pt-BR')} dias.`)
    const atencao: string[] = []
    if (metricas.tarefasAtrasadas > 0) atencao.push(plural(metricas.tarefasAtrasadas, 'tarefa atrasada', 'tarefas atrasadas'))
    if (metricas.leadsSemContato7Dias > 0) atencao.push(`${plural(metricas.leadsSemContato7Dias, 'lead', 'leads')} sem contato há 7 dias`)
    if (atencao.length) frases.push(`Pede atenção: ${atencao.join(' e ')}.`)
  }

  const serie = (chave: 'total' | 'ganhos' | 'perdidos') => metricas.leadsPorMes.map((m) => m[chave])
  const formatarPct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
  const formatarDias = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`

  const seletor = 'min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100'

  const totalOrigem = metricas.leadsPorOrigem.reduce((acc, o) => acc + o.total, 0)
  const corTemperatura: Record<string, string> = { frio: paleta.saldo, morno: paleta.aVencer, quente: paleta.atrasado }

  return (
    // Sem altura nem rolagem própria: quem rola é a área principal do Layout, e a
    // barra de filtros gruda no topo dela. Duas áreas rolando uma dentro da outra
    // cortavam a página e deixavam a barra presa na área que não rola.
    <div className="min-h-full bg-gray-50 dark:bg-gray-900">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-4 sm:px-6 dark:border-gray-700 dark:bg-gray-800">
        <div>
          <h1 className="text-xl font-bold text-gray-800 sm:text-2xl dark:text-gray-100">Dashboard CRM</h1>
          <p className="text-xs text-gray-500 sm:text-sm dark:text-gray-400">Visão geral do funil de vendas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            title="Atualizar"
            aria-label="Atualizar os números"
          >
            <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} />
          </button>
          <Link
            to="/crm"
            data-tour="cdash-kanban"
            className="rounded-lg bg-primary-500 px-4 py-2 text-sm text-white hover:bg-primary-600"
          >
            Ver Kanban
          </Link>
          <TourHelpButton tourId="crm-dashboard" label="" />
        </div>
      </div>

      {/* Filtros presos no topo: funil, proprietário, período e comparação */}
      <BarraFiltros
        periodo={periodo}
        atalhos={ATALHOS_CRM}
        mostrarBase={false}
        basePersonalizado="mes"
        anteriorTexto={anteriorTexto}
        referencia="pela data do evento (cadastro, venda ou movimentação)"
        data-tour="cdash-periodo"
        extra={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <select
              data-tour="cdash-funil"
              aria-label="Funil"
              value={selectedFunilId || ''}
              onChange={(e) => setSelectedFunilId(e.target.value ? parseInt(e.target.value) : undefined)}
              className={seletor}
            >
              <option value="">Todos os funis</option>
              {funis?.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
            <select
              aria-label="Proprietário"
              value={selectedResponsavelId || ''}
              onChange={(e) => setSelectedResponsavelId(e.target.value ? parseInt(e.target.value) : undefined)}
              className={seletor}
            >
              <option value="">Todos os proprietários</option>
              {usuarios?.map((u) => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        <CaixaResumo frases={frases} />

        {/* Seis números, cada um com a comparação ao período anterior */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3" data-tour="cdash-kpis">
          <CartaoIndicador
            titulo="Leads novos"
            valor={String(metricas.totalLeads)}
            detalhe={`${metricas.leadsAtivos} ativos (não arquivados)`}
            comparacao={ant && { atual: metricas.totalLeads, anterior: ant.totalLeads, bomQuandoSobe: true, formatar: String }}
            tendencia={{ valores: serie('total'), cor: paleta.saldo }}
            icone={<Users className="h-5 w-5" />}
            corIcone="bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
          />
          <CartaoIndicador
            titulo="Vendas"
            valor={String(metricas.leadsGanhos)}
            corValor="text-emerald-700 dark:text-emerald-400"
            detalhe={`${formatCurrency(metricas.valorGanho)} em vendas`}
            comparacao={ant && { atual: metricas.leadsGanhos, anterior: ant.leadsGanhos, bomQuandoSobe: true, formatar: String }}
            tendencia={{ valores: serie('ganhos'), cor: paleta.receber }}
            icone={<CheckCircle className="h-5 w-5" />}
            corIcone="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
          />
          <CartaoIndicador
            titulo="Taxa de conversão"
            valor={formatarPct(metricas.taxaConversao)}
            detalhe="Vendas sobre leads novos do período"
            comparacao={ant && { atual: metricas.taxaConversao, anterior: ant.taxaConversao, bomQuandoSobe: true, modo: 'diferenca', formatar: formatarPct, anteriorVazio: ant.totalLeads === 0 }}
            icone={<Target className="h-5 w-5" />}
            corIcone="bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
          />
          <CartaoIndicador
            titulo="Perdas"
            valor={String(metricas.leadsPerdidos)}
            corValor={metricas.leadsPerdidos > 0 ? 'text-red-700 dark:text-red-400' : undefined}
            detalhe="Leads que foram para a etapa de perda"
            comparacao={ant && { atual: metricas.leadsPerdidos, anterior: ant.leadsPerdidos, bomQuandoSobe: false, formatar: String }}
            tendencia={{ valores: serie('perdidos'), cor: paleta.pagar }}
            icone={<XCircle className="h-5 w-5" />}
            corIcone="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
          />
          <CartaoIndicador
            titulo="Valor em pipeline"
            valor={formatCurrency(metricas.valorTotal)}
            detalhe="Soma do valor dos leads ativos"
            comparacao={ant && { atual: metricas.valorTotal, anterior: ant.valorTotal, bomQuandoSobe: true }}
            icone={<DollarSign className="h-5 w-5" />}
            corIcone="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
          />
          <CartaoIndicador
            titulo="Tempo até a venda"
            valor={metricas.tempoMedioConversao ? formatarDias(metricas.tempoMedioConversao) : '—'}
            detalhe="Média do cadastro à venda"
            comparacao={
              ant?.tempoMedioConversao && metricas.tempoMedioConversao
                ? { atual: metricas.tempoMedioConversao, anterior: ant.tempoMedioConversao, bomQuandoSobe: false, formatar: formatarDias }
                : null
            }
            icone={<Clock className="h-5 w-5" />}
            corIcone="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
          />
        </div>

        {/* O que pede ação agora */}
        <section aria-labelledby="atencao-titulo" className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 id="atencao-titulo" className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
            <AlertTriangle size={16} className="text-amber-500" aria-hidden />
            Pede atenção
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { rotulo: 'Tarefas atrasadas', valor: metricas.tarefasAtrasadas, icone: <AlertTriangle size={18} />, cor: 'text-red-600 dark:text-red-400', fundo: 'bg-red-50 dark:bg-red-900/20' },
              { rotulo: metricas.periodoAtivo ? 'Tarefas no período' : 'Tarefas para hoje', valor: metricas.tarefasHoje, icone: <Calendar size={18} />, cor: 'text-amber-600 dark:text-amber-400', fundo: 'bg-amber-50 dark:bg-amber-900/20' },
              { rotulo: 'Sem contato há 7 dias', valor: metricas.leadsSemContato7Dias, icone: <Clock size={18} />, cor: 'text-blue-600 dark:text-blue-400', fundo: 'bg-blue-50 dark:bg-blue-900/20' },
            ].map((a) => (
              <div key={a.rotulo} className={`flex items-center gap-3 rounded-lg p-3 ${a.fundo}`}>
                <span className={a.cor} aria-hidden>{a.icone}</span>
                <span className="flex-1 text-sm text-gray-700 dark:text-gray-200">{a.rotulo}</span>
                <span className={`text-2xl font-bold tabular-nums ${a.valor > 0 ? a.cor : 'text-gray-400'}`}>{a.valor}</span>
              </div>
            ))}
          </div>

          {followupMetricas && (
            <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700" data-tour="cdash-followups">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <Bell size={16} className="text-orange-500" aria-hidden />
                Follow-ups automáticos
              </h3>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  { rotulo: 'Pendentes', valor: followupMetricas.total_pendentes, cor: 'text-orange-600 dark:text-orange-400' },
                  { rotulo: 'Atrasados', valor: followupMetricas.total_atrasados, cor: followupMetricas.total_atrasados > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400' },
                  { rotulo: followupMetricas.periodo_ativo ? 'No período' : 'Para hoje', valor: followupMetricas.pendentes_hoje, cor: 'text-amber-600 dark:text-amber-400' },
                  { rotulo: followupMetricas.periodo_ativo ? 'Enviados' : 'Enviados hoje', valor: followupMetricas.enviados_hoje, cor: 'text-emerald-600 dark:text-emerald-400' },
                  { rotulo: 'Falharam', valor: followupMetricas.total_falhados, cor: followupMetricas.total_falhados > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400' },
                ].map((f) => (
                  <div key={f.rotulo} className="rounded-lg bg-gray-50 p-2.5 text-center dark:bg-gray-900/40">
                    <dd className={`text-xl font-bold tabular-nums ${f.cor}`}>{f.valor}</dd>
                    <dt className="text-xs text-gray-500 dark:text-gray-400">{f.rotulo}</dt>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </section>

        <ProdutividadeFunil funilId={selectedFunilId} filtros={dateFilters} />

        {/* Funil de Vendas */}
        <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800" data-tour="cdash-funil-grafico">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 font-medium text-gray-800">
                <BarChart3 size={18} className="text-gray-400" />
                Funil de Vendas
              </h3>
              <p className="mt-0.5 text-xs text-gray-500">
                {visaoFunil === 'acumulado'
                  ? 'Leads que entraram no período (criados ou transferidos) e até onde cada um chegou, até hoje'
                  : 'Entradas em cada etapa, dia a dia'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-700" role="group" aria-label="Visão do funil">
                {(['acumulado', 'diario'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={visaoFunil === v}
                    onClick={() => setVisaoFunil(v)}
                    className={`rounded-md px-3 py-1 text-xs transition-all ${
                      visaoFunil === v
                        ? 'bg-white font-medium text-primary-600 shadow dark:bg-gray-800 dark:text-primary-300'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {v === 'acumulado' ? 'Acumulado' : 'Diário'}
                  </button>
                ))}
              </div>

              {/* Só no Diário e sem data escolhida (com data, o diário segue o período) */}
              {visaoFunil === 'diario' && !dataInicio && !dataFim && (
                <div className="flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-700">
                  {[7, 14, 30].map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={diasDiario === d}
                      onClick={() => setDiasDiario(d)}
                      className={`rounded-md px-2 py-1 text-xs transition-all ${
                        diasDiario === d
                          ? 'bg-white font-medium text-primary-600 shadow dark:bg-gray-800 dark:text-primary-300'
                          : 'text-gray-500 hover:text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {isLoadingFunil ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="animate-spin text-primary-400" size={20} />
            </div>
          ) : !funilAnalytics ? (
            <p className="py-6 text-center text-sm text-gray-400">Nenhum dado disponível</p>
          ) : visaoFunil === 'acumulado' ? (
            <FunilAcumulado data={funilAnalytics} />
          ) : (
            <FunilDiario data={funilAnalytics} />
          )}
        </div>

        {/* Temperatura e origem: barras horizontais com número e parte escritos */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
            <h3 className="mb-4 flex items-center gap-2 font-medium text-gray-800">
              <Thermometer size={18} className="text-gray-400" />
              Leads por temperatura
            </h3>
            <BarrasHorizontais
              vazio="Nenhum lead com temperatura no período"
              itens={metricas.leadsPorTemperatura.map((t) => ({
                chave: t.temperatura,
                rotulo: temperaturaLabels[t.temperatura] || t.temperatura,
                valor: t.total,
                detalhe: t.valor > 0 ? formatCurrency(t.valor) : undefined,
                cor: corTemperatura[t.temperatura] ?? paleta.perdido,
              }))}
            />
          </div>

          <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
            <h3 className="mb-4 flex items-center gap-2 font-medium text-gray-800">
              <Globe size={18} className="text-gray-400" />
              Leads por origem
              {totalOrigem > 0 && <span className="text-xs font-normal text-gray-400">· {totalOrigem} no total</span>}
            </h3>
            {/* Uma cor só: aqui a cor não identifica nada, o comprimento é que compara. */}
            <BarrasHorizontais
              vazio="Nenhum dado de origem no período"
              itens={[...metricas.leadsPorOrigem]
                .sort((a, b) => b.total - a.total)
                .map((o) => ({
                  chave: o.origem,
                  rotulo: origemLabels[o.origem] || o.origem,
                  valor: o.total,
                  cor: paleta.saldo,
                }))}
            />
          </div>
        </div>

        {/* Evolução — o card fica SEMPRE montado: o seletor de agrupamento mora
            dentro dele, e um agrupamento sem dados não pode sumir com o seletor. */}
        <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
          <h3 className="mb-1 flex items-center gap-2 font-medium text-gray-800">
            <TrendingUp size={18} className="text-gray-400" />
            {ROTULO_EVOLUCAO[granularidade]}
          </h3>
          <p className="mb-4 text-xs text-gray-400">
            Criados: data de cadastro · Ganhos/Perdidos/Valor: data em que o evento ocorreu
          </p>

          <GraficoEvolucaoMensal
            dados={metricas.leadsPorMes}
            granularidade={granularidade}
            onGranularidade={setGranularidade}
          />

          {metricas.leadsPorMes.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Leads criados, ganhos e perdidos por período</caption>
                <thead>
                  <tr className="border-b dark:border-gray-700">
                    <th scope="col" className="px-3 py-2 text-left font-medium text-gray-600">{granularidade === 'ano' ? 'Ano' : granularidade === 'mes' ? 'Mês' : 'Período'}</th>
                    <th scope="col" className="px-3 py-2 text-center font-medium text-gray-600">Criados</th>
                    <th scope="col" className="px-3 py-2 text-center font-medium text-gray-600">Ganhos</th>
                    <th scope="col" className="px-3 py-2 text-center font-medium text-gray-600">Perdidos</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium text-gray-600">Valor Ganho</th>
                  </tr>
                </thead>
                <tbody>
                  {metricas.leadsPorMes.map((mes) => {
                    const valorMes = metricas.valorPorMes.find((v) => v.mes === mes.mes)
                    return (
                      <tr key={mes.mes} className="border-b hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/40">
                        <th scope="row" className="px-3 py-2 text-left font-medium">{formatMonth(mes.mes)}</th>
                        <td className="px-3 py-2 text-center tabular-nums">{mes.total || '-'}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{mes.ganhos || '-'}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{mes.perdidos || '-'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{valorMes?.valor ? formatCurrency(valorMes.valor) : '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-gray-50 font-semibold dark:border-gray-700 dark:bg-gray-900/40">
                    <th scope="row" className="px-3 py-2 text-left text-gray-700">Total</th>
                    <td className="px-3 py-2 text-center tabular-nums text-gray-700">{metricas.leadsPorMes.reduce((s, m) => s + m.total, 0)}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-gray-700">{metricas.leadsPorMes.reduce((s, m) => s + m.ganhos, 0)}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-gray-700">{metricas.leadsPorMes.reduce((s, m) => s + m.perdidos, 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{formatCurrency(metricas.valorPorMes.reduce((s, m) => s + m.valor, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Atividades recentes do período */}
        {metricas.atividadesRecentes.length > 0 && (
          <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
            <h3 className="mb-4 flex items-center gap-2 font-medium text-gray-800">
              <Activity size={18} className="text-gray-400" />
              Atividades recentes
            </h3>
            <ol className="relative space-y-4 border-l border-gray-200 pl-5 dark:border-gray-700">
              {metricas.atividadesRecentes.map((ativ) => (
                <li key={ativ.id} className="text-sm">
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-primary-500 dark:border-gray-800" aria-hidden />
                  <p className="text-gray-800 dark:text-gray-100">
                    <span className="font-medium">{ativ.lead_nome}</span>
                    {' — '}
                    {ativ.descricao}
                  </p>
                  <p className="text-xs text-gray-400">{new Date(ativ.created_at).toLocaleString('pt-BR')}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}
