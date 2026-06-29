import { useState, useMemo } from 'react'
import {
  TrendingUp,
  TrendingDown,
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
  Bell
} from 'lucide-react'
import { useCRMDashboard, useFunis, useCRMFunilAnalytics, useFollowupMetricas, useUsuariosEmpresa } from '@/hooks/useCRM'
import { Link } from 'react-router-dom'
import { TourHelpButton } from '@/components/tour/TourHelpButton'
import type { FunilAnalytics } from '@/types/crm'
import { DateRangePresets } from '@/components/ui/DateRangePresets'

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const formatMonth = (mes: string) => {
  const [year, month] = mes.split('-')
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[parseInt(month) - 1]}/${year.slice(2)}`
}

const temperaturaColors: Record<string, string> = {
  frio: 'bg-blue-100 text-blue-700',
  morno: 'bg-yellow-100 text-yellow-700',
  quente: 'bg-red-100 text-red-700'
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

const origemColors: Record<string, string> = {
  manual: 'bg-gray-100 text-gray-600',
  whatsapp: 'bg-green-100 text-green-600',
  importacao: 'bg-blue-100 text-blue-600',
  indicacao: 'bg-primary-100 text-primary-600',
  networking: 'bg-primary-100 text-primary-600',
  parceria: 'bg-pink-100 text-pink-600',
  instagram: 'bg-fuchsia-100 text-fuchsia-600',
  lancamento: 'bg-orange-100 text-orange-600',
  forms: 'bg-teal-100 text-teal-600',
  desconhecido: 'bg-gray-100 text-gray-500'
}

// Agrupa estágios de mesmo nome (case-insensitive) somando leads_passaram
// Usado quando "Todos os Funis" está selecionado
function agruparFunilPorNome(data: FunilAnalytics): FunilAnalytics {
  const { acumulado, diario } = data
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
    acumulado: agrupado,
    diario: diarioAgrupado,
    boca_funil: bocaFunil,
    taxa_conversao_geral: taxaConversaoGeral,
  }
}

function FunilAcumulado({ data }: { data: FunilAnalytics }) {
  const { acumulado, boca_funil, taxa_conversao_geral } = data

  if (acumulado.length === 0) {
    return <p className="text-center text-gray-400 py-6 text-sm">Nenhum estagio configurado</p>
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

      {/* Rodapé com totais */}
      {boca_funil > 0 && (
        <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-gray-500">
          <span>Boca do funil: <strong className="text-gray-700">{boca_funil}</strong> leads</span>
          <span>
            Conversao geral:{' '}
            <strong className={taxa_conversao_geral >= 10 ? 'text-green-600' : taxa_conversao_geral >= 5 ? 'text-amber-600' : 'text-red-500'}>
              {taxa_conversao_geral}%
            </strong>
          </span>
        </div>
      )}
    </div>
  )
}

function FunilDiario({ data }: { data: FunilAnalytics }) {
  const { acumulado, diario } = data

  if (diario.length === 0) {
    return <p className="text-center text-gray-400 py-6 text-sm">Sem movimentacoes no periodo</p>
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

export default function CRMDashboard() {
  const [selectedFunilId, setSelectedFunilId] = useState<number | undefined>(undefined)
  const [selectedResponsavelId, setSelectedResponsavelId] = useState<number | undefined>(undefined)
  const [visaoFunil, setVisaoFunil] = useState<'acumulado' | 'diario'>('acumulado')
  const [diasDiario, setDiasDiario] = useState(30)

  const [dataInicio, setDataInicio] = useState<string>('')
  const [dataFim, setDataFim] = useState<string>('')

  const dateFilters = useMemo(
    () => ({
      data_inicio: dataInicio || undefined,
      data_fim: dataFim || undefined,
      responsavel_id: selectedResponsavelId,
    }),
    [dataInicio, dataFim, selectedResponsavelId]
  )

  const { data: funis } = useFunis()
  const { data: usuarios } = useUsuariosEmpresa()
  const { data: metricas, isLoading, refetch } = useCRMDashboard(selectedFunilId, dateFilters)
  const { data: funilAnalyticsRaw, isLoading: isLoadingFunil } = useCRMFunilAnalytics(selectedFunilId, diasDiario, dateFilters)
  const { data: followupMetricas } = useFollowupMetricas()

  const limparFiltroData = () => {
    setDataInicio('')
    setDataFim('')
  }

  // Quando "Todos os Funis", agrupa estágios de mesmo nome somando os leads
  const funilAnalytics = useMemo(() => {
    if (!funilAnalyticsRaw) return undefined
    if (selectedFunilId) return funilAnalyticsRaw
    return agruparFunilPorNome(funilAnalyticsRaw)
  }, [funilAnalyticsRaw, selectedFunilId])

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
        Nenhum dado disponivel
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 overflow-auto h-full bg-gray-50">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="ml-10 md:ml-0">
          <h1 className="text-2xl font-bold text-gray-800">Dashboard CRM</h1>
          <p className="text-sm text-gray-500">Visão geral do funil de vendas</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            data-tour="cdash-funil"
            value={selectedFunilId || ''}
            onChange={(e) => setSelectedFunilId(e.target.value ? parseInt(e.target.value) : undefined)}
            className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Todos os Funis</option>
            {funis?.map(f => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select>

          <select
            value={selectedResponsavelId || ''}
            onChange={(e) => setSelectedResponsavelId(e.target.value ? parseInt(e.target.value) : undefined)}
            className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Todos os Proprietários</option>
            {usuarios?.map(u => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>

          <button
            onClick={() => refetch()}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
            title="Atualizar"
          >
            <RefreshCw size={18} />
          </button>

          <Link
            to="/crm"
            data-tour="cdash-kanban"
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
          >
            Ver Kanban
          </Link>

          <TourHelpButton tourId="crm-dashboard" label="" />
        </div>
      </div>

      {/* Filtro por período */}
      <div data-tour="cdash-periodo">
      <DateRangePresets
        dataInicio={dataInicio}
        dataFim={dataFim}
        onChange={(inicio, fim) => {
          setDataInicio(inicio)
          setDataFim(fim)
        }}
        onClear={limparFiltroData}
        label="Período de análise"
        referenceLabel="data do evento (cadastro, ganho ou movimentação)"
      />
      </div>

      {/* KPIs Principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-tour="cdash-kpis">
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Leads Ativos</p>
              <p className="text-2xl font-bold text-gray-800">{metricas.leadsAtivos}</p>
            </div>
            <div className="p-3 bg-primary-100 rounded-full">
              <Users size={24} className="text-primary-600" />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {metricas.totalLeads} leads no total
          </p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Valor em Pipeline</p>
              <p className="text-2xl font-bold text-gray-800">{formatCurrency(metricas.valorTotal)}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <DollarSign size={24} className="text-green-600" />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {formatCurrency(metricas.valorGanho)} ganhos
          </p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Taxa de Conversão</p>
              <p className="text-2xl font-bold text-gray-800">{metricas.taxaConversao}%</p>
            </div>
            <div className="p-3 bg-primary-100 rounded-full">
              <Target size={24} className="text-primary-600" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs">
            <span className="text-green-600 flex items-center">
              <TrendingUp size={12} /> {metricas.leadsGanhos} ganhos
            </span>
            <span className="text-red-600 flex items-center">
              <TrendingDown size={12} /> {metricas.leadsPerdidos} perdidos
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Tempo Medio</p>
              <p className="text-2xl font-bold text-gray-800">
                {metricas.tempoMedioConversao ? `${metricas.tempoMedioConversao} dias` : '-'}
              </p>
            </div>
            <div className="p-3 bg-amber-100 rounded-full">
              <Clock size={24} className="text-amber-600" />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Para conversao em venda
          </p>
        </div>
      </div>

      {/* Segunda linha - Alertas e Tarefas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-500" />
            <span className="font-medium text-red-700">Tarefas Atrasadas</span>
          </div>
          <p className="text-3xl font-bold text-red-700 mt-2">{metricas.tarefasAtrasadas}</p>
        </div>

        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
          <div className="flex items-center gap-2">
            <Calendar size={20} className="text-amber-500" />
            <span className="font-medium text-amber-700">Tarefas para Hoje</span>
          </div>
          <p className="text-3xl font-bold text-amber-700 mt-2">{metricas.tarefasHoje}</p>
        </div>

        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
          <div className="flex items-center gap-2">
            <Clock size={20} className="text-blue-500" />
            <span className="font-medium text-blue-700">Sem Contato (7 dias)</span>
          </div>
          <p className="text-3xl font-bold text-blue-700 mt-2">{metricas.leadsSemContato7Dias}</p>
        </div>
      </div>

      {/* Follow-ups widget */}
      {followupMetricas && (
        <div className="bg-white rounded-lg shadow-sm p-4" data-tour="cdash-followups">
          <div className="flex items-center gap-2 mb-3">
            <Bell size={18} className="text-orange-500" />
            <h3 className="font-medium text-gray-800">Follow-ups</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-600">{followupMetricas.total_pendentes}</p>
              <p className="text-xs text-gray-500 mt-0.5">Pendentes</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold ${followupMetricas.total_atrasados > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {followupMetricas.total_atrasados}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Atrasados</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-600">{followupMetricas.pendentes_hoje}</p>
              <p className="text-xs text-gray-500 mt-0.5">Para hoje</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{followupMetricas.enviados_hoje}</p>
              <p className="text-xs text-gray-500 mt-0.5">Enviados hoje</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold ${followupMetricas.total_falhados > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                {followupMetricas.total_falhados}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Falhados</p>
            </div>
          </div>
        </div>
      )}

      {/* Funil de Vendas */}
      <div className="bg-white p-4 rounded-lg shadow-sm" data-tour="cdash-funil-grafico">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-gray-800 flex items-center gap-2">
            <BarChart3 size={18} className="text-gray-400" />
            Funil de Vendas
          </h3>
          <div className="flex items-center gap-2">
            {/* Toggle Acumulado / Diário */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setVisaoFunil('acumulado')}
                className={`px-3 py-1 text-xs rounded-md transition-all ${
                  visaoFunil === 'acumulado'
                    ? 'bg-white shadow text-primary-600 font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Acumulado
              </button>
              <button
                onClick={() => setVisaoFunil('diario')}
                className={`px-3 py-1 text-xs rounded-md transition-all ${
                  visaoFunil === 'diario'
                    ? 'bg-white shadow text-primary-600 font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Diario
              </button>
            </div>

            {/* Seletor de período - só no Diário */}
            {visaoFunil === 'diario' && (
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                {[7, 14, 30].map(d => (
                  <button
                    key={d}
                    onClick={() => setDiasDiario(d)}
                    className={`px-2 py-1 text-xs rounded-md transition-all ${
                      diasDiario === d
                        ? 'bg-white shadow text-primary-600 font-medium'
                        : 'text-gray-500 hover:text-gray-700'
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
          <p className="text-center text-gray-400 py-6 text-sm">Nenhum dado disponivel</p>
        ) : visaoFunil === 'acumulado' ? (
          <FunilAcumulado data={funilAnalytics} />
        ) : (
          <FunilDiario data={funilAnalytics} />
        )}
      </div>

      {/* Graficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leads por Temperatura */}
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <h3 className="font-medium text-gray-800 mb-4 flex items-center gap-2">
            <Thermometer size={18} className="text-gray-400" />
            Leads por Temperatura
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {metricas.leadsPorTemperatura.map((item) => (
              <div
                key={item.temperatura}
                className={`p-4 rounded-lg text-center ${temperaturaColors[item.temperatura] || 'bg-gray-100'}`}
              >
                <p className="text-2xl font-bold">{item.total}</p>
                <p className="text-sm font-medium">{temperaturaLabels[item.temperatura] || item.temperatura}</p>
                <p className="text-xs mt-1 opacity-70">{formatCurrency(item.valor)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Leads por Origem */}
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <h3 className="font-medium text-gray-800 mb-4 flex items-center gap-2">
            <Globe size={18} className="text-gray-400" />
            Leads por Origem
          </h3>
          {metricas.leadsPorOrigem.length === 0 ? (
            <p className="text-center text-gray-400 py-4 text-sm">Nenhum dado de origem disponivel</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {metricas.leadsPorOrigem.map((item) => {
                const totalOrigem = metricas.leadsPorOrigem.reduce((acc, o) => acc + o.total, 0)
                const pct = totalOrigem > 0 ? Math.round((item.total / totalOrigem) * 100) : 0
                return (
                  <div
                    key={item.origem}
                    className={`p-3 rounded-lg text-center ${origemColors[item.origem] || 'bg-gray-100 text-gray-600'}`}
                  >
                    <p className="text-2xl font-bold">{item.total}</p>
                    <p className="text-sm font-medium">{origemLabels[item.origem] || item.origem}</p>
                    <p className="text-xs mt-1 opacity-70">{pct}%</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Evolucao Mensal */}
      {metricas.leadsPorMes.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <h3 className="font-medium text-gray-800 mb-1 flex items-center gap-2">
            <TrendingUp size={18} className="text-gray-400" />
            Evolucao Mensal
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            Criados: data de cadastro · Ganhos/Perdidos/Valor: data em que o evento ocorreu
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Mes</th>
                  <th className="text-center py-2 px-3 font-medium text-gray-600">Criados</th>
                  <th className="text-center py-2 px-3 font-medium text-green-600">Ganhos</th>
                  <th className="text-center py-2 px-3 font-medium text-red-600">Perdidos</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Valor Ganho</th>
                </tr>
              </thead>
              <tbody>
                {metricas.leadsPorMes.map((mes) => {
                  const valorMes = metricas.valorPorMes.find(v => v.mes === mes.mes)
                  return (
                    <tr key={mes.mes} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium">{formatMonth(mes.mes)}</td>
                      <td className="py-2 px-3 text-center">{mes.total || '-'}</td>
                      <td className="py-2 px-3 text-center text-green-600">{mes.ganhos || '-'}</td>
                      <td className="py-2 px-3 text-center text-red-600">{mes.perdidos || '-'}</td>
                      <td className="py-2 px-3 text-right">{valorMes?.valor ? formatCurrency(valorMes.valor) : '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-gray-50 font-semibold">
                  <td className="py-2 px-3 text-gray-700">Total</td>
                  <td className="py-2 px-3 text-center text-gray-700">
                    {metricas.leadsPorMes.reduce((s, m) => s + m.total, 0)}
                  </td>
                  <td className="py-2 px-3 text-center text-green-700">
                    {metricas.leadsPorMes.reduce((s, m) => s + m.ganhos, 0)}
                  </td>
                  <td className="py-2 px-3 text-center text-red-700">
                    {metricas.leadsPorMes.reduce((s, m) => s + m.perdidos, 0)}
                  </td>
                  <td className="py-2 px-3 text-right text-gray-700">
                    {formatCurrency(metricas.valorPorMes.reduce((s, m) => s + m.valor, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Atividades Recentes */}
      {metricas.atividadesRecentes.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <h3 className="font-medium text-gray-800 mb-4 flex items-center gap-2">
            <Activity size={18} className="text-gray-400" />
            Atividades Recentes
          </h3>
          <div className="space-y-3">
            {metricas.atividadesRecentes.map((ativ) => (
              <div key={ativ.id} className="flex items-start gap-3 text-sm">
                <div className="p-2 bg-gray-100 rounded-full">
                  <CheckCircle size={14} className="text-gray-500" />
                </div>
                <div className="flex-1">
                  <p className="text-gray-800">
                    <span className="font-medium">{ativ.lead_nome}</span>
                    {' - '}
                    {ativ.descricao}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(ativ.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
