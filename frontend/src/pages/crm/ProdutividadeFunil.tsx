import { useMemo } from 'react'
import { Activity, AlertTriangle, RefreshCw } from 'lucide-react'
import { useCRMProdutividade } from '@/hooks/useCRM'
import type { LinhaProdutividade } from '@/api/crm'

/**
 * Produtividade do funil (30/09/2026): o que a equipe contava à mão pelo WhatsApp.
 * As definições moram na API (`crm/dashboard/produtividade.ts`); aqui é só a leitura.
 * Sem funil escolhido não há o que mostrar: as etapas de reunião e oferta são do funil.
 */

interface Props {
  funilId?: number
  filtros: { data_inicio?: string; data_fim?: string; responsavel_id?: number }
}

const numero = (n: number) => n.toLocaleString('pt-BR')
const moeda = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (parte: number, todo: number) =>
  todo > 0 ? `${(Math.round((parte / todo) * 1000) / 10).toLocaleString('pt-BR')}%` : '—'
const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

const NOME_MARCO: Record<string, string> = {
  reuniao_agendada: 'Reunião agendada',
  reuniao_realizada: 'Reunião realizada',
  oferta: 'Reunião realizada, Objeção ou Fechamento',
  venda: 'etapa de ganho',
  perda: 'etapa de perda',
}

/** Todos os dias do período até hoje — dia sem atividade também é informação. */
function diasDoPeriodo(inicio: string, fim: string): string[] {
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
  const ultimo = fim < hoje ? fim : hoje
  const dias: string[] = []
  for (let d = new Date(`${inicio}T12:00:00Z`); d.toISOString().slice(0, 10) <= ultimo; d.setUTCDate(d.getUTCDate() + 1)) {
    dias.push(d.toISOString().slice(0, 10))
    if (dias.length > 400) break
  }
  return dias.reverse()
}

