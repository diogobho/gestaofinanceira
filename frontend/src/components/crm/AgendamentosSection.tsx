import { useState, useMemo, useCallback } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import {
  Bell, Clock, CheckCircle, XCircle, AlertCircle, RefreshCw, Bot,
  Phone, Mail, Users, FileText, CalendarClock, ChevronRight, AlertTriangle, Smartphone,
} from 'lucide-react'
import { followupsApi, tarefasApi } from '@/api/crm'
import type { Followup } from '@/api/crm'
import { useAllFollowups, useFollowupMetricas } from '@/hooks/useCRM'
import { IntervaloEnvioConfig } from './IntervaloEnvioConfig'
import { TourHelpButton } from '@/components/tour/TourHelpButton'
import AgendamentoDetalheDrawer from './AgendamentoDetalheDrawer'
import LeadDetailsModal from './LeadDetailsModal'
import { useLead, useEstagios, useTarefasEmpresa } from '@/hooks/useCRM'
import { resolverEstado, APRESENTACAO } from '@/utils/followupStatus'
import type { Tarefa } from '@/types/crm'

type TarefaComExtra = Tarefa & { lead_nome?: string; responsavel_nome?: string; funil_tipo?: string }

const TIPO_TAREFA_LABEL: Record<string, string> = {
  ligacao: 'Ligação', reuniao: 'Reunião', email: 'E-mail', follow_up: 'Follow-up',
  proposta: 'Proposta', visita: 'Visita', outros: 'Outros',
}
const TIPO_TAREFA_ICONE: Record<string, typeof Clock> = {
  ligacao: Phone, reuniao: Users, email: Mail, follow_up: Bell,
  proposta: FileText, visita: CalendarClock, outros: Clock,
}
const PRIORIDADE_COR: Record<string, string> = {
  baixa: 'text-gray-500 dark:text-gray-400',
  normal: 'text-blue-600 dark:text-blue-400',
  alta: 'text-amber-600 dark:text-amber-400',
  urgente: 'text-red-600 dark:text-red-400',
}

/**
 * Abas de status da tela.
 *
 * Cada uma vira uma consulta que o backend JÁ sabia responder — `filtro` +
 * `status` de `GET /crm/followups`. "Atrasados" é o único que não é um status no
 * banco: é `filtro=atrasados`, que o serviço traduz para pendente com
 * `agendado_para < NOW()`. Nenhum endpoint novo foi criado para esta tela.
 */
const ABAS: Array<{
  chave: string
  rotulo: string
  filtro: 'hoje' | 'semana' | 'atrasados' | 'todos'
  status?: string
}> = [
  { chave: 'agendados', rotulo: 'Agendados', filtro: 'todos', status: 'pendente' },
  { chave: 'atrasados', rotulo: 'Atrasados', filtro: 'atrasados' },
  { chave: 'falhos', rotulo: 'Falhos', filtro: 'todos', status: 'falhou' },
  { chave: 'enviados', rotulo: 'Enviados', filtro: 'todos', status: 'enviado' },
  { chave: 'cancelados', rotulo: 'Cancelados', filtro: 'todos', status: 'cancelado' },
  { chave: 'todos', rotulo: 'Todos', filtro: 'todos', status: 'todos' },
]

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}
function isAtrasado(data: string) {
  return new Date(data) < new Date()
}

