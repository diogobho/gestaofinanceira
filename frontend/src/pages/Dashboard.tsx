import React, { useState, useMemo } from 'react'
import toast from 'react-hot-toast'
import { Header } from '@/components/layout'
import { Card, Spinner, DateRangePresets, Button } from '@/components/ui'
import { formatCurrency, formatDate, toInputDate } from '@/utils'
import { useAuth } from '@/contexts/AuthContext'
import { gerarAssinaturaPadrao } from '@/utils/assinaturaEmail'
import {
  capturarGrafico,
  escaparHtml,
  exportarRelatorioPdf,
  listaValoresHtml,
  tabelaHtml,
  LARGURA_PAPEL_METADE,
} from '@/utils/relatorioPdf'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  Users,
  FileDown
} from 'lucide-react'
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LabelList
} from 'recharts'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { dashboardApi, clientsApi, parcelasApi } from '@/api'
import { DetalhamentoLancamentos } from './dashboard/detalhamento/DetalhamentoLancamentos'
import {
  agruparPorSituacao,
  dataPura,
  descricaoSemCliente,
  diasEntre,
  normalizarDespesas,
  normalizarReceitas,
  ordenarPorVencimento,
  somarPorSituacao,
  type Lancamento,
  type SomaSituacao,
} from './dashboard/detalhamento/agregacoes'

