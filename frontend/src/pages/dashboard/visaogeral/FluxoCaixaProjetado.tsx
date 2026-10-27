import React from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot, ResponsiveContainer } from 'recharts'
import { Card } from '@/components/ui'
import { formatCurrency, formatDate } from '@/utils'
import type { PaletaViz } from '../contaazul/paleta'
import { HORIZONTES, recorteFluxo, type DiaFluxo, type Horizonte } from './fluxoCaixa'
import { TabelaDoGrafico, TooltipGrafico } from './graficoUi'

/**
 * Cartão do fluxo de caixa previsto: uma linha só (a sobra acumulada), com a
 * área verde acima de zero e vermelha abaixo — o corte é um gradiente com a
 * parada exatamente na altura do zero, então a cor muda no ponto certo e não
 * no dia seguinte. O pior dia ganha um marcador quando a sobra fica negativa.
 */

interface Props {
  dias: DiaFluxo[] | null
  paleta: PaletaViz
  horizonte: Horizonte
  onHorizonte: (h: Horizonte) => void
  formatCompact: (v: number) => string
}

const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const diaPorExtenso = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
}

export const FluxoCaixaProjetado: React.FC<Props> = ({ dias, paleta, horizonte, onHorizonte, formatCompact }) => {
  if (!dias) {
    return (
      <Card className="p-4 sm:p-6">
        <div className="h-72 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700/50" aria-label="Carregando a previsão" />
      </Card>
    )
  }

  const { serie, entradas, saidas, saldo, pior } = recorteFluxo(dias, horizonte)
  const valores = serie.map((d) => d.saldo)
  const max = Math.max(0, ...valores)
  const min = Math.min(0, ...valores)
  // Onde o zero cai no gradiente (0 = topo, 1 = base).
  const corte = max - min > 0 ? max / (max - min) : 1
  const temMovimento = entradas > 0 || saidas > 0
  const ficaNegativo = pior && pior.saldo < 0

  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Fluxo de caixa previsto</h3>
          <p className="text-xs text-gray-400">
            O que ainda vai entrar e sair de hoje em diante, e quanto sobra somando dia a dia. Não inclui o saldo do banco nem receitas em atraso.
          </p>
        </div>
        <div role="group" aria-label="Horizonte da previsão" className="inline-flex rounded-lg border border-gray-300 p-0.5 dark:border-gray-600">
          {HORIZONTES.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={horizonte === h}
              onClick={() => onHorizonte(h)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition sm:text-sm ${
                horizonte === h
                  ? 'bg-primary-600 text-white dark:bg-primary-500'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {h} dias
            </button>
          ))}
        </div>
      </div>

      <dl className="mb-4 grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { rotulo: 'Vai entrar', valor: entradas, cor: paleta.receber },
          { rotulo: 'Vai sair', valor: saidas, cor: paleta.pagar },
          { rotulo: `Sobra em ${horizonte} dias`, valor: saldo, cor: saldo >= 0 ? paleta.saldo : paleta.atrasado },
        ].map((t) => (
          <div key={t.rotulo} className="rounded-lg bg-gray-50 p-2.5 sm:p-3 dark:bg-gray-900/40">
            <dt className="flex items-center gap-1.5 text-[11px] text-gray-500 sm:text-xs dark:text-gray-400">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: t.cor }} aria-hidden />
              {t.rotulo}
            </dt>
            <dd className="mt-0.5 text-sm font-bold tabular-nums text-gray-900 sm:text-lg dark:text-gray-100">{formatCurrency(t.valor)}</dd>
          </div>
        ))}
      </dl>

      {!temMovimento ? (
        <p className="flex h-48 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          Nada a receber nem a pagar nos próximos {horizonte} dias
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300" aria-live="polite">
            {ficaNegativo
              ? `Atenção: o pior momento é ${diaPorExtenso(pior.data)}, quando faltam ${formatCurrency(-pior.saldo)}.`
              : 'A sobra não fica negativa em nenhum dia do período.'}
          </p>
          <div
            data-grafico="fluxo-caixa"
            style={{ width: '100%', height: '260px' }}
            role="img"
            aria-label={`Sobra acumulada nos próximos ${horizonte} dias: termina em ${formatCurrency(saldo)}.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serie} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fluxoTraco" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={corte} stopColor={paleta.receber} />
                    <stop offset={corte} stopColor={paleta.atrasado} />
                  </linearGradient>
                  <linearGradient id="fluxoArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={0} stopColor={paleta.receber} stopOpacity={0.35} />
                    <stop offset={corte} stopColor={paleta.receber} stopOpacity={0.05} />
                    <stop offset={corte} stopColor={paleta.atrasado} stopOpacity={0.05} />
                    <stop offset={1} stopColor={paleta.atrasado} stopOpacity={0.35} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={paleta.grid} vertical={false} />
                <XAxis
                  dataKey="data"
                  tickFormatter={diaCurto}
                  stroke={paleta.eixo}
                  tick={{ fontSize: 11, fill: paleta.eixo }}
                  minTickGap={28}
                />
                <YAxis stroke={paleta.eixo} tick={{ fontSize: 11, fill: paleta.eixo }} tickFormatter={(v) => formatCompact(Number(v))} width={64} />
                <ReferenceLine y={0} stroke={paleta.eixo} strokeDasharray="4 4" />
                <Tooltip
                  cursor={{ stroke: paleta.eixo, strokeDasharray: '3 3' }}
                  content={(p: any) => (
                    <TooltipGrafico
                      {...p}
                      paleta={paleta}
                      payload={
                        p.payload?.length
                          ? [
                              { name: 'Entra', value: p.payload[0].payload.entradas, color: paleta.receber, dataKey: 'entradas', payload: p.payload[0].payload },
                              { name: 'Sai', value: p.payload[0].payload.saidas, color: paleta.pagar, dataKey: 'saidas', payload: p.payload[0].payload },
                            ]
                          : []
                      }
                      titulo={(d) => diaPorExtenso(d.data)}
                      rodape={(d) => (
                        <span className="flex justify-between gap-4 font-semibold">
                          <span>Sobra acumulada</span>
                          <span className="tabular-nums">{formatCurrency(d.saldo)}</span>
                        </span>
                      )}
                    />
                  )}
                />
                <Area
                  // Degrau, não curva: a sobra só muda no dia em que algo vence.
                  type="stepAfter"
                  dataKey="saldo"
                  name="Sobra acumulada"
                  stroke="url(#fluxoTraco)"
                  strokeWidth={2}
                  fill="url(#fluxoArea)"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: paleta.tooltipBg }}
                />
                {ficaNegativo && (
                  <ReferenceDot x={pior.data} y={pior.saldo} r={5} fill={paleta.atrasado} stroke={paleta.tooltipBg} strokeWidth={2} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <TabelaDoGrafico
            legenda={`Dias com movimento nos próximos ${horizonte} dias`}
            resumo="Ver os dias com movimento em tabela"
            linhas={serie.filter((d) => d.entradas > 0 || d.saidas > 0)}
            colunas={[
              { titulo: 'Dia', valor: (d) => formatDate(d.data) },
              { titulo: 'Entra', valor: (d) => formatCurrency(d.entradas), numero: true },
              { titulo: 'Sai', valor: (d) => formatCurrency(d.saidas), numero: true },
              { titulo: 'Sobra acumulada', valor: (d) => formatCurrency(d.saldo), numero: true },
            ]}
          />
        </>
      )}
    </Card>
  )
}
