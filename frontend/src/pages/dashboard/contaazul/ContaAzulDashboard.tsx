import React, { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Download,
  FileDown,
  RefreshCw,
  Layers,
  Scale,
  ServerCrash,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, Spinner } from '@/components/ui'
import { formatCurrency } from '@/utils'
import { useAuth } from '@/contexts/AuthContext'
import { gerarAssinaturaPadrao } from '@/utils/assinaturaEmail'
import {
  capturarGrafico,
  escaparHtml,
  exportarRelatorioPdf,
  tabelaHtml,
  type BlocoRelatorio,
} from '@/utils/relatorioPdf'
import { contaazulApi, type EventoFinanceiro } from '@/api/contaazul'
import { mapaParaImpressao, usePaletaViz, type PaletaViz } from './paleta'
import { FiltrosContaAzul } from './FiltrosContaAzul'
import {
  FILTROS_VAZIOS,
  ROTULO_SITUACAO,
  aplicarFiltros,
  faixasDeAtraso,
  opcoesDe,
  ranking,
  resumirPorConexao,
  resumirPorTipo,
  serieMensal,
  situacaoDoItem,
  taxaInadimplencia,
  valorEmAberto,
  type BaseData,
  type FiltrosContaAzul as Filtros,
} from './agregacoes'

/* ---------------------------------------------------------------- período --- */

type Preset = 'mes' | 'mesPassado' | '3meses' | '6meses' | 'ano' | 'personalizado'

const PRESETS: { chave: Preset; rotulo: string }[] = [
  { chave: 'mes', rotulo: 'Este mês' },
  { chave: 'mesPassado', rotulo: 'Mês passado' },
  { chave: '3meses', rotulo: '3 meses' },
  { chave: '6meses', rotulo: '6 meses' },
  { chave: 'ano', rotulo: 'Este ano' },
]

