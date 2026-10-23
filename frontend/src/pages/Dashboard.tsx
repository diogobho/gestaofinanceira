import React, { useState, useMemo } from 'react'
import toast from 'react-hot-toast'
import { Header } from '@/components/layout'
import { Card, Spinner, Button } from '@/components/ui'
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
  AlertTriangle,
  FileDown
} from 'lucide-react'
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, Label
} from 'recharts'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { dashboardApi, clientsApi, parcelasApi } from '@/api'
import { useTermoCliente } from '@/hooks/useTermoCliente'
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
import { mapaParaImpressao, usePaletaViz } from './dashboard/contaazul/paleta'
import { periodoAnterior, usePeriodoNaUrl } from './dashboard/visaogeral/periodo'
import { BarraFiltros } from './dashboard/visaogeral/BarraFiltros'
import {
  filtrarDespesas,
  filtrarReceitas,
  filtroDeUmLado,
  opcoesDosFiltros,
  rotuloValor,
  ROTULO_FILTRO,
  useFiltrosNaUrl,
  type ChaveFiltro,
  type SituacaoFiltro,
} from './dashboard/visaogeral/filtros'
import { CartaoIndicador } from './dashboard/visaogeral/CartaoIndicador'
import { TabelaDoGrafico, TooltipGrafico } from './dashboard/visaogeral/graficoUi'
import { FluxoCaixaProjetado } from './dashboard/visaogeral/FluxoCaixaProjetado'
import { recorteFluxo, useFluxoCaixa, type Horizonte } from './dashboard/visaogeral/fluxoCaixa'
import { ResumoEscrito, frasesDoResumo, type DadosResumo } from './dashboard/visaogeral/ResumoEscrito'

/**
 * Números das RECEITAS de um período, calculados das parcelas.
 *
 * - Em atraso é o que não foi pago e venceu antes de hoje, pela data — o job
 *   que marca ATRASADO roda uma vez por dia, e a parcela de ontem ainda está
 *   PENDENTE até ele passar.
 * - Inadimplência olha só receitas: era a soma das parcelas atrasadas de
 *   receita E de despesa, então a conta que a própria empresa não pagou
 *   aparecia como cliente devendo.
 * - Cliente ativo é quem tem receita no período, não o total cadastrado.
 */
function indicadoresReceitas(parcelas: any[] | undefined, hojeISO: string) {
  let recebido = 0
  let aberto = 0
  let atrasado = 0
  let vencido = 0
  const clientes = new Set<string>()
  const clientesEmAtraso = new Set<string>()
  for (const p of parcelas ?? []) {
    const v = Number(p.valor) || 0
    const venceu = dataPura(p.data_vencimento) < hojeISO
    if (p.cliente_id) clientes.add(String(p.cliente_id))
    if (venceu) vencido += v
    if (p.status === 'PAGO') {
      recebido += v
    } else {
      aberto += v
      if (venceu) {
        atrasado += v
        if (p.cliente_id) clientesEmAtraso.add(String(p.cliente_id))
      }
    }
  }
  const faturamento = recebido + aberto
  return {
    faturamento,
    recebido,
    aberto,
    atrasado,
    taxaAtraso: vencido > 0 ? (atrasado / vencido) * 100 : 0,
    clientesAtivos: clientes.size,
    clientesEmAtraso: clientesEmAtraso.size,
    ticketMedio: clientes.size > 0 ? faturamento / clientes.size : 0,
  }
}

/** Totais das DESPESAS de um período, das parcelas (mesma regra da API: aberto = não pago). */
function indicadoresDespesas(parcelas: any[] | undefined) {
  let pago = 0
  let aberto = 0
  for (const p of parcelas ?? []) {
    const v = Number(p.valor) || 0
    if (p.status === 'PAGO') pago += v
    else aberto += v
  }
  return { total: pago + aberto, pago, aberto }
}

