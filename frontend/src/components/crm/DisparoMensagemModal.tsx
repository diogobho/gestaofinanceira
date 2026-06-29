import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Send, ChevronRight, ChevronLeft, AlertCircle, CheckCircle,
  Loader2, MessageSquare, Users, Eye, Clock, Zap, Search, ArrowRight, Calendar
} from 'lucide-react'
import api from '@/api/client'
import { estagiosApi } from '@/api/crm'
import type { FiltrosLead } from '@/api/crm'
import type { EstagioFunil } from '@/types/crm'
import { WhatsAppFormatToolbar } from '@/components/ui/WhatsAppFormatToolbar'

interface LeadDisparo {
  id: number
  nome: string
  telefone: string | null
  empresa: string | null
  total_disparos?: number
  ultimo_estagio_disparo?: string | null
}

interface DisparoMensagemModalProps {
  isOpen: boolean
  onClose: () => void
  funilId: number
  filtros?: FiltrosLead
}

type Step = 'destinatarios' | 'mensagem' | 'disparando' | 'resultado'
type Modo = 'todos' | 'selecionados'

interface DisparoStatus {
  id: number
  total: number
  enviados: number
  falhas: number
  status: 'processando' | 'concluido' | 'agendado' | 'cancelado'
  erros: Array<{ lead_id: number; nome: string; telefone?: string; erro: string }>
  agendado_para?: string
}

const VARIAVEIS = [
  { label: '[Nome]', desc: 'Nome completo' },
  { label: '[PrimeiroNome]', desc: 'Primeiro nome' },
  { label: '[Empresa]', desc: 'Empresa do lead' },
  { label: '[Origem]', desc: 'Origem do lead' },
]

const LIMITE_DIARIO = 30

// Média entre 45s e 90s de delay aleatório
function tempoEstimado(n: number): string {
  const segundos = n * 67.5
  if (segundos < 60) return `~${Math.ceil(segundos)}s`
  return `~${Math.ceil(segundos / 60)} min`
}

function aplicarPreview(template: string, lead: LeadDisparo): string {
  const primeiro = lead.nome?.split(' ')[0] || lead.nome
  return template
    .replace(/\[Nome\]/gi, lead.nome || '')
    .replace(/\[PrimeiroNome\]/gi, primeiro || '')
    .replace(/\[Empresa\]/gi, lead.empresa || '')
    .replace(/\[Telefone\]/gi, lead.telefone || '')
}