function Etapa({ titulo, valor, detalhe, sub }: { titulo: string; valor: string; detalhe: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{titulo}</p>
      <p className="text-2xl font-bold text-gray-800 mt-1">{valor}</p>
      <p className="text-xs text-gray-600 mt-0.5">{detalhe}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

const COLUNAS: Array<{ chave: keyof LinhaProdutividade; rotulo: string; dica: string; base?: keyof LinhaProdutividade }> = [
  { chave: 'trabalhados', rotulo: 'Faladas', dica: 'Pessoas faladas: receberam mensagem nossa. Card só movido, ou tarefa concluída sem mensagem, não conta' },
  { chave: 'responderam', rotulo: 'Responderam', dica: 'Das pessoas faladas, quantas responderam depois do contato (e o %)', base: 'trabalhados' },
  { chave: 'contatos_novos', rotulo: 'Novos', dica: 'Contatos novos: primeira mensagem nossa para o lead neste funil (lead transferido de outro funil conta como novo), sem ter avançado além disso' },
  { chave: 'retornos', rotulo: 'Retornos', dica: 'Contatos novos que responderam (e o % sobre os novos)', base: 'contatos_novos' },
  { chave: 'fup_leads', rotulo: 'FUP', dica: 'Leads com FUP: contato mais de 1 hora depois do primeiro ou tarefa de follow-up concluída, sem ter avançado além disso' },
  { chave: 'fup_responderam', rotulo: 'Resp. FUP', dica: 'Leads que responderam depois do FUP (e o % sobre os leads com FUP)', base: 'fup_leads' },
  { chave: 'perdas', rotulo: 'Perdas', dica: 'Leads que entraram na etapa de perda, sem ter tido reunião ou oferta' },
  { chave: 'reunioes_agendadas', rotulo: 'Agendadas', dica: 'Cards movidos para Reunião agendada, sem ter chegado à oferta' },
  { chave: 'ofertas', rotulo: 'Ofertas', dica: 'Cards movidos para Reunião realizada, Objeção ou Fechamento, sem ter fechado venda. Na linha Total, quem comprou também conta como oferta' },
  { chave: 'vendas', rotulo: 'Vendas', dica: 'Leads que entraram na etapa de ganho' },
]

export default function ProdutividadeFunil({ funilId, filtros }: Props) {
  const { data, isLoading, isFetching, isError } = useCRMProdutividade(funilId, filtros)

  const somaTrabalhados = data?.diario.reduce((s, d) => s + d.trabalhados, 0) ?? 0
  const diasComTrabalho = data?.diario.filter(d => d.trabalhados > 0).length ?? 0

  const linhas = useMemo(() => {
    if (!data) return []
    const porDia = new Map(data.diario.map(d => [d.dia, d]))
    return diasDoPeriodo(data.periodo.inicio, data.periodo.fim).map(dia => ({ dia, linha: porDia.get(dia) }))
  }, [data])

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="font-medium text-gray-800 flex items-center gap-2">
            <Activity size={18} className="text-gray-400" />
            Produtividade do funil
            {isFetching && !isLoading && <RefreshCw size={14} className="animate-spin text-gray-400" />}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {data
              ? `De ${dataCurta(data.periodo.inicio)} a ${dataCurta(data.periodo.fim)}${filtros.data_inicio || filtros.data_fim ? '' : ' (mês atual)'} · cada card conta uma vez, no indicador mais avançado`
              : 'Boca de funil, FUP, reuniões, ofertas e vendas'}
          </p>
        </div>
        {data && funilId && (
          <div className="text-right" title="Pessoas faladas: receberam mensagem nossa. Card só movido, ou tarefa concluída sem mensagem, não conta">
            <p className="text-2xl font-bold text-gray-800 leading-none">{numero(data.total.trabalhados)}</p>
            <p className="text-xs text-gray-500 mt-1">
              pessoas faladas · {numero(data.total.responderam)} responderam ({pct(data.total.responderam, data.total.trabalhados)})
              {diasComTrabalho > 0 && ` · média ${numero(Math.round(somaTrabalhados / diasComTrabalho))}/dia`}
            </p>
          </div>
        )}
      </div>

      {!funilId ? (
        <p className="text-sm text-gray-500 py-4 text-center">Escolha um funil no topo da página para ver a produtividade.</p>
      ) : isLoading ? (
        <div className="flex justify-center py-8"><RefreshCw className="animate-spin text-primary-400" size={20} /></div>
      ) : isError || !data ? (
        <p className="text-sm text-red-500 py-4 text-center">Não foi possível carregar a produtividade.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Etapa
              titulo="Boca de funil"
              valor={numero(data.total.contatos_novos)}
              detalhe="contatos novos"
              sub={`${numero(data.total.retornos)} retornaram (${pct(data.total.retornos, data.total.contatos_novos)})`}
            />
            <Etapa
              titulo="FUP"
              valor={numero(data.total.fup_leads)}
              detalhe={`leads · ${numero(data.total.fup_responderam)} responderam (${pct(data.total.fup_responderam, data.total.fup_leads)})`}
              sub={`contatos feitos: ${numero(data.total.fup_mensagens)} por mensagem + ${numero(data.total.fup_tarefas)} tarefas`}
            />
            <Etapa
              titulo="Reuniões agendadas"
              valor={numero(data.total.reunioes_agendadas)}
              detalhe="cards movidos no período"
              sub={`hoje em agendada: ${numero(data.atual.agendadas)}`}
            />
            <Etapa
              titulo="Ofertas"
              valor={numero(data.total.ofertas)}
              detalhe={`realizada, objeção, fechamento ou venda · ${numero(data.total.reunioes_realizadas)} com reunião (já dentro deste número)`}
              sub={`hoje em oferta: ${numero(data.atual.ofertas)}`}
            />
            <Etapa
              titulo="Vendas"
              valor={numero(data.total.vendas)}
              detalhe={moeda(data.total.valor_vendas)}
              sub={`${pct(data.total.vendas, data.total.ofertas)} das ofertas`}
            />
            <Etapa
              titulo="Perdas"
              valor={numero(data.total.perdas)}
              detalhe="leads perdidos"
              sub={`${numero(data.total.vendas)} ganhos para ${numero(data.total.perdas)} perdidos`}
            />
          </div>

          {data.atual.etapas.length > 0 && (
            <p className="mt-3 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
              <span className="font-medium text-gray-700">Hoje no funil{filtros.responsavel_id ? ' (deste responsável)' : ''}: </span>
              {data.atual.etapas.map(e => `${e.nome} ${numero(e.leads)}`).join(' · ')}
              <span className="text-gray-400"> — quantos cards estão em cada etapa agora, não importa quando entraram.</span>
            </p>
          )}

          {data.marcosAusentes.length > 0 && (
            <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                Este funil não tem etapa de {data.marcosAusentes.map(m => NOME_MARCO[m]).join(', ')} — esses
                indicadores ficam zerados. As etapas são reconhecidas pelo nome.
              </span>
            </p>
          )}

          <div className="mt-4 overflow-x-auto max-h-96 overflow-y-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 sticky top-0">
                <tr>
                  <th className="text-left font-medium px-3 py-2 whitespace-nowrap">Dia</th>
                  {COLUNAS.map(c => (
                    <th key={c.chave} title={c.dica} className="text-right font-medium px-2 py-2 whitespace-nowrap">{c.rotulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {linhas.map(({ dia, linha }) => (
                  <tr key={dia} className={linha ? '' : 'text-gray-300'}>
                    <td className="px-3 py-1.5 whitespace-nowrap text-gray-700">
                      {dataCurta(dia)} <span className="text-gray-400 text-xs">{DIAS_SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()]}</span>
                    </td>
                    {COLUNAS.map(c => (
                      <td key={c.chave} className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                        {linha && linha[c.chave] ? numero(linha[c.chave]) : '—'}
                        {c.base && linha && linha[c.base] > 0 && (
                          <span className="text-gray-400 text-xs ml-1">{pct(linha[c.chave], linha[c.base])}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold text-gray-800 sticky bottom-0">
                <tr>
                  <td className="px-3 py-2">Período</td>
                  {COLUNAS.map(c => (
                    <td key={c.chave} className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                      {numero(data.total[c.chave])}
                      {c.base && data.total[c.base] > 0 && (
                        <span className="text-gray-500 text-xs font-normal ml-1">{pct(data.total[c.chave], data.total[c.base])}</span>
                      )}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Cada card conta uma vez, no indicador mais avançado que alcançou: foi FUP e depois Objeção, conta
            só como Oferta. Por isso Novos, FUP, Perdas, Agendadas, Ofertas e Vendas podem ser somados.
            Contato é a conversa, não a mensagem: o que sai com menos de 1 hora da anterior é o mesmo contato.
            Contato é mensagem nossa: tarefa concluída sem mensagem no dia não conta. Lead transferido de
            outro funil conta como novo no primeiro contato depois da transferência.
            Card só movido, sem contato no período, não conta; e etapa em que o card ficou menos de 10 minutos
            (passagem a caminho de outra, como Objeção → Perda → Nutrição) também não. Venda conta sempre.
            Reunião realizada já está dentro de Ofertas.
            Somar os dias pode dar mais que o período, porque o mesmo card pode ter ação em vários dias.
            Mensagem mandada pelo celular conta, desde que o chip esteja conectado.
          </p>
        </>
      )}
    </div>
  )
}
