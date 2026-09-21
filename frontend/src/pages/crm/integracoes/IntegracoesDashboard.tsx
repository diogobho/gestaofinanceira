import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell,
} from 'recharts'
import {
  RefreshCw, Download, Plug, AlertTriangle, ExternalLink, Webhook, Database, MessageSquare,
} from 'lucide-react'
import { Card, Spinner } from '@/components/ui'
import { integracoesApi, type CampoDisponivel, type LeadIntegracao } from '@/api/integracoes'
import { usePaletaIntegracoes, mapaDeCores, MAX_SERIES } from './paleta'
import { FiltrosIntegracoes } from './FiltrosIntegracoes'
import {
  FILTROS_VAZIOS, ID_OUTRAS, aplicarFiltros, camposDoRecorte, contagemPor, distribuicaoDeCampo,
  ehCategorico, ordemPorVolume, resumoPorIntegracao, serieTemporal,
  type Filtros, type Granularidade,
} from './agregacoes'

const MAX_LINHAS_TABELA = 150
const MAX_BARRAS_CAMPO = 12
const MAX_LINHAS_DISTRIBUICAO = 30

const ICONE_CANAL = { webhook: Webhook, banco: Database, interno: MessageSquare } as const
const ROTULO_CANAL = {
  webhook: 'Webhook',
  banco: 'Escrita direta',
  interno: 'Dentro do app',
} as const

