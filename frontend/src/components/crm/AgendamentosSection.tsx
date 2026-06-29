import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  Bell, Clock, CheckCircle, XCircle, AlertCircle, RefreshCw,
  Phone, Mail, Users, FileText, CalendarClock
} from 'lucide-react'
import { followupsApi, tarefasApi } from '@/api/crm'
import type { Followup } from '@/api/crm'
import type { Tarefa } from '@/types/crm'

type TarefaComExtra = Tarefa & { lead_nome?: string; responsavel_nome?: string; funil_tipo?: string }

const TIPO_TAREFA_LABEL: Record<string, string> = {
  ligacao: 'Ligação',
  reuniao: 'Reunião',
  email: 'E-mail',
  follow_up: 'Follow-up',
  proposta: 'Proposta',
  visita: 'Visita',
  outros: 'Outros',
}

const TIPO_TAREFA_ICONE: Record<string, typeof Clock> = {
  ligacao: Phone,
  reuniao: Users,
  email: Mail,
  follow_up: Bell,
  proposta: FileText,
  visita: CalendarClock,
  outros: Clock,
}

const PRIORIDADE_COR: Record<string, string> = {
  baixa: 'text-gray-500 dark:text-gray-400',
  normal: 'text-blue-600 dark:text-blue-400',
  alta: 'text-amber-600 dark:text-amber-400',
  urgente: 'text-red-600 dark:text-red-400',
}

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

function isAtrasado(data: string) {
  return new Date(data) < new Date()
}

interface AgendamentosSectionProps {
  funilTipo?: 'aquisicao' | 'cx'
}

export function AgendamentosSection({ funilTipo }: AgendamentosSectionProps) {
  const [followups, setFollowups] = useState<Followup[]>([])
  const [tarefas, setTarefas] = useState<TarefaComExtra[]>([])
  const [loading, setLoading] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const [fups, tafs] = await Promise.all([
        followupsApi.listarTodos('todos', 'pendente', funilTipo),
        tarefasApi.listByEmpresa({ funil_tipo: funilTipo }),
      ])
      setFollowups(fups)
      setTarefas(tafs.filter((t) => t.status === 'pendente' || t.status === 'em_andamento'))
    } catch {
      // silencioso
    } finally {
      setLoading(false)
    }
  }, [funilTipo])

  const cancelarFollowup = async (id: number) => {
    try {
      await followupsApi.cancelar(id)
      toast.success('Follow-up cancelado')
      setFollowups((prev) => prev.filter((f) => f.id !== id))
    } catch {
      toast.error('Erro ao cancelar follow-up')
    }
  }

  const concluirTarefa = async (id: number) => {
    try {
      await tarefasApi.concluir(id)
      toast.success('Tarefa concluída')
      setTarefas((prev) => prev.filter((t) => t.id !== id))
    } catch {
      toast.error('Erro ao concluir tarefa')
    }
  }

  useEffect(() => {
    carregar()
  }, [carregar])

  const total = followups.length + tarefas.length
  if (!loading && total === 0) return null

  return (
    <div className="mb-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-orange-500" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Agendamentos e marcações
          </h2>
          {!loading && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {total} pendente{total !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={carregar}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500"
          title="Atualizar"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
          <RefreshCw size={14} className="animate-spin" /> Carregando...
        </div>
      ) : (
        <ul className="space-y-2">
          {/* Follow-ups */}
          {followups.map((f) => {
            const atrasado = isAtrasado(f.agendado_para)
            return (
              <li
                key={`fup-${f.id}`}
                className={`rounded-lg border p-3 ${
                  atrasado
                    ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10'
                    : 'border-orange-100 bg-orange-50 dark:border-orange-900/40 dark:bg-orange-900/10'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        f.tipo === 'agente_ia'
                          ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                          : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                      }`}
                    >
                      <Bell size={14} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {f.lead_nome ?? `Lead #${f.lead_id}`}
                        </span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                            f.tipo === 'agente_ia'
                              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                              : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                          }`}
                        >
                          {f.tipo === 'agente_ia' ? 'Agente IA' : 'Follow-up manual'}
                        </span>
                        {f.estagio_nome && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: f.estagio_cor || '#6366f1' }}
                          >
                            {f.estagio_nome}
                          </span>
                        )}
                        {atrasado && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-red-600 dark:text-red-400 font-medium">
                            <AlertCircle size={11} /> Atrasado
                          </span>
                        )}
                      </div>
                      <p className={`mt-0.5 text-xs ${atrasado ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                        <Clock size={11} className="inline mr-1" />
                        {formatarData(f.agendado_para)}
                        {f.usuario_nome && ` · por ${f.usuario_nome}`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => cancelarFollowup(f.id)}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300"
                    title="Cancelar follow-up"
                  >
                    <XCircle size={12} /> Cancelar
                  </button>
                </div>
              </li>
            )
          })}

          {/* Tarefas */}
          {tarefas.map((t) => {
            const Icone = TIPO_TAREFA_ICONE[t.tipo] ?? Clock
            const atrasado = isAtrasado(t.data_vencimento)
            return (
              <li
                key={`tar-${t.id}`}
                className={`rounded-lg border p-3 ${
                  atrasado
                    ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10'
                    : 'border-blue-100 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/10'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      <Icone size={14} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {t.titulo}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-medium">
                          {TIPO_TAREFA_LABEL[t.tipo] ?? t.tipo}
                        </span>
                        <span className={`text-xs font-medium ${PRIORIDADE_COR[t.prioridade] ?? ''}`}>
                          {t.prioridade}
                        </span>
                        {atrasado && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-red-600 dark:text-red-400 font-medium">
                            <AlertCircle size={11} /> Atrasada
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {t.lead_nome && (
                          <span>Lead <strong className="text-gray-700 dark:text-gray-300">{t.lead_nome}</strong> · </span>
                        )}
                        <Clock size={11} className="inline mr-1" />
                        <span className={atrasado ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                          {formatarData(t.data_vencimento)}
                        </span>
                        {t.responsavel_nome && (
                          <span> · por {t.responsavel_nome}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => concluirTarefa(t.id)}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300"
                    title="Marcar como concluída"
                  >
                    <CheckCircle size={12} /> Concluir
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