/** YYYY-MM-DD montado com os componentes locais — toISOString viraria o dia em UTC-3. */
function iso(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function intervaloDoPreset(preset: Preset): { de: string; ate: string } {
  const hoje = new Date()
  const a = hoje.getFullYear()
  const m = hoje.getMonth()
  const ultimoDia = (ano: number, mes: number) => new Date(ano, mes + 1, 0).getDate()

  switch (preset) {
    case 'mes':
      return { de: iso(a, m, 1), ate: iso(a, m, ultimoDia(a, m)) }
    case 'mesPassado': {
      const d = new Date(a, m - 1, 1)
      return {
        de: iso(d.getFullYear(), d.getMonth(), 1),
        ate: iso(d.getFullYear(), d.getMonth(), ultimoDia(d.getFullYear(), d.getMonth())),
      }
    }
    case '3meses': {
      const d = new Date(a, m - 2, 1)
      return { de: iso(d.getFullYear(), d.getMonth(), 1), ate: iso(a, m, ultimoDia(a, m)) }
    }
    case '6meses': {
      const d = new Date(a, m - 5, 1)
      return { de: iso(d.getFullYear(), d.getMonth(), 1), ate: iso(a, m, ultimoDia(a, m)) }
    }
    case 'ano':
    default:
      return { de: iso(a, 0, 1), ate: iso(a, 11, 31) }
  }
}

/* ------------------------------------------------------------- auxiliares --- */

/** Percentual em pt-BR: `toFixed` devolve ponto, e o painel inteiro usa vírgula. */
const formatPercent = (valor: number) =>
  `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`


function compacto(valor: number): string {
  const abs = Math.abs(valor)
  const sinal = valor < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sinal}R$ ${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sinal}R$ ${(abs / 1_000).toFixed(0)}k`
  return `${sinal}R$ ${abs.toFixed(0)}`
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' sem passar por Date (evita off-by-one em UTC-3). */
function dataBR(valor: string | null): string {
  if (!valor) return '—'
  const [a, m, d] = valor.split('-')
  return `${d}/${m}/${a}`
}

const CorSituacao: Record<string, keyof PaletaViz> = {
  quitado: 'quitado',
  aVencer: 'aVencer',
  atrasado: 'atrasado',
  perdido: 'perdido',
}

/** Tooltip própria — a padrão do recharts não segue o tema escuro. */
const TooltipViz: React.FC<any> = ({ active, payload, label, paleta, total }) => {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-lg border px-3 py-2 text-sm shadow-lg"
      style={{
        background: paleta.tooltipBg,
        borderColor: paleta.tooltipBorda,
        color: paleta.tooltipTexto,
      }}
    >
      {label && <p className="mb-1 font-semibold">{label}</p>}
      {payload.map((p: any) => (
        <div key={p.dataKey ?? p.name} className="flex items-center gap-2 whitespace-nowrap">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ background: p.color ?? p.fill }}
          />
          <span className="opacity-80">{p.name}:</span>
          <span className="font-semibold">{formatCurrency(Number(p.value))}</span>
          {total > 0 && (
            <span className="opacity-60">({formatPercent((Number(p.value) / total) * 100)})</span>
          )}
        </div>
      ))}
    </div>
  )
}

/** Cartão de indicador — mesma linguagem do MetricCard, com espaço para o detalhe. */
const Indicador: React.FC<{
  titulo: string
  valor: string
  detalhe?: React.ReactNode
  icone: React.ElementType
  cor: string
  fundo: string
}> = ({ titulo, valor, detalhe, icone: Icone, cor, fundo }) => (
  <Card className="p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-sm font-medium text-gray-600 dark:text-gray-400">{titulo}</p>
        <p className="truncate text-2xl font-bold text-gray-900 dark:text-gray-100">{valor}</p>
        {detalhe && (
          <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{detalhe}</div>
        )}
      </div>
      <div className={`rounded-full p-2.5 ${fundo}`}>
        <Icone className={`h-5 w-5 ${cor}`} />
      </div>
    </div>
  </Card>
)

/* -------------------------------------------------------------- principal --- */

export const ContaAzulDashboard: React.FC = () => {
  const paleta = usePaletaViz()
  const { user } = useAuth()

  const [preset, setPreset] = useState<Preset>('ano')
  const [intervalo, setIntervalo] = useState(() => intervaloDoPreset('ano'))
  const [filtros, setFiltros] = useState<Filtros>({ ...FILTROS_VAZIOS })
  const [baseData, setBaseData] = useState<BaseData>('vencimento')
  const [ordem, setOrdem] = useState<{ campo: keyof EventoFinanceiro; asc: boolean }>({
    campo: 'vencimento',
    asc: true,
  })
  const [pagina, setPagina] = useState(1)
  const POR_PAGINA = 25

  const queryClient = useQueryClient()
  const [atualizando, setAtualizando] = useState(false)

  const chaveQuery = ['contaazul-dashboard', intervalo.de, intervalo.ate]
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: chaveQuery,
    queryFn: () => contaazulApi.dados(intervalo.de, intervalo.ate),
    staleTime: 5 * 60 * 1000,
  })

  /**
   * Descarta o cache do servidor e já grava o resultado no cache do react-query:
   * um `refetch()` depois do forçado traria os mesmos 500+ KB de novo.
   */
  const atualizar = async () => {
    setAtualizando(true)
    try {
      const frescos = await contaazulApi.dados(intervalo.de, intervalo.ate, true)
      queryClient.setQueryData(chaveQuery, frescos)
    } finally {
      setAtualizando(false)
    }
  }

  const itens = data?.itens ?? []
  const hoje = data?.hoje ?? intervalo.ate

  const opcoes = useMemo(
    () => ({
      categoria: opcoesDe(itens, 'categoria'),
      centroCusto: opcoesDe(itens, 'centro_custo'),
      parte: opcoesDe(itens, 'parte'),
    }),
    [itens]
  )

  const filtrados = useMemo(() => aplicarFiltros(itens, filtros), [itens, filtros])
  const resumo = useMemo(() => resumirPorTipo(filtrados), [filtrados])

  /** Contas consolidadas: as que responderam entram no filtro; as que falharam viram aviso. */
  const conexoes = data?.conexoes ?? []
  const conexoesOk = useMemo(() => conexoes.filter((c) => !c.erro), [conexoes])
  const conexoesComErro = useMemo(() => conexoes.filter((c) => c.erro), [conexoes])
  const porConexao = useMemo(() => resumirPorConexao(filtrados), [filtrados])
  const mensal = useMemo(() => serieMensal(filtrados, baseData), [filtrados, baseData])

  const inadimplencia = useMemo(() => {
    const receber = filtrados.filter((i) => i.tipo === 'receber')
    return {
      faixas: faixasDeAtraso(receber),
      taxa: taxaInadimplencia(receber, hoje),
      devedores: ranking(
        receber.filter((i) => i.dias_atraso > 0 || i.status === 'LOST'),
        'parte',
        valorEmAberto,
        8
      ),
    }
  }, [filtrados, hoje])

  const rankingReceber = useMemo(
    () => ranking(filtrados.filter((i) => i.tipo === 'receber'), 'categoria', (i) => i.total),
    [filtrados]
  )
  const rankingPagar = useMemo(
    () => ranking(filtrados.filter((i) => i.tipo === 'pagar'), 'categoria', (i) => i.total),
    [filtrados]
  )

  /** Composição por situação — uma barra empilhada por tipo. */
  const composicao = useMemo(
    () =>
      (['receber', 'pagar'] as const)
        .filter((t) => filtros.tipos.includes(t))
        .map((t) => ({
          nome: t === 'receber' ? 'A receber' : 'A pagar',
          ...resumo[t],
        })),
    [resumo, filtros.tipos]
  )

  const tabela = useMemo(() => {
    const copia = [...filtrados]
    const { campo, asc } = ordem
    copia.sort((a, b) => {
      const va = a[campo]
      const vb = b[campo]
      const cmp =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), 'pt-BR')
      return asc ? cmp : -cmp
    })
    return copia
  }, [filtrados, ordem])

  const totalPaginas = Math.max(1, Math.ceil(tabela.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const linhasPagina = tabela.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)

  const aplicarPreset = (p: Preset) => {
    setPreset(p)
    setIntervalo(intervaloDoPreset(p))
    setPagina(1)
  }

  const ordenarPor = (campo: keyof EventoFinanceiro) => {
    setOrdem((o) => ({ campo, asc: o.campo === campo ? !o.asc : true }))
    setPagina(1)
  }

  const exportarCSV = () => {
    const cabecalho = [
      'Tipo', 'Descrição', 'Cliente/Fornecedor', 'Categoria', 'Centro de custo',
      'Vencimento', 'Competência', 'Situação', 'Total', 'Pago', 'Em aberto', 'Dias em atraso',
    ]
    // Ponto e vírgula + vírgula decimal: é o que o Excel pt-BR abre sem reclamar.
    const escapar = (v: string) => `"${v.replace(/"/g, '""')}"`
    const numero = (n: number) => n.toFixed(2).replace('.', ',')

    const linhas = tabela.map((i) =>
      [
        i.tipo === 'receber' ? 'A receber' : 'A pagar',
        escapar(i.descricao),
        escapar(i.parte),
        escapar(i.categoria),
        escapar(i.centro_custo),
        dataBR(i.vencimento),
        dataBR(i.competencia),
        ROTULO_SITUACAO[situacaoDoItem(i)],
        numero(i.total),
        numero(i.pago),
        numero(valorEmAberto(i)),
        String(i.dias_atraso),
      ].join(';')
    )

    const csv = '﻿' + [cabecalho.join(';'), ...linhas].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `contaazul_${intervalo.de}_a_${intervalo.ate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ---------------------------------------------------------- relatório --- */

  // Cabeçalho do PDF é a assinatura salva em /gestao/perfil; sem ela, o padrão
  // montado com os dados da empresa.
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

  const [exportandoPdf, setExportandoPdf] = useState(false)

  /** Filtros ativos em texto — o PDF sai do contexto da tela e precisa dizer o recorte. */
  const descreverFiltros = (): string[] => {
    const partes: string[] = []
    if (filtros.conexoes.length > 0) {
      const nomes = conexoesOk
        .filter((c) => filtros.conexoes.includes(c.id))
        .map((c) => c.nome)
      partes.push(`Produto: ${nomes.join(', ') || filtros.conexoes.join(', ')}`)
    }
    if (filtros.tipos.length === 1) {
      partes.push(`Tipo: ${filtros.tipos[0] === 'receber' ? 'A receber' : 'A pagar'}`)
    }
    if (filtros.situacoes.length < 4) {
      partes.push(`Situação: ${filtros.situacoes.map((s) => ROTULO_SITUACAO[s]).join(', ')}`)
    }
    if (filtros.categorias.length > 0) partes.push(`Categoria: ${filtros.categorias.join(', ')}`)
    if (filtros.centrosCusto.length > 0) partes.push(`Centro de custo: ${filtros.centrosCusto.join(', ')}`)
    if (filtros.partes.length > 0) partes.push(`Cliente/Fornecedor: ${filtros.partes.join(', ')}`)
    if (filtros.busca.trim()) partes.push(`Busca: "${filtros.busca.trim()}"`)
    if (filtros.valorMin || filtros.valorMax) {
      partes.push(
        `Valor: ${filtros.valorMin ? formatCurrency(Number(filtros.valorMin)) : 'sem mínimo'} a ${
          filtros.valorMax ? formatCurrency(Number(filtros.valorMax)) : 'sem máximo'
        }`
      )
    }
    return partes
  }

  const LIMITE_LANCAMENTOS_PDF = 150

  const exportarPDF = async () => {
    setExportandoPdf(true)
    try {
      const mapaCores = mapaParaImpressao(paleta)
      const saldoPrevisto = resumo.receber.emAberto - resumo.pagar.emAberto
      const filtrosTexto = descreverFiltros()
      const situacoes = ['quitado', 'aVencer', 'atrasado', 'perdido'] as const

      const blocos: BlocoRelatorio[] = []

      if (conexoesComErro.length > 0) {
        blocos.push({
          titulo: 'Consolidado incompleto',
          descricao: 'Os números abaixo somam só as contas que responderam.',
          html: tabelaHtml(
            [{ titulo: 'Conta' }, { titulo: 'Erro' }],
            conexoesComErro.map((c) => [c.nome, c.erro ?? '—'])
          ),
        })
      }

      if (porConexao.length > 1) {
        blocos.push({
          titulo: 'Por produto',
          descricao: 'Mesmo período e mesmos filtros, separado por conta do Conta Azul',
          html: tabelaHtml(
            [
              { titulo: 'Produto' },
              { titulo: 'A receber em aberto', alinhar: 'direita' },
              { titulo: 'A pagar em aberto', alinhar: 'direita' },
              { titulo: 'Saldo previsto', alinhar: 'direita' },
              { titulo: 'Recebido', alinhar: 'direita' },
              { titulo: 'Pago', alinhar: 'direita' },
              { titulo: 'Títulos', alinhar: 'direita' },
            ],
            porConexao.map(({ nome, porTipo }) => [
              nome,
              formatCurrency(porTipo.receber.emAberto),
              formatCurrency(porTipo.pagar.emAberto),
              formatCurrency(porTipo.receber.emAberto - porTipo.pagar.emAberto),
              formatCurrency(porTipo.receber.quitado),
              formatCurrency(porTipo.pagar.quitado),
              porTipo.receber.quantidade + porTipo.pagar.quantidade,
            ])
          ),
        })
      }

      blocos.push(
        {
          // Largura cheia porque a série é longa (um ponto por mês do
          // período). O tamanho do texto não depende mais da largura do bloco
          // — `capturarGrafico` normaliza a fonte contra a escala do SVG.
          titulo: `Entradas e saídas por mês (por ${baseData})`,
          descricao: 'Valor total dos títulos, quitados ou não. A linha é o saldo do mês.',
          html:
            capturarGrafico('[data-grafico="ca-evolucao"]', { mapaCores }) ||
            '<p class="vazio">Nenhum lançamento no período com os filtros atuais.</p>',
        },
        {
          titulo: 'Entradas e saídas (valores)',
          metade: true,
          html: tabelaHtml(
            [
              { titulo: 'Mês' },
              { titulo: 'A receber', alinhar: 'direita' },
              { titulo: 'A pagar', alinhar: 'direita' },
              { titulo: 'Saldo', alinhar: 'direita' },
            ],
            mensal.map((m) => [
              m.rotulo,
              formatCurrency(m.receber),
              formatCurrency(m.pagar),
              formatCurrency(m.saldo),
            ])
          ),
        },
        {
          titulo: 'Situação dos títulos',
          descricao:
            'Título parcialmente pago aparece nos dois lados; o quitado é o efetivamente liquidado, já com juros ou desconto.',
          metade: true,
          html: tabelaHtml(
            [
              { titulo: 'Situação' },
              { titulo: 'A receber', alinhar: 'direita' },
              { titulo: 'A pagar', alinhar: 'direita' },
            ],
            [
              ...situacoes.map((chave) => [
                ROTULO_SITUACAO[chave],
                formatCurrency(resumo.receber[chave]),
                formatCurrency(resumo.pagar[chave]),
              ]),
              ['Total', formatCurrency(resumo.receber.base), formatCurrency(resumo.pagar.base)],
            ]
          ),
        },
        {
          titulo: 'Inadimplência por faixa de atraso',
          descricao: `Saldo em aberto de contas a receber já vencidas · ${formatPercent(inadimplencia.taxa)} do que já venceu`,
          html:
            capturarGrafico('[data-grafico="ca-atraso"]', { mapaCores }) ||
            tabelaHtml(
              [{ titulo: 'Faixa' }, { titulo: 'Em aberto', alinhar: 'direita' }, { titulo: 'Títulos', alinhar: 'direita' }],
              inadimplencia.faixas.map((f) => [f.faixa, formatCurrency(f.valor), f.quantidade])
            ),
        }
      )

      if (inadimplencia.devedores.length > 0) {
        blocos.push({
          titulo: 'Maiores devedores',
          metade: true,
          html: tabelaHtml(
            [{ titulo: 'Cliente' }, { titulo: 'Em aberto', alinhar: 'direita' }, { titulo: 'Títulos', alinhar: 'direita' }],
            inadimplencia.devedores.map((d) => [d.nome, formatCurrency(d.valor), d.quantidade])
          ),
        })
      }

      if (filtros.tipos.includes('receber')) {
        blocos.push({
          titulo: 'Maiores categorias a receber',
          metade: true,
          html: tabelaHtml(
            [{ titulo: 'Categoria' }, { titulo: 'Total', alinhar: 'direita' }, { titulo: 'Títulos', alinhar: 'direita' }],
            rankingReceber.map((l) => [l.nome, formatCurrency(l.valor), l.quantidade])
          ),
        })
      }
      if (filtros.tipos.includes('pagar')) {
        blocos.push({
          titulo: 'Maiores categorias a pagar',
          metade: true,
          html: tabelaHtml(
            [{ titulo: 'Categoria' }, { titulo: 'Total', alinhar: 'direita' }, { titulo: 'Títulos', alinhar: 'direita' }],
            rankingPagar.map((l) => [l.nome, formatCurrency(l.valor), l.quantidade])
          ),
        })
      }

      // A lista completa é o CSV: 2.9 mil lançamentos viram ~60 páginas de PDF.
      const recorte = tabela.slice(0, LIMITE_LANCAMENTOS_PDF)
      blocos.push({
        titulo: `Lançamentos (${tabela.length.toLocaleString('pt-BR')})`,
        descricao:
          tabela.length > recorte.length
            ? `Mostrando os ${recorte.length} primeiros na ordenação da tela — a lista completa sai em "Exportar CSV".`
            : 'Na ordenação da tela.',
        html: tabelaHtml(
          [
            { titulo: 'Tipo' },
            { titulo: 'Descrição' },
            { titulo: 'Cliente / Fornecedor' },
            { titulo: 'Vencimento' },
            { titulo: 'Total', alinhar: 'direita' },
            { titulo: 'Em aberto', alinhar: 'direita' },
            { titulo: 'Situação' },
          ],
          recorte.map((i) => [
            i.tipo === 'receber' ? 'A receber' : 'A pagar',
            i.descricao || '—',
            i.parte,
            dataBR(i.vencimento),
            formatCurrency(i.total),
            formatCurrency(valorEmAberto(i)),
            ROTULO_SITUACAO[situacaoDoItem(i)] + (i.dias_atraso > 0 ? ` (${i.dias_atraso}d)` : ''),
          ])
        ),
      })

      await exportarRelatorioPdf({
        titulo: 'Relatório Financeiro — Conta Azul',
        subtitulo: user?.empresa?.nome || undefined,
        nomeArquivo: `contaazul_${intervalo.de}_a_${intervalo.ate}`,
        assinaturaHtml,
        periodo:
          `<strong>Período:</strong> ${escaparHtml(dataBR(intervalo.de))} a ${escaparHtml(dataBR(intervalo.ate))} (por vencimento)` +
          `<br><strong>Filtros:</strong> ${filtrosTexto.length ? escaparHtml(filtrosTexto.join(' · ')) : 'nenhum (consolidado)'}` +
          `<br>${filtrados.length.toLocaleString('pt-BR')} de ${itens.length.toLocaleString('pt-BR')} lançamentos · ` +
          `${conexoesOk.length > 1 ? `${conexoesOk.length} contas consolidadas` : escaparHtml(conexoesOk[0]?.nome ?? 'uma conta')} · ` +
          `dados do Conta Azul atualizados em ${escaparHtml(new Date(data!.gerado_em).toLocaleString('pt-BR'))}`,
        resumo: [
          {
            rotulo: 'A receber em aberto',
            valor: formatCurrency(resumo.receber.emAberto),
            detalhe: `${resumo.receber.quantidade.toLocaleString('pt-BR')} títulos`,
            cor: '#047857',
          },
          {
            rotulo: 'A pagar em aberto',
            valor: formatCurrency(resumo.pagar.emAberto),
            detalhe: `${resumo.pagar.quantidade.toLocaleString('pt-BR')} títulos`,
            cor: '#b45309',
          },
          {
            rotulo: 'Saldo previsto',
            valor: formatCurrency(saldoPrevisto),
            detalhe: 'A receber menos a pagar, só o que está em aberto',
            cor: saldoPrevisto >= 0 ? '#1d4ed8' : '#b91c1c',
          },
          {
            rotulo: 'Inadimplência',
            valor: formatCurrency(resumo.receber.atrasado + resumo.receber.perdido),
            detalhe: `${formatPercent(inadimplencia.taxa)} do que já venceu · ${resumo.receber.quantidadeAtrasada.toLocaleString('pt-BR')} títulos em atraso`,
            cor: '#b91c1c',
          },
          { rotulo: 'Já recebido', valor: formatCurrency(resumo.receber.quitado), detalhe: 'Quitado no período' },
          { rotulo: 'Já pago', valor: formatCurrency(resumo.pagar.quitado), detalhe: 'Quitado no período' },
          { rotulo: 'Total a receber', valor: formatCurrency(resumo.receber.total), detalhe: 'Valor de face dos títulos' },
          { rotulo: 'Total a pagar', valor: formatCurrency(resumo.pagar.total), detalhe: 'Valor de face dos títulos' },
        ],
        blocos,
        notaRodape:
          'Fonte: API do Conta Azul. Todo recorte de data é por VENCIMENTO — a API não devolve data de pagamento, ' +
          'então "quitado" é o valor já liquidado de títulos que vencem no período. Quitado com juros ou desconto ' +
          'faz a soma dos baldes diferir do valor de face.',
      })
    } catch (erro: any) {
      toast.error(erro?.message || 'Não foi possível gerar o relatório.')
    } finally {
      setExportandoPdf(false)
    }
  }

  /* ------------------------------------------------------------- estados --- */

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    const msg = (error as any)?.response?.data?.message ?? (error as Error).message
    const precisaAutorizar = (error as any)?.response?.data?.code === 'NAO_AUTORIZADO'
    return (
      <Card className="mx-auto mt-8 max-w-xl text-center">
        <ServerCrash className="mx-auto mb-3 h-10 w-10 text-amber-500" />
        <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Não deu para carregar o Conta Azul
        </h3>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">{msg}</p>
        {precisaAutorizar && (
          <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
            A integração precisa ser autorizada de novo pelo administrador.
          </p>
        )}
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-white hover:bg-primary-800"
        >
          <RefreshCw className="h-4 w-4" /> Tentar de novo
        </button>
      </Card>
    )
  }

  const saldo = resumo.receber.emAberto - resumo.pagar.emAberto
  const totalComposicao = composicao.reduce((s, c) => s + c.base, 0)

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------- período --- */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                Período (por vencimento)
              </span>
              <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600">
                {PRESETS.map(({ chave, rotulo }) => (
                  <button
                    key={chave}
                    type="button"
                    onClick={() => aplicarPreset(chave)}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                      preset === chave
                        ? 'bg-primary-700 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800'
                    }`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-end gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  De
                </label>
                {/* Sem `max`: a trava cruzada deixava o "De" sem alcance para
                    frente do "Até" e o filtro parecia quebrado. Aqui o fim é
                    empurrado junto quando o início passa dele. */}
                <input
                  type="date"
                  value={intervalo.de}
                  onChange={(e) => {
                    const de = e.target.value
                    setPreset('personalizado')
                    setIntervalo((i) => ({ de, ate: de && i.ate && de > i.ate ? de : i.ate }))
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  Até
                </label>
                <input
                  type="date"
                  value={intervalo.ate}
                  onChange={(e) => {
                    const ate = e.target.value
                    setPreset('personalizado')
                    setIntervalo((i) => ({ ate, de: ate && i.de && ate < i.de ? ate : i.de }))
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={atualizar}
              disabled={isFetching || atualizando}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching || atualizando ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={exportarPDF}
              disabled={exportandoPdf}
              title="Gera um PDF com os números do período e dos filtros atuais"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <FileDown className="h-4 w-4" />
              {exportandoPdf ? 'Gerando...' : 'Exportar PDF'}
            </button>
            <button
              type="button"
              onClick={exportarCSV}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-700 px-3 py-2 text-sm font-medium text-white hover:bg-primary-800"
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </button>
          </div>
        </div>

        <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700">
          <FiltrosContaAzul
            filtros={filtros}
            onChange={(f) => {
              setFiltros(f)
              setPagina(1)
            }}
            opcoesConexao={conexoesOk.map((c) => ({ id: c.id, nome: c.nome }))}
            opcoesCategoria={opcoes.categoria}
            opcoesCentroCusto={opcoes.centroCusto}
            opcoesParte={opcoes.parte}
          />
        </div>

        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {filtrados.length.toLocaleString('pt-BR')} de {itens.length.toLocaleString('pt-BR')} lançamentos ·{' '}
          {conexoesOk.length > 1
            ? `${conexoesOk.length} contas consolidadas`
            : conexoesOk[0]?.nome ?? 'uma conta'}{' '}
          · dados do Conta Azul atualizados em {new Date(data!.gerado_em).toLocaleString('pt-BR')}
        </p>
      </Card>

      {/* Uma conta fora do ar não derruba o dashboard, mas o número consolidado
          fica incompleto — e isso precisa estar na cara, não escondido no console. */}
      {conexoesComErro.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-600 dark:text-amber-300" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                Consolidado incompleto — {conexoesComErro.length === 1 ? 'uma conta' : `${conexoesComErro.length} contas`} não respondeu
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-amber-800 dark:text-amber-200">
                {conexoesComErro.map((c) => (
                  <li key={c.id}>
                    <strong>{c.nome}:</strong> {c.erro}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
                Os números abaixo somam só as contas que responderam.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- indicadores --- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          titulo="A receber em aberto"
          valor={formatCurrency(resumo.receber.emAberto)}
          icone={ArrowUpCircle}
          cor="text-emerald-600 dark:text-emerald-300"
          fundo="bg-emerald-50 dark:bg-emerald-900/30"
          detalhe={
            <>
              {formatCurrency(resumo.receber.quitado)} já recebido ·{' '}
              {resumo.receber.quantidade.toLocaleString('pt-BR')} títulos
            </>
          }
        />
        <Indicador
          titulo="A pagar em aberto"
          valor={formatCurrency(resumo.pagar.emAberto)}
          icone={ArrowDownCircle}
          cor="text-orange-600 dark:text-orange-300"
          fundo="bg-orange-50 dark:bg-orange-900/30"
          detalhe={
            <>
              {formatCurrency(resumo.pagar.quitado)} já pago ·{' '}
              {resumo.pagar.quantidade.toLocaleString('pt-BR')} títulos
            </>
          }
        />
        <Indicador
          titulo="Saldo previsto"
          valor={formatCurrency(saldo)}
          icone={Scale}
          cor="text-blue-600 dark:text-blue-300"
          fundo="bg-blue-50 dark:bg-blue-900/30"
          detalhe="A receber menos a pagar, só o que está em aberto"
        />
        <Indicador
          titulo="Inadimplência"
          valor={formatCurrency(resumo.receber.atrasado + resumo.receber.perdido)}
          icone={AlertTriangle}
          cor="text-red-600 dark:text-red-300"
          fundo="bg-red-50 dark:bg-red-900/30"
          detalhe={
            <>
              {formatPercent(inadimplencia.taxa)} do que já venceu ·{' '}
              {resumo.receber.quantidadeAtrasada.toLocaleString('pt-BR')} títulos em atraso
            </>
          }
        />
      </div>

      {/* --------------------------------------------- comparativo por produto --- */}
      {porConexao.length > 1 && (
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary-700 dark:text-primary-300" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Por produto
            </h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              mesmo período e mesmos filtros, separado por conta do Conta Azul
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {porConexao.map(({ conexao_id, nome, porTipo }) => {
              const saldoProduto = porTipo.receber.emAberto - porTipo.pagar.emAberto
              return (
                <div
                  key={conexao_id}
                  className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
                >
                  <p className="mb-3 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {nome}
                  </p>
                  <dl className="space-y-2 text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="text-gray-500 dark:text-gray-400">A receber em aberto</dt>
                      <dd className="font-semibold text-emerald-700 dark:text-emerald-300">
                        {formatCurrency(porTipo.receber.emAberto)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="text-gray-500 dark:text-gray-400">A pagar em aberto</dt>
                      <dd className="font-semibold text-orange-700 dark:text-orange-300">
                        {formatCurrency(porTipo.pagar.emAberto)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 border-t border-gray-100 pt-2 dark:border-gray-700">
                      <dt className="text-gray-600 dark:text-gray-300">Saldo previsto</dt>
                      <dd
                        className={`font-bold ${
                          saldoProduto >= 0
                            ? 'text-blue-700 dark:text-blue-300'
                            : 'text-red-700 dark:text-red-300'
                        }`}
                      >
                        {formatCurrency(saldoProduto)}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                    {formatCurrency(porTipo.receber.quitado)} recebido ·{' '}
                    {formatCurrency(porTipo.pagar.quitado)} pago ·{' '}
                    {(porTipo.receber.quantidade + porTipo.pagar.quantidade).toLocaleString('pt-BR')}{' '}
                    títulos
                  </p>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* ------------------------------------------------------- evolução --- */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Entradas e saídas por mês
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Valor total dos títulos, quitados ou não. A linha é o saldo do mês.
            </p>
          </div>
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-300 text-sm dark:border-gray-600">
            {(['vencimento', 'competencia'] as BaseData[]).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBaseData(b)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  baseData === b
                    ? 'bg-primary-700 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800'
                }`}
              >
                Por {b === 'vencimento' ? 'vencimento' : 'competência'}
              </button>
            ))}
          </div>
        </div>

        {mensal.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
            Nenhum lançamento no período com os filtros atuais.
          </p>
        ) : (
          <div data-grafico="ca-evolucao">
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={mensal} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={paleta.grid} vertical={false} />
              <XAxis dataKey="rotulo" stroke={paleta.eixo} tickLine={false} style={{ fontSize: 12 }} />
              <YAxis
                stroke={paleta.eixo}
                tickLine={false}
                axisLine={false}
                width={72}
                tickFormatter={compacto}
                style={{ fontSize: 12 }}
              />
              <Tooltip content={<TooltipViz paleta={paleta} />} cursor={{ fill: paleta.grid, opacity: 0.4 }} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              {filtros.tipos.includes('receber') && (
                <Bar dataKey="receber" name="A receber" fill={paleta.receber} radius={[4, 4, 0, 0]} maxBarSize={34} />
              )}
              {filtros.tipos.includes('pagar') && (
                <Bar dataKey="pagar" name="A pagar" fill={paleta.pagar} radius={[4, 4, 0, 0]} maxBarSize={34} />
              )}
              {filtros.tipos.length === 2 && (
                <Line
                  type="monotone"
                  dataKey="saldo"
                  name="Saldo"
                  stroke={paleta.saldo}
                  strokeWidth={2}
                  dot={{ r: 4, fill: paleta.saldo, strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* --------------------------------------- composição + faixas ------- */}
      {/* items-start: sem isso o card mais curto estica e sobra um vazio grande */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Situação dos títulos
          </h3>
          <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
            Cada barra soma 100% do período. Título parcialmente pago aparece nos dois lados; o
            valor quitado é o efetivamente liquidado, já com juros ou desconto.
          </p>

          {composicao.length === 0 || totalComposicao === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
              Sem valores para exibir.
            </p>
          ) : (
            <div className="space-y-5">
              {composicao.map((linha) => {
                const partes = (['quitado', 'aVencer', 'atrasado', 'perdido'] as const)
                  .map((chave) => ({
                    chave,
                    rotulo: ROTULO_SITUACAO[chave],
                    valor: linha[chave],
                    cor: paleta[CorSituacao[chave]] as string,
                  }))
                  .filter((p) => p.valor > 0)

                return (
                  <div key={linha.nome}>
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {linha.nome}
                      </span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {formatCurrency(linha.base)}
                      </span>
                    </div>
                    {/* gap de 2px entre segmentos — separa sem depender da cor */}
                    <div className="flex h-7 w-full gap-0.5 overflow-hidden rounded">
                      {partes.map((p) => (
                        <div
                          key={p.chave}
                          className="h-full"
                          style={{ background: p.cor, width: `${(p.valor / linha.base) * 100}%` }}
                          title={`${p.rotulo}: ${formatCurrency(p.valor)}`}
                        />
                      ))}
                    </div>
                    {/* rótulo direto: identidade nunca fica só na cor */}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {partes.map((p) => (
                        <span key={p.chave} className="inline-flex items-center gap-1.5 text-xs">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-sm"
                            style={{ background: p.cor }}
                          />
                          <span className="text-gray-600 dark:text-gray-400">{p.rotulo}</span>
                          <span className="font-semibold text-gray-800 dark:text-gray-200">
                            {formatCurrency(p.valor)}
                          </span>
                          <span className="text-gray-400">
                            ({((p.valor / linha.base) * 100).toFixed(0)}%)
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Inadimplência por faixa de atraso
          </h3>
          <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
            Saldo em aberto de contas a receber já vencidas, por tempo de atraso.
          </p>

          {inadimplencia.faixas.every((f) => f.valor === 0) ? (
            <p className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
              Nenhuma conta a receber em atraso no período. 🎉
            </p>
          ) : (
            <div data-grafico="ca-atraso">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={inadimplencia.faixas} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={paleta.grid} vertical={false} />
                <XAxis dataKey="faixa" stroke={paleta.eixo} tickLine={false} style={{ fontSize: 11 }} />
                <YAxis
                  stroke={paleta.eixo}
                  tickLine={false}
                  axisLine={false}
                  width={72}
                  tickFormatter={compacto}
                  style={{ fontSize: 12 }}
                />
                <Tooltip
                  content={<TooltipViz paleta={paleta} />}
                  cursor={{ fill: paleta.grid, opacity: 0.4 }}
                />
                <Bar
                  dataKey="valor"
                  name="Em aberto"
                  fill={paleta.atrasado}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={56}
                />
              </BarChart>
            </ResponsiveContainer>
            </div>
          )}

          {inadimplencia.devedores.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700">
              <h4 className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                Maiores devedores
              </h4>
              <ul className="space-y-1.5">
                {inadimplencia.devedores.map((d) => (
                  <li key={d.nome} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate text-gray-600 dark:text-gray-400">{d.nome}</span>
                    <span className="shrink-0 font-semibold text-gray-900 dark:text-gray-100">
                      {formatCurrency(d.valor)}
                      <span className="ml-1 text-xs font-normal text-gray-400">
                        ({d.quantidade})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------------- rankings --- */}
      {/* items-start: sem isso o card mais curto estica e sobra um vazio grande */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {filtros.tipos.includes('receber') && (
          <RankingCard
            titulo="Maiores categorias a receber"
            linhas={rankingReceber}
            cor={paleta.receber}
            paleta={paleta}
            marca="ca-ranking-receber"
          />
        )}
        {filtros.tipos.includes('pagar') && (
          <RankingCard
            titulo="Maiores categorias a pagar"
            linhas={rankingPagar}
            cor={paleta.pagar}
            paleta={paleta}
            marca="ca-ranking-pagar"
          />
        )}
      </div>

      {/* --------------------------------------------------------- tabela --- */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Lançamentos ({tabela.length.toLocaleString('pt-BR')})
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Página {paginaAtual} de {totalPaginas}
          </span>
        </div>

        <div className="-mx-6 overflow-x-auto px-6">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left dark:border-gray-700">
                {([
                  ['tipo', 'Tipo'],
                  ['descricao', 'Descrição'],
                  ['parte', 'Cliente / Fornecedor'],
                  ['categoria', 'Categoria'],
                  ['vencimento', 'Vencimento'],
                  ['total', 'Total'],
                  ['aberto', 'Em aberto'],
                ] as [keyof EventoFinanceiro, string][]).map(([campo, rotulo]) => (
                  <th key={campo} className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => ordenarPor(campo)}
                      className="font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                    >
                      {rotulo}
                      {ordem.campo === campo && (ordem.asc ? ' ▲' : ' ▼')}
                    </button>
                  </th>
                ))}
                <th className="px-2 py-2 font-semibold text-gray-600 dark:text-gray-400">Situação</th>
              </tr>
            </thead>
            <tbody>
              {linhasPagina.map((item) => {
                const situacao = situacaoDoItem(item)
                return (
                  <tr
                    key={item.id}
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
                  >
                    <td className="whitespace-nowrap px-2 py-2 text-gray-600 dark:text-gray-400">
                      {item.tipo === 'receber' ? 'A receber' : 'A pagar'}
                    </td>
                    <td className="max-w-[260px] truncate px-2 py-2 text-gray-900 dark:text-gray-100" title={item.descricao}>
                      {item.descricao || '—'}
                    </td>
                    <td className="max-w-[200px] truncate px-2 py-2 text-gray-600 dark:text-gray-400" title={item.parte}>
                      {item.parte}
                    </td>
                    <td className="max-w-[180px] truncate px-2 py-2 text-gray-600 dark:text-gray-400" title={item.categoria}>
                      {item.categoria}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-gray-600 dark:text-gray-400">
                      {dataBR(item.vencimento)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-medium text-gray-900 dark:text-gray-100">
                      {formatCurrency(item.total)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right text-gray-600 dark:text-gray-400">
                      {formatCurrency(valorEmAberto(item))}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: paleta[CorSituacao[situacao]] as string }}
                        />
                        <span className="text-gray-700 dark:text-gray-300">
                          {ROTULO_SITUACAO[situacao]}
                          {item.dias_atraso > 0 && (
                            <span className="ml-1 text-xs text-gray-400">
                              {item.dias_atraso}d
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                  </tr>
                )
              })}
              {linhasPagina.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                    Nenhum lançamento com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPaginas > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={paginaAtual === 1}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-gray-600 dark:text-gray-300"
            >
              Anterior
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {paginaAtual} / {totalPaginas}
            </span>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaAtual === totalPaginas}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-gray-600 dark:text-gray-300"
            >
              Próxima
            </button>
          </div>
        )}
      </Card>
    </div>
  )
}

/** Ranking horizontal — série única, então uma cor só e rótulo em cada barra. */
const RankingCard: React.FC<{
  titulo: string
  linhas: { nome: string; valor: number; quantidade: number }[]
  cor: string
  paleta: PaletaViz
  /** identifica o gráfico para a cópia do relatório em PDF */
  marca: string
}> = ({ titulo, linhas, cor, paleta, marca }) => (
  <Card>
    <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">{titulo}</h3>
    {linhas.length === 0 ? (
      <p className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
        Sem valores para exibir.
      </p>
    ) : (
      <div data-grafico={marca}>
      <ResponsiveContainer width="100%" height={Math.max(200, linhas.length * 34 + 20)}>
        <BarChart data={linhas} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={paleta.grid} horizontal={false} />
          <XAxis type="number" hide tickFormatter={compacto} />
          <YAxis
            type="category"
            dataKey="nome"
            width={150}
            stroke={paleta.eixo}
            tickLine={false}
            axisLine={false}
            style={{ fontSize: 11 }}
          />
          <Tooltip content={<TooltipViz paleta={paleta} />} cursor={{ fill: paleta.grid, opacity: 0.4 }} />
          <Bar dataKey="valor" name="Total" fill={cor} radius={[0, 4, 4, 0]} maxBarSize={22}>
            {/* rótulo direto em cada barra — cobre o aviso de contraste da paleta */}
            <LabelList
              dataKey="valor"
              position="right"
              formatter={(v: any) => compacto(Number(v))}
              style={{ fontSize: 11, fill: paleta.eixo }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
    )}
  </Card>
)
