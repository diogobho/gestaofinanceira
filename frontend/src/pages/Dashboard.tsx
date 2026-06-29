import React, { useState, useMemo } from 'react'
import { Header } from '@/components/layout'
import { Card, Spinner, DateRangePresets } from '@/components/ui'
import { formatCurrency } from '@/utils'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  Users
} from 'lucide-react'
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LabelList
} from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { dashboardApi, clientsApi, parcelasApi } from '@/api'

export const Dashboard: React.FC = () => {
  // Calcular data padrão: hoje e 3 meses atrás
  const hoje = new Date()
  const tresMesesAtras = new Date()
  tresMesesAtras.setMonth(hoje.getMonth() - 3)

  const formatDateForInput = (date: Date) => {
    return date.toISOString().split('T')[0]
  }

  // Formata valores compactos para labels de gráfico (evita overflow)
  const formatCompact = (value: number) => {
    if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(1)}k`
    return `R$ ${value.toFixed(0)}`
  }

  // Estados para filtros de data
  const [dataIni, setDataIni] = useState(formatDateForInput(tresMesesAtras))
  const [dataFim, setDataFim] = useState(formatDateForInput(hoje))
  const [filtrosAtivos, setFiltrosAtivos] = useState<{ data_ini?: string, data_fim?: string }>({
    data_ini: formatDateForInput(tresMesesAtras),
    data_fim: formatDateForInput(hoje)
  })

  // Buscar dados do dashboard com filtros
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['dashboard', filtrosAtivos],
    queryFn: () => dashboardApi.getData(filtrosAtivos)
  })

  // Buscar parcelas para gráficos
  const { data: parcelasReceitas } = useQuery({
    queryKey: ['parcelas-receitas-dash', filtrosAtivos],
    queryFn: () => parcelasApi.getParcelasReceitas(filtrosAtivos)
  })

  const { data: parcelasDespesas } = useQuery({
    queryKey: ['parcelas-despesas-dash', filtrosAtivos],
    queryFn: () => parcelasApi.getParcelasDespesas(filtrosAtivos)
  })

  const { data: clients } = useQuery({
    queryKey: ['clients-dashboard'],
    queryFn: () => clientsApi.list()
  })

  // Limpar filtros
  const handleLimparFiltros = () => {
    const dataInicial = formatDateForInput(tresMesesAtras)
    const dataFinal = formatDateForInput(hoje)
    setDataIni(dataInicial)
    setDataFim(dataFinal)
    setFiltrosAtivos({ data_ini: dataInicial, data_fim: dataFinal })
  }

  // Dados para gráfico de evolução mensal
  const dadosMensais = useMemo(() => {
    if (!parcelasReceitas || !parcelasDespesas) return []

    const meses: Record<string, { mes: string, receitas: number, despesas: number, lucro: number }> = {}

    // Agrupar receitas por mês (inclui PENDENTE e ATRASADO para mostrar previsão)
    parcelasReceitas.forEach((parcela: any) => {
      const data = new Date(parcela.data_vencimento)
      const mesAno = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`
      const mesNome = data.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })

      if (!meses[mesAno]) {
        meses[mesAno] = { mes: mesNome, receitas: 0, despesas: 0, lucro: 0 }
      }
      // Mostra valor independente do status (realizadas + previstas)
      meses[mesAno].receitas += parseFloat(parcela.valor)
    })

    // Agrupar despesas por mês (inclui PENDENTE e ATRASADO para mostrar previsão)
    parcelasDespesas.forEach((parcela: any) => {
      const data = new Date(parcela.data_vencimento)
      const mesAno = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`
      const mesNome = data.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })

      if (!meses[mesAno]) {
        meses[mesAno] = { mes: mesNome, receitas: 0, despesas: 0, lucro: 0 }
      }
      // Mostra valor independente do status (realizadas + previstas)
      meses[mesAno].despesas += parseFloat(parcela.valor)
    })

    // Calcular lucro
    Object.keys(meses).forEach(mesAno => {
      meses[mesAno].lucro = meses[mesAno].receitas - meses[mesAno].despesas
    })

    return Object.entries(meses)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([_, valores]) => valores)
  }, [parcelasReceitas, parcelasDespesas])

  // Dados para gráfico de pizza - Status
  const dadosStatus = useMemo(() => {
    const pagas = (parcelasReceitas?.filter((p: any) => p.status === 'PAGO').length || 0) +
                  (parcelasDespesas?.filter((p: any) => p.status === 'PAGO').length || 0)
    const pendentes = (parcelasReceitas?.filter((p: any) => p.status === 'PENDENTE').length || 0) +
                      (parcelasDespesas?.filter((p: any) => p.status === 'PENDENTE').length || 0)
    const atrasadas = (parcelasReceitas?.filter((p: any) => p.status === 'ATRASADO').length || 0) +
                      (parcelasDespesas?.filter((p: any) => p.status === 'ATRASADO').length || 0)

    return [
      { name: 'Pagas', value: pagas, color: '#10B981' },
      { name: 'Pendentes', value: pendentes, color: '#F59E0B' },
      { name: 'Atrasadas', value: atrasadas, color: '#EF4444' }
    ].filter(item => item.value > 0)
  }, [parcelasReceitas, parcelasDespesas])

  // Top 5 Clientes por Receita
  const topClientes = useMemo(() => {
    if (!parcelasReceitas) return []

    const clientesMap: Record<string, { nome: string, valor: number }> = {}

    parcelasReceitas.forEach((parcela: any) => {
      if (parcela.cliente_nome && parcela.status === 'PAGO') {
        if (!clientesMap[parcela.cliente_nome]) {
          clientesMap[parcela.cliente_nome] = { nome: parcela.cliente_nome, valor: 0 }
        }
        clientesMap[parcela.cliente_nome].valor += parseFloat(parcela.valor)
      }
    })

    return Object.values(clientesMap)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5)
  }, [parcelasReceitas])

  // Receitas por Produto
  const receitasPorProduto = useMemo(() => {
    if (!parcelasReceitas) return []

    const produtosMap: Record<string, number> = {}

    parcelasReceitas.forEach((parcela: any) => {
      const produto = parcela.receita_descricao || 'Sem Descrição'
      if (parcela.status === 'PAGO') {
        if (!produtosMap[produto]) {
          produtosMap[produto] = 0
        }
        produtosMap[produto] += parseFloat(parcela.valor)
      }
    })

    const cores = ['#10B981', '#3B82F6', '#F59E0B', '#3a5483', '#EC4899', '#14B8A6']

    return Object.entries(produtosMap)
      .map(([produto, valor], index) => ({
        name: produto,
        value: valor,
        color: cores[index % cores.length]
      }))
      .sort((a, b) => b.value - a.value)
  }, [parcelasReceitas])

  // Despesas por Produto
  const despesasPorProduto = useMemo(() => {
    if (!parcelasDespesas) return []

    const produtosMap: Record<string, number> = {}

    parcelasDespesas.forEach((parcela: any) => {
      const produto = parcela.despesa_descricao || 'Sem Descrição'
      if (parcela.status === 'PAGO') {
        if (!produtosMap[produto]) {
          produtosMap[produto] = 0
        }
        produtosMap[produto] += parseFloat(parcela.valor)
      }
    })

    const cores = ['#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#22C55E']

    return Object.entries(produtosMap)
      .map(([produto, valor], index) => ({
        name: produto,
        value: valor,
        color: cores[index % cores.length]
      }))
      .sort((a, b) => b.value - a.value)
  }, [parcelasDespesas])

  // Métricas adicionais
  const metricas = useMemo(() => {
    const totalParcelas = (parcelasReceitas?.length || 0) + (parcelasDespesas?.length || 0)
    const parcelasAtrasadas = (parcelasReceitas?.filter((p: any) => p.status === 'ATRASADO').length || 0) +
                              (parcelasDespesas?.filter((p: any) => p.status === 'ATRASADO').length || 0)

    const taxaInadimplencia = totalParcelas > 0 ? (parcelasAtrasadas / totalParcelas) * 100 : 0

    const totalReceitas = parcelasReceitas?.filter((p: any) => p.status === 'PAGO').length || 0
    const somaReceitas = parcelasReceitas
      ?.filter((p: any) => p.status === 'PAGO')
      .reduce((acc: number, p: any) => acc + parseFloat(p.valor), 0) || 0

    const ticketMedio = totalReceitas > 0 ? somaReceitas / totalReceitas : 0

    // Ticket médio projetado: inclui PENDENTE e ATRASADO
    const totalReceitasTodas = parcelasReceitas?.length || 0
    const somaReceitasTodas = parcelasReceitas
      ?.reduce((acc: number, p: any) => acc + parseFloat(p.valor), 0) || 0
    const ticketMedioProjetado = totalReceitasTodas > 0 ? somaReceitasTodas / totalReceitasTodas : 0

    return {
      taxaInadimplencia,
      ticketMedio,
      ticketMedioProjetado,
      totalParcelas,
      parcelasAtrasadas
    }
  }, [parcelasReceitas, parcelasDespesas])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner size="lg" />
      </div>
    )
  }

  // Extrair dados do dashboard
  const receitasRealizadas = dashboardData?.receitas.realizadas || 0
  const receitasPrevistas = dashboardData?.receitas.previstas || 0
  const receitaTotal = dashboardData?.receitas.total || 0
  const despesasRealizadas = dashboardData?.despesas.realizadas || 0
  const despesasPrevistas = dashboardData?.despesas.previstas || 0
  const despesaTotal = dashboardData?.despesas.total || 0
  const lucroTotal = dashboardData?.lucro.total || 0

  return (
    <div>
      <Header
        title="Dashboard Financeiro"
        subtitle="Visão geral completa do seu negócio"
      />

      <div className="p-4 sm:p-6 space-y-6">
        {/* Big Numbers - Responsivos ao filtro */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <Card>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm text-gray-600">Faturamento do Período</p>
                <p className="text-2xl font-bold text-green-600 mt-1">
                  {formatCurrency(receitaTotal)}
                </p>
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-gray-600 flex items-center justify-between">
                    <span>Receita Recebida:</span>
                    <span className="font-medium text-green-600">{formatCurrency(receitasRealizadas)}</span>
                  </p>
                  <p className="text-xs text-gray-600 flex items-center justify-between">
                    <span>A Receber:</span>
                    <span className="font-medium text-amber-600">{formatCurrency(receitasPrevistas)}</span>
                  </p>
                </div>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm text-gray-600">Despesas do Período</p>
                <p className="text-2xl font-bold text-red-600 mt-1">
                  {formatCurrency(despesaTotal)}
                </p>
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-gray-600 flex items-center justify-between">
                    <span>Despesas Pagas:</span>
                    <span className="font-medium text-red-600">{formatCurrency(despesasRealizadas)}</span>
                  </p>
                  <p className="text-xs text-gray-600 flex items-center justify-between">
                    <span>A Pagar:</span>
                    <span className="font-medium text-amber-600">{formatCurrency(despesasPrevistas)}</span>
                  </p>
                </div>
              </div>
              <div className="p-3 bg-red-100 rounded-full">
                <TrendingDown className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Lucro Total</p>
                <p className={`text-2xl font-bold mt-1 ${lucroTotal >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {formatCurrency(lucroTotal)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {`Margem: ${receitaTotal > 0 ? ((lucroTotal / receitaTotal) * 100).toFixed(1) : 0}%`}
                </p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <DollarSign className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Clientes Ativos</p>
                <p className="text-2xl font-bold text-primary-600 mt-1">
                  {clients?.length || 0}
                </p>
                <p className="text-xs text-gray-500 mt-1">Total cadastrados</p>
              </div>
              <div className="p-3 bg-primary-100 rounded-full">
                <Users className="w-6 h-6 text-primary-600" />
              </div>
            </div>
          </Card>
        </div>

        {/* Métricas Adicionais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Ticket Médio</p>
                <p className="text-2xl font-bold text-primary-600 mt-1">
                  {metricas.ticketMedio > 0 ? formatCurrency(metricas.ticketMedio) : formatCurrency(metricas.ticketMedioProjetado)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {metricas.ticketMedio > 0 ? 'Baseado em parcelas pagas' : 'Projetado (sem pagamentos ainda)'}
                </p>
              </div>
              <div className="p-3 bg-primary-100 rounded-full">
                <Wallet className="w-6 h-6 text-primary-600" />
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Taxa de Inadimplência</p>
                <p className={`text-2xl font-bold mt-1 ${metricas.taxaInadimplencia < 10 ? 'text-green-600' : metricas.taxaInadimplencia < 20 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {metricas.taxaInadimplencia.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500 mt-1">{metricas.parcelasAtrasadas} de {metricas.totalParcelas} parcelas</p>
              </div>
              <div className={`p-3 rounded-full ${metricas.taxaInadimplencia < 10 ? 'bg-green-100' : metricas.taxaInadimplencia < 20 ? 'bg-yellow-100' : 'bg-red-100'}`}>
                <TrendingDown className={`w-6 h-6 ${metricas.taxaInadimplencia < 10 ? 'text-green-600' : metricas.taxaInadimplencia < 20 ? 'text-yellow-600' : 'text-red-600'}`} />
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Receitas Previstas</p>
                <p className="text-2xl font-bold text-teal-600 mt-1">
                  {formatCurrency(receitasPrevistas)}
                </p>
                <p className="text-xs text-gray-500 mt-1">A receber</p>
              </div>
              <div className="p-3 bg-teal-100 rounded-full">
                <TrendingUp className="w-6 h-6 text-teal-600" />
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Despesas Previstas</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">
                  {formatCurrency(despesasPrevistas)}
                </p>
                <p className="text-xs text-gray-500 mt-1">A pagar</p>
              </div>
              <div className="p-3 bg-orange-100 rounded-full">
                <TrendingDown className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </Card>
        </div>

        {/* Filtros por Período */}
        <DateRangePresets
          dataInicio={dataIni}
          dataFim={dataFim}
          onChange={(inicio, fim) => {
            setDataIni(inicio)
            setDataFim(fim)
            setFiltrosAtivos({
              data_ini: inicio || undefined,
              data_fim: fim || undefined
            })
          }}
          onClear={handleLimparFiltros}
          label="Filtrar Período"
          referenceLabel="data de vencimento das parcelas"
        />

        {/* Cards de Métricas Filtradas - Receitas */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Receitas (Período Filtrado)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Realizadas (Pagas)</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">
                    {formatCurrency(receitasRealizadas)}
                  </p>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Previstas (A Receber)</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">
                    {formatCurrency(receitasPrevistas)}
                  </p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <Wallet className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total do Período</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {formatCurrency(receitasRealizadas + receitasPrevistas)}
                  </p>
                </div>
                <div className="p-3 bg-gray-100 rounded-full">
                  <DollarSign className="w-6 h-6 text-gray-600" />
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Cards de Métricas Filtradas - Despesas */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Despesas (Período Filtrado)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Realizadas (Pagas)</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">
                    {formatCurrency(despesasRealizadas)}
                  </p>
                </div>
                <div className="p-3 bg-red-100 rounded-full">
                  <TrendingDown className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Previstas (A Pagar)</p>
                  <p className="text-2xl font-bold text-orange-600 mt-1">
                    {formatCurrency(despesasPrevistas)}
                  </p>
                </div>
                <div className="p-3 bg-orange-100 rounded-full">
                  <Wallet className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total do Período</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {formatCurrency(despesasRealizadas + despesasPrevistas)}
                  </p>
                </div>
                <div className="p-3 bg-gray-100 rounded-full">
                  <DollarSign className="w-6 h-6 text-gray-600" />
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico de Evolução Mensal */}
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Evolução Mensal</h3>
            <p className="text-xs text-gray-400 mb-4">Inclui parcelas pagas e a receber no período</p>
            <div style={{ width: '100%', height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dadosMensais}>
                  <defs>
                    <linearGradient id="colorReceitas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorDespesas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="mes" stroke="#6B7280" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                    formatter={(value: any) => formatCurrency(value)}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="receitas"
                    stroke="#10B981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorReceitas)"
                    name="Receitas"
                    dot={{ r: 4, fill: '#10B981', strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                  >
                    <LabelList dataKey="receitas" position="top" style={{ fontSize: '10px', fill: '#10B981', fontWeight: 600 }} formatter={(v: any) => formatCompact(v as number)} />
                  </Area>
                  <Area
                    type="monotone"
                    dataKey="despesas"
                    stroke="#EF4444"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorDespesas)"
                    name="Despesas"
                    dot={{ r: 4, fill: '#EF4444', strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                  >
                    <LabelList dataKey="despesas" position="bottom" style={{ fontSize: '10px', fill: '#EF4444', fontWeight: 600 }} formatter={(v: any) => formatCompact(v as number)} />
                  </Area>
                  <Area
                    type="monotone"
                    dataKey="lucro"
                    stroke="#3B82F6"
                    fill="transparent"
                    name="Lucro"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#3B82F6', strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Gráfico de Status */}
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Status das Parcelas</h3>
            <div style={{ width: '100%', height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dadosStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={3}
                    labelLine={false}
                    label={({ name, value, percent }) =>
                      (percent as number) > 0.08 ? `${name}: ${value}` : ''
                    }
                    dataKey="value"
                  >
                    {dadosStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => `${value} parcelas`} />
                  <Legend formatter={(value, entry: any) => `${value}: ${entry.payload.value}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Mais Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico de Barras - Comparação Mensal */}
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Comparação Receitas vs Despesas</h3>
            <div style={{ width: '100%', height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosMensais}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="mes" stroke="#6B7280" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                    formatter={(value: any) => formatCurrency(value)}
                  />
                  <Legend />
                  <Bar dataKey="receitas" fill="#10B981" name="Receitas" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="receitas" position="top" style={{ fontSize: '10px', fill: '#10B981', fontWeight: 600 }} formatter={(v: any) => formatCompact(v as number)} />
                  </Bar>
                  <Bar dataKey="despesas" fill="#EF4444" name="Despesas" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="despesas" position="top" style={{ fontSize: '10px', fill: '#EF4444', fontWeight: 600 }} formatter={(v: any) => formatCompact(v as number)} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Top 5 Clientes */}
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Top 5 Clientes
            </h3>
            <div style={{ width: '100%', height: '300px' }}>
              {topClientes.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topClientes} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" stroke="#6B7280" style={{ fontSize: '12px' }} />
                    <YAxis type="category" dataKey="nome" stroke="#6B7280" style={{ fontSize: '12px' }} width={100} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                      formatter={(value: any) => formatCurrency(value)}
                    />
                    <Bar dataKey="valor" fill="#3a5483" name="Receita Total" radius={[0, 6, 6, 0]}>
                      <LabelList dataKey="valor" position="right" style={{ fontSize: '10px', fill: '#374151', fontWeight: 600 }} formatter={(v: any) => formatCompact(v as number)} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  Nenhum cliente com receitas pagas no período
                </div>
              )}
            </div>
          </Card>

          {/* Receitas por Produto/Fonte */}
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Receitas por Produto</h3>
            <div style={{ width: '100%', height: '300px' }}>
              {receitasPorProduto.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={receitasPorProduto}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={3}
                      labelLine={false}
                      label={({ name, percent }: any) =>
                        (percent as number) > 0.08 ? `${(name as string).length > 12 ? (name as string).slice(0, 12) + '…' : name} ${((percent as number) * 100).toFixed(0)}%` : ''
                      }
                      dataKey="value"
                    >
                      {receitasPorProduto.map((entry, index) => (
                        <Cell key={`cell-receita-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Legend formatter={(value, entry: any) => `${value}: ${formatCompact(entry.payload.value)}`} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  Nenhuma receita paga no período
                </div>
              )}
            </div>
          </Card>

          {/* Despesas por Produto/Categoria */}
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Despesas por Produto</h3>
            <div style={{ width: '100%', height: '300px' }}>
              {despesasPorProduto.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={despesasPorProduto}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={3}
                      labelLine={false}
                      label={({ name, percent }: any) =>
                        (percent as number) > 0.08 ? `${(name as string).length > 12 ? (name as string).slice(0, 12) + '…' : name} ${((percent as number) * 100).toFixed(0)}%` : ''
                      }
                      dataKey="value"
                    >
                      {despesasPorProduto.map((entry, index) => (
                        <Cell key={`cell-despesa-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Legend formatter={(value, entry: any) => `${value}: ${formatCompact(entry.payload.value)}`} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  Nenhuma despesa paga no período
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Card de Informação */}
        <Card>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">ℹ️ Como funciona o Dashboard</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• <strong>TODO o dashboard</strong> responde ao filtro de período selecionado</li>
              <li>• <strong>Faturamento do Período:</strong> soma das parcelas com vencimento dentro do período filtrado (pagas + pendentes)</li>
              <li>• <strong>Realizadas/Pagas:</strong> Parcelas com status "PAGO" no período</li>
              <li>• <strong>Previstas/Pendentes:</strong> Parcelas com status "PENDENTE" ou "ATRASADO" no período</li>
              <li>• <strong>Evolução Mensal:</strong> agrupa todas as parcelas por mês de vencimento (pagas + previstas)</li>
              <li>• <strong>Filtro padrão:</strong> Últimos 3 meses — parcelas fora deste intervalo não aparecem aqui (veja o módulo Parcelas para totais globais)</li>
              <li>• <strong>Ticket Médio:</strong> calculado sobre parcelas pagas; exibe projeção quando não há pagamentos ainda</li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  )
}