export const Dashboard: React.FC = () => {
  const { user } = useAuth()

  // Calcular data padrão: hoje e 3 meses atrás
  const hoje = new Date()
  // Dia limitado a 28 ao voltar meses: com dia 31 o setMonth "cru" cai no mês errado (31/05 − 3 meses = 03/03)
  const tresMesesAtras = new Date(hoje.getFullYear(), hoje.getMonth() - 3, Math.min(hoje.getDate(), 28))

  // Data LOCAL (não toISOString/UTC): à noite no Brasil (UTC-3) o ISO já é o dia seguinte
  const formatDateForInput = (date: Date) => toInputDate(date)

  // Percentual em pt-BR. `toFixed` sempre devolve ponto decimal ("98.4%"), e o
  // relatório inteiro em volta usa vírgula (R$ 64.243,23) — o fallback do
  // cálculo de margem já era '0,0'.
  const formatPercent = (value: number) =>
    `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

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
  /*
    `placeholderData: keepPreviousData` nas consultas que dependem do filtro:
    sem isso, mudar o período troca a queryKey, `isLoading` volta a ser true, a
    página vira um spinner, a altura colapsa e o scroll salta para o topo.
  */
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['dashboard', filtrosAtivos],
    queryFn: () => dashboardApi.getData(filtrosAtivos),
    placeholderData: keepPreviousData,
  })

  // Buscar parcelas para gráficos
  const { data: parcelasReceitas } = useQuery({
    queryKey: ['parcelas-receitas-dash', filtrosAtivos],
    queryFn: () => parcelasApi.getParcelasReceitas(filtrosAtivos),
    placeholderData: keepPreviousData,
  })

  const { data: parcelasDespesas } = useQuery({
    queryKey: ['parcelas-despesas-dash', filtrosAtivos],
    queryFn: () => parcelasApi.getParcelasDespesas(filtrosAtivos),
    placeholderData: keepPreviousData,
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

  /*
    O mês sai da data LITERAL da parcela. `new Date('2026-09-01T00:00:00.000Z')`
    no navegador em UTC-3 é 31/08 às 21h: toda parcela que vence no dia 1º
    caía no mês anterior do gráfico (12 de 666 parcelas na base em 09/2026).
  */
  const chaveMes = (v: unknown) => dataPura(v).slice(0, 7)
  const nomeMes = (mesAno: string) => {
    const [a, m] = mesAno.split('-').map(Number)
    return new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
  }

  // Dados para gráfico de evolução mensal
  const dadosMensais = useMemo(() => {
    if (!parcelasReceitas || !parcelasDespesas) return []

    const meses: Record<string, { mes: string, receitas: number, despesas: number, lucro: number }> = {}

    // Agrupar receitas por mês (inclui PENDENTE e ATRASADO para mostrar previsão)
    parcelasReceitas.forEach((parcela: any) => {
      const mesAno = chaveMes(parcela.data_vencimento)
      const mesNome = nomeMes(mesAno)

      if (!meses[mesAno]) {
        meses[mesAno] = { mes: mesNome, receitas: 0, despesas: 0, lucro: 0 }
      }
      // Mostra valor independente do status (realizadas + previstas)
      meses[mesAno].receitas += parseFloat(parcela.valor)
    })

    // Agrupar despesas por mês (inclui PENDENTE e ATRASADO para mostrar previsão)
    parcelasDespesas.forEach((parcela: any) => {
      const mesAno = chaveMes(parcela.data_vencimento)
      const mesNome = nomeMes(mesAno)

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

  // Detalhamento — quem pagou / com o que foi gasto. Mesmas parcelas, mesmo período.
  const lancReceitas = useMemo(() => normalizarReceitas(parcelasReceitas), [parcelasReceitas])
  const lancDespesas = useMemo(() => normalizarDespesas(parcelasDespesas), [parcelasDespesas])

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

  /* ------------------------------------------------------ relatório PDF --- */

  // Cabeçalho do PDF é a assinatura salva em /gestao/perfil; sem ela, o padrão
  // montado com os dados da empresa — o mesmo que o disparo de e-mail usa.
  const assinaturaHtml = useMemo(
    () =>
      user?.assinatura_email ||
      gerarAssinaturaPadrao({
        nomeUsuario: user?.nome,
        emailUsuario: user?.email,
        empresa: user?.empresa,
      }),
    [user?.assinatura_email, user?.nome, user?.email, user?.empresa]
  )

  const [exportando, setExportando] = useState(false)

  const periodoTexto = (() => {
    const de = filtrosAtivos.data_ini
    const ate = filtrosAtivos.data_fim
    if (de && ate) return `${formatDate(de)} a ${formatDate(ate)}`
    if (de) return `a partir de ${formatDate(de)}`
    if (ate) return `até ${formatDate(ate)}`
    return 'todo o histórico'
  })()

  const exportarPdf = async () => {
    setExportando(true)
    try {
      const receitasReal = dashboardData?.receitas.realizadas || 0
      const receitasPrev = dashboardData?.receitas.previstas || 0
      const receitasTot = dashboardData?.receitas.total || 0
      const despesasReal = dashboardData?.despesas.realizadas || 0
      const despesasPrev = dashboardData?.despesas.previstas || 0
      const despesasTot = dashboardData?.despesas.total || 0
      const lucro = dashboardData?.lucro.total || 0
      const margem = formatPercent(receitasTot > 0 ? (lucro / receitasTot) * 100 : 0)

      const de = filtrosAtivos.data_ini
      const ate = filtrosAtivos.data_fim

      const totalStatus = dadosStatus.reduce((acc, s) => acc + s.value, 0)

      // Detalhamento com TODAS as parcelas do período, abertas por situação —
      // ver `agruparPorSituacao`: filtrar só as pagas deixava as tabelas vazias
      // em conta que não dá baixa, logo abaixo de um faturamento de seis dígitos.
      const tabelaGrupos = (tipo: 'receita' | 'despesa', rotulo: string, lancs: Lancamento[], chave: string) => {
        const t = somarPorSituacao(lancs)
        // Zero vira travessão no corpo: uma coluna de "R$ 0,00" esconde o valor
        // que importa. No total fica o número, para não restar dúvida.
        const valor = (v: number) => (Math.abs(v) < 0.005 ? '—' : formatCurrency(v))
        const colunasSituacao = (s: SomaSituacao, fmt: (v: number) => string) =>
          [s.pago, s.aVencer, s.atrasado, s.total].map(fmt)
        return tabelaHtml(
          [
            { titulo: rotulo },
            { titulo: 'Parc.', alinhar: 'direita' },
            { titulo: tipo === 'receita' ? 'Recebido' : 'Pago', alinhar: 'direita' },
            { titulo: 'A vencer', alinhar: 'direita' },
            { titulo: 'Em atraso', alinhar: 'direita' },
            { titulo: 'Total', alinhar: 'direita' },
          ],
          agruparPorSituacao(lancs, chave).map((g) => [g.nome, g.quantidade, ...colunasSituacao(g, valor)]),
          ['Total', t.quantidade, ...colunasSituacao(t, formatCurrency)]
        )
      }
      const qtd = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
      const nGrupos = (lancs: Lancamento[], chave: string) => new Set(lancs.map((l) => l.grupos[chave])).size

      // Situação escrita por extenso: no papel não há cor que ajude.
      const hojeISO = toInputDate(new Date())
      const situacaoPdf = (l: Lancamento, tipo: 'receita' | 'despesa') => {
        if (l.status === 'PAGO') {
          return `${tipo === 'receita' ? 'Recebido' : 'Pago'} em ${formatDate(l.pagamento ?? l.vencimento)}`
        }
        if (l.status === 'ATRASADO') {
          const dias = diasEntre(l.vencimento, hojeISO)
          return dias > 0 ? `Em atraso há ${qtd(dias, 'dia', 'dias')}` : 'Em atraso'
        }
        return 'A vencer'
      }

      // Mesmo corte do Conta Azul: milhares de linhas viram dezenas de páginas.
      const LIMITE_LANCAMENTOS_PDF = 150
      const notaCorte = (n: number) =>
        n > LIMITE_LANCAMENTOS_PDF
          ? `As ${LIMITE_LANCAMENTOS_PDF} de vencimento mais recente, de ${n} parcelas — a lista inteira está no dashboard e na tela de Parcelas.`
          : `${qtd(n, 'parcela', 'parcelas')}, pagas e em aberto · vencimento mais recente primeiro`

      await exportarRelatorioPdf({
        titulo: 'Relatório Financeiro',
        subtitulo: user?.empresa?.nome || undefined,
        periodo: `<strong>Período:</strong> ${escaparHtml(periodoTexto)}`,
        assinaturaHtml,
        nomeArquivo: `relatorio-financeiro-${de || 'inicio'}-a-${ate || 'hoje'}`,
        resumo: [
          {
            rotulo: 'Faturamento do período',
            valor: formatCurrency(receitasTot),
            detalhe: `${formatCurrency(receitasReal)} recebido · ${formatCurrency(receitasPrev)} a receber`,
            cor: '#047857',
          },
          {
            rotulo: 'Despesas do período',
            valor: formatCurrency(despesasTot),
            detalhe: `${formatCurrency(despesasReal)} pago · ${formatCurrency(despesasPrev)} a pagar`,
            cor: '#b91c1c',
          },
          {
            rotulo: 'Lucro',
            valor: formatCurrency(lucro),
            detalhe: `Margem: ${margem}`,
            cor: lucro >= 0 ? '#1d4ed8' : '#b91c1c',
          },
          {
            rotulo: 'Clientes ativos',
            valor: String(clients?.length || 0),
            detalhe: 'Total cadastrados',
          },
          {
            rotulo: 'Ticket médio',
            valor: formatCurrency(
              metricas.ticketMedio > 0 ? metricas.ticketMedio : metricas.ticketMedioProjetado
            ),
            detalhe:
              metricas.ticketMedio > 0
                ? 'Baseado em parcelas pagas'
                : 'Projetado (sem pagamentos ainda)',
          },
          {
            rotulo: 'Taxa de inadimplência',
            valor: formatPercent(metricas.taxaInadimplencia),
            detalhe: `${metricas.parcelasAtrasadas} de ${metricas.totalParcelas} parcelas`,
            cor: metricas.taxaInadimplencia < 10 ? '#047857' : metricas.taxaInadimplencia < 20 ? '#b45309' : '#b91c1c',
          },
          {
            rotulo: 'Receitas previstas',
            valor: formatCurrency(receitasPrev),
            detalhe: 'A receber',
          },
          {
            rotulo: 'Despesas previstas',
            valor: formatCurrency(despesasPrev),
            detalhe: 'A pagar',
          },
        ],
        blocos: [
          {
            titulo: 'Receitas e despesas no período',
            metade: true,
            html: tabelaHtml(
              [
                { titulo: 'Movimento' },
                { titulo: 'Realizado', alinhar: 'direita' },
                { titulo: 'Previsto', alinhar: 'direita' },
                { titulo: 'Total', alinhar: 'direita' },
              ],
              [
                ['Receitas', formatCurrency(receitasReal), formatCurrency(receitasPrev), formatCurrency(receitasReal + receitasPrev)],
                ['Despesas', formatCurrency(despesasReal), formatCurrency(despesasPrev), formatCurrency(despesasReal + despesasPrev)],
                ['Resultado', formatCurrency(receitasReal - despesasReal), formatCurrency(receitasPrev - despesasPrev), formatCurrency(lucro)],
              ]
            ),
          },
          {
            titulo: 'Status das parcelas',
            descricao: `${totalStatus} parcelas no período`,
            metade: true,
            html: listaValoresHtml(
              dadosStatus.map((s) => ({
                rotulo: s.name,
                valor: `${s.value} (${totalStatus > 0 ? ((s.value / totalStatus) * 100).toFixed(0) : 0}%)`,
                cor: s.color,
              }))
            ),
          },
          {
            // Os dois gráficos dividem uma linha, e as duas tabelas a
            // seguinte. Meia largura só passou a ser possível quando
            // `capturarGrafico` deixou de amarrar o tamanho do texto à largura
            // do bloco: antes, espremido em meia coluna, o eixo encolhia junto
            // com o SVG e ficava ilegível — e em largura cheia um gráfico só
            // comia 431px de página e empurrava o resto para a folha seguinte.
            titulo: 'Evolução mensal',
            descricao: 'Inclui parcelas pagas e a receber no período',
            metade: true,
            html: capturarGrafico('[data-grafico="evolucao-mensal"]', {
              larguraAlvo: LARGURA_PAPEL_METADE,
              alturaMax: 230,
            }),
          },
          {
            titulo: 'Receitas vs Despesas',
            metade: true,
            html: capturarGrafico('[data-grafico="comparacao"]', {
              larguraAlvo: LARGURA_PAPEL_METADE,
              alturaMax: 230,
            }),
          },
          {
            titulo: 'Evolução mensal (valores)',
            html: tabelaHtml(
              [
                { titulo: 'Mês' },
                { titulo: 'Receitas', alinhar: 'direita' },
                { titulo: 'Despesas', alinhar: 'direita' },
                { titulo: 'Lucro', alinhar: 'direita' },
              ],
              dadosMensais.map((m) => [
                m.mes,
                formatCurrency(m.receitas),
                formatCurrency(m.despesas),
                formatCurrency(m.lucro),
              ])
            ),
          },
          // Detalhamento: quem pagou, quem deve e com o que se gastou. Largura
          // cheia — seis colunas não cabem em meia A4 — e tabelas inteiras, não
          // o top 5: é o que o relatório existe para responder.
          {
            titulo: 'Receitas por cliente',
            descricao: `Quem pagou e quem ainda deve · ${qtd(lancReceitas.length, 'parcela', 'parcelas')} de ${qtd(nGrupos(lancReceitas, 'cliente'), 'cliente', 'clientes')}`,
            html: tabelaGrupos('receita', 'Cliente', lancReceitas, 'cliente'),
          },
          {
            titulo: 'Receitas por produto',
            descricao: qtd(nGrupos(lancReceitas, 'produto'), 'produto', 'produtos'),
            html: tabelaGrupos('receita', 'Produto', lancReceitas, 'produto'),
          },
          {
            titulo: 'Despesas por categoria',
            descricao: `Com o que foi gasto e o que falta pagar · ${qtd(lancDespesas.length, 'parcela', 'parcelas')} em ${qtd(nGrupos(lancDespesas, 'categoria'), 'categoria', 'categorias')}`,
            html: tabelaGrupos('despesa', 'Categoria', lancDespesas, 'categoria'),
          },
          {
            titulo: 'Despesas por descrição',
            descricao: qtd(nGrupos(lancDespesas, 'descricao'), 'descrição', 'descrições'),
            html: tabelaGrupos('despesa', 'Descrição', lancDespesas, 'descricao'),
          },
          {
            titulo: 'Receitas do período — parcela a parcela',
            descricao: notaCorte(lancReceitas.length),
            html: tabelaHtml(
              [
                { titulo: 'Vencimento', semQuebra: true },
                { titulo: 'Cliente' },
                { titulo: 'Produto', largura: '20%' },
                { titulo: 'Descrição', largura: '14%' },
                { titulo: 'Parcela', semQuebra: true },
                { titulo: 'Situação', semQuebra: true },
                { titulo: 'Valor', alinhar: 'direita' },
              ],
              ordenarPorVencimento(lancReceitas)
                .slice(0, LIMITE_LANCAMENTOS_PDF)
                .map((l) => [
                  formatDate(l.vencimento),
                  l.grupos.cliente,
                  l.grupos.produto,
                  descricaoSemCliente(l),
                  l.parcela ?? 'à vista',
                  situacaoPdf(l, 'receita'),
                  formatCurrency(l.valor),
                ])
            ),
          },
          {
            titulo: 'Despesas do período — parcela a parcela',
            descricao: notaCorte(lancDespesas.length),
            html: tabelaHtml(
              [
                { titulo: 'Vencimento', semQuebra: true },
                { titulo: 'Categoria' },
                { titulo: 'Descrição' },
                { titulo: 'Parcela', semQuebra: true },
                { titulo: 'Situação', semQuebra: true },
                { titulo: 'Valor', alinhar: 'direita' },
              ],
              ordenarPorVencimento(lancDespesas)
                .slice(0, LIMITE_LANCAMENTOS_PDF)
                .map((l) => [
                  formatDate(l.vencimento),
                  l.grupos.categoria,
                  l.descricao,
                  l.parcela ?? 'à vista',
                  situacaoPdf(l, 'despesa'),
                  formatCurrency(l.valor),
                ])
            ),
          },
        ],
        notaRodape:
          'Valores por data de vencimento das parcelas. "Realizado", "recebido" e "pago" são parcelas com status PAGO; ' +
          '"a vencer" são as pendentes dentro do prazo e "em atraso" as que venceram sem baixa — ' +
          'juntas, formam o "previsto" do mesmo período.',
      })
    } catch (erro: any) {
      toast.error(erro?.message || 'Não foi possível gerar o relatório.')
    } finally {
      setExportando(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
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
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={exportarPdf}
            isLoading={exportando}
            title="Gera um PDF com os números do período filtrado"
            data-tour="dash-exportar"
          >
            <FileDown className="w-4 h-4 mr-2" />
            Exportar PDF
          </Button>
        }
      />

      <div className="p-4 sm:p-6 space-y-6">
        {/* Big Numbers - Responsivos ao filtro */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6" data-tour="dash-kpis">
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
                  {`Margem: ${formatPercent(receitaTotal > 0 ? (lucroTotal / receitaTotal) * 100 : 0)}`}
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
                  {formatPercent(metricas.taxaInadimplencia)}
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
        <div data-tour="dash-periodo">
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
        </div>

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-tour="dash-graficos">
          {/* Gráfico de Evolução Mensal */}
          <Card>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Evolução Mensal</h3>
            <p className="text-xs text-gray-400 mb-4">Inclui parcelas pagas e a receber no período</p>
            <div data-grafico="evolucao-mensal" style={{ width: '100%', height: '300px' }}>
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
                  {/* Sem `padding` o primeiro e o último ponto encostam nas bordas:
                      o rótulo do primeiro cobre o eixo Y e o do último vaza para
                      fora da área desenhada (no PDF saía cortado no meio). */}
                  <XAxis dataKey="mes" stroke="#6B7280" style={{ fontSize: '12px' }} padding={{ left: 28, right: 28 }} />
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
                  />
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
            <div data-grafico="status-parcelas" style={{ width: '100%', height: '300px' }}>
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
          <Card className="lg:col-span-2">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Comparação Receitas vs Despesas</h3>
            <div data-grafico="comparacao" style={{ width: '100%', height: '300px' }}>
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

        </div>

        {/* Detalhamento — quem pagou e com o que foi gasto, lançamento a lançamento */}
        <div className="space-y-6" data-tour="dash-detalhamento">
          <DetalhamentoLancamentos tipo="receita" lancamentos={lancReceitas} periodo={periodoTexto} />
          <DetalhamentoLancamentos tipo="despesa" lancamentos={lancDespesas} periodo={periodoTexto} />
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
              <li>• <strong>Quem pagou / Com o que foi gasto:</strong> cada parcela do período, agrupada por cliente, produto, categoria ou descrição — clique num nome para ver os lançamentos dele</li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  )
}
