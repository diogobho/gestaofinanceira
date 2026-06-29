import { useState, useEffect, useCallback } from 'react'
import { Calendar, Users, XCircle, RefreshCw, Pencil, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { disparosAgendadosApi, type DisparoAgendado } from '@/api/crm'

function toLocalDatetimeInput(isoString: string): string {
  // Converte ISO UTC para string YYYY-MM-DDTHH:MM no fuso local do browser (Brasil)
  const d = new Date(isoString)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function EditForm({
  disparo,
  onSave,
  onCancel,
}: {
  disparo: DisparoAgendado
  onSave: () => void
  onCancel: () => void
}) {
  const [template, setTemplate] = useState(disparo.template ?? '')
  const [agendadoPara, setAgendadoPara] = useState(toLocalDatetimeInput(disparo.agendado_para))
  const [saving, setSaving] = useState(false)

  const salvar = async () => {
    if (!template.trim()) { toast.error('Mensagem não pode ficar vazia'); return }
    if (!agendadoPara) { toast.error('Data/hora obrigatória'); return }
    setSaving(true)
    try {
      await disparosAgendadosApi.editar(disparo.id, {
        template: template.trim(),
        agendado_para: new Date(agendadoPara).toISOString(),
      })
      toast.success('Disparo atualizado')
      onSave()
    } catch {
      toast.error('Erro ao salvar alterações')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Mensagem</label>
        <textarea
          value={template}
          onChange={e => setTemplate(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none bg-white dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nova data e hora de disparo</label>
        <input
          type="datetime-local"
          value={agendadoPara}
          onChange={e => setAgendadoPara(e.target.value)}
          min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
          className="px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
        />
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300"
        >
          <X size={12} /> Cancelar edição
        </button>
        <button
          onClick={salvar}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          <Check size={12} /> {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}

interface DisparosAgendadosSectionProps {
  funilTipo?: 'aquisicao' | 'cx'
}

export function DisparosAgendadosSection({ funilTipo }: DisparosAgendadosSectionProps) {
  const [itens, setItens] = useState<DisparoAgendado[]>([])
  const [loading, setLoading] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const data = await disparosAgendadosApi.listar(funilTipo)
      setItens(data)
    } catch {
      // silencioso
    } finally {
      setLoading(false)
    }
  }, [funilTipo])

  const cancelar = async (id: number) => {
    try {
      await disparosAgendadosApi.cancelar(id)
      toast.success('Disparo cancelado')
      carregar()
    } catch {
      toast.error('Erro ao cancelar disparo')
    }
  }

  useEffect(() => { carregar() }, [carregar])

  if (!loading && itens.length === 0) return null

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-primary-500" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Disparos agendados</h2>
          {!loading && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {itens.length} aguardando envio
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
          {itens.map(d => (
            <li
              key={d.id}
              className="rounded-lg border border-primary-100 bg-primary-50 p-4 dark:border-primary-900/40 dark:bg-primary-900/10"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-900/30">
                    <Calendar size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white text-sm">
                        Disparo #{d.id}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                        <Calendar size={10} /> Agendado
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400 line-clamp-1">
                      {d.template?.slice(0, 80)}{(d.template?.length ?? 0) > 80 ? '…' : ''}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <Users size={11} />
                        {d.total} lead{d.total !== 1 ? 's' : ''}
                      </span>
                      <span>·</span>
                      <span>
                        Dispara em{' '}
                        <strong className="text-primary-700 dark:text-primary-300">
                          {new Date(d.agendado_para).toLocaleString('pt-BR', {
                            day: '2-digit', month: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                            timeZone: 'America/Sao_Paulo',
                          })}
                        </strong>
                      </span>
                      {d.criado_por && (
                        <><span>·</span><span>por {d.criado_por}</span></>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 self-end sm:self-start sm:flex-shrink-0">
                  <button
                    onClick={() => setEditandoId(editandoId === d.id ? null : d.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary-100 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-200 dark:bg-primary-900/30 dark:text-primary-300"
                  >
                    <Pencil size={12} /> Editar
                  </button>
                  <button
                    onClick={() => cancelar(d.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300"
                  >
                    <XCircle size={13} /> Cancelar
                  </button>
                </div>
              </div>

              {/* Formulário de edição inline */}
              {editandoId === d.id && (
                <EditForm
                  disparo={d}
                  onSave={() => { setEditandoId(null); carregar() }}
                  onCancel={() => setEditandoId(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
