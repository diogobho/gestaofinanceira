import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Mail, ChevronRight, ChevronLeft, AlertCircle, CheckCircle,
  Loader2, Users, Eye, Search, Pen, Paperclip, FileText, Trash2,
  ArrowRight, Calendar
} from 'lucide-react'
import api from '@/api/client'
import { estagiosApi } from '@/api/crm'
import type { FiltrosLead } from '@/api/crm'
import type { EstagioFunil } from '@/types/crm'
import EmailEditor from './EmailEditor'

interface LeadEmail {
  id: number
  nome: string
  email: string
  empresa: string | null
}

interface DisparoEmailModalProps {
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
  erros: Array<{ lead_id: number; nome: string; erro: string }>
  agendado_para?: string
}

const VARIAVEIS = [
  { label: '[Nome]', desc: 'Nome completo' },
  { label: '[PrimeiroNome]', desc: 'Primeiro nome' },
  { label: '[Empresa]', desc: 'Empresa do lead' },
  { label: '[Email]', desc: 'E-mail do lead' },
]

function aplicarPreview(template: string, lead: LeadEmail): string {
  const primeiro = lead.nome?.split(' ')[0] || lead.nome
  return template
    .replace(/\[Nome\]/gi, lead.nome || '')
    .replace(/\[PrimeiroNome\]/gi, primeiro || '')
    .replace(/\[Empresa\]/gi, lead.empresa || '')
    .replace(/\[Email\]/gi, lead.email || '')
}

const SIGNATURE_STORAGE_KEY = 'crm_email_signature_v3'

const SIG_BASE = 'https://duofuturo.mooo.com/gestao/signature'

const DEFAULT_SIGNATURE = `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;font-family:Arial,sans-serif;color:#333;">
  <tr>
    <td style="padding:24px 0 18px;">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding-right:24px;vertical-align:middle;">
            <img src="${SIG_BASE}/logo.svg" width="92" height="110" alt="Instituto Totem" style="display:block;" />
          </td>
          <td style="vertical-align:middle;">
            <p style="margin:0;font-size:20px;letter-spacing:5px;font-weight:300;color:#1a1a1a;font-family:Georgia,Times New Roman,serif;text-transform:uppercase;line-height:1.1;">INSTITUTO TOTEM</p>
            <p style="margin:6px 0 0;font-size:8px;letter-spacing:2.5px;color:#999;text-transform:uppercase;font-family:Arial,sans-serif;">ENTRE EM CONTATO CONOSCO</p>
            <p style="margin:10px 0 0;font-size:12px;color:#555;font-family:Arial,sans-serif;">&#9993;&nbsp;<a href="mailto:suporte@escolapanthers.com.br" style="color:#555;text-decoration:none;">suporte@escolapanthers.com.br</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr><td style="height:1px;background-color:#e0e0e0;font-size:0;line-height:0;padding:0;">&nbsp;</td></tr>
  <tr>
    <td style="padding:18px 0 14px;text-align:center;">
      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
        <tr>
          <td style="padding:0 5px;">
            <a href="mailto:suporte@escolapanthers.com.br" title="E-mail" style="display:inline-block;text-decoration:none;">
              <img src="${SIG_BASE}/icon-email.svg" width="42" height="42" alt="E-mail" style="display:block;" />
            </a>
          </td>
          <td style="padding:0 5px;">
            <a href="https://escolapanthers.com.br/permitido-prosperar/?utm_source=email" title="WhatsApp" style="display:inline-block;text-decoration:none;">
              <img src="${SIG_BASE}/icon-whatsapp.svg" width="42" height="42" alt="WhatsApp" style="display:block;" />
            </a>
          </td>
          <td style="padding:0 5px;">
            <a href="https://www.instagram.com/sabrinabogiani" title="Instagram" style="display:inline-block;text-decoration:none;">
              <img src="${SIG_BASE}/icon-instagram.svg" width="42" height="42" alt="Instagram" style="display:block;" />
            </a>
          </td>
          <td style="padding:0 5px;">
            <a href="https://www.youtube.com/@sabrinabogiani" title="YouTube" style="display:inline-block;text-decoration:none;">
              <img src="${SIG_BASE}/icon-youtube.svg" width="42" height="42" alt="YouTube" style="display:block;" />
            </a>
          </td>
          <td style="padding:0 5px;">
            <a href="https://www.tiktok.com/@sabrinabogiani" title="TikTok" style="display:inline-block;text-decoration:none;">
              <img src="${SIG_BASE}/icon-tiktok.svg" width="42" height="42" alt="TikTok" style="display:block;" />
            </a>
          </td>
          <td style="padding:0 5px;">
            <a href="https://open.spotify.com/user/3163332z5ysohitmiph43x4z7ure?si=58cc6565fef942f0" title="Spotify" style="display:inline-block;text-decoration:none;">
              <img src="${SIG_BASE}/icon-spotify.svg" width="42" height="42" alt="Spotify" style="display:block;" />
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:10px 0 4px;font-size:10px;color:#bbb;text-align:center;line-height:1.8;border-top:1px solid #eeeeee;font-family:Arial,sans-serif;">
      Panthers Empreendedorismo, Rua Principe Humberto, 112 Sala 44 Edif&iacute;cio Vancouver<br>
      S&atilde;o Bernardo do Campo - SP, 09.725-200, Brasil
    </td>
  </tr>
</table>`