/** Card compacto de um agendamento. A hierarquia é: lead → o que/quando → por quem. */
function CardAgendamento({ f, onAbrir }: { f: Followup; onAbrir: (f: Followup) => void }) {
  const estado = resolverEstado(f)
  const ap = APRESENTACAO[estado]
  const ehIA = f.tipo === 'agente_ia'

  return (
    <li>
      <button
        onClick={() => onAbrir(f)}
        className="flex w-full items-stretch gap-0 overflow-hidden rounded-lg border-[1px] border-gray-200 bg-white text-left transition hover:border-gray-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
      >
        {/* Faixa de status: a leitura mais rápida da lista inteira */}
        <span className={`w-1 shrink-0 ${ap.faixa}`} aria-hidden />
        <div className="min-w-0 flex-1 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {f.lead_nome ?? `Lead #${f.lead_id}`}
            </span>
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${ap.badge}`}>
              {ap.rotulo}
            </span>
            {f.cadencia_desatualizada && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full border-[1px] border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
                title="Este passo foi criado pela cadência de outra etapa"
              >
                <AlertTriangle size={10} /> Etapa anterior
              </span>
            )}
            {f.lead_arquivado && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-500/20 dark:text-slate-300">
                Lead arquivado
              </span>
            )}
          </div>

          {/* Próxima ação: o que vai acontecer, quando, em qual etapa */}
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-gray-600 dark:text-gray-300">
            {ehIA ? <Bot size={12} className="text-primary-500" /> : <Bell size={12} className="text-orange-500" />}
            <span className="font-medium">{ehIA ? 'Agente IA' : 'Follow-up manual'}</span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className={estado === 'atrasado' ? 'font-medium text-amber-700 dark:text-amber-400' : ''}>
              {formatarData(f.agendado_para)}
            </span>
            {f.estagio_nome && (
              <>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[11px] text-white"
                  style={{ backgroundColor: f.estagio_cor || '#6366f1' }}
                >
                  {f.estagio_nome}
                </span>
              </>
            )}
          </p>

          {/* Por qual chip a mensagem sai */}
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400">
            <Smartphone size={10} />
            {f.responsavel_nome || f.usuario_nome || '—'}
            {f.responsavel_porta ? ` · porta ${f.responsavel_porta}` : ''}
          </p>
        </div>
        <ChevronRight size={16} className="mr-2 shrink-0 self-center text-gray-300" />
      </button>
    </li>
  )
}

interface AgendamentosSectionProps {
  funilTipo?: 'aquisicao' | 'cx'
}

export function AgendamentosSection({ funilTipo }: AgendamentosSectionProps) {
  const queryClient = useQueryClient()
  const [aba, setAba] = useState('agendados')
  const [porResponsavel, setPorResponsavel] = useState('')
  const [porEstagio, setPorEstagio] = useState('')
  const [porTipo, setPorTipo] = useState('')
  const [detalhe, setDetalhe] = useState<Followup | null>(null)
  const [confirmar, setConfirmar] = useState<Followup | null>(null)
  const [motivo, setMotivo] = useState('')
  const [leadAberto, setLeadAberto] = useState<number | null>(null)

  const abaAtual = ABAS.find((a) => a.chave === aba) ?? ABAS[0]
  const { data: followups = [], isFetching, refetch } = useAllFollowups(
    abaAtual.filtro, abaAtual.status, funilTipo
  )
  const { data: metricas } = useFollowupMetricas()
  const { data: tarefasRaw = [], refetch: refetchTarefas } = useTarefasEmpresa({ funil_tipo: funilTipo })

  const tarefas = useMemo(
    () => (tarefasRaw as TarefaComExtra[]).filter((t) => t.status === 'pendente' || t.status === 'em_andamento'),
    [tarefasRaw]
  )

  // Opções dos filtros secundários saem da própria lista carregada — nada de
  // consulta extra só para popular um select.
  const responsaveis = useMemo(
    () => [...new Set(followups.map((f) => f.responsavel_nome).filter(Boolean))].sort() as string[],
    [followups]
  )
  const estagios = useMemo(
    () => [...new Set(followups.map((f) => f.estagio_nome).filter(Boolean))].sort() as string[],
    [followups]
  )

  const visiveis = useMemo(() => followups.filter((f) => {
    if (porResponsavel && f.responsavel_nome !== porResponsavel) return false
    if (porEstagio && f.estagio_nome !== porEstagio) return false
    if (porTipo && f.tipo !== porTipo) return false
    // "Agendados" pede o que ainda vai acontecer; o atrasado tem aba própria.
    if (aba === 'agendados' && isAtrasado(f.agendado_para)) return false
    return true
  }), [followups, porResponsavel, porEstagio, porTipo, aba])

  const recarregar = useCallback(() => {
    refetch()
    refetchTarefas()
    queryClient.invalidateQueries({ queryKey: ['crm', 'followups-metricas'] })
  }, [refetch, refetchTarefas, queryClient])

  const confirmarCancelamento = async () => {
    if (!confirmar) return
    try {
      await followupsApi.cancelar(confirmar.id, motivo.trim() || undefined)
      toast.success('Envio cancelado — o registro fica no histórico')
      setConfirmar(null)
      setMotivo('')
      setDetalhe(null)
      recarregar()
    } catch {
      toast.error('Erro ao cancelar o agendamento')
    }
  }

  const concluirTarefa = async (id: number) => {
    try {
      await tarefasApi.concluir(id)
      toast.success('Tarefa concluída')
      refetchTarefas()
    } catch {
      toast.error('Erro ao concluir tarefa')
    }
  }

  const { data: leadDetalhe } = useLead(leadAberto ?? undefined)
  const { data: estagiosDoFunil = [] } = useEstagios(leadDetalhe?.funil_id)

  const semNada = !isFetching && followups.length === 0 && tarefas.length === 0
    && aba === 'agendados' && !metricas?.total_pendentes && !metricas?.total_falhados
  if (semNada) return null

  return (
    <div className="mb-6 space-y-3">
      {/* Cabeçalho + resumo (item 9: reusa GET /crm/followups/metricas) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-orange-500" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Agendamentos e marcações
          </h2>
        </div>
        <div className="flex items-center gap-1">
          {/* O tutorial desta tela é próprio: ela vive numa ABA do CRM, e o tour do
              funil não alcança nada daqui. */}
          <TourHelpButton tourId="agendamentos" label="" />
          <button
            onClick={recarregar}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            title="Atualizar"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {metricas && (
        <div data-tour="ag-resumo" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            // `total_pendentes` do endpoint inclui os atrasados. Mostrar o número cru
            // aqui faria o card dizer 2 enquanto a aba "Agendados" lista 1 — o card e a
            // aba precisam contar a mesma coisa. Somados, os dois voltam ao total.
            {
              rotulo: 'Agendados',
              valor: Math.max(0, (metricas.total_pendentes ?? 0) - (metricas.total_atrasados ?? 0)),
              cor: 'text-sky-600 dark:text-sky-400',
            },
            { rotulo: 'Atrasados', valor: metricas.total_atrasados, cor: 'text-amber-600 dark:text-amber-400' },
            { rotulo: 'Falhos', valor: metricas.total_falhados, cor: 'text-red-600 dark:text-red-400' },
            {
              rotulo: metricas.periodo_ativo ? 'No período' : 'Para hoje',
              valor: metricas.pendentes_hoje, cor: 'text-gray-700 dark:text-gray-200',
            },
          ].map((c) => (
            <div
              key={c.rotulo}
              className="rounded-lg border-[1px] border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
            >
              <p className="text-[11px] uppercase tracking-wide text-gray-400">{c.rotulo}</p>
              <p className={`text-lg font-semibold ${c.cor}`}>{c.valor?.toLocaleString('pt-BR') ?? 0}</p>
            </div>
          ))}
        </div>
      )}

      <IntervaloEnvioConfig />

      {/* Filtros (item 8) */}
      <div data-tour="ag-filtros" className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {ABAS.map((a) => (
            <button
              key={a.chave}
              onClick={() => setAba(a.chave)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                aba === a.chave
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
              }`}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
        <div data-tour="ag-filtros-sec" className="flex flex-wrap gap-2">
          <select
            value={porResponsavel}
            onChange={(e) => setPorResponsavel(e.target.value)}
            className="rounded-lg border-[1px] border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            <option value="">Todos os responsáveis</option>
            {responsaveis.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select
            value={porEstagio}
            onChange={(e) => setPorEstagio(e.target.value)}
            className="rounded-lg border-[1px] border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            <option value="">Todos os estágios</option>
            {estagios.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <select
            value={porTipo}
            onChange={(e) => setPorTipo(e.target.value)}
            className="rounded-lg border-[1px] border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            <option value="">Manual e Agente IA</option>
            <option value="agente_ia">Só Agente IA</option>
            <option value="manual">Só manual</option>
          </select>
        </div>
      </div>

      {/* Lista */}
      {visiveis.length === 0 ? (
        <p className="rounded-lg border-[1px] border-dashed border-gray-200 py-6 text-center text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
          Nenhum agendamento neste filtro.
        </p>
      ) : (
        <ul data-tour="ag-lista" className="space-y-2">
          {visiveis.map((f) => (
            <CardAgendamento key={`fup-${f.id}`} f={f} onAbrir={setDetalhe} />
          ))}
        </ul>
      )}

      {followups.length >= 200 && (
        <p className="text-[11px] text-gray-400">
          Mostrando os 200 primeiros deste filtro. Use os filtros para estreitar a lista.
        </p>
      )}

      {/* Tarefas — outra natureza de item, por isso em bloco próprio */}
      {tarefas.length > 0 && (
        <div className="space-y-2 pt-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Tarefas e marcações ({tarefas.length})
          </h3>
          <ul className="space-y-2">
            {tarefas.map((t) => {
              const Icone = TIPO_TAREFA_ICONE[t.tipo] ?? Clock
              const atrasado = isAtrasado(t.data_vencimento)
              return (
                <li
                  key={`tar-${t.id}`}
                  className={`rounded-lg border-[1px] p-3 ${
                    atrasado
                      ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10'
                      : 'border-blue-100 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        <Icone size={14} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-gray-900 dark:text-white">{t.titulo}</span>
                          <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                            {TIPO_TAREFA_LABEL[t.tipo] ?? t.tipo}
                          </span>
                          <span className={`text-xs font-medium ${PRIORIDADE_COR[t.prioridade] ?? ''}`}>{t.prioridade}</span>
                          {atrasado && (
                            <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                              <AlertCircle size={11} /> Atrasada
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {t.lead_nome && (
                            <span>Lead <strong className="text-gray-700 dark:text-gray-300">{t.lead_nome}</strong> · </span>
                          )}
                          <Clock size={11} className="mr-1 inline" />
                          <span className={atrasado ? 'font-medium text-red-600 dark:text-red-400' : ''}>
                            {formatarData(t.data_vencimento)}
                          </span>
                          {t.responsavel_nome && <span> · por {t.responsavel_nome}</span>}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => concluirTarefa(t.id)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300"
                    >
                      <CheckCircle size={12} /> Concluir
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <AgendamentoDetalheDrawer
        followup={detalhe}
        onFechar={() => setDetalhe(null)}
        onVerLead={(leadId) => setLeadAberto(leadId)}
        onCancelar={(f) => { setConfirmar(f); setMotivo('') }}
      />

      {/* Confirmação de cancelamento (item 5) */}
      {confirmar && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-2xl dark:bg-gray-800">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
              <XCircle size={16} className="text-red-500" /> Cancelar este envio?
            </h3>
            <div className="mt-3 rounded-lg bg-gray-50 p-2.5 text-xs text-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
              <p><strong>{confirmar.lead_nome ?? `Lead #${confirmar.lead_id}`}</strong></p>
              <p className="mt-0.5">
                {confirmar.tipo === 'agente_ia' ? 'Follow-up do Agente IA' : 'Follow-up manual'}
                {confirmar.estagio_nome ? ` · ${confirmar.estagio_nome}` : ''}
              </p>
              <p className="mt-0.5">Previsto para {formatarData(confirmar.agendado_para)}</p>
            </div>
            <p className="mt-2.5 text-xs text-gray-600 dark:text-gray-300">
              A mensagem <strong>não será enviada</strong>. O registro continua no histórico
              do lead, marcado como cancelado.
            </p>
            <label className="mt-3 block text-xs text-gray-600 dark:text-gray-300">
              Motivo (opcional)
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex: lead já respondeu por outro canal"
                className="mt-1 w-full rounded-lg border-[1px] border-gray-200 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setConfirmar(null); setMotivo('') }}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Manter agendado
              </button>
              <button
                onClick={confirmarCancelamento}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
              >
                Cancelar envio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* "Ver lead" reaproveita o modal que o Kanban já usa (item 14) */}
      {leadAberto && leadDetalhe && (
        <LeadDetailsModal
          lead={leadDetalhe}
          estagios={estagiosDoFunil}
          isOpen
          onClose={() => setLeadAberto(null)}
        />
      )}
    </div>
  )
}