export const Dashboard: React.FC = () => {
  const { user } = useAuth()
  const { Cliente, Clientes, cliente, clientes } = useTermoCliente()
  const paleta = usePaletaViz()

  // Percentual em pt-BR. `toFixed` sempre devolve ponto decimal ("98.4%"), e o
  // relatório inteiro em volta usa vírgula (R$ 64.243,23) — o fallback do
  // cálculo de margem já era '0,0'.
  const formatPercent = (value: number) =>
    `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

  // Formata valores compactos para labels de gráfico (evita overflow)
  // Negativo vira "-R$ 1,5k" (o fluxo de caixa desce abaixo de zero).
  const formatCompact = (value: number) => {
    const sinal = value < 0 ? '-' : ''
    const v = Math.abs(value)
    const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
    if (v >= 1_000_000) return `${sinal}R$ ${num(v / 1_000_000)}M`
    if (v >= 1_000) return `${sinal}R$ ${num(v / 1_000)}k`
    return `${sinal}R$ ${v.toFixed(0)}`
  }

  // Período mora na URL (F5 e link reabrem no mesmo recorte) — ver `periodo.ts`.
  const periodo = usePeriodoNaUrl()
  const filtrosAtivos = useMemo(
    () => ({ data_ini: periodo.de, data_fim: periodo.ate, base: periodo.base }),
    [periodo.de, periodo.ate, periodo.base]
  )
  const anterior = useMemo(
    () => (periodo.comparar ? periodoAnterior({ de: periodo.de, ate: periodo.ate }) : null),
    [periodo.comparar, periodo.de, periodo.ate]
  )
  const filtrosAnteriores = anterior ? { data_ini: anterior.de, data_fim: anterior.ate, base: periodo.base } : {}

  // Cliente, produto, categoria, origem e situação — aplicados aqui, sobre as
  // parcelas já baixadas (ver `filtros.ts`).
  const filtros = useFiltrosNaUrl()
  const hojeISO = toInputDate(new Date())

  // A API do dashboard só entra com o "a receber daqui para frente", que não
  // segue período nem filtro. Os totais saem das parcelas, para obedecerem aos
  // filtros; a soma é a mesma que a API faria.
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
  const { data: receitasDoPeriodo } = useQuery({
    queryKey: ['parcelas-receitas-dash', filtrosAtivos],
    queryFn: () => parcelasApi.getParcelasReceitas(filtrosAtivos),
    placeholderData: keepPreviousData,
  })

  const { data: despesasDoPeriodo } = useQuery({
    queryKey: ['parcelas-despesas-dash', filtrosAtivos],
    queryFn: () => parcelasApi.getParcelasDespesas(filtrosAtivos),
    placeholderData: keepPreviousData,
  })

  // Período anterior, só para a comparação dos cartões. Sem `keepPreviousData`:
  // número velho com rótulo novo seria uma comparação errada; melhor sumir um instante.
  const { data: receitasAnterioresBrutas } = useQuery({
    queryKey: ['parcelas-receitas-dash', filtrosAnteriores],
    queryFn: () => parcelasApi.getParcelasReceitas(filtrosAnteriores),
    enabled: !!anterior,
  })

  const { data: despesasAnterioresBrutas } = useQuery({
    queryKey: ['parcelas-despesas-dash', filtrosAnteriores],
    queryFn: () => parcelasApi.getParcelasDespesas(filtrosAnteriores),
    enabled: !!anterior,
  })

  const opcoes = useMemo(
    () => opcoesDosFiltros(receitasDoPeriodo, despesasDoPeriodo),
    [receitasDoPeriodo, despesasDoPeriodo]
  )
  const parcelasReceitas = useMemo(
    () => (receitasDoPeriodo ? filtrarReceitas(receitasDoPeriodo, filtros.filtros, hojeISO) : undefined),
    [receitasDoPeriodo, filtros.filtros, hojeISO]
  )
  const parcelasDespesas = useMemo(
    () => (despesasDoPeriodo ? filtrarDespesas(despesasDoPeriodo, filtros.filtros, hojeISO) : undefined),
    [despesasDoPeriodo, filtros.filtros, hojeISO]
  )

  const { data: clients } = useQuery({
    queryKey: ['clients-dashboard'],
    queryFn: () => clientsApi.list()
  })

  /*
    O mês sai da data LITERAL da parcela. `new Date('2026-09-01T00:00:00.000Z')`
    no navegador em UTC-3 é 31/08 às 21h: toda parcela que vence no dia 1º
    caía no mês anterior do gráfico (12 de 666 parcelas na base em 09/2026).
  */
  const chaveMes = (v: unknown) => dataPura(v).slice(0, 7)
  // Por pagamento (caixa), o mês é o do dia em que foi pago.
  const dataDoMes = (p: any) => (periodo.base === 'pagamento' ? p.data_pagamento : p.data_vencimento)
  const nomeMes = (mesAno: string) => {
    const [a, m] = mesAno.split('-').map(Number)
    return new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
  }

  // Dados para gráfico de evolução mensal
  const dadosMensais = useMemo(() => {
    if (!parcelasReceitas || !parcelasDespesas) return []

    const meses: Record<string, { chave: string, mes: string, receitas: number, despesas: number, lucro: number }> = {}

    // Agrupar receitas por mês (inclui PENDENTE e ATRASADO para mostrar previsão)
    parcelasReceitas.forEach((parcela: any) => {
      const mesAno = chaveMes(dataDoMes(parcela))
      const mesNome = nomeMes(mesAno)

      if (!meses[mesAno]) {
        meses[mesAno] = { chave: mesAno, mes: mesNome, receitas: 0, despesas: 0, lucro: 0 }
      }
      // Mostra valor independente do status (realizadas + previstas)
      meses[mesAno].receitas += parseFloat(parcela.valor)
    })

    // Agrupar despesas por mês (inclui PENDENTE e ATRASADO para mostrar previsão)
    parcelasDespesas.forEach((parcela: any) => {
      const mesAno = chaveMes(dataDoMes(parcela))
      const mesNome = nomeMes(mesAno)

      if (!meses[mesAno]) {
        meses[mesAno] = { chave: mesAno, mes: mesNome, receitas: 0, despesas: 0, lucro: 0 }
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
  }, [parcelasReceitas, parcelasDespesas, periodo.base])


  const ind = useMemo(() => indicadoresReceitas(parcelasReceitas, hojeISO), [parcelasReceitas, hojeISO])
  const indDesp = useMemo(() => indicadoresDespesas(parcelasDespesas), [parcelasDespesas])
  // O anterior passa pelos MESMOS filtros: "Asaas em setembro" compara com "Asaas em agosto".
  const indAnterior = useMemo(
    () =>
      anterior && receitasAnterioresBrutas
        ? indicadoresReceitas(filtrarReceitas(receitasAnterioresBrutas, filtros.filtros, hojeISO), hojeISO)
        : null,
    [anterior, receitasAnterioresBrutas, filtros.filtros, hojeISO]
  )
  const indDespAnterior = useMemo(
    () =>
      anterior && despesasAnterioresBrutas
        ? indicadoresDespesas(filtrarDespesas(despesasAnterioresBrutas, filtros.filtros, hojeISO))
        : null,
    [anterior, despesasAnterioresBrutas, filtros.filtros, hojeISO]
  )
  const semResultado = filtroDeUmLado(filtros.filtros)
  const caixa = periodo.base === 'pagamento'

  // Fluxo de caixa previsto: sempre de hoje até 90 dias, com os mesmos filtros.
  const { dias: diasFluxo } = useFluxoCaixa(filtros.filtros)
  const [horizonte, setHorizonte] = useState<Horizonte>(30)

  // Clique no gráfico filtra a página: um mês vira o período; uma fatia, a situação.
  // recharts 3: o clique traz só a posição (`activeIndex`), não mais o `activePayload`.
  const filtrarMes = (estado: any) => {
    const chave: string | undefined = dadosMensais[Number(estado?.activeIndex)]?.chave
    if (!chave) return
    const [a, m] = chave.split('-').map(Number)
    periodo.escolherDatas(toInputDate(new Date(a, m - 1, 1)), toInputDate(new Date(a, m, 0)))
  }

  /*
    Situação das receitas, em DINHEIRO. A pizza antiga contava parcelas e
    misturava receita com despesa: uma parcela de R$ 10 pesava o mesmo que uma
    de R$ 10 mil, e uma conta a pagar aparecia como "atrasada" ao lado do que os
    clientes devem.
  */
  const dadosStatus = useMemo(
    () =>
      [
        { name: 'Recebido', situacao: 'pago' as SituacaoFiltro, value: ind.recebido, color: paleta.quitado },
        { name: 'A vencer', situacao: 'a-vencer' as SituacaoFiltro, value: ind.aberto - ind.atrasado, color: paleta.aVencer },
        { name: 'Em atraso', situacao: 'atraso' as SituacaoFiltro, value: ind.atrasado, color: paleta.atrasado },
      ].filter((item) => item.value > 0.005),
    [ind, paleta]
  )

  // Detalhamento — quem pagou / com o que foi gasto. Mesmas parcelas, mesmo período.
  const lancReceitas = useMemo(() => normalizarReceitas(parcelasReceitas), [parcelasReceitas])
  const lancDespesas = useMemo(() => normalizarDespesas(parcelasDespesas), [parcelasDespesas])

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

  // "Cliente: Maria · Origem: Asaas" — vai para o PDF junto do período.
  const filtrosTexto = (Object.keys(filtros.filtros) as ChaveFiltro[])
    .map((c) => `${c === 'cliente' ? Cliente : ROTULO_FILTRO[c]}: ${rotuloValor(c, filtros.filtros[c]!)}`)
    .join(' · ')

  // O mesmo resumo em frases vai para a tela (topo) e para o PDF.
  const fluxo30 = diasFluxo ? recorteFluxo(diasFluxo, 30) : null
  const dadosResumo: DadosResumo = {
    periodoTexto,
    filtrosTexto,
    base: periodo.base,
    faturamento: ind.faturamento,
    recebido: ind.recebido,
    aReceber: ind.aberto,
    despesas: indDesp.total,
    resultado: ind.faturamento - indDesp.total,
    semResultado,
    faturamentoAnterior: indAnterior?.faturamento ?? null,
    despesasAnteriores: indDespAnterior?.total ?? null,
    atrasado: ind.atrasado,
    clientesEmAtraso: ind.clientesEmAtraso,
    termoCliente: [cliente, clientes],
    proximos30: fluxo30 && { entradas: fluxo30.entradas, saidas: fluxo30.saidas },
  }

  const exportarPdf = async () => {
    setExportando(true)
    try {
      const receitasReal = ind.recebido
      const receitasPrev = ind.aberto
      const receitasTot = ind.faturamento
      const despesasReal = indDesp.pago
      const despesasPrev = indDesp.aberto
      const despesasTot = indDesp.total
      const lucro = receitasTot - despesasTot
      const margem = formatPercent(receitasTot > 0 ? (lucro / receitasTot) * 100 : 0)

      const de = filtrosAtivos.data_ini
      const ate = filtrosAtivos.data_fim

      const totalStatus = dadosStatus.reduce((acc, s) => acc + s.value, 0)
      // Gráfico copiado da tela no tema escuro leva eixo e grade claros demais para o papel.
      const mapaCores = mapaParaImpressao(paleta)

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
        periodo:
          `<strong>Período:</strong> ${escaparHtml(periodoTexto)}` +
          (filtrosTexto ? `<br><strong>Filtros:</strong> ${escaparHtml(filtrosTexto)}` : ''),
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
            rotulo: 'Resultado',
            valor: semResultado ? '—' : formatCurrency(lucro),
            detalhe: semResultado ? 'Não se aplica a este filtro' : `Margem: ${margem}`,
            cor: semResultado || lucro >= 0 ? '#1d4ed8' : '#b91c1c',
          },
          {
            rotulo: 'Em atraso',
            valor: formatCurrency(ind.atrasado),
            detalhe: `${formatPercent(ind.taxaAtraso)} do que já venceu · ${ind.clientesEmAtraso} ${ind.clientesEmAtraso === 1 ? cliente : clientes}`,
            cor: ind.atrasado > 0 ? '#b91c1c' : '#047857',
          },
          {
            rotulo: `${Clientes} ativos`,
            valor: String(ind.clientesAtivos),
            detalhe: `Com receita no período · ${clients?.length || 0} cadastrados`,
          },
          {
            rotulo: 'Ticket médio',
            valor: ind.clientesAtivos > 0 ? formatCurrency(ind.ticketMedio) : '—',
            detalhe: `Faturamento por ${cliente} ativo`,
          },
        ],
        blocos: [
          {
            titulo: 'Resumo',
            html: `<p style="margin:0;line-height:1.5">${escaparHtml(frasesDoResumo(dadosResumo).join(' '))}</p>`,
          },
          // Sem nada a vencer em 90 dias, a tabela seria só zeros: fica de fora.
          ...(diasFluxo && recorteFluxo(diasFluxo, 90).serie.some((d) => d.entradas > 0 || d.saidas > 0)
            ? [
                {
                  titulo: 'Fluxo de caixa previsto',
                  descricao: 'De hoje em diante, sem o saldo do banco e sem receitas em atraso',
                  html: tabelaHtml(
                    [
                      { titulo: 'Horizonte' },
                      { titulo: 'Vai entrar', alinhar: 'direita' as const },
                      { titulo: 'Vai sair', alinhar: 'direita' as const },
                      { titulo: 'Sobra', alinhar: 'direita' as const },
                    ],
                    ([30, 60, 90] as const).map((h) => {
                      const r = recorteFluxo(diasFluxo!, h)
                      return [`${h} dias`, formatCurrency(r.entradas), formatCurrency(r.saidas), formatCurrency(r.saldo)]
                    })
                  ),
                },
              ]
            : []),
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
            titulo: 'Situação das receitas',
            descricao: `${formatCurrency(totalStatus)} no período`,
            metade: true,
            html: listaValoresHtml(
              dadosStatus.map((s) => ({
                rotulo: s.name,
                valor: `${formatCurrency(s.value)} (${totalStatus > 0 ? ((s.value / totalStatus) * 100).toFixed(0) : 0}%)`,
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
              mapaCores,
              larguraAlvo: LARGURA_PAPEL_METADE,
              alturaMax: 230,
            }),
          },
          {
            titulo: 'Receitas vs Despesas',
            metade: true,
            html: capturarGrafico('[data-grafico="comparacao"]', {
              mapaCores,
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
                { titulo: 'Resultado', alinhar: 'direita' },
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
            titulo: `Receitas por ${cliente}`,
            descricao: `Quem pagou e quem ainda deve · ${qtd(lancReceitas.length, 'parcela', 'parcelas')} de ${qtd(nGrupos(lancReceitas, 'cliente'), cliente, clientes)}`,
            html: tabelaGrupos('receita', Cliente, lancReceitas, 'cliente'),
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
                { titulo: Cliente },
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
          periodo.base === 'pagamento'
            ? 'Valores pelo dia em que cada parcela foi paga (regime de caixa): só entram parcelas pagas.'
            : 'Valores por data de vencimento das parcelas. "Realizado", "recebido" e "pago" são parcelas com status PAGO; ' +
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
  const receitasRealizadas = ind.recebido
  const receitasPrevistas = ind.aberto
  const receitaTotal = ind.faturamento
  const despesasRealizadas = indDesp.pago
  const despesasPrevistas = indDesp.aberto
  const despesaTotal = indDesp.total
  const lucroTotal = receitaTotal - despesaTotal

  // Comparação só quando o período anterior já chegou — nunca contra zero provisório.
  const antDesp = indDespAnterior
  const anteriorTexto = anterior ? `${formatDate(anterior.de!)} a ${formatDate(anterior.ate!)}` : undefined

  const eixoTick = { fontSize: 12, fill: paleta.eixo }
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

      <BarraFiltros periodo={periodo} filtros={filtros} opcoes={opcoes} anteriorTexto={anteriorTexto} />

      <div className="p-4 sm:p-6 space-y-6">
        <ResumoEscrito dados={dadosResumo} />

        {/* Seis números, sem repetição: o "a receber" aparecia três vezes e o
            total de despesas duas, em 14 cartões. */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4" data-tour="dash-kpis">
          <CartaoIndicador
            titulo="Faturamento"
            valor={formatCurrency(receitaTotal)}
            corValor="text-emerald-700 dark:text-emerald-400"
            detalhe={caixa ? 'O que entrou, pelo dia do pagamento' : <>{formatCurrency(receitasRealizadas)} recebido · {formatCurrency(receitasPrevistas)} a receber</>}
            tendencia={{ valores: dadosMensais.map((m) => m.receitas), cor: paleta.receber }}
            comparacao={indAnterior && { atual: receitaTotal, anterior: indAnterior.faturamento, bomQuandoSobe: true }}
            icone={<TrendingUp className="w-5 h-5" />}
            corIcone="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
          />
          <CartaoIndicador
            titulo="Despesas"
            valor={formatCurrency(despesaTotal)}
            corValor="text-red-700 dark:text-red-400"
            detalhe={caixa ? 'O que saiu, pelo dia do pagamento' : <>{formatCurrency(despesasRealizadas)} pago · {formatCurrency(despesasPrevistas)} a pagar</>}
            tendencia={{ valores: dadosMensais.map((m) => m.despesas), cor: paleta.pagar }}
            comparacao={antDesp && { atual: despesaTotal, anterior: antDesp.total, bomQuandoSobe: false }}
            icone={<TrendingDown className="w-5 h-5" />}
            corIcone="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
          />
          <CartaoIndicador
            titulo="Resultado"
            valor={semResultado ? '—' : formatCurrency(lucroTotal)}
            corValor={semResultado || lucroTotal >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-red-700 dark:text-red-400'}
            detalhe={
              semResultado
                ? `Não se aplica: ${cliente} e produto só filtram receitas, e categoria só despesas`
                : `Margem de ${formatPercent(receitaTotal > 0 ? (lucroTotal / receitaTotal) * 100 : 0)}`
            }
            comparacao={
              !semResultado && indAnterior && antDesp
                ? {
                    atual: lucroTotal,
                    anterior: indAnterior.faturamento - antDesp.total,
                    bomQuandoSobe: true,
                    modo: 'diferenca',
                    anteriorVazio: indAnterior.faturamento === 0 && antDesp.total === 0,
                  }
                : null
            }
            tendencia={semResultado ? undefined : { valores: dadosMensais.map((m) => m.lucro), cor: paleta.saldo }}
            icone={<DollarSign className="w-5 h-5" />}
            corIcone="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
          />
          <CartaoIndicador
            titulo="Em atraso"
            valor={caixa ? '—' : formatCurrency(ind.atrasado)}
            corValor={caixa ? undefined : ind.atrasado > 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}
            detalhe={
              caixa
                ? 'Por pagamento só entra o que já foi pago — troque para Vencimento para ver o atraso'
                : ind.atrasado > 0
                ? <>{formatPercent(ind.taxaAtraso)} do que já venceu · {ind.clientesEmAtraso} {ind.clientesEmAtraso === 1 ? cliente : clientes}</>
                : 'Nenhuma receita vencida sem pagamento'
            }
            icone={<AlertTriangle className="w-5 h-5" />}
            corIcone="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
          />
          <CartaoIndicador
            titulo={`${Clientes} ativos`}
            valor={String(ind.clientesAtivos)}
            detalhe={`Com receita no período · ${clients?.length || 0} cadastrados`}
            comparacao={indAnterior && { atual: ind.clientesAtivos, anterior: indAnterior.clientesAtivos, bomQuandoSobe: true, formatar: String }}
            icone={<Users className="w-5 h-5" />}
            corIcone="bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
          />
          <CartaoIndicador
            titulo="Ticket médio"
            valor={ind.clientesAtivos > 0 ? formatCurrency(ind.ticketMedio) : '—'}
            detalhe={`Faturamento por ${cliente} ativo`}
            comparacao={
              indAnterior && indAnterior.clientesAtivos > 0 && ind.clientesAtivos > 0
                ? { atual: ind.ticketMedio, anterior: indAnterior.ticketMedio, bomQuandoSobe: true }
                : null
            }
            icone={<Wallet className="w-5 h-5" />}
            corIcone="bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
          />
        </div>

        <div data-tour="dash-fluxo">
          <FluxoCaixaProjetado
            dias={diasFluxo}
            paleta={paleta}
            horizonte={horizonte}
            onHorizonte={setHorizonte}
            formatCompact={formatCompact}
          />
        </div>

        {/* A receber daqui para frente — não segue o filtro de período */}
        {dashboardData?.aReceberFuturo && dashboardData.aReceberFuturo.total > 0 && (
          <Card>
            <h2 className="text-sm text-gray-600 dark:text-gray-300">A receber daqui para frente</h2>
            <p className="text-2xl font-bold text-amber-600 mt-1">
              {formatCurrency(dashboardData.aReceberFuturo.total)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {dashboardData.aReceberFuturo.parcelas} parcelas a vencer, de hoje em diante. Este número não muda com o período nem com os filtros.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="A receber por mês">
              {dashboardData.aReceberFuturo.porMes.map((m) => {
                const [a, mm] = m.mes.split('-').map(Number)
                const nome = new Date(a, mm - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
                return (
                  <li key={m.mes} className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-xs text-gray-700 dark:text-gray-200">
                    <span className="capitalize">{nome}</span>: <strong>{formatCurrency(m.valor)}</strong>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-tour="dash-graficos">
          {/* Evolução mensal: duas áreas e a linha do resultado, no MESMO eixo */}
          <Card className="p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Evolução Mensal</h3>
            <p className="text-xs text-gray-400 mb-4">
              {periodo.base === 'pagamento' ? 'O que entrou e saiu em cada mês.' : 'Parcelas pagas e a receber de cada mês.'} Clique num mês para ver só ele.
            </p>
            <div
              data-grafico="evolucao-mensal"
              style={{ width: '100%', height: '300px' }}
              role="img"
              aria-label="Receitas, despesas e resultado mês a mês. Os números estão na tabela logo abaixo."
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dadosMensais} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} onClick={filtrarMes} style={{ cursor: 'pointer' }}>
                  <defs>
                    <linearGradient id="colorReceitas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={paleta.receber} stopOpacity={0.35}/>
                      <stop offset="100%" stopColor={paleta.receber} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorDespesas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={paleta.pagar} stopOpacity={0.3}/>
                      <stop offset="100%" stopColor={paleta.pagar} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={paleta.grid} vertical={false} />
                  <XAxis dataKey="mes" stroke={paleta.eixo} tick={eixoTick} padding={{ left: 16, right: 16 }} />
                  <YAxis stroke={paleta.eixo} tick={eixoTick} tickFormatter={(v) => formatCompact(Number(v))} width={64} />
                  <ReferenceLine y={0} stroke={paleta.eixo} />
                  <Tooltip
                    cursor={{ stroke: paleta.eixo, strokeDasharray: '3 3' }}
                    content={(p: any) => <TooltipGrafico {...p} paleta={paleta} />}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: paleta.eixo }} />
                  <Area type="monotone" dataKey="receitas" name="Receitas" stroke={paleta.receber} strokeWidth={2} fill="url(#colorReceitas)"
                    dot={{ r: 3, fill: paleta.receber, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 2, stroke: paleta.tooltipBg }} />
                  <Area type="monotone" dataKey="despesas" name="Despesas" stroke={paleta.pagar} strokeWidth={2} fill="url(#colorDespesas)"
                    dot={{ r: 3, fill: paleta.pagar, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 2, stroke: paleta.tooltipBg }} />
                  <Area type="monotone" dataKey="lucro" name="Resultado" stroke={paleta.saldo} strokeWidth={2} strokeDasharray="5 3" fill="transparent"
                    dot={{ r: 3, fill: paleta.saldo, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 2, stroke: paleta.tooltipBg }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <TabelaDoGrafico
              legenda="Receitas, despesas e resultado por mês"
              linhas={dadosMensais}
              colunas={[
                { titulo: 'Mês', valor: (m) => m.mes },
                { titulo: 'Receitas', valor: (m) => formatCurrency(m.receitas), numero: true },
                { titulo: 'Despesas', valor: (m) => formatCurrency(m.despesas), numero: true },
                { titulo: 'Resultado', valor: (m) => formatCurrency(m.lucro), numero: true },
              ]}
            />
          </Card>

          {/* Situação das receitas, em dinheiro: rosca com o total no centro */}
          <Card className="p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Situação das Receitas</h3>
            <p className="text-xs text-gray-400 mb-4">Quanto do faturamento do período já entrou, ainda vai vencer ou está em atraso. Clique numa parte para filtrar por ela.</p>
            <div
              data-grafico="status-parcelas"
              style={{ width: '100%', height: '280px' }}
              role="img"
              aria-label={dadosStatus.map((d) => `${d.name}: ${formatCurrency(d.value)}`).join('; ') || 'Nenhuma receita no período'}
            >
              {dadosStatus.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">Nenhuma receita no período</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dadosStatus}
                      cx="50%"
                      cy="45%"
                      innerRadius="58%"
                      outerRadius="80%"
                      paddingAngle={dadosStatus.length > 1 ? 2 : 0}
                      cornerRadius={4}
                      dataKey="value"
                      stroke={paleta.tooltipBg}
                      strokeWidth={2}
                      style={{ cursor: 'pointer' }}
                      onClick={(_fatia: any, i: number) => {
                        const sit = dadosStatus[i]?.situacao
                        if (sit) filtros.definir('situacao', sit)
                      }}
                    >
                      {dadosStatus.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                      <Label
                        position="center"
                        content={({ viewBox }: any) => {
                          const { cx, cy } = viewBox ?? {}
                          if (cx == null) return null
                          return (
                            <g>
                              <text x={cx} y={cy - 8} textAnchor="middle" style={{ fontSize: 11, fill: paleta.eixo }}>Faturamento</text>
                              <text x={cx} y={cy + 12} textAnchor="middle" style={{ fontSize: 16, fontWeight: 700, fill: paleta.tooltipTexto }}>
                                {formatCompact(ind.faturamento)}
                              </text>
                            </g>
                          )
                        }}
                      />
                    </Pie>
                    <Tooltip content={(p: any) => <TooltipGrafico {...p} paleta={paleta} titulo={(d) => d?.name ?? ''} />} />
                    {/* A cor não fala sozinha (verde × vermelho somem no daltonismo):
                        a legenda leva o nome e o valor de cada fatia. */}
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: paleta.eixo }}
                      formatter={(value, entry: any) => `${value}: ${formatCurrency(entry.payload.value)}`} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <TabelaDoGrafico
              legenda="Situação das receitas do período"
              linhas={dadosStatus}
              colunas={[
                { titulo: 'Situação', valor: (d) => d.name },
                { titulo: 'Valor', valor: (d) => formatCurrency(d.value), numero: true },
                { titulo: 'Parte', valor: (d) => formatPercent(ind.faturamento > 0 ? (d.value / ind.faturamento) * 100 : 0), numero: true },
              ]}
            />
          </Card>
        </div>

        {/* Receitas × despesas lado a lado, por mês */}
        <Card className="p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Comparação Receitas vs Despesas</h3>
          <p className="text-xs text-gray-400 mb-4">Clique num mês para ver só ele.</p>
          <div
            data-grafico="comparacao"
            style={{ width: '100%', height: '300px' }}
            role="img"
            aria-label="Receitas e despesas lado a lado, mês a mês. Os números estão na tabela do gráfico de Evolução Mensal."
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosMensais} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%"
                onClick={filtrarMes} style={{ cursor: 'pointer' }}>
                <CartesianGrid strokeDasharray="3 3" stroke={paleta.grid} vertical={false} />
                <XAxis dataKey="mes" stroke={paleta.eixo} tick={eixoTick} />
                <YAxis stroke={paleta.eixo} tick={eixoTick} tickFormatter={(v) => formatCompact(Number(v))} width={64} />
                <Tooltip cursor={{ fill: paleta.grid, opacity: 0.5 }} content={(p: any) => <TooltipGrafico {...p} paleta={paleta} />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: paleta.eixo }} />
                <Bar dataKey="receitas" fill={paleta.receber} name="Receitas" radius={[4, 4, 0, 0]} maxBarSize={48} />
                <Bar dataKey="despesas" fill={paleta.pagar} name="Despesas" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

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
              <li>• <strong>Faturamento:</strong> soma das parcelas de receita com vencimento dentro do período (recebidas + a receber)</li>
              <li>• <strong>Resultado:</strong> faturamento menos despesas do período</li>
              <li>• <strong>Em atraso:</strong> receitas que já venceram e não foram pagas — só o que os {clientes} devem, sem as contas a pagar</li>
              <li>• <strong>{Clientes} ativos:</strong> {clientes} com alguma receita no período</li>
              <li>• <strong>Ticket médio:</strong> faturamento dividido pelos {clientes} ativos</li>
              <li>• <strong>Comparação:</strong> cada número mostra quanto subiu ou caiu em relação ao período anterior do mesmo tamanho (setembro compara com agosto)</li>
              <li>• <strong>Resumo do período:</strong> os mesmos números dos cartões, escritos em frases</li>
              <li>• <strong>Vencimento ou Pagamento:</strong> por vencimento entra o que venceu no período, pago ou não; por pagamento entra só o que de fato foi pago, pelo dia do pagamento (o caixa)</li>
              <li>• <strong>Fluxo de caixa previsto:</strong> o que vai entrar e sair de hoje até 30, 60 ou 90 dias e quanto sobra, dia a dia. Não inclui o saldo do banco nem receitas em atraso, e segue os filtros, mas não o período</li>
              <li>• <strong>Tabelas:</strong> cada gráfico tem "Ver os números em tabela", que o leitor de tela também lê</li>
              <li>• <strong>Filtros:</strong> {cliente} e produto recortam só as receitas; categoria, só as despesas (com eles o Resultado não se aplica); origem e situação valem para as duas. Clicar num mês do gráfico mostra só aquele mês, e clicar numa parte da pizza filtra pela situação</li>
              <li>• <strong>Filtro padrão:</strong> últimos 3 meses, inteiros. O período fica no endereço da página: recarregar ou mandar o link mantém o mesmo recorte</li>
              <li>• <strong>Quem pagou / Com o que foi gasto:</strong> cada parcela do período, agrupada por {cliente}, produto, categoria ou descrição — clique num nome para ver os lançamentos dele</li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  )
}