export default function DisparoEmailModal({ isOpen, onClose, funilId, filtros }: DisparoEmailModalProps) {
  const [step, setStep] = useState<Step>('destinatarios')
  const [modo, setModo] = useState<Modo>('todos')
  const [assunto, setAssunto] = useState('')
  const [corpo, setCorpo] = useState('')
  const [assinatura, setAssinatura] = useState<string>(
    () => localStorage.getItem(SIGNATURE_STORAGE_KEY) ?? DEFAULT_SIGNATURE
  )
  const [mostrarAssinatura, setMostrarAssinatura] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [disparoId, setDisparoId] = useState<number | null>(null)
  const [status, setStatus] = useState<DisparoStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [anexos, setAnexos] = useState<File[]>([])
  const anexoInputRef = useRef<HTMLInputElement>(null)

  const [estagioPosDeparoId, setEstagioPosDeparoId] = useState<number | null>(null)
  const [estagiosList, setEstagiosList] = useState<EstagioFunil[]>([])
  const [agendar, setAgendar] = useState(false)
  const [agendadoPara, setAgendadoPara] = useState('')

  const [leads, setLeads] = useState<LeadEmail[]>([])
  const [total, setTotal] = useState(0)
  const [paginas, setPaginas] = useState(1)
  const [page, setPage] = useState(1)
  const [loadingLeads, setLoadingLeads] = useState(false)
  const [busca, setBusca] = useState('')
  const [buscaDebounced, setBuscaDebounced] = useState('')

  const insertVariableFnRef = useRef<((v: string) => void) | null>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setBuscaDebounced(busca)
      setPage(1)
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [busca])

  const carregarLeads = useCallback(async (p: number, search: string) => {
    if (!funilId) return
    setLoadingLeads(true)
    try {
      const res = await api.get('/crm/disparos-email/leads', {
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
    if (isOpen && funilId) carregarLeads(page, buscaDebounced)
  }, [isOpen, funilId, page, buscaDebounced, carregarLeads])

  useEffect(() => {
    if (isOpen && funilId) {
      estagiosApi.listByFunil(funilId).then(setEstagiosList).catch(() => {})
    }
  }, [isOpen, funilId])

  useEffect(() => {
    if (isOpen) {
      setStep('destinatarios')
      setModo('todos')
      setAssunto('')
      setCorpo('')
      setDisparoId(null)
      setStatus(null)
      setError(null)
      setSelectedIds(new Set())
      setBusca('')
      setBuscaDebounced('')
      setPage(1)
      setShowPreview(false)
      setAnexos([])
      setEstagioPosDeparoId(null)
      setAgendar(false)
      setAgendadoPara('')
    }
  }, [isOpen])

  useEffect(() => {
    if (step === 'disparando' && disparoId) {
      pollRef.current = setInterval(async () => {
        try {
          const res = await api.get(`/crm/disparos-email/${disparoId}`)
          setStatus(res.data)
          if (res.data.status === 'concluido') {
            clearInterval(pollRef.current!)
            setStep('resultado')
          }
        } catch {
          // silencia
        }
      }, 2000)
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
      if (todosSelecionados) leads.forEach(l => next.delete(l.id))
      else leads.forEach(l => next.add(l.id))
      return next
    })
  }

  const inserirVariavel = (variavel: string) => {
    if (insertVariableFnRef.current) {
      insertVariableFnRef.current(variavel)
    }
  }

  const buildEmailHtml = (template: string): string => {
    if (!assinatura.trim()) return template
    const sep = '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />'
    return `${template}${sep}${assinatura}`
  }

  const handleDisparar = async () => {
    const totalSel = modo === 'todos' ? total : selectedIds.size
    if (!assunto.trim() || !corpo.trim() || totalSel === 0) return
    setLoading(true)
    setError(null)
    try {
      const htmlFinal = buildEmailHtml(corpo)
      const formData = new FormData()
      formData.append('assunto', assunto.trim())
      formData.append('template', htmlFinal)
      formData.append('funil_id', String(funilId))
      if (modo === 'todos') {
        formData.append('todos', 'true')
        if (filtros?.estagio_id) formData.append('estagio_id', String(filtros.estagio_id))
        if (filtros?.responsavel_id) formData.append('responsavel_id', String(filtros.responsavel_id))
        if (filtros?.temperatura) formData.append('temperatura', filtros.temperatura)
        if (filtros?.origem) formData.append('origem', filtros.origem)
      } else {
        formData.append('lead_ids', JSON.stringify(Array.from(selectedIds)))
      }
      anexos.forEach(file => formData.append('anexos', file, file.name))
      if (estagioPosDeparoId) {
        formData.append('estagio_pos_disparo_id', String(estagioPosDeparoId))
      }
      if (agendar && agendadoPara) {
        formData.append('agendado_para', new Date(agendadoPara).toISOString())
      }

      const res = await api.post('/crm/disparos-email', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      if (agendar && agendadoPara) {
        setStatus({
          id: res.data.disparo_id,
          total: totalSel,
          enviados: 0,
          falhas: 0,
          status: 'agendado',
          erros: [],
          agendado_para: new Date(agendadoPara).toISOString(),
        })
        setStep('resultado')
      } else {
        setDisparoId(res.data.disparo_id)
        setStep('disparando')
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string }
      setError(e.response?.data?.error || e.message || 'Erro ao iniciar disparo')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    setStep('destinatarios')
    setAssunto('')
    setCorpo('')
    setSelectedIds(new Set())
    setDisparoId(null)
    setStatus(null)
    setError(null)
    setBusca('')
    setAnexos([])
    setEstagioPosDeparoId(null)
    setAgendar(false)
    setAgendadoPara('')
    onClose()
  }

  const progresso = status ? Math.round((status.enviados + status.falhas) / Math.max(status.total, 1) * 100) : 0
  const totalSelecionados = modo === 'todos' ? total : selectedIds.size
  const previewLead = leads[0]

  const previewHtml = previewLead
    ? aplicarPreview(buildEmailHtml(corpo), previewLead)
    : buildEmailHtml(corpo)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="p-5 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <Mail size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Disparo de E-mail</h2>
              <p className="text-xs text-gray-500">
                {step === 'destinatarios' && 'Selecione quem vai receber'}
                {step === 'mensagem' && 'Escreva o e-mail'}
                {step === 'disparando' && 'Enviando e-mails...'}
                {step === 'resultado' && status?.status === 'agendado' && 'Disparo agendado'}
                {step === 'resultado' && status?.status !== 'agendado' && 'Disparo concluído'}
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
                  step === s ? 'bg-blue-500 text-white' :
                  (step === 'mensagem' && s === 'destinatarios') ? 'bg-blue-100 text-blue-700' :
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
              <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl">
                <button
                  onClick={() => setModo('todos')}
                  className={`py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                    modo === 'todos' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Todos do funil
                </button>
                <button
                  onClick={() => setModo('selecionados')}
                  className={`py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                    modo === 'selecionados' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Selecionar leads
                </button>
              </div>

              {modo === 'todos' && (
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                    {loadingLeads ? (
                      <Loader2 size={28} className="mx-auto text-blue-400 animate-spin mb-1" />
                    ) : (
                      <p className="text-3xl font-bold text-blue-700">{total}</p>
                    )}
                    <p className="text-sm text-blue-600 mt-1">leads com e-mail</p>
                  </div>
                  {total === 0 && !loadingLeads && (
                    <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
                      <AlertCircle size={16} />
                      Nenhum lead neste funil possui e-mail cadastrado.
                    </div>
                  )}
                </div>
              )}

              {modo === 'selecionados' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-gray-800">{total}</p>
                      <p className="text-xs text-gray-500">com e-mail</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-blue-600">{selectedIds.size}</p>
                      <p className="text-xs text-blue-700">selecionados</p>
                    </div>
                  </div>

                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={busca}
                      onChange={e => setBusca(e.target.value)}
                      placeholder="Filtrar por nome ou e-mail..."
                      className="w-full pl-9 pr-8 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {loadingLeads && (
                      <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
                    )}
                  </div>

                  <div className="flex items-center justify-between py-2 border-b">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={leads.length > 0 && leads.every(l => selectedIds.has(l.id))}
                        onChange={toggleTodosPagina}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Página atual ({leads.length})</span>
                    </label>
                    <span className="text-xs text-gray-400">{selectedIds.size} selecionados</span>
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                    {leads.length === 0 && !loadingLeads && (
                      <div className="text-center py-8 text-gray-400">
                        <Mail size={32} className="mx-auto mb-2 opacity-30" />
                        <p className="text-sm">{busca ? `Nenhum resultado para "${busca}"` : 'Nenhum lead com e-mail'}</p>
                      </div>
                    )}
                    {leads.map(lead => (
                      <label
                        key={lead.id}
                        className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                          selectedIds.has(lead.id) ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(lead.id)}
                          onChange={() => toggleLead(lead.id)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{lead.nome}</p>
                          <p className="text-xs text-gray-400 truncate">{lead.email}</p>
                        </div>
                        {lead.empresa && (
                          <span className="text-xs text-gray-400 truncate max-w-[80px]">{lead.empresa}</span>
                        )}
                      </label>
                    ))}
                  </div>

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
              {/* Assunto */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Assunto <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={assunto}
                  onChange={e => setAssunto(e.target.value)}
                  placeholder="Ex: Olá [PrimeiroNome], temos uma novidade para você!"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Variáveis */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Inserir variável no corpo
                </p>
                <div className="flex flex-wrap gap-2">
                  {VARIAVEIS.map(v => (
                    <button
                      key={v.label}
                      onClick={() => inserirVariavel(v.label)}
                      title={v.desc}
                      className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-sm font-mono hover:bg-blue-100 transition-colors"
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Editor rich text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Corpo do e-mail <span className="text-red-500">*</span>
                </label>
                <EmailEditor
                  value={corpo}
                  onChange={setCorpo}
                  placeholder="Olá [PrimeiroNome], escreva sua mensagem aqui..."
                  onInsertVariable={fn => { insertVariableFnRef.current = fn }}
                  minHeight={180}
                />
              </div>

              {/* Anexos */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <Paperclip size={14} className="text-gray-500" />
                    Anexos
                    {anexos.length > 0 && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{anexos.length}</span>
                    )}
                  </label>
                  <button
                    type="button"
                    onClick={() => anexoInputRef.current?.click()}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                  >
                    + Adicionar arquivo
                  </button>
                </div>
                <input
                  ref={anexoInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => {
                    const files = Array.from(e.target.files || [])
                    setAnexos(prev => {
                      const combined = [...prev, ...files].slice(0, 5)
                      return combined
                    })
                    e.target.value = ''
                  }}
                />
                {anexos.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => anexoInputRef.current?.click()}
                    className="w-full border border-dashed border-gray-300 rounded-lg py-3 text-xs text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors flex items-center justify-center gap-2"
                  >
                    <Paperclip size={14} />
                    Clique para anexar arquivos (máx. 5 arquivos · 15 MB cada)
                  </button>
                ) : (
                  <div className="border border-gray-200 rounded-lg divide-y">
                    {anexos.map((file, i) => (
                      <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                        <FileText size={14} className="text-blue-500 shrink-0" />
                        <span className="flex-1 text-xs text-gray-700 truncate">{file.name}</span>
                        <span className="text-xs text-gray-400 shrink-0">
                          {(file.size / 1024).toFixed(0)} KB
                        </span>
                        <button
                          type="button"
                          onClick={() => setAnexos(prev => prev.filter((_, idx) => idx !== i))}
                          className="p-0.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors shrink-0"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                    {anexos.length < 5 && (
                      <button
                        type="button"
                        onClick={() => anexoInputRef.current?.click()}
                        className="w-full py-2 text-xs text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        + Adicionar mais ({5 - anexos.length} restantes)
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Assinatura / Rodapé */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMostrarAssinatura(p => !p)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Pen size={14} className="text-gray-500" />
                    Assinatura / Rodapé
                    {assinatura.trim() && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Ativa</span>
                    )}
                  </div>
                  <ChevronRight size={16} className={`text-gray-400 transition-transform ${mostrarAssinatura ? 'rotate-90' : ''}`} />
                </button>

                {mostrarAssinatura && (
                  <div className="p-3 space-y-3 border-t border-gray-200">
                    <p className="text-xs text-gray-500">
                      A assinatura é adicionada automaticamente ao final de todos os e-mails. Edite o HTML abaixo.
                    </p>
                    <textarea
                      value={assinatura}
                      onChange={e => {
                        setAssinatura(e.target.value)
                        localStorage.setItem(SIGNATURE_STORAGE_KEY, e.target.value)
                      }}
                      rows={6}
                      className="w-full text-xs font-mono border border-gray-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-y"
                      placeholder="<p>Atenciosamente,<br>Seu Nome | Empresa</p>"
                    />
                    {assinatura.trim() && (
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Preview:</p>
                        <div
                          className="border border-gray-100 rounded bg-white p-3 overflow-x-auto"
                          dangerouslySetInnerHTML={{ __html: assinatura }}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setAssinatura(DEFAULT_SIGNATURE)
                        localStorage.setItem(SIGNATURE_STORAGE_KEY, DEFAULT_SIGNATURE)
                      }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Restaurar assinatura padrão
                    </button>
                  </div>
                )}
              </div>

              {/* Preview */}
              {corpo.trim() && (
                <div className="border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowPreview(p => !p)}
                    className="w-full flex items-center gap-2 bg-gray-50 px-4 py-2 border-b hover:bg-gray-100 transition-colors"
                  >
                    <Eye size={14} className="text-gray-500" />
                    <span className="text-xs font-semibold text-gray-600 flex-1 text-left">
                      {showPreview ? 'Ocultar preview' : 'Ver preview do e-mail'}
                      {previewLead && ` — ${previewLead.nome} (${previewLead.email})`}
                    </span>
                    <ChevronRight size={14} className={`text-gray-400 transition-transform ${showPreview ? 'rotate-90' : ''}`} />
                  </button>
                  {showPreview && (
                    <div className="p-4 bg-gray-50">
                      <div className="bg-white rounded-lg shadow-sm">
                        {assunto && (
                          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg">
                            <p className="text-xs text-gray-500">
                              <span className="font-semibold">Assunto:</span>{' '}
                              {previewLead ? aplicarPreview(assunto, previewLead) : assunto}
                            </p>
                          </div>
                        )}
                        <div
                          className="p-4 text-sm text-gray-800 leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: previewHtml }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Mover lead após envio */}
              {estagiosList.length > 0 && (
                <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
                  <div className="flex items-center gap-2">
                    <ArrowRight size={15} className="text-blue-500 shrink-0" />
                    <label className="text-sm font-medium text-gray-700">
                      Após o envio, mover lead para{' '}
                      <span className="text-gray-400 font-normal">(opcional)</span>
                    </label>
                  </div>
                  <select
                    value={estagioPosDeparoId ?? ''}
                    onChange={e => setEstagioPosDeparoId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    <option value="">— Não mover —</option>
                    {estagiosList.map(e => (
                      <option key={e.id} value={e.id}>{e.nome}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Agendar */}
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
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <Calendar size={15} className="text-blue-500 shrink-0" />
                  <label className="text-sm font-medium text-gray-700 cursor-pointer">
                    Agendar para depois{' '}
                    <span className="text-gray-400 font-normal">(opcional)</span>
                  </label>
                </div>
                {agendar && (
                  <input
                    type="datetime-local"
                    value={agendadoPara}
                    onChange={e => setAgendadoPara(e.target.value)}
                    min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  />
                )}
              </div>
            </div>
          )}

          {/* STEP: Disparando */}
          {step === 'disparando' && (
            <div className="py-6 space-y-5">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-3">
                  <Loader2 size={32} className="text-blue-600 animate-spin" />
                </div>
                <p className="text-lg font-semibold text-gray-800">Enviando e-mails...</p>
                <p className="text-sm text-gray-500 mt-1">Aguarde, os e-mails estão sendo enviados</p>
              </div>
              {status && (
                <>
                  <div className="bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-500 rounded-full"
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
                </>
              )}
            </div>
          )}

          {/* STEP: Resultado */}
          {step === 'resultado' && status && (
            <div className="space-y-4">
              {status.status === 'agendado' ? (
                <div className="text-center py-6">
                  <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-3">
                    <Calendar size={32} className="text-blue-600" />
                  </div>
                  <p className="text-lg font-semibold text-gray-800">Disparo agendado!</p>
                  {status.agendado_para && (
                    <p className="text-sm text-gray-500 mt-1">
                      Será enviado em{' '}
                      <span className="font-medium text-blue-700">
                        {new Date(status.agendado_para).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    {status.total} lead{status.total !== 1 ? 's' : ''} receberão o e-mail no horário agendado.
                  </p>
                </div>
              ) : (
                <>
                  <div className="text-center py-4">
                    <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-3">
                      <CheckCircle size={32} className="text-blue-600" />
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
                            <span className="font-medium text-red-600">{e.nome}:</span>{' '}
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
                className="flex items-center gap-2 px-5 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm font-medium"
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
                  {totalSelecionados} lead{totalSelecionados !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={handleDisparar}
                  disabled={!assunto.trim() || !corpo.trim() || loading || totalSelecionados === 0 || (agendar && !agendadoPara)}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm font-medium"
                >
                  {loading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : agendar ? (
                    <Calendar size={16} />
                  ) : (
                    <Mail size={16} />
                  )}
                  {agendar
                    ? `Agendar para ${totalSelecionados} lead${totalSelecionados !== 1 ? 's' : ''}`
                    : `Enviar para ${totalSelecionados} lead${totalSelecionados !== 1 ? 's' : ''}`}
                </button>
              </div>
            </>
          )}

          {step === 'disparando' && (
            <p className="text-xs text-gray-400 w-full text-center">
              Os e-mails estão sendo enviados em background. Pode fechar esta janela.
            </p>
          )}

          {step === 'resultado' && (
            <button
              onClick={handleClose}
              className="w-full px-5 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium"
            >
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
