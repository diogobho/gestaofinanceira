import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Zap, Trash2, Play, Pause, MessageCircle, Bot, Send, Clock,
  Search, AlertCircle
} from 'lucide-react'
import { Spinner, Badge, Button, Input } from '@/components/ui'
import {
  automacoesApi, type Automacao, type ListFilters, type TipoAcao,
  TIPO_ACAO_LABEL
} from '@/api/automacoes'

interface AutomacoesPanelProps {
  filtros?: ListFilters
  titulo?: string
  emptyMessage?: string
  showContexto?: boolean
  onCreate?: () => void
}

const TIPO_ICONE: Record<TipoAcao, typeof Zap> = {
  envio_mensagem_grupo: MessageCircle,
  followup: Clock,
  ativar_agente_estagio: Bot,
  ativar_agente_lead: Bot,
  disparo_lote: Send
}

const TIPO_COR: Record<TipoAcao, string> = {
  envio_mensagem_grupo: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  followup: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  ativar_agente_estagio: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
  ativar_agente_lead: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
  disparo_lote: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
}

export function AutomacoesPanel({
  filtros = {},
  titulo,
  emptyMessage,
  showContexto = true,
  onCreate
}: AutomacoesPanelProps) {
  const [items, setItems] = useState<Automacao[]>([])
  const [loading, setLoading] = useState(true)
  const [tipoFiltro, setTipoFiltro] = useState<TipoAcao | ''>('')
  const [statusFiltro, setStatusFiltro] = useState<'todos' | 'ativas' | 'pausadas'>('todos')
  const [busca, setBusca] = useState('')

  const carregar = async () => {
    setLoading(true)
    try {
      const params: ListFilters = { ...filtros }
      if (tipoFiltro) params.tipo_acao = tipoFiltro
      if (statusFiltro === 'ativas') params.ativa = true
      if (statusFiltro === 'pausadas') params.ativa = false
      const res = await automacoesApi.list(params)
      setItems(res.data)
    } catch (err) {
      toast.error('Erro ao carregar automações')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filtros), tipoFiltro, statusFiltro])

  const handleToggle = async (a: Automacao) => {
    try {
      const updated = await automacoesApi.toggle(a.id)
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      toast.success(updated.ativa ? 'Automação reativada' : 'Automação pausada')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Falha ao alternar status')
    }
  }

  const handleDelete = async (a: Automacao) => {
    if (!confirm(`Remover automação "${a.nome}"?`)) return
    try {
      await automacoesApi.delete(a.id)
      setItems((prev) => prev.filter((x) => x.id !== a.id))
      toast.success('Automação removida')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Falha ao remover')
    }
  }

  const filtrados = items.filter((a) => {
    if (!busca.trim()) return true
    const q = busca.toLowerCase()
    return (
      a.nome.toLowerCase().includes(q) ||
      (a.estagio_nome ?? '').toLowerCase().includes(q) ||
      (a.lead_nome ?? '').toLowerCase().includes(q) ||
      (a.funil_nome ?? '').toLowerCase().includes(q)
    )
  })

  const ativas = items.filter((x) => x.ativa).length
  const pausadas = items.filter((x) => !x.ativa).length

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {titulo && <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{titulo}</h2>}
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {ativas} ativa{ativas !== 1 ? 's' : ''} · {pausadas} pausada{pausadas !== 1 ? 's' : ''}
          </p>
        </div>
        {onCreate && (
          <Button onClick={onCreate} className="gap-2">
            <Zap className="h-4 w-4" /> Nova automação
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Buscar por nome, estágio, lead ou funil..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={tipoFiltro}
          onChange={(e) => setTipoFiltro(e.target.value as TipoAcao | '')}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
        >
          <option value="">Todos os tipos</option>
          {Object.entries(TIPO_ACAO_LABEL).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
        <select
          value={statusFiltro}
          onChange={(e) => setStatusFiltro(e.target.value as any)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
        >
          <option value="todos">Todos os status</option>
          <option value="ativas">Apenas ativas</option>
          <option value="pausadas">Apenas pausadas</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center dark:border-gray-700 dark:bg-gray-900/50">
          <Zap className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            {emptyMessage ?? 'Nenhuma automação neste contexto.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtrados.map((a) => {
            const Icone = TIPO_ICONE[a.tipo_acao] ?? Zap
            const corClasse = TIPO_COR[a.tipo_acao] ?? 'bg-gray-100 text-gray-700'
            return (
              <li
                key={a.id}
                className={`
                  flex flex-col gap-3 rounded-lg border p-4 transition
                  sm:flex-row sm:items-center sm:justify-between
                  ${a.ativa
                    ? 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'
                    : 'border-gray-200 bg-gray-50 opacity-75 dark:border-gray-800 dark:bg-gray-900/50'}
                `}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${corClasse}`}>
                    <Icone className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-gray-900 dark:text-white">{a.nome}</h3>
                      {a.ativa ? (
                        <Badge variant="success">Ativa</Badge>
                      ) : (
                        <Badge variant="default">Pausada</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {TIPO_ACAO_LABEL[a.tipo_acao]}
                      {showContexto && (a.funil_nome || a.estagio_nome || a.lead_nome || a.grupo_whatsapp_id) && (
                        <>
                          <span className="mx-1.5">·</span>
                          {a.funil_nome && <span>Funil <strong>{a.funil_nome}</strong></span>}
                          {a.estagio_nome && (
                            <> {a.funil_nome && '/ '}Estágio <strong>{a.estagio_nome}</strong></>
                          )}
                          {a.lead_nome && <> Lead <strong>{a.lead_nome}</strong></>}
                          {a.grupo_whatsapp_id && !a.funil_nome && (
                            <>Grupo WhatsApp <strong>{a.config?.grupo_nome ?? a.grupo_whatsapp_id}</strong></>
                          )}
                        </>
                      )}
                    </p>
                    {a.total_execucoes > 0 && (
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                        {a.total_execucoes} execução{a.total_execucoes !== 1 ? 'ões' : ''}
                        {a.ultima_execucao_at && ` · última em ${new Date(a.ultima_execucao_at).toLocaleString('pt-BR')}`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => handleToggle(a)}
                    className={`
                      inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition
                      ${a.ativa
                        ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300'}
                    `}
                  >
                    {a.ativa ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    {a.ativa ? 'Pausar' : 'Reativar'}
                  </button>
                  <button
                    onClick={() => handleDelete(a)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remover
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {!loading && items.some((a) => a.tipo_acao === 'ativar_agente_lead' && !a.ativa) && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Automações de "Agente IA por lead" pausadas indicam leads com agente desativado individualmente
            (override do estágio).
          </p>
        </div>
      )}
    </div>
  )
}