export default function DisparoMensagemModal({ isOpen, onClose, funilId, filtros }: DisparoMensagemModalProps) {
  const [step, setStep] = useState<Step>('destinatarios')
  const [modo, setModo] = useState<Modo>('todos')
  const [template, setTemplate] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [disparoId, setDisparoId] = useState<number | null>(null)
  const [status, setStatus] = useState<DisparoStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [estagioPosDeparoId, setEstagioPosDisparoId] = useState<number | null>(null)
  const [estagiosList, setEstagiosList] = useState<EstagioFunil[]>([])
  const [agendar, setAgendar] = useState(false)
  const [agendadoPara, setAgendadoPara] = useState('')

  // Leads paginados do servidor
  const [leads, setLeads] = useState<LeadDisparo[]>([])
  const [total, setTotal] = useState(0)
  const [paginas, setPaginas] = useState(1)
  const [page, setPage] = useState(1)
  const [loadingLeads, setLoadingLeads] = useState(false)
  const [busca, setBusca] = useState('')
  const [buscaDebounced, setBuscaDebounced] = useState('')

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce busca
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setBuscaDebounced(busca)
      setPage(1)
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [busca])

  // Carregar leads do servidor (só quando modal aberto e funilId definido)
  const carregarLeads = useCallback(async (p: number, search: string) => {
    if (!funilId) return
    setLoadingLeads(true)
    try {
      const res = await api.get('/crm/disparos/leads', {
        params: {
          funil_id: funilId,
          search: search || undefined,
          page: p,
          per_page: 50,
          estagio_id: filtros?.estagio_id,
          responsavel_id: filtros?.responsavel_id,
          temperatura: filtros?.temperatura,
          origem: filtros?.origem,
        }
      })
      setLeads(res.data.leads)
      setTotal(res.data.total)
      setPaginas(res.data.paginas || 1)
    } catch {
      // silencia
    } finally {
      setLoadingLeads(false)
    }
  }, [funilId, filtros])

  useEffect(() => {
    if (isOpen && funilId) {
      carregarLeads(page, buscaDebounced)
    }
  }, [isOpen, funilId, page, buscaDebounced, carregarLeads])

  // Carregar estágios do funil para o seletor de automação
  useEffect(() => {
    if (isOpen && funilId) {
      estagiosApi.listByFunil(funilId).then(setEstagiosList).catch(() => {})
    }
  }, [isOpen, funilId])

  // Reset ao abrir
  useEffect(() => {
    if (isOpen) {
      setStep('destinatarios')
      setModo('todos')
      setTemplate('')
      setDisparoId(null)
      setStatus(null)
      setError(null)
      setSelectedIds(new Set())
      setBusca('')
      setBuscaDebounced('')
      setPage(1)
      setEstagioPosDisparoId(null)
      setAgendar(false)
      setAgendadoPara('')
    }
  }, [isOpen])

  // Polling de progresso
  useEffect(() => {
    if (step === 'disparando' && disparoId) {
      pollRef.current = setInterval(async () => {
        try {
          const res = await api.get(`/crm/disparos/${disparoId}`)
          setStatus(res.data)
          if (res.data.status === 'concluido') {
            clearInterval(pollRef.current!)
            setStep('resultado')
          }
        } catch {
          // silencia erros de poll
        }
      }, 1500)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [step, disparoId])

  if (!isOpen) return null

  const toggleLead = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleTodosPagina = () => {
    const todosSelecionados = leads.length > 0 && leads.every(l => selectedIds.has(l.id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (todosSelecionados) {
        leads.forEach(l => next.delete(l.id))
      } else {
        leads.forEach(l => next.add(l.id))
      }
      return next
    })
  }

  const inserirVariavel = (variavel: string) => {
    const textarea = textareaRef.current
    if (!textarea) {
      setTemplate(prev => prev + variavel)
      return
    }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const novo = template.slice(0, start) + variavel + template.slice(end)
    setTemplate(novo)
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + variavel.length, start + variavel.length)
    }, 0)
  }

  const handleDisparar = async () => {
    const totalSel = modo === 'todos' ? total : selectedIds.size
    if (!template.trim() || totalSel === 0) return
    setLoading(true)
    setError(null)
    try {
      const body: any = { template: template.trim(), funil_id: funilId }
      if (modo === 'todos') {
        body.todos = true
        if (filtros?.estagio_id) body.estagio_id = filtros.estagio_id
        if (filtros?.responsavel_id) body.responsavel_id = filtros.responsavel_id
        if (filtros?.temperatura) body.temperatura = filtros.temperatura
        if (filtros?.origem) body.origem = filtros.origem
      } else {
        body.lead_ids = Array.from(selectedIds)
      }
      if (estagioPosDeparoId) {
        body.estagio_pos_disparo_id = estagioPosDeparoId
      }
      if (agendar && agendadoPara) {
        body.agendado_para = new Date(agendadoPara).toISOString()
      }
      const res = await api.post('/crm/disparos', body)
      setDisparoId(res.data.disparo_id)
      if (agendar && agendadoPara) {
        setStatus({
          id: res.data.disparo_id, total: totalSelecionados, enviados: 0, falhas: 0,
          status: 'agendado', erros: [], agendado_para: new Date(agendadoPara).toISOString(),
        })
        setStep('resultado')
      } else {
        setStep('disparando')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Erro ao iniciar disparo')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    setStep('destinatarios')
    setTemplate('')
    setSelectedIds(new Set())
    setDisparoId(null)
    setStatus(null)
    setError(null)
    setBusca('')
    setAgendar(false)
    setAgendadoPara('')
    onClose()
  }

  const progresso = status ? Math.round((status.enviados + status.falhas) / Math.max(status.total, 1) * 100) : 0
  const totalSelecionados = modo === 'todos' ? total : selectedIds.size
  const previewLead = leads[0]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="p-5 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
              <Send size={18} className="text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Disparo em Massa</h2>
              <p className="text-xs text-gray-500">
                {step === 'destinatarios' && 'Selecione quem vai receber'}
                {step === 'mensagem' && 'Escreva a mensagem'}
                {step === 'disparando' && 'Enviando mensagens...'}
                {step === 'resultado' && 'Disparo concluído'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Steps indicator */}
        {(step === 'destinatarios' || step === 'mensagem') && (
          <div className="px-5 pt-4 flex items-center gap-2 shrink-0">
            {['destinatarios', 'mensagem'].map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  step === s ? 'bg-green-500 text-white' :
                  (step === 'mensagem' && s === 'destinatarios') ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {i + 1}
                </div>
                <span className={`text-sm ${step === s ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                  {s === 'destinatarios' ? 'Destinatários' : 'Mensagem'}
                </span>
                {i < 1 && <ChevronRight size={16} className="text-gray-300 ml-1" />}
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* STEP 1: Destinatários */}
          {step === 'destinatarios' && (
            <div className="space-y-4">
              {/* Modo tabs */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl">
                <button
                  onClick={() => setModo('todos')}
                  className={`py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                    modo === 'todos' ? 'bg-white shadow-sm text-green-700' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Todos do funil
                </button>
                <button
                  onClick={() => setModo('selecionados')}
                  className={`py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                    modo === 'selecionados' ? 'bg-white shadow-sm text-green-700' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Selecionar leads
                </button>
              </div>

              {/* Modo: Todos */}
              {modo === 'todos' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                      {loadingLeads ? (
                        <Loader2 size={28} className="mx-auto text-green-400 animate-spin mb-1" />
                      ) : (
                        <p className="text-3xl font-bold text-green-700">{total}</p>
                      )}
                      <p className="text-sm text-green-600 mt-1">leads com telefone</p>
                    </div>
                    <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 text-center">
                      <p className="text-3xl font-bold text-primary-700">{tempoEstimado(total)}</p>
                      <p className="text-sm text-primary-600 mt-1">tempo estimado</p>
                    </div>
                  </div>
                  {total === 0 && !loadingLeads && (
                    <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
                      <AlertCircle size={16} />
                      Nenhum lead neste funil possui telefone cadastrado.
                    </div>
                  )}
                  {total > 0 && total <= LIMITE_DIARIO && (
                    <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm">
                      <Users size={16} />
                      Disparo será enviado para <strong className="mx-1">{total}</strong> lead{total !== 1 ? 's' : ''} com telefone
                    </div>
                  )}
                  {total > LIMITE_DIARIO && (
                    <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
                      <AlertCircle size={16} />
                      <span>
                        Funil tem <strong>{total}</strong> leads, mas o limite diário seguro é{' '}
                        <strong>{LIMITE_DIARIO}</strong>. Serão enviados apenas os primeiros <strong>{LIMITE_DIARIO}</strong>.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Modo: Selecionados */}
              {modo === 'selecionados' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-gray-800">{total}</p>
                      <p className="text-xs text-gray-500">com telefone</p>
                    </div>
                    <div className="bg-primary-50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-primary-600">{selectedIds.size}</p>
                      <p className="text-xs text-primary-700">selecionados</p>
                    </div>
                  </div>

                  {/* Busca */}
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={busca}
                      onChange={e => setBusca(e.target.value)}
                      placeholder="Filtrar por nome..."
                      className="w-full pl-9 pr-8 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                    {loadingLeads && (
                      <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
                    )}
                  </div>

                  {/* Toggle todos da página */}
                  <div className="flex items-center justify-between py-2 border-b">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={leads.length > 0 && leads.every(l => selectedIds.has(l.id))}
                        onChange={toggleTodosPagina}
                        className="w-4 h-4 rounded text-green-600 focus:ring-green-500"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Página atual ({leads.length})
                      </span>
                    </label>
                    <span className="text-xs text-gray-400">{selectedIds.size} selecionados</span>
                  </div>

                  {/* Lista */}
                  <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                    {leads.length === 0 && !loadingLeads && (
                      <div className="text-center py-8 text-gray-400">
                        <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
                        <p className="text-sm">{busca ? `Nenhum resultado para "${busca}"` : 'Nenhum lead com telefone'}</p>
                      </div>
                    )}
                    {leads.map(lead => (
                      <label
                        key={lead.id}
                        className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                          selectedIds.has(lead.id) ? 'bg-green-50 border border-green-200' : 'hover:bg-gray-50 border border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(lead.id)}
                          onChange={() => toggleLead(lead.id)}
                          className="w-4 h-4 rounded text-green-600 focus:ring-green-500 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{lead.nome}</p>
                          <p className="text-xs text-gray-400 truncate">{lead.telefone}</p>
                        </div>
                        {lead.empresa && (
                          <span className="text-xs text-gray-400 truncate max-w-[80px]">{lead.empresa}</span>
                        )}
                        {(lead.total_disparos || 0) > 0 && (
                          <span
                            title={lead.ultimo_estagio_disparo ? `Último disparo: ${lead.ultimo_estagio_disparo}` : `${lead.total_disparos}x disparado`}
                            className="shrink-0 px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700"
                          >
                            {lead.total_disparos}x
                          </span>
                        )}
                      </label>
                    ))}
                  </div>

                  {/* Paginação */}
                  {paginas > 1 && (
                    <div className="flex items-center justify-between pt-1 border-t">
                      <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-40 px-2 py-1 rounded"
                      >
                        ← Anterior
                      </button>
                      <span className="text-xs text-gray-400">Pág. {page} / {paginas}</span>
                      <button
                        onClick={() => setPage(p => Math.min(paginas, p + 1))}
                        disabled={page === paginas}
                        className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-40 px-2 py-1 rounded"
                      >
                        Próxima →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Mensagem */}
          {step === 'mensagem' && (
            <div className="space-y-4">
              {/* Automação pós-disparo */}
              <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
                <div className="flex items-center gap-2">
                  <ArrowRight size={15} className="text-primary-500" />
                  <label className="text-sm font-medium text-gray-700">Após o envio, mover lead para</label>
                  <span className="text-xs text-gray-400">(opcional)</span>
                </div>
                <select
                  value={estagioPosDeparoId ?? ''}
                  onChange={e => setEstagioPosDisparoId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                >
                  <option value="">— Não mover —</option>
                  {estagiosList.map(e => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </select>
                {estagioPosDeparoId && (
                  <p className="text-xs text-primary-600">
                    Cada lead que receber a mensagem será movido para esta etapa automaticamente.
                  </p>
                )}
              </div>

              {/* Agendamento */}
              <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
                <div
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={() => setAgendar(prev => !prev)}
                >
                  <input
                    type="checkbox"
                    checked={agendar}
                    onChange={() => setAgendar(prev => !prev)}
                    onClick={e => e.stopPropagation()}
                    className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
                  />
                  <Calendar size={15} className="text-primary-500" />
                  <label className="text-sm font-medium text-gray-700 cursor-pointer">Agendar para depois</label>
                  <span className="text-xs text-gray-400">(opcional)</span>
                </div>
                {agendar && (
                  <input
                    type="datetime-local"
                    value={agendadoPara}
                    onChange={e => setAgendadoPara(e.target.value)}
                    min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                  />
                )}
              </div>

              {/* Avisos de risco */}
              {totalSelecionados > LIMITE_DIARIO && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 text-sm text-red-700">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>
                    <strong>Volume alto: {totalSelecionados} leads selecionados.</strong> O limite seguro é{' '}
                    <strong>{LIMITE_DIARIO} msgs/dia</strong> por número. O sistema vai enviar apenas os primeiros{' '}
                    {LIMITE_DIARIO} para proteger sua conta.
                  </span>
                </div>
              )}
              {totalSelecionados > 0 && totalSelecionados <= LIMITE_DIARIO && totalSelecionados > 15 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-sm text-amber-700">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>
                    <strong>Atenção:</strong> você está próximo do limite diário seguro ({LIMITE_DIARIO} msgs/dia).
                    Se já disparou mensagens hoje, o sistema vai completar apenas o restante disponível.
                  </span>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Inserir variável
                </p>
                <div className="flex flex-wrap gap-2">
                  {VARIAVEIS.map(v => (
                    <button
                      key={v.label}
                      onClick={() => inserirVariavel(v.label)}
                      title={v.desc}
                      className="px-3 py-1.5 bg-primary-50 text-primary-700 border border-primary-200 rounded-full text-sm font-mono hover:bg-primary-100 transition-colors"
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-700">
                    Mensagem <span className="text-red-500">*</span>
                  </label>
                  <WhatsAppFormatToolbar
                    textareaRef={textareaRef}
                    value={template}
                    onChange={setTemplate}
                  />
                </div>
                <textarea
                  ref={textareaRef}
                  value={template}
                  onChange={e => setTemplate(e.target.value)}
                  placeholder={"Bom dia [PrimeiroNome]! Aqui é a Débora da Escola Panthers.\n\nTudo bem com você?"}
                  rows={6}
                  className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none font-sans"
                />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-gray-400">{template.length} caracteres</p>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock size={12} />
                    {tempoEstimado(Math.min(totalSelecionados, LIMITE_DIARIO))} para{' '}
                    {Math.min(totalSelecionados, LIMITE_DIARIO)} leads
                  </div>
                </div>
              </div>

              {/* Aviso: mensagem sem variável de nome */}
              {template.trim().length > 0 && !/\[Nome\]|\[PrimeiroNome\]/i.test(template) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-sm text-amber-700">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>
                    <strong>Mensagem sem nome personalizado.</strong> Mensagens idênticas para muitos contatos
                    aumentam o risco de bloqueio no WhatsApp. Adicione{' '}
                    <span className="font-mono bg-amber-100 px-1 rounded">[PrimeiroNome]</span> para personalizar.
                  </span>
                </div>
              )}

              {previewLead && template.trim() && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b flex items-center gap-2">
                    <Eye size={14} className="text-gray-500" />
                    <span className="text-xs font-semibold text-gray-600">
                      Preview — {previewLead.nome}
                    </span>
                  </div>
                  <div className="p-4 bg-green-50">
                    <div className="bg-white rounded-xl rounded-tl-none shadow-sm p-3 max-w-xs text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {aplicarPreview(template, previewLead)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP: Disparando */}
          {step === 'disparando' && (
            <div className="py-6 space-y-5">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                  <Loader2 size={32} className="text-green-600 animate-spin" />
                </div>
                <p className="text-lg font-semibold text-gray-800">Enviando mensagens...</p>
                <p className="text-sm text-gray-500 mt-1">Intervalo de 45–90s aleatório entre envios (anti-bloqueio)</p>
              </div>
              {status && (
                <>
                  <div className="bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all duration-500 rounded-full"
                      style={{ width: `${progresso}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-xl font-bold text-gray-700">{status.total}</p>
                      <p className="text-xs text-gray-500">Total</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-green-600">{status.enviados}</p>
                      <p className="text-xs text-gray-500">Enviados</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-red-500">{status.falhas}</p>
                      <p className="text-xs text-gray-500">Falhas</p>
                    </div>
                  </div>
                  <p className="text-center text-sm text-gray-500">
                    {status.enviados + status.falhas} / {status.total} — {progresso}%
                    {status.total > 0 && (
                      <span className="ml-2 text-gray-400">
                        (restante: {tempoEstimado(status.total - status.enviados - status.falhas)})
                      </span>
                    )}
                  </p>
                </>
              )}
            </div>
          )}

          {/* STEP: Resultado */}
          {step === 'resultado' && status && (
            <div className="space-y-4">
              {status.status === 'agendado' ? (
                <div className="text-center py-6">
                  <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-3">
                    <Calendar size={32} className="text-primary-600" />
                  </div>
                  <p className="text-lg font-semibold text-gray-800">Disparo agendado!</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Será enviado em{' '}
                    <strong>{new Date(status.agendado_para!).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</strong>
                  </p>
                  <p className="text-xs text-gray-400 mt-2">para {status.total} lead{status.total !== 1 ? 's' : ''}</p>
                </div>
              ) : (
                <>
                  <div className="text-center py-4">
                    <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                      <CheckCircle size={32} className="text-green-600" />
                    </div>
                    <p className="text-lg font-semibold text-gray-800">Disparo concluído!</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-gray-800">{status.total}</p>
                      <p className="text-sm text-gray-500">Total</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-green-600">{status.enviados}</p>
                      <p className="text-sm text-green-700">Enviados</p>
                    </div>
                    <div className={`rounded-lg p-4 text-center ${status.falhas > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                      <p className={`text-2xl font-bold ${status.falhas > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {status.falhas}
                      </p>
                      <p className={`text-sm ${status.falhas > 0 ? 'text-red-700' : 'text-gray-500'}`}>Falhas</p>
                    </div>
                  </div>
                  {status.erros.length > 0 && (
                    <div>
                      <h3 className="font-medium text-gray-700 mb-2 text-sm">Erros ({status.erros.length})</h3>
                      <div className="max-h-40 overflow-y-auto border rounded-lg divide-y text-sm">
                        {status.erros.map((e, i) => (
                          <div key={i} className="px-3 py-2">
                            <span className="font-medium text-red-600">{e.nome}</span>
                            {e.telefone && (
                              <span className="text-gray-500"> ({e.telefone})</span>
                            )}
                            <span className="font-medium text-red-600">:</span>{' '}
                            <span className="text-gray-600">{e.erro}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex items-center justify-between shrink-0 gap-3">
          {step === 'destinatarios' && (
            <>
              <button onClick={handleClose} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm">
                Cancelar
              </button>
              <button
                onClick={() => setStep('mensagem')}
                disabled={totalSelecionados === 0}
                className="flex items-center gap-2 px-5 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 text-sm font-medium"
              >
                Continuar
                <ChevronRight size={16} />
              </button>
            </>
          )}

          {step === 'mensagem' && (
            <>
              <button
                onClick={() => setStep('destinatarios')}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm"
              >
                <ChevronLeft size={16} />
                Voltar
              </button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Users size={13} />
                  {totalSelecionados} leads · {tempoEstimado(totalSelecionados)}
                </span>
                <button
                  onClick={handleDisparar}
                  disabled={!template.trim() || loading || totalSelecionados === 0 || (agendar && !agendadoPara)}
                  className="flex items-center gap-2 px-5 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 text-sm font-medium"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : (agendar ? <Calendar size={16} /> : <Zap size={16} />)}
                  {agendar && agendadoPara ? `Agendar para ${totalSelecionados} leads` : `Disparar para ${totalSelecionados} leads`}
                </button>
              </div>
            </>
          )}

          {step === 'disparando' && (
            <p className="text-xs text-gray-400 w-full text-center">
              Não feche esta janela durante o envio.
            </p>
          )}

          {step === 'resultado' && (
            <button
              onClick={handleClose}
              className="w-full px-5 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm font-medium"
            >
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
