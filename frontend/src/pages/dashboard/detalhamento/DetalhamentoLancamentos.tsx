import React, { useMemo, useState } from 'react'
import { Search, X, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui'
import { formatCurrency, formatDate } from '@/utils'
import { usePaletaViz } from '../contaazul/paleta'
import {
  AGRUPAMENTOS_DESPESA,
  AGRUPAMENTOS_RECEITA,
  agrupar,
  filtrarSituacao,
  ordenarPorData,
  somar,
  type Lancamento,
  type Situacao,
} from './agregacoes'

/**
 * Seção de detalhamento do dashboard: um ranking (quem pagou / com o que foi
 * gasto) ao lado do extrato lançamento a lançamento. Clicar numa linha do
 * ranking filtra o extrato.
 *
 * O ranking é HTML, não recharts: cada linha é um botão (teclado e leitor de
 * tela alcançam), o nome longo trunca por CSS com o nome inteiro no `title`, e
 * com 50 clientes a lista rola dentro do card em vez de esticar a página.
 * Série única — uma cor só, a da paleta validada, e o valor escrito em cada
 * linha, então a cor nunca responde sozinha.
 */

interface Props {
  tipo: 'receita' | 'despesa'
  lancamentos: Lancamento[]
  /** hoje: "01/06/2026 a 10/09/2026" */
  periodo: string
}

const TEXTOS = {
  receita: {
    titulo: 'Recebimentos — quem pagou',
    subtitulo: 'Tudo o que entrou no período e de quem veio.',
    situacoes: [
      { chave: 'pago', rotulo: 'Recebido' },
      { chave: 'aberto', rotulo: 'A receber' },
      { chave: 'tudo', rotulo: 'Tudo' },
    ],
    vazio: {
      pago: 'Nenhum recebimento no período.',
      aberto: 'Nada a receber no período.',
      tudo: 'Nenhuma receita no período.',
    },
    agrupamentos: AGRUPAMENTOS_RECEITA,
  },
  despesa: {
    titulo: 'Gastos — com o que foi gasto',
    subtitulo: 'Tudo o que saiu no período e para onde foi.',
    situacoes: [
      { chave: 'pago', rotulo: 'Pago' },
      { chave: 'aberto', rotulo: 'A pagar' },
      { chave: 'tudo', rotulo: 'Tudo' },
    ],
    vazio: {
      pago: 'Nenhum pagamento no período.',
      aberto: 'Nada a pagar no período.',
      tudo: 'Nenhuma despesa no período.',
    },
    agrupamentos: AGRUPAMENTOS_DESPESA,
  },
} as const

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const formatPercent = (v: number) =>
  `${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`

/** Segmentado — mesmo desenho do filtro "Tipo" do Conta Azul. */
const Segmentado: React.FC<{
  rotulo: string
  opcoes: readonly { chave: string; rotulo: string }[]
  valor: string
  onChange: (chave: string) => void
}> = ({ rotulo, opcoes, valor, onChange }) => (
  <div className="flex items-center gap-2">
    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{rotulo}</span>
    <div className="inline-flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600">
      {opcoes.map((o) => {
        const ativo = o.chave === valor
        return (
          <button
            key={o.chave}
            type="button"
            onClick={() => onChange(o.chave)}
            aria-pressed={ativo}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              ativo
                ? 'bg-primary-700 text-white dark:bg-primary-500'
                : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800'
            }`}
          >
            {o.rotulo}
          </button>
        )
      })}
    </div>
  </div>
)

/** Situação escrita, com ícone — nunca só a cor. */
const SituacaoLinha: React.FC<{ l: Lancamento; tipo: Props['tipo'] }> = ({ l, tipo }) => {
  if (l.status === 'PAGO') {
    return (
      <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3" />
        {tipo === 'receita' ? 'recebido' : 'pago'} em {formatDate(l.pagamento ?? l.vencimento)}
      </span>
    )
  }
  if (l.status === 'ATRASADO') {
    return (
      <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400">
        <AlertTriangle className="h-3 w-3" />
        venceu em {formatDate(l.vencimento)}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
      <Clock className="h-3 w-3" />
      vence em {formatDate(l.vencimento)}
    </span>
  )
}

export const DetalhamentoLancamentos: React.FC<Props> = ({ tipo, lancamentos, periodo }) => {
  const paleta = usePaletaViz()
  const t = TEXTOS[tipo]
  const cor = tipo === 'receita' ? paleta.receber : paleta.pagar

  const [situacao, setSituacao] = useState<Situacao>('pago')
  const [agrupamento, setAgrupamento] = useState<string>(t.agrupamentos[0].chave)
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [busca, setBusca] = useState('')

  const opcaoAgrupamento = t.agrupamentos.find((a) => a.chave === agrupamento) ?? t.agrupamentos[0]

  const naSituacao = useMemo(() => filtrarSituacao(lancamentos, situacao), [lancamentos, situacao])
  const grupos = useMemo(() => agrupar(naSituacao, agrupamento), [naSituacao, agrupamento])
  const total = useMemo(() => somar(naSituacao), [naSituacao])
  const maior = grupos[0]?.valor || 0

  const extrato = useMemo(() => {
    let linhas = naSituacao
    if (selecionado) linhas = linhas.filter((l) => l.grupos[agrupamento] === selecionado)
    const termo = semAcento(busca.trim())
    if (termo) {
      linhas = linhas.filter((l) =>
        semAcento([l.descricao, ...Object.values(l.grupos)].join(' ')).includes(termo)
      )
    }
    return ordenarPorData(linhas)
  }, [naSituacao, selecionado, agrupamento, busca])

  const totalExtrato = useMemo(() => somar(extrato), [extrato])

  const trocarAgrupamento = (chave: string) => {
    setAgrupamento(chave)
    // O nome selecionado era de outro agrupamento (um cliente não é um produto).
    setSelecionado(null)
  }

  // Na linha do extrato, o que ajuda a reconhecer o lançamento além da descrição.
  const contexto = (l: Lancamento) =>
    tipo === 'receita'
      ? [l.grupos.cliente, l.grupos.produto]
      : [l.grupos.categoria]

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t.titulo}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t.subtitulo} Clique num nome para ver os lançamentos dele.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Segmentado
            rotulo="Situação"
            opcoes={t.situacoes}
            valor={situacao}
            onChange={(c) => setSituacao(c as Situacao)}
          />
          <Segmentado
            rotulo="Agrupar por"
            opcoes={t.agrupamentos}
            valor={agrupamento}
            onChange={trocarAgrupamento}
          />
        </div>
      </div>

      {/* Número-resumo: o total do recorte e de quantos ele se compõe */}
      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
          {formatCurrency(total)}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {naSituacao.length} {naSituacao.length === 1 ? 'lançamento' : 'lançamentos'} ·{' '}
          {grupos.length} {grupos.length === 1 ? opcaoAgrupamento.rotulo.toLowerCase() : opcaoAgrupamento.plural}
          {periodo && <> · {periodo}</>}
        </span>
      </div>

      {naSituacao.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
          {t.vazio[situacao]}
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* ------------------------------------------------ ranking --- */}
          <div className="lg:col-span-2">
            <p className="mb-2 flex items-center text-xs font-medium uppercase tracking-wide text-gray-500 lg:min-h-[34px] dark:text-gray-400">
              Por {opcaoAgrupamento.rotulo.toLowerCase()}
            </p>
            <ul className="max-h-[460px] space-y-0.5 overflow-y-auto pr-1">
              {grupos.map((g) => {
                const ativo = selecionado === g.nome
                const apagado = selecionado !== null && !ativo
                const largura = maior > 0 ? Math.max((g.valor / maior) * 100, g.valor > 0 ? 1 : 0) : 0
                return (
                  <li key={g.nome}>
                    <button
                      type="button"
                      onClick={() => setSelecionado(ativo ? null : g.nome)}
                      aria-pressed={ativo}
                      title={`${g.nome} — ${formatCurrency(g.valor)} em ${g.quantidade} ${g.quantidade === 1 ? 'lançamento' : 'lançamentos'}`}
                      className={`w-full rounded-md px-2 py-1.5 text-left transition-colors ${
                        ativo
                          ? 'bg-primary-50 ring-1 ring-primary-300 dark:bg-primary-900/40 dark:ring-primary-700'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
                      }`}
                    >
                      <div className="flex items-baseline gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-200">{g.nome}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                          {formatCurrency(g.valor)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                          <div
                            className="h-full rounded-full transition-opacity"
                            style={{ width: `${largura}%`, background: cor, opacity: apagado ? 0.35 : 1 }}
                          />
                        </div>
                        <span className="w-28 shrink-0 text-right text-xs tabular-nums text-gray-500 dark:text-gray-400">
                          {formatPercent(total > 0 ? (g.valor / total) * 100 : 0)} · {g.quantidade} lanç.
                        </span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* ------------------------------------------------ extrato --- */}
          <div className="lg:col-span-3">
            <div className="mb-2 flex min-h-[34px] flex-wrap items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Lançamentos
              </p>
              {selecionado && (
                <button
                  type="button"
                  onClick={() => setSelecionado(null)}
                  className="inline-flex max-w-[16rem] items-center gap-1 rounded-full border border-primary-300 bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-800 dark:border-primary-700 dark:bg-primary-900/40 dark:text-primary-200"
                  title="Limpar seleção"
                >
                  <span className="truncate">{selecionado}</span>
                  <X className="h-3 w-3 shrink-0" />
                </button>
              )}
              <div className="relative ml-auto w-full sm:w-56">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar lançamento…"
                  aria-label="Buscar lançamento"
                  className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-700">
              {extrato.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                  Nenhum lançamento{selecionado ? ` de "${selecionado}"` : ''}
                  {busca.trim() ? ` com "${busca.trim()}"` : ''} nesta situação.
                </p>
              ) : (
                <ul className="max-h-[420px] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-700">
                  {extrato.map((l) => (
                    <li key={l.id} className="flex items-start gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium text-gray-900 sm:truncate dark:text-gray-100" title={l.descricao}>
                          {l.descricao}
                          {l.parcela && (
                            <span className="ml-1.5 text-xs font-normal text-gray-500 dark:text-gray-400">
                              parcela {l.parcela}
                            </span>
                          )}
                        </p>
                        <p className="break-words text-xs text-gray-500 sm:truncate dark:text-gray-400">
                          {contexto(l).join(' · ')}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                          {formatCurrency(l.valor)}
                        </p>
                        <p className="text-xs">
                          <SituacaoLinha l={l} tipo={tipo} />
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900/40">
                <span className="text-gray-600 dark:text-gray-400">
                  {extrato.length} {extrato.length === 1 ? 'lançamento' : 'lançamentos'}
                </span>
                <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  {formatCurrency(totalExtrato)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