const dataBR = (iso: string | null) => {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

const rotuloPeriodo = (periodo: string, g: Granularidade) => {
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const p = periodo.split('-')
  if (g === 'mes') return `${meses[Number(p[1]) - 1]}/${p[0].slice(2)}`
  return `${p[2]}/${p[1]}`
}

const truncar = (v: string, n: number) => (v.length > n ? `${v.slice(0, n - 1)}…` : v)

/** Lista ranqueada com barra proporcional. Uma dimensão, sem identidade de cor. */
const ListaRanqueada: React.FC<{
  itens: { rotulo: string; leads: number }[]
  vazio: string
  limite?: number
}> = ({ itens, vazio, limite = 8 }) => {
  if (itens.length === 0) return <p className="py-6 text-center text-sm text-gray-500">{vazio}</p>
  const maximo = Math.max(...itens.map((i) => i.leads))
  return (
    <ul className="space-y-2">
      {itens.slice(0, limite).map((item) => (
        <li key={item.rotulo} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-sm text-gray-700 dark:text-gray-300" title={item.rotulo}>
            {item.rotulo}
          </span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
            <span
              className="block h-full rounded-full bg-emerald-500"
              style={{ width: `${maximo ? Math.max(2, (item.leads / maximo) * 100) : 0}%` }}
            />
          </span>
          <span className="w-12 shrink-0 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
            {item.leads}
          </span>
        </li>
      ))}
      {itens.length > limite && (
        <li className="pt-1 text-xs text-gray-500">+{itens.length - limite} não listados</li>
      )}
    </ul>
  )
}

export const IntegracoesDashboard: React.FC = () => {
  const paleta = usePaletaIntegracoes()
  const [filtros, setFiltros] = useState<Filtros>({ ...FILTROS_VAZIOS })
  const [granularidade, setGranularidade] = useState<Granularidade>('semana')
  const [campoSelecionado, setCampoSelecionado] = useState<string>('')

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['integracoes-dashboard'],
    queryFn: () => integracoesApi.dashboard(),
    staleTime: 5 * 60 * 1000,
  })

  const todos = data?.leads ?? []
  const catalogo = data?.catalogo ?? []
  const nomeDe = useMemo(() => {
    const m = new Map(catalogo.map((d) => [d.id, d.nome]))
    m.set(ID_OUTRAS, 'Outras')
    return (id: string) => m.get(id) ?? id
  }, [catalogo])

  // A ordem — e portanto a cor — sai do conjunto INTEIRO. Filtrar não repinta nada.
  const ordem = useMemo(() => ordemPorVolume(todos), [todos])
  const cores = useMemo(() => mapaDeCores(ordem, paleta), [ordem, paleta])

  const leads = useMemo(() => aplicarFiltros(todos, filtros), [todos, filtros])
  const resumos = useMemo(() => resumoPorIntegracao(leads, catalogo), [leads, catalogo])
  const campos = useMemo(() => camposDoRecorte(leads, data?.campos_disponiveis ?? []), [leads, data])

  // Série: as integrações do recorte que estão entre as de cor própria; o resto empilha em "Outras".
  const seriesVisiveis = useMemo(() => {
    const noRecorte = new Set(resumos.map((r) => r.id))
    return ordem.slice(0, MAX_SERIES).filter((id) => noRecorte.has(id))
  }, [ordem, resumos])
  /**
   * As integrações que sobraram para o balde neutro.
   *
   * Quando é UMA só, o balde leva o nome dela em vez de "Outras": filtrar por
   * Caixa Rápido e ver a barra dela rotulada "Outras" é o painel respondendo
   * outra pergunta. A cor não muda — quem muda é o rótulo, e é o rótulo que
   * carrega a identidade quando a cor é neutra.
   */
  const dobradas = useMemo(
    () => resumos.filter((r) => !seriesVisiveis.includes(r.id)).map((r) => r.id),
    [resumos, seriesVisiveis]
  )
  const temOutras = dobradas.length > 0
  const rotuloOutras =
    dobradas.length === 1 ? nomeDe(dobradas[0]) : `Outras (${dobradas.length})`
  const detalheOutras = dobradas.map(nomeDe).join(' · ')
  const serie = useMemo(
    () => serieTemporal(leads, granularidade, seriesVisiveis),
    [leads, granularidade, seriesVisiveis]
  )

  const campoAtual = campos.find((c) => c.chave === campoSelecionado) ?? campos.find((c) => ehCategorico(c)) ?? campos[0]
  const distribuicao = useMemo(
    () => (campoAtual ? distribuicaoDeCampo(leads, campoAtual.chave) : []),
    [leads, campoAtual]
  )

  const ganhos = leads.filter((l) => l.ganho).length
  const multiToque = leads.filter((l) => l.integracoes.length > 1).length

  /**
   * Colunas próprias na tabela só quando o recorte É de uma integração só.
   *
   * Numa lista misturada, abrir as colunas de UMA integração enche a tabela de
   * travessão: os campos do Caixa Rápido contra linhas do SendFlow são todos
   * vazios, e a coluna larga fica ocupando espaço para não dizer nada. No recorte
   * misto cada linha mostra os próprios campos, em uma coluna só.
   */
  const colunasDaTabela = useMemo(() => {
    const unica =
      filtros.integracoes.length === 1
        ? filtros.integracoes[0]
        : resumos.length === 1
          ? resumos[0].id
          : null
    return unica ? campos.filter((c) => c.integracao === unica).slice(0, 4) : []
  }, [filtros.integracoes, resumos, campos])

  const exportarCsv = () => {
    const chaves = campos.map((c) => c.chave)
    const cabecalho = [
      'ID', 'Nome', 'Telefone', 'E-mail', 'Origem', 'Integrações', 'Funil', 'Estágio',
      'Proprietário', 'Criado em', 'Ganho', 'Perdido',
      ...campos.map((c) => `${nomeDe(c.integracao)} — ${c.rotulo}`),
    ]
    const escapar = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
    const linhas = leads.map((l) =>
      [
        l.id, l.nome, l.telefone, l.email, l.origem,
        l.integracoes.map(nomeDe).join(' + '),
        l.funil_nome, l.estagio_nome, l.responsavel_nome, dataBR(l.criado_em_dia),
        l.ganho ? 'sim' : '', l.perdido ? 'sim' : '',
        ...chaves.map((k) => (l.campos[k] ?? []).join(' | ')),
      ].map(escapar).join(';')
    )
    // BOM na frente: sem ele o Excel em pt-BR abre acento quebrado.
    const csv = '﻿' + [cabecalho.map(escapar).join(';'), ...linhas].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `integracoes_${data?.hoje ?? 'export'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <div className="flex items-start gap-3 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">Não foi possível carregar as integrações.</p>
            <button onClick={() => refetch()} className="mt-2 text-emerald-600 hover:underline">
              Tentar de novo
            </button>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Integrações</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Todo lead que entrou por um sistema — webhook, app ou WhatsApp — e o que cada um trouxe junto.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={exportarCsv}
            disabled={leads.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
        </div>
      </div>

      <FiltrosIntegracoes
        filtros={filtros}
        onChange={setFiltros}
        catalogo={catalogo}
        leads={todos}
        camposDisponiveis={data?.campos_disponiveis ?? []}
        cores={cores}
      />

      {/* Números do recorte */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Leads no recorte</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{leads.length.toLocaleString('pt-BR')}</p>
          <p className="mt-1 text-xs text-gray-500">de {todos.length.toLocaleString('pt-BR')} vindos de integração</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Integrações ativas</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{resumos.length}</p>
          <p className="mt-1 text-xs text-gray-500">{catalogo.length} cadastradas no total</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Ganhos</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{ganhos.toLocaleString('pt-BR')}</p>
          <p className="mt-1 text-xs text-gray-500">
            {leads.length ? `${((ganhos / leads.length) * 100).toFixed(1)}% do recorte` : '—'}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Tocados por 2+ integrações</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{multiToque.toLocaleString('pt-BR')}</p>
          <p className="mt-1 text-xs text-gray-500">entraram por uma e responderam a outra</p>
        </Card>
      </div>

      {/* Uma integração por cartão */}
      <Card title="Cada integração">
        {resumos.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">Nenhum lead de integração no recorte.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {resumos.map((r) => {
              const Icone = ICONE_CANAL[r.definicao?.canal ?? 'webhook']
              const ativo = filtros.integracoes.includes(r.id)
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() =>
                    setFiltros({
                      ...filtros,
                      integracoes: ativo
                        ? filtros.integracoes.filter((x) => x !== r.id)
                        : [...filtros.integracoes, r.id],
                    })
                  }
                  aria-pressed={ativo}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    ativo
                      ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-900/20'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: cores.get(r.id) || paleta.neutra }}
                        aria-hidden
                      />
                      <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {r.definicao?.nome ?? r.id}
                      </span>
                    </div>
                    <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {r.leads.toLocaleString('pt-BR')}
                    </span>
                  </div>

                  <p className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <Icone className="h-3.5 w-3.5 shrink-0" />
                    {ROTULO_CANAL[r.definicao?.canal ?? 'webhook']}
                  </p>

                  <dl className="mt-2 grid grid-cols-3 gap-1 text-xs">
                    <div>
                      <dt className="text-gray-500">Ganhos</dt>
                      <dd className="font-medium text-gray-800 dark:text-gray-200">{r.ganhos}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Anexados</dt>
                      <dd className="font-medium text-gray-800 dark:text-gray-200" title="Cards que já existiam e receberam este toque depois">
                        {r.anexados}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Último</dt>
                      <dd className="font-medium text-gray-800 dark:text-gray-200">{dataBR(r.ultimo)}</dd>
                    </div>
                  </dl>
                </button>
              )
            })}
          </div>
        )}

        {/* Integrações configuradas que ainda não produziram nada no recorte */}
        {(() => {
          const semLead = catalogo.filter((d) => !resumos.some((r) => r.id === d.id))
          if (semLead.length === 0) return null
          return (
            <p className="mt-4 border-t border-gray-200 pt-3 text-xs text-gray-500 dark:border-gray-700">
              <Plug className="mr-1 inline h-3.5 w-3.5" />
              Sem lead neste recorte: {semLead.map((d) => d.nome).join(' · ')}
            </p>
          )
        })()}
      </Card>

      {/* Evolução */}
      <Card
        title="Entrada ao longo do tempo"
        action={
          <div className="flex rounded-lg border border-gray-300 p-0.5 dark:border-gray-600">
            {(['dia', 'semana', 'mes'] as Granularidade[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGranularidade(g)}
                className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                  granularidade === g
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                {g === 'mes' ? 'mês' : g}
              </button>
            ))}
          </div>
        }
      >
        {serie.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-gray-500">
            Nenhum lead no recorte — ajuste os filtros.
          </div>
        ) : (
          <>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={paleta.grid} vertical={false} />
                  <XAxis
                    dataKey="periodo"
                    tickFormatter={(v) => rotuloPeriodo(String(v), granularidade)}
                    tick={{ fill: paleta.eixo, fontSize: 11 }}
                    axisLine={{ stroke: paleta.grid }}
                    tickLine={false}
                    minTickGap={12}
                  />
                  <YAxis
                    tick={{ fill: paleta.eixo, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    width={36}
                  />
                  <Tooltip
                    cursor={{ fill: paleta.grid, opacity: 0.4 }}
                    contentStyle={{
                      background: paleta.tooltipBg,
                      border: `1px solid ${paleta.tooltipBorda}`,
                      borderRadius: 8,
                      color: paleta.tooltipTexto,
                      fontSize: 12,
                    }}
                    labelFormatter={(v) => rotuloPeriodo(String(v), granularidade)}
                    formatter={(valor: number, chave: string) => [valor, chave === ID_OUTRAS ? rotuloOutras : nomeDe(chave)]}
                    itemSorter={(item: any) => -(item.value ?? 0)}
                  />
                  {[...seriesVisiveis, ...(temOutras ? [ID_OUTRAS] : [])].map((id, i, arr) => (
                    <Bar
                      key={id}
                      dataKey={id}
                      name={id === ID_OUTRAS ? rotuloOutras : nomeDe(id)}
                      stackId="toques"
                      fill={id === ID_OUTRAS ? paleta.neutra : cores.get(id)}
                      /* 2px da cor da superfície entre as fatias: é o respiro que
                         separa dois tons vizinhos sem inventar uma borda escura. */
                      stroke={paleta.superficie}
                      strokeWidth={2}
                      radius={i === arr.length - 1 ? [4, 4, 0, 0] : undefined}
                      isAnimationActive={false}
                    >
                      {i === arr.length - 1 && serie.length <= 14 && (
                        <LabelList
                          dataKey="total"
                          position="top"
                          offset={6}
                          style={{ fill: paleta.eixo, fontSize: 11 }}
                        />
                      )}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Legenda com valor: a cor identifica, o número é quem responde. */}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
              {[...seriesVisiveis, ...(temOutras ? [ID_OUTRAS] : [])].map((id) => {
                const total = serie.reduce((s, p) => s + ((p[id] as number) ?? 0), 0)
                return (
                  <span key={id} className="flex items-center gap-2 text-xs">
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: id === ID_OUTRAS ? paleta.neutra : cores.get(id) }}
                      aria-hidden
                    />
                    <span className="text-gray-600 dark:text-gray-300" title={id === ID_OUTRAS ? detalheOutras : undefined}>
                      {id === ID_OUTRAS ? rotuloOutras : nomeDe(id)}
                    </span>
                    <strong className="text-gray-900 dark:text-gray-100">{total.toLocaleString('pt-BR')}</strong>
                  </span>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              A pilha conta <strong>toques</strong>: um card que entrou por uma integração e respondeu a outra
              aparece nas duas. O total de leads sem repetição está nos cartões acima.
            </p>
          </>
        )}
      </Card>

      {/* Explorador de campos */}
      <Card
        title="O que cada integração trouxe"
        action={
          campos.length > 0 && (
            <select
              value={campoAtual?.chave ?? ''}
              onChange={(e) => setCampoSelecionado(e.target.value)}
              className="max-w-[16rem] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            >
              {[...new Set(campos.map((c) => c.integracao))].map((idInt) => (
                <optgroup key={idInt} label={nomeDe(idInt)}>
                  {campos
                    .filter((c) => c.integracao === idInt)
                    .map((c) => (
                      <option key={c.chave} value={c.chave}>
                        {c.rotulo} ({c.leads})
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          )
        }
      >
        {!campoAtual ? (
          <p className="py-6 text-center text-sm text-gray-500">
            Nenhuma integração do recorte grava campos nas notas. Escolha outra integração acima.
          </p>
        ) : (
          <ExploradorDeCampo
            campo={campoAtual}
            distribuicao={distribuicao}
            leads={leads}
            cor={cores.get(campoAtual.integracao) || paleta.series[0]}
            paleta={paleta}
            nomeIntegracao={nomeDe(campoAtual.integracao)}
            valorFiltrado={filtros.campoChave === campoAtual.chave ? filtros.campoValor : ''}
            onFiltrar={(valor) =>
              setFiltros((f) => ({
                ...f,
                campoChave: valor ? campoAtual.chave : '',
                campoValor: valor,
              }))
            }
          />
        )}
      </Card>

      {/* Onde os leads foram parar */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Em que estágio estão">
          <ListaRanqueada
            itens={contagemPor(leads, (l) => (l.estagio_nome ? `${l.estagio_nome}` : null))}
            vazio="Nenhum lead no recorte."
          />
        </Card>
        <Card title="De quem são">
          <ListaRanqueada
            itens={contagemPor(leads, (l) => l.responsavel_nome)}
            vazio="Nenhum lead no recorte."
          />
        </Card>
      </div>

      {/* Tabela */}
      <Card
        title={`Leads (${leads.length.toLocaleString('pt-BR')})`}
        action={
          leads.length > MAX_LINHAS_TABELA && (
            <span className="text-xs text-gray-500">
              Mostrando os {MAX_LINHAS_TABELA} mais recentes — a lista inteira sai no CSV.
            </span>
          )
        }
      >
        <TabelaLeads
          leads={leads.slice(0, MAX_LINHAS_TABELA)}
          camposDaIntegracao={colunasDaTabela}
          nomeDe={nomeDe}
          cores={cores}
          neutra={paleta.neutra}
        />
      </Card>

      {data?.truncado && (
        <p className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          A base passou do teto de linhas do painel — os mais antigos ficaram de fora.
        </p>
      )}
    </div>
  )
}

/**
 * Distribuição de um campo.
 *
 * Campo com poucos valores repetidos (faixa de faturamento, grupo, produto) vira
 * barra. Campo em que quase todo lead responde uma coisa diferente ("Maior
 * desafio") NÃO vira barra: 41 barras de altura 1 não são um gráfico. Vira lista
 * de respostas, que é como um texto livre se lê.
 */
const ExploradorDeCampo: React.FC<{
  campo: CampoDisponivel
  distribuicao: { valor: string; leads: number; pct: number }[]
  leads: LeadIntegracao[]
  cor: string
  paleta: ReturnType<typeof usePaletaIntegracoes>
  nomeIntegracao: string
  /** Valor em vigor NESTE campo, '' quando o filtro é de outro campo ou não há. */
  valorFiltrado: string
  onFiltrar: (valor: string) => void
}> = ({ campo, distribuicao, leads, cor, paleta, nomeIntegracao, valorFiltrado, onFiltrar }) => {
  const categorico = ehCategorico(campo)
  const comCampo = leads.filter((l) => l.campos[campo.chave]?.length)

  if (distribuicao.length === 0) {
    return <p className="py-6 text-center text-sm text-gray-500">Nenhum lead do recorte respondeu a este campo.</p>
  }

  if (!categorico) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <strong>{campo.rotulo}</strong> · {nomeIntegracao} — {campo.valores} respostas diferentes em{' '}
          {campo.leads} leads. É texto livre, então vai como lista, não como gráfico.
        </p>
        <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {comCampo.slice(0, 60).map((l) => (
            <li key={l.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <Link
                to={`/crm?lead=${l.id}`}
                className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
              >
                {l.nome}
              </Link>
              <p className="mt-1 whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">
                {l.campos[campo.chave].join('\n')}
              </p>
            </li>
          ))}
        </ul>
        {comCampo.length > 60 && (
          <p className="text-xs text-gray-500">+{comCampo.length - 60} respostas — o CSV traz todas.</p>
        )}
      </div>
    )
  }

  const dados = distribuicao.slice(0, MAX_BARRAS_CAMPO)
  const soma = distribuicao.reduce((s, d) => s + d.leads, 0)

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        <strong>{campo.rotulo}</strong> · {nomeIntegracao} — {campo.leads} leads responderam.
      </p>

      <div style={{ height: Math.max(160, dados.length * 34 + 20) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 44, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={paleta.grid} horizontal={false} />
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="valor"
              width={190}
              tick={{ fill: paleta.eixo, fontSize: 11 }}
              tickFormatter={(v) => truncar(String(v), 30)}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: paleta.grid, opacity: 0.4 }}
              contentStyle={{
                background: paleta.tooltipBg,
                border: `1px solid ${paleta.tooltipBorda}`,
                borderRadius: 8,
                color: paleta.tooltipTexto,
                fontSize: 12,
              }}
              formatter={(v: number) => [`${v} leads`, campo.rotulo]}
            />
            <Bar dataKey="leads" radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={18}>
              {dados.map((d) => (
                <Cell
                  key={d.valor}
                  fill={cor}
                  fillOpacity={valorFiltrado && d.valor !== valorFiltrado ? 0.35 : 1}
                />
              ))}
              <LabelList
                dataKey="leads"
                position="right"
                offset={8}
                style={{ fill: paleta.eixo, fontSize: 11, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* A tabela é o alívio exigido pelo aviso de contraste da paleta: quem não
          distingue a cor, e quem precisa do número exato, lê aqui. */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700">
              <th className="py-2 pr-3 font-medium">{campo.rotulo}</th>
              <th className="py-2 pr-3 text-right font-medium">Leads</th>
              <th className="py-2 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {distribuicao.slice(0, MAX_LINHAS_DISTRIBUICAO).map((d) => {
              const ativo = d.valor === valorFiltrado
              return (
              <tr
                key={d.valor}
                className={`border-b border-gray-100 last:border-0 dark:border-gray-700/60 ${
                  ativo ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''
                }`}
              >
                {/* Filtrar é um BOTÃO, não um clique na barra: o recharts não é
                    alcançável por teclado, e a tabela já é o alívio de contraste. */}
                <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">
                  <button
                    type="button"
                    onClick={() => onFiltrar(ativo ? '' : d.valor)}
                    aria-pressed={ativo}
                    title={ativo ? 'Remover o filtro' : `Ver só os leads com "${d.valor}"`}
                    className={`text-left hover:underline ${
                      ativo ? 'font-semibold text-emerald-700 dark:text-emerald-400' : ''
                    }`}
                  >
                    {d.valor}
                  </button>
                </td>
                <td className="py-1.5 pr-3 text-right font-medium text-gray-900 dark:text-gray-100">{d.leads}</td>
                <td className="py-1.5 text-right text-gray-500">{d.pct.toFixed(1)}%</td>
              </tr>
              )
            })}
          </tbody>
        </table>
        {distribuicao.length > MAX_LINHAS_DISTRIBUICAO && (
          <p className="pt-2 text-xs text-gray-500">
            +{distribuicao.length - MAX_LINHAS_DISTRIBUICAO} valores não listados — o CSV traz todos.
          </p>
        )}
      </div>

      {soma > campo.leads && (
        <p className="text-xs text-gray-500">
          A soma passa do número de leads porque um mesmo card pode ter mais de um valor — quem entrou em dois
          grupos, por exemplo, conta em cada um.
        </p>
      )}
    </div>
  )
}

/**
 * O que a integração trouxe naquele card, em uma célula.
 *
 * Só o que ESTE lead tem: `chave` já carrega a integração no prefixo, então o
 * rótulo sai do próprio texto da nota. Três pares bastam para dar contexto na
 * linha — o resto está no card e no CSV.
 */
function resumoDosCampos(l: LeadIntegracao): React.ReactNode {
  const pares = Object.entries(l.campos).slice(0, 3)
  if (pares.length === 0) return <span className="text-gray-400">—</span>
  return (
    <span className="block max-w-md text-xs leading-relaxed">
      {pares.map(([chave, valores]) => (
        <span key={chave} className="mr-2 inline-block">
          <span className="text-gray-500">{chave.split('.')[1].replace(/_/g, ' ')}:</span>{' '}
          {truncar(valores.join(' | '), 40)}
        </span>
      ))}
    </span>
  )
}

const TabelaLeads: React.FC<{
  leads: LeadIntegracao[]
  /** Vazio quando o recorte mistura integrações — aí cada linha mostra os próprios campos. */
  camposDaIntegracao: CampoDisponivel[]
  nomeDe: (id: string) => string
  cores: Map<string, string>
  neutra: string
}> = ({ leads, camposDaIntegracao, nomeDe, cores, neutra }) => {
  if (leads.length === 0) {
    return <p className="py-6 text-center text-sm text-gray-500">Nenhum lead com os filtros atuais.</p>
  }

  const campos = camposDaIntegracao
  const colunaResumo = campos.length === 0

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700">
            <th className="py-2 pr-3 font-medium">Lead</th>
            <th className="whitespace-nowrap py-2 pr-3 font-medium">Integrações</th>
            <th className="whitespace-nowrap py-2 pr-3 font-medium">Estágio</th>
            <th className="whitespace-nowrap py-2 pr-3 font-medium">Proprietário</th>
            <th className="whitespace-nowrap py-2 pr-3 font-medium">Entrou em</th>
            {campos.map((c) => (
              <th key={c.chave} className="whitespace-nowrap py-2 pr-3 font-medium" title={c.rotulo}>
                {truncar(c.rotulo, 22)}
              </th>
            ))}
            {colunaResumo && <th className="py-2 font-medium">O que veio junto</th>}
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} className="border-b border-gray-100 align-top last:border-0 dark:border-gray-700/60">
              <td className="py-2 pr-3">
                <Link
                  to={`/crm?lead=${l.id}`}
                  className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  {truncar(l.nome, 28)}
                  <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                </Link>
                <div className="text-xs text-gray-500">{l.telefone || l.email || '—'}</div>
              </td>
              <td className="py-2 pr-3">
                <div className="flex flex-wrap gap-1">
                  {l.integracoes.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: cores.get(id) || neutra }}
                        aria-hidden
                      />
                      {nomeDe(id)}
                    </span>
                  ))}
                </div>
              </td>
              <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">
                <div>{l.estagio_nome || '—'}</div>
                <div className="text-xs text-gray-500">{l.funil_nome || ''}</div>
              </td>
              <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">{l.responsavel_nome || '—'}</td>
              <td className="py-2 pr-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                {dataBR(l.criado_em_dia)}
              </td>
              {campos.map((c) => (
                <td key={c.chave} className="py-2 pr-3 text-gray-700 dark:text-gray-300">
                  {(l.campos[c.chave] ?? []).length > 0 ? (
                    <span title={l.campos[c.chave].join(' | ')}>{truncar(l.campos[c.chave].join(' | '), 60)}</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              ))}
              {colunaResumo && <td className="py-2 text-gray-700 dark:text-gray-300">{resumoDosCampos(l)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
