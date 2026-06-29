import { useState, useRef, useEffect } from 'react'
import toast from 'react-hot-toast'
import {
  X, Phone, Mail, Building, DollarSign, Calendar, MessageCircle,
  Thermometer, Tag as TagIcon, Archive, Trash2, Send, Clock, User,
  Paperclip, Image, FileText, Mic, XCircle, Plus, Check,
  Trash, PhoneCall, Video, MailIcon, RefreshCw, FileSignature, MapPin,
  MoreHorizontal, StickyNote, AlertTriangle, Bell, Globe, Square, Edit2, ArrowRight
} from 'lucide-react'
import LeadFormModal from './LeadFormModal'
import {
  useArquivarLead, useDeleteLead, useUpdateLead,
  useLeadAtividades, useMarcarLido, useHistoricoMensagens,
  useTarefasLead, useCreateTarefa, useUpdateTarefa, useConcluirTarefa, useDeleteTarefa,
  useAnotacoesLead, useCreateAnotacao, useDeleteAnotacao,
  useLeadEnviarMensagem, useLeadEnviarMedia, useLeadHistoricoWhatsApp, useLeadMarcarLido,
  useUsuariosEmpresa, useFunis, useTransferirFunil,
  useFollowupsLead, useCreateFollowup, useCancelarFollowup,
} from '@/hooks/useCRM'
import ChatBubble, { ChatDateSeparator } from './ChatBubble'
import AgenteIALeadToggle from './AgenteIALeadToggle'
import { WhatsAppFormatToolbar } from '@/components/ui/WhatsAppFormatToolbar'
import type { Lead, EstagioFunil, HistoricoMensagem, TarefaTipo, TarefaPrioridade, AnotacaoTipo, LeadOrigem } from '@/types/crm'

interface LeadDetailsModalProps {
  lead: Lead | null
  estagios: EstagioFunil[]
  isOpen: boolean
  onClose: () => void
}

const temperaturaOptions = [
  { value: 'frio', label: 'Frio', color: 'bg-blue-100 text-blue-700' },
  { value: 'morno', label: 'Morno', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'quente', label: 'Quente', color: 'bg-red-100 text-red-700' },
]

const origemConfig: Record<string, { label: string; color: string }> = {
  manual: { label: 'Manual', color: 'bg-gray-100 text-gray-700' },
  whatsapp: { label: 'WhatsApp', color: 'bg-green-100 text-green-700' },
  importacao: { label: 'Importacao', color: 'bg-blue-100 text-blue-700' },
  indicacao: { label: 'Indicacao', color: 'bg-primary-100 text-primary-700' },
  networking: { label: 'Networking', color: 'bg-primary-100 text-primary-700' },
  parceria: { label: 'Parceria', color: 'bg-pink-100 text-pink-700' },
  instagram: { label: 'Instagram', color: 'bg-fuchsia-100 text-fuchsia-700' },
  lancamento: { label: 'Lancamento', color: 'bg-orange-100 text-orange-700' },
  forms: { label: 'Forms', color: 'bg-teal-100 text-teal-700' },
}

const origemOptions: { value: LeadOrigem; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'indicacao', label: 'Indicacao' },
  { value: 'networking', label: 'Networking' },
  { value: 'parceria', label: 'Parceria' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'lancamento', label: 'Lancamento' },
  { value: 'forms', label: 'Forms' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'importacao', label: 'Importacao' },
]

export default function LeadDetailsModal({ lead, estagios, isOpen, onClose }: LeadDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'tarefas' | 'anotacoes' | 'atividades' | 'mensagem'>('info')
  const [mensagem, setMensagem] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const mensagemTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Tarefas state
  const [showTarefaForm, setShowTarefaForm] = useState(false)
  const [tarefaTipo, setTarefaTipo] = useState<TarefaTipo>('follow_up')
  const [tarefaTitulo, setTarefaTitulo] = useState('')
  const [tarefaDescricao, setTarefaDescricao] = useState('')
  const [tarefaDataVencimento, setTarefaDataVencimento] = useState('')
  const [tarefaPrioridade, setTarefaPrioridade] = useState<TarefaPrioridade>('normal')

  const [showEditModal, setShowEditModal] = useState(false)
  const [showTransferirFunil, setShowTransferirFunil] = useState(false)
  const [targetFunilId, setTargetFunilId] = useState<number | undefined>()

  // Follow-up state
  const [showFollowupPanel, setShowFollowupPanel] = useState(false)
  const [followupTipo, setFollowupTipo] = useState<'manual' | 'agente_ia'>('agente_ia')
  const [followupMensagem, setFollowupMensagem] = useState('')
  const [followupInstrucaoIa, setFollowupInstrucaoIa] = useState('')
  const [followupData, setFollowupData] = useState('')
  const [followupHora, setFollowupHora] = useState('09:00')
  const [followupHoraInicioJanela, setFollowupHoraInicioJanela] = useState('08:00')
  const [followupHoraFimJanela, setFollowupHoraFimJanela] = useState('18:00')
  const [followupDiasSemana, setFollowupDiasSemana] = useState<number[]>([1, 2, 3, 4, 5])

  // Origem state (local para evitar que o select reverta ao valor antigo após mutação)
  const [leadOrigem, setLeadOrigem] = useState<LeadOrigem>(lead?.origem || 'manual')
  useEffect(() => {
    setLeadOrigem(lead?.origem || 'manual')
  }, [lead?.id, lead?.origem])

  // Anotacoes state
  const [anotacaoConteudo, setAnotacaoConteudo] = useState('')
  const [anotacaoTipo, setAnotacaoTipo] = useState<AnotacaoTipo>('nota')

const arquivarLead = useArquivarLead()
  const deleteLead = useDeleteLead()
  const updateLead = useUpdateLead()
  const marcarLido = useMarcarLido()
  const { data: usuariosEmpresa = [] } = useUsuariosEmpresa()
  const { data: funisList = [] } = useFunis()
  const transferirFunilMutation = useTransferirFunil()
  const leadEnviarMensagem = useLeadEnviarMensagem()
  const leadEnviarMedia = useLeadEnviarMedia()
  const leadMarcarLido = useLeadMarcarLido()
  const { data: atividades } = useLeadAtividades(lead?.id)

  // Determinar se o lead pode usar WhatsApp (tem contato vinculado OU tem telefone)
  const canWhatsApp = !!(lead?.contato_whatsapp_id || lead?.telefone)

  // Usar historico via contato se ja vinculado, ou via lead
  const { data: historicoContato } = useHistoricoMensagens(
    activeTab === 'mensagem' && lead?.contato_whatsapp_id ? lead.contato_whatsapp_id : undefined
  )
  const { data: historicoLead } = useLeadHistoricoWhatsApp(
    lead?.id,
    activeTab === 'mensagem' && canWhatsApp && !lead?.contato_whatsapp_id
  )
  const historico = lead?.contato_whatsapp_id ? historicoContato : historicoLead

  const { data: tarefas } = useTarefasLead(activeTab === 'tarefas' ? lead?.id : undefined)
  const createTarefa = useCreateTarefa()
  const updateTarefa = useUpdateTarefa()
  const concluirTarefa = useConcluirTarefa()
  const deleteTarefa = useDeleteTarefa()
  const { data: anotacoes } = useAnotacoesLead(activeTab === 'anotacoes' ? lead?.id : undefined)
  const createAnotacao = useCreateAnotacao()
  const deleteAnotacao = useDeleteAnotacao()
  const { data: followups = [] } = useFollowupsLead(lead?.id)
  const createFollowup = useCreateFollowup()
  const cancelarFollowup = useCancelarFollowup()

// Marcar como lido ao abrir aba mensagem
  useEffect(() => {
    if (isOpen && activeTab === 'mensagem' && lead && (lead.mensagens_nao_lidas || 0) > 0) {
      if (lead?.contato_whatsapp_id) {
        marcarLido.mutate({ contatoId: lead.contato_whatsapp_id, leadId: lead.id })
      } else if (lead?.id) {
        leadMarcarLido.mutate(lead.id)
      }
    }
  }, [activeTab, lead?.id, isOpen])

  // Auto-scroll para o fim do chat — aguarda o DOM pintar antes de rolar
  useEffect(() => {
    if (isOpen && activeTab === 'mensagem') {
      const scrollToBottom = () => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
        }
      }
      // Dois rAF garantem que o browser terminou de renderizar e calcular scrollHeight
      requestAnimationFrame(() => requestAnimationFrame(scrollToBottom))
    }
  }, [historico, activeTab, isOpen])

  if (!isOpen || !lead) return null

  const estagioAtual = estagios.find((e) => e.id === lead.estagio_id)

  const handleEnviarMensagem = async () => {
    if (!mensagem.trim()) return
    // Usar endpoint via lead (auto-cria contato se necessario)
    await leadEnviarMensagem.mutateAsync({
      leadId: lead.id,
      mensagem,
    })
    setMensagem('')
  }

  const handleEnviarMedia = async () => {
    if (!selectedFile) return
    // Usar endpoint via lead (auto-cria contato se necessario)
    await leadEnviarMedia.mutateAsync({
      leadId: lead.id,
      file: selectedFile,
      caption: caption || undefined,
    })
    setSelectedFile(null)
    setCaption('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleEnviarMensagem()
    }
  }

  const handleToggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop()
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const mimeType = MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')
          ? 'audio/ogg; codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/ogg'
        const mediaRecorder = new MediaRecorder(stream, { mimeType })
        mediaRecorderRef.current = mediaRecorder
        audioChunksRef.current = []

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data)
        }

        mediaRecorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: mimeType.split(';')[0] })
          const ext = mimeType.includes('ogg') ? 'ogg' : 'webm'
          const file = new File([blob], `audio_${Date.now()}.${ext}`, { type: mimeType.split(';')[0] })
          setSelectedFile(file)
          stream.getTracks().forEach((t) => t.stop())
          setIsRecording(false)
        }

        mediaRecorder.start()
        setIsRecording(true)
      } catch {
        toast.error('Permissão de microfone negada')
      }
    }
  }

const handleArquivar = async () => {
    if (confirm('Tem certeza que deseja arquivar este lead?')) {
      await arquivarLead.mutateAsync(lead.id)
      onClose()
    }
  }

  const handleDeletar = async () => {
    if (confirm('Tem certeza que deseja deletar este lead? Esta acao nao pode ser desfeita.')) {
      await deleteLead.mutateAsync(lead.id)
      onClose()
    }
  }

  const handleAgendarFollowup = async () => {
    if (followupTipo === 'manual' && (!followupData || !followupHora || !followupMensagem.trim())) return
    // Agente IA: agenda para agora — janela e dias controlam quando envia
    // Manual: usa a data/hora escolhida pelo usuário
    const agendadoPara = followupTipo === 'agente_ia'
      ? new Date().toISOString()
      : new Date(`${followupData}T${followupHora}:00`).toISOString()
    await createFollowup.mutateAsync({
      leadId: lead.id,
      data: {
        agendado_para: agendadoPara,
        tipo: followupTipo,
        mensagem: followupTipo === 'manual' ? followupMensagem : undefined,
        instrucao_ia: followupTipo === 'agente_ia' ? followupInstrucaoIa : undefined,
        hora_inicio: followupHoraInicioJanela || undefined,
        hora_fim: followupHoraFimJanela || undefined,
        dias_semana: followupDiasSemana.length > 0 ? followupDiasSemana : undefined,
      }
    })
    setShowFollowupPanel(false)
    setFollowupData('')
    setFollowupHora('09:00')
    setFollowupMensagem('')
    setFollowupInstrucaoIa('')
    setFollowupDiasSemana([1, 2, 3, 4, 5])
  }

  const formatarData = (data: string) => {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(data))
  }

  // Agrupar mensagens por data para separadores
  const mensagensOrdenadas = [...(historico || [])].reverse()
  const mensagensComDatas: { type: 'date' | 'msg'; date?: string; msg?: HistoricoMensagem }[] = []
  let lastDate = ''
  for (const msg of mensagensOrdenadas) {
    const msgDate = new Date(msg.enviado_at).toDateString()
    if (msgDate !== lastDate) {
      mensagensComDatas.push({ type: 'date', date: msg.enviado_at })
      lastDate = msgDate
    }
    mensagensComDatas.push({ type: 'msg', msg })
  }

  const unreadCount = lead.mensagens_nao_lidas || 0

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{lead.titulo || lead.nome}</h2>
            {estagioAtual && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium mt-1"
                style={{ backgroundColor: `${estagioAtual.cor}20`, color: estagioAtual.cor }}
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: estagioAtual.cor }} />
                {estagioAtual.nome}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
            >
              <Edit2 size={14} />
              Editar
            </button>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X size={20} className="text-gray-500" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b flex">
          <button
            onClick={() => setActiveTab('info')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === 'info'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Informacoes
          </button>
          <button
            onClick={() => setActiveTab('tarefas')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1 ${
              activeTab === 'tarefas'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Tarefas
            {(lead.total_tarefas_pendentes || 0) > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-primary-100 text-primary-700 text-xs rounded-full font-bold min-w-[20px] text-center">
                {lead.total_tarefas_pendentes}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('anotacoes')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1 ${
              activeTab === 'anotacoes'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Anotacoes
            {(lead.total_anotacoes || 0) > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full font-bold min-w-[20px] text-center">
                {lead.total_anotacoes}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('atividades')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === 'atividades'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Atividades
          </button>
          {canWhatsApp && (
            <button
              onClick={() => setActiveTab('mensagem')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1 ${
                activeTab === 'mensagem'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <MessageCircle size={16} />
              WhatsApp
              {unreadCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-green-500 text-white text-xs rounded-full font-bold min-w-[20px] text-center">
                  {unreadCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'info' && (
            <div className="space-y-4">
              {/* Contato */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <User size={16} className="text-gray-400" />
                  <span className="text-gray-600">{lead.nome}</span>
                </div>
                {lead.telefone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone size={16} className="text-gray-400" />
                    <span className="text-gray-600">{lead.telefone}</span>
                  </div>
                )}
                {lead.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail size={16} className="text-gray-400" />
                    <span className="text-gray-600">{lead.email}</span>
                  </div>
                )}
                {lead.empresa && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building size={16} className="text-gray-400" />
                    <span className="text-gray-600">{lead.empresa}</span>
                  </div>
                )}
                {lead.cpf_cnpj && (
                  <div className="flex items-center gap-2 text-sm">
                    <FileText size={16} className="text-gray-400" />
                    <span className="text-gray-600">CPF/CNPJ: {lead.cpf_cnpj}</span>
                  </div>
                )}
              </div>

              {/* Detalhes do negocio */}
              <div className="border-t pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Detalhes do Negocio</h3>
                <div className="grid grid-cols-2 gap-4">
                  {lead.valor_potencial && (
                    <div className="flex items-center gap-2 text-sm">
                      <DollarSign size={16} className="text-green-500" />
                      <span className="font-medium text-green-600">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lead.valor_potencial)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Thermometer size={16} className="text-gray-400" />
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      temperaturaOptions.find((t) => t.value === lead.temperatura)?.color
                    }`}>
                      {temperaturaOptions.find((t) => t.value === lead.temperatura)?.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Globe size={16} className="text-gray-400" />
                    <select
                      value={leadOrigem}
                      onChange={(e) => {
                        const nova = e.target.value as LeadOrigem
                        setLeadOrigem(nova)
                        updateLead.mutate({ id: lead.id, data: { origem: nova } })
                      }}
                      className={`px-2 py-0.5 rounded text-xs font-medium border-0 cursor-pointer ${
                        origemConfig[leadOrigem]?.color || 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {!origemOptions.some(o => o.value === leadOrigem) && (
                        <option value={leadOrigem}>{leadOrigem}</option>
                      )}
                      {origemOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  {usuariosEmpresa.length > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <User size={16} className="text-gray-400" />
                      <select
                        value={lead.responsavel_id || ''}
                        onChange={(e) => {
                          updateLead.mutate({ id: lead.id, data: { responsavel_id: Number(e.target.value) } })
                        }}
                        className="px-2 py-0.5 rounded text-xs font-medium border border-gray-200 cursor-pointer bg-white text-gray-700"
                      >
                        <option value="">Sem responsável</option>
                        {usuariosEmpresa.map((u) => (
                          <option key={u.id} value={u.id}>{u.nome}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {lead.probabilidade && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400">Probabilidade:</span>
                      <span className="font-medium">{lead.probabilidade}%</span>
                    </div>
                  )}
                  {lead.data_previsao_fechamento && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar size={16} className="text-gray-400" />
                      <span className="text-gray-600">
                        {new Intl.DateTimeFormat('pt-BR').format(new Date(lead.data_previsao_fechamento))}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Tags */}
              {lead.tags && lead.tags.length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <TagIcon size={14} />
                    Tags
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {lead.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="px-2 py-1 rounded text-xs font-medium"
                        style={{ backgroundColor: `${tag.cor}20`, color: tag.cor }}
                      >
                        {tag.nome}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notas */}
              {lead.notas && (() => {
                const origemMatch = lead.notas.match(/\[origem_lead_id:(\d+)\]/);
                const notasLimpas = lead.notas.replace(/\[origem_lead_id:\d+\]\s*/g, '').trim();
                return (
                  <div className="border-t pt-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Notas</h3>
                    {origemMatch && (
                      <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <ArrowRight size={14} className="text-emerald-600 shrink-0" />
                        <span className="text-xs text-emerald-700">
                          Criado a partir da negociação{' '}
                          <span className="font-semibold">#{origemMatch[1]}</span> no Funil de Aquisição
                        </span>
                      </div>
                    )}
                    {notasLimpas && (
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">{notasLimpas}</p>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {activeTab === 'tarefas' && (
            <div className="space-y-4">
              {/* Botao nova tarefa */}
              {!showTarefaForm && (
                <button
                  onClick={() => setShowTarefaForm(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-primary-600 hover:bg-primary-50 rounded-lg border border-dashed border-primary-300 w-full justify-center"
                >
                  <Plus size={16} />
                  Nova Tarefa
                </button>
              )}

              {/* Form nova tarefa */}
              {showTarefaForm && (
                <div className="p-4 border rounded-lg bg-gray-50 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Tipo</label>
                      <select
                        value={tarefaTipo}
                        onChange={(e) => setTarefaTipo(e.target.value as TarefaTipo)}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      >
                        <option value="ligacao">Ligacao</option>
                        <option value="reuniao">Reuniao</option>
                        <option value="email">Email</option>
                        <option value="follow_up">Follow-up</option>
                        <option value="proposta">Proposta</option>
                        <option value="visita">Visita</option>
                        <option value="outros">Outros</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Prioridade</label>
                      <select
                        value={tarefaPrioridade}
                        onChange={(e) => setTarefaPrioridade(e.target.value as TarefaPrioridade)}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      >
                        <option value="baixa">Baixa</option>
                        <option value="normal">Normal</option>
                        <option value="alta">Alta</option>
                        <option value="urgente">Urgente</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Titulo</label>
                    <input
                      value={tarefaTitulo}
                      onChange={(e) => setTarefaTitulo(e.target.value)}
                      placeholder="Ex: Ligar para confirmar reuniao"
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Data/Hora</label>
                    <input
                      type="datetime-local"
                      value={tarefaDataVencimento}
                      onChange={(e) => setTarefaDataVencimento(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Descricao (opcional)</label>
                    <textarea
                      value={tarefaDescricao}
                      onChange={(e) => setTarefaDescricao(e.target.value)}
                      rows={2}
                      placeholder="Detalhes da tarefa..."
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => {
                        setShowTarefaForm(false)
                        setTarefaTitulo('')
                        setTarefaDescricao('')
                        setTarefaDataVencimento('')
                        setTarefaTipo('follow_up')
                        setTarefaPrioridade('normal')
                      }}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={async () => {
                        if (!tarefaTitulo.trim() || !tarefaDataVencimento) return
                        try {
                          await createTarefa.mutateAsync({
                            lead_id: lead.id,
                            tipo: tarefaTipo,
                            titulo: tarefaTitulo,
                            descricao: tarefaDescricao || undefined,
                            data_vencimento: new Date(tarefaDataVencimento).toISOString(),
                            prioridade: tarefaPrioridade,
                          })
                          setShowTarefaForm(false)
                          setTarefaTitulo('')
                          setTarefaDescricao('')
                          setTarefaDataVencimento('')
                          setTarefaTipo('follow_up')
                          setTarefaPrioridade('normal')
                        } catch {
                          // Erro já tratado pelo onError do hook
                        }
                      }}
                      disabled={!tarefaTitulo.trim() || !tarefaDataVencimento || createTarefa.isPending}
                      className="px-4 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
                    >
                      {createTarefa.isPending ? 'Criando...' : 'Criar Tarefa'}
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de tarefas */}
              {!tarefas || tarefas.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Nenhuma tarefa cadastrada</p>
              ) : (
                tarefas.map((tarefa) => {
                  const isConcluida = tarefa.status === 'concluida' || tarefa.status === 'cancelada'
                  const statusColors: Record<string, string> = {
                    vermelho: 'bg-red-500',
                    verde: 'bg-green-500',
                    amarelo: 'bg-yellow-400',
                    cinza: 'bg-gray-400',
                  }
                  const tipoIcons: Record<string, typeof PhoneCall> = {
                    ligacao: PhoneCall,
                    reuniao: Video,
                    email: MailIcon,
                    follow_up: RefreshCw,
                    proposta: FileSignature,
                    visita: MapPin,
                    outros: MoreHorizontal,
                  }
                  const TipoIcon = tipoIcons[tarefa.tipo] || MoreHorizontal
                  const prioridadeColors: Record<string, string> = {
                    baixa: 'text-gray-500',
                    normal: 'text-blue-600',
                    alta: 'text-orange-600',
                    urgente: 'text-red-600',
                  }

                  return (
                    <div
                      key={tarefa.id}
                      className={`flex items-start gap-3 p-3 border rounded-lg ${isConcluida ? 'bg-gray-50 opacity-60' : 'bg-white'}`}
                    >
                      {/* Concluir / Reabrir toggle */}
                      <button
                        onClick={() => {
                          if (isConcluida) {
                            updateTarefa.mutate({ id: tarefa.id, data: { status: 'pendente' } })
                          } else {
                            concluirTarefa.mutate(tarefa.id)
                          }
                        }}
                        title={isConcluida ? 'Reabrir tarefa' : 'Marcar como concluída'}
                        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isConcluida
                            ? 'bg-green-500 border-green-500 text-white hover:bg-gray-400 hover:border-gray-400'
                            : 'border-gray-300 hover:border-primary-500'
                        }`}
                      >
                        {isConcluida && <Check size={12} />}
                      </button>

                      {/* Status visual dot */}
                      <span className={`mt-2 w-2 h-2 rounded-full flex-shrink-0 ${statusColors[tarefa.status_visual || 'cinza']}`} />

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <TipoIcon size={14} className="text-gray-400 flex-shrink-0" />
                          <span className={`text-sm font-medium ${isConcluida ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                            {tarefa.titulo}
                          </span>
                          <span className={`text-xs font-medium ${prioridadeColors[tarefa.prioridade]}`}>
                            {tarefa.prioridade !== 'normal' && tarefa.prioridade.charAt(0).toUpperCase() + tarefa.prioridade.slice(1)}
                          </span>
                        </div>
                        {tarefa.descricao && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{tarefa.descricao}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(tarefa.data_vencimento))}
                        </p>
                      </div>

                      {/* Delete — sempre visível */}
                      <button
                        onClick={() => {
                          if (confirm('Excluir esta tarefa?')) deleteTarefa.mutate(tarefa.id)
                        }}
                        className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                        title="Excluir tarefa"
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {activeTab === 'anotacoes' && (
            <div className="space-y-4">
              {/* Form nova anotacao */}
              <div className="p-3 border rounded-lg bg-gray-50 space-y-2">
                <textarea
                  value={anotacaoConteudo}
                  onChange={(e) => setAnotacaoConteudo(e.target.value)}
                  rows={3}
                  placeholder="Escreva uma anotacao..."
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                />
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    {([
                      { value: 'nota', label: 'Nota', icon: StickyNote, color: 'text-gray-600 bg-gray-100' },
                      { value: 'importante', label: 'Importante', icon: AlertTriangle, color: 'text-orange-600 bg-orange-100' },
                      { value: 'lembrete', label: 'Lembrete', icon: Bell, color: 'text-blue-600 bg-blue-100' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setAnotacaoTipo(opt.value)}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                          anotacaoTipo === opt.value ? opt.color : 'text-gray-400 hover:text-gray-600'
                        }`}
                      >
                        <opt.icon size={12} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={async () => {
                      if (!anotacaoConteudo.trim()) return
                      await createAnotacao.mutateAsync({
                        lead_id: lead.id,
                        conteudo: anotacaoConteudo,
                        tipo: anotacaoTipo,
                      })
                      setAnotacaoConteudo('')
                      setAnotacaoTipo('nota')
                    }}
                    disabled={!anotacaoConteudo.trim() || createAnotacao.isPending}
                    className="px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
                  >
                    {createAnotacao.isPending ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>

              {/* Lista de anotacoes */}
              {!anotacoes || anotacoes.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Nenhuma anotacao registrada</p>
              ) : (
                anotacoes.map((anotacao) => {
                  const tipoConfig: Record<string, { icon: typeof StickyNote; color: string; bg: string }> = {
                    nota: { icon: StickyNote, color: 'text-gray-600', bg: 'bg-gray-100' },
                    importante: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-100' },
                    lembrete: { icon: Bell, color: 'text-blue-600', bg: 'bg-blue-100' },
                  }
                  const cfg = tipoConfig[anotacao.tipo] || tipoConfig.nota
                  const AnotIcon = cfg.icon

                  return (
                    <div key={anotacao.id} className="p-3 border rounded-lg bg-white">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <span className={`mt-0.5 p-1 rounded ${cfg.bg}`}>
                            <AnotIcon size={12} className={cfg.color} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{anotacao.conteudo}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {anotacao.usuario_nome && <span className="font-medium text-gray-500">{anotacao.usuario_nome} - </span>}
                              {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(anotacao.created_at))}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (confirm('Excluir esta anotacao?')) deleteAnotacao.mutate(anotacao.id)
                          }}
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded flex-shrink-0"
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {activeTab === 'atividades' && (
            <div className="space-y-3">
              {!atividades || atividades.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Nenhuma atividade registrada</p>
              ) : (
                atividades.map((atividade) => (
                  <div key={atividade.id} className="flex gap-3 p-3 border rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      <Clock size={14} className="text-gray-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-800">{atividade.descricao}</p>
                      <p className="text-xs text-gray-500 mt-1">{formatarData(atividade.created_at)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'mensagem' && canWhatsApp && (
            <div className="flex flex-col h-full -m-4">
              {/* Chat area */}
              <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 bg-gray-50 min-h-[350px] max-h-[450px]"
                style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23e5e7eb\' fill-opacity=\'0.4\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}
              >
                {mensagensComDatas.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-gray-500">
                      <MessageCircle size={40} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhuma mensagem ainda</p>
                      <p className="text-xs mt-1">Envie a primeira mensagem para este lead</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {mensagensComDatas.map((item, i) =>
                      item.type === 'date' ? (
                        <ChatDateSeparator key={`date-${i}`} date={item.date!} />
                      ) : (
                        <ChatBubble key={item.msg!.id} mensagem={item.msg!} />
                      )
                    )}
                  </>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Preview de arquivo selecionado */}
              {selectedFile && (
                <div className="px-4 py-2 bg-gray-100 border-t flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {selectedFile.type.startsWith('image/') ? (
                      <Image size={20} className="text-blue-500 flex-shrink-0" />
                    ) : selectedFile.type.startsWith('audio/') ? (
                      <Mic size={20} className="text-primary-500 flex-shrink-0" />
                    ) : (
                      <FileText size={20} className="text-orange-500 flex-shrink-0" />
                    )}
                    <span className="text-sm text-gray-700 truncate">{selectedFile.name}</span>
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      ({(selectedFile.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
                  <button
                    onClick={() => { setSelectedFile(null); setCaption('') }}
                    className="p-1 hover:bg-gray-200 rounded"
                  >
                    <XCircle size={18} className="text-gray-500" />
                  </button>
                </div>
              )}

              {/* Barra de controle do Agente IA */}
              {lead && (
                <div className="bg-white border-t">
                  <div className="px-4 py-2">
                    <AgenteIALeadToggle leadId={lead.id} />
                  </div>
                </div>
              )}

              {/* Input area */}
              <div className="p-3 bg-white border-t">
                {selectedFile ? (
                  <div className="flex gap-2">
                    <input
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder="Legenda (opcional)..."
                      className="flex-1 px-3 py-2 border rounded-full text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleEnviarMedia() }}
                    />
                    <button
                      onClick={handleEnviarMedia}
                      disabled={leadEnviarMedia.isPending}
                      className="p-2 bg-green-500 text-white rounded-full hover:bg-green-600 disabled:opacity-50"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"
                      title="Anexar arquivo"
                    >
                      <Paperclip size={20} />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept="image/*,audio/*,video/*,.pdf,.docx,.xlsx"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) setSelectedFile(file)
                        e.target.value = ''
                      }}
                    />
                    <button
                      onClick={handleToggleRecording}
                      className={`p-2 rounded-full transition-colors ${
                        isRecording
                          ? 'text-red-500 bg-red-50 animate-pulse'
                          : 'text-gray-500 hover:bg-gray-100'
                      }`}
                      title={isRecording ? 'Parar gravação' : 'Gravar áudio'}
                    >
                      {isRecording ? <Square size={20} /> : <Mic size={20} />}
                    </button>
                    <div className="flex-1 flex flex-col gap-1">
                      <WhatsAppFormatToolbar
                        textareaRef={mensagemTextareaRef}
                        value={mensagem}
                        onChange={setMensagem}
                        className="px-1"
                      />
                      <textarea
                        ref={mensagemTextareaRef}
                        value={mensagem}
                        onChange={(e) => setMensagem(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Digite uma mensagem..."
                        rows={1}
                        className="w-full px-3 py-2 border rounded-full text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none"
                        style={{ maxHeight: '80px' }}
                      />
                    </div>
                    <button
                      onClick={handleEnviarMensagem}
                      disabled={!mensagem.trim() || leadEnviarMensagem.isPending}
                      className="p-2 bg-green-500 text-white rounded-full hover:bg-green-600 disabled:opacity-50"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Follow-up panel */}
        {showFollowupPanel && (
          <div className="border-t bg-orange-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-orange-800 flex items-center gap-1.5">
                <Bell size={15} />
                Agendar Follow-up
              </span>
              <button onClick={() => setShowFollowupPanel(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle size={16} />
              </button>
            </div>
            {/* Follow-ups existentes pendentes */}
            {followups.filter(f => f.status === 'pendente').length > 0 && (
              <div className="space-y-1">
                {followups.filter(f => f.status === 'pendente').map(f => {
                  const isAtrasado = new Date(f.agendado_para) < new Date()
                  return (
                    <div key={f.id} className={`flex items-center justify-between bg-white rounded px-2 py-1 text-xs border ${isAtrasado ? 'border-red-300 text-red-700' : 'border-orange-200 text-gray-700'}`}>
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {f.tipo === 'agente_ia' ? 'Agente IA' : 'Manual'} ·{' '}
                        {new Date(f.agendado_para).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                          timeZone: 'America/Sao_Paulo'
                        })}
                        {isAtrasado && <span className="font-semibold text-red-600 ml-1">· atrasado</span>}
                        {f.hora_inicio && (
                          <span className="text-gray-400 ml-1">
                            (janela: {f.hora_inicio}{f.hora_fim ? `–${f.hora_fim}` : ''})
                          </span>
                        )}
                        {f.origem === 'estagio' && <span className="ml-1 text-orange-500">(estágio)</span>}
                      </span>
                      <button
                        onClick={() => cancelarFollowup.mutate({ id: f.id, leadId: lead.id })}
                        className="text-red-400 hover:text-red-600 ml-2"
                        title="Cancelar"
                      >
                        <XCircle size={13} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            {/* Follow-ups falhados com opção de retry */}
            {followups.filter(f => f.status === 'falhou').length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-red-700">Falhados:</p>
                {followups.filter(f => f.status === 'falhou').map(f => (
                  <div key={f.id} className="flex items-center justify-between bg-red-50 rounded px-2 py-1 text-xs border border-red-200 text-red-700">
                    <span className="flex items-center gap-1 truncate">
                      <Clock size={11} />
                      {f.tipo === 'agente_ia' ? 'Agente IA' : 'Manual'} ·{' '}
                      {new Date(f.agendado_para).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        timeZone: 'America/Sao_Paulo'
                      })}
                      {f.erro && <span className="text-red-400 truncate ml-1">· {f.erro}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {/* Tipo */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" value="agente_ia" checked={followupTipo === 'agente_ia'} onChange={() => setFollowupTipo('agente_ia')} className="text-orange-500" />
                  Agente IA
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" value="manual" checked={followupTipo === 'manual'} onChange={() => setFollowupTipo('manual')} className="text-orange-500" />
                  Mensagem fixa
                </label>
              </div>
            </div>

            {/* Campos por tipo */}
            {followupTipo === 'agente_ia' ? (
              <div className="space-y-2">
                <p className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1.5">
                  O agente enviará a mensagem assim que a janela de horário permitir — respeitando os dias da semana configurados.
                </p>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Janela de atuação do agente</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={followupHoraInicioJanela}
                      onChange={(e) => setFollowupHoraInicioJanela(e.target.value)}
                      className="px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
                    />
                    <span className="text-xs text-gray-500">até</span>
                    <input
                      type="time"
                      value={followupHoraFimJanela}
                      onChange={(e) => setFollowupHoraFimJanela(e.target.value)}
                      className="px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Instrução para o agente (opcional)</label>
                  <textarea
                    value={followupInstrucaoIa}
                    onChange={(e) => setFollowupInstrucaoIa(e.target.value)}
                    placeholder="Ex: Retome o contato perguntando se o lead já tomou uma decisão sobre a proposta..."
                    rows={3}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400 resize-none"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Data e hora de envio</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={followupData}
                      onChange={(e) => setFollowupData(e.target.value)}
                      className="px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
                    />
                    <input
                      type="time"
                      value={followupHora}
                      onChange={(e) => setFollowupHora(e.target.value)}
                      className="px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mensagem</label>
                  <textarea
                    value={followupMensagem}
                    onChange={(e) => setFollowupMensagem(e.target.value)}
                    placeholder="Olá! Gostaria de saber se tem alguma dúvida..."
                    rows={3}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400 resize-none"
                  />
                </div>
              </div>
            )}

            {/* Dias da semana */}
            <div className="pt-2 border-t">
              <label className="block text-xs font-medium text-gray-600 mb-1">Dias da semana</label>
              <div className="flex gap-1 flex-wrap">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map((d, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setFollowupDiasSemana(prev =>
                      prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i].sort()
                    )}
                    className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                      followupDiasSemana.includes(i)
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleAgendarFollowup}
              disabled={
                (followupTipo === 'manual' && (!followupData || !followupHora || !followupMensagem.trim())) ||
                createFollowup.isPending
              }
              className="w-full px-3 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
            >
              {createFollowup.isPending ? 'Agendando...' : 'Confirmar agendamento'}
            </button>
          </div>
        )}

        {/* Footer */}
        {(
          <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
            <div className="flex gap-2 items-center flex-wrap">
              {!showTransferirFunil ? (
                <>
                  <button
                    onClick={() => setShowFollowupPanel(!showFollowupPanel)}
                    className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded ${
                      showFollowupPanel
                        ? 'text-orange-700 bg-orange-100'
                        : 'text-orange-600 hover:bg-orange-50'
                    }`}
                  >
                    <Bell size={16} />
                    Follow-up
                    {(lead.followup_pendente_count ?? 0) > 0 && (
                      <span className="ml-1 bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5">
                        {lead.followup_pendente_count}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={handleArquivar}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-orange-600 hover:bg-orange-50 rounded"
                  >
                    <Archive size={16} />
                    Arquivar
                  </button>
                  <button
                    onClick={handleDeletar}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 size={16} />
                    Deletar
                  </button>
                  {funisList.length > 1 && (
                    <button
                      onClick={() => { setShowTransferirFunil(true); setTargetFunilId(undefined) }}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded"
                    >
                      <ArrowRight size={16} />
                      Mover Funil
                    </button>
                  )}
                </>
              ) : (
                <>
                  <select
                    value={targetFunilId || ''}
                    onChange={(e) => setTargetFunilId(Number(e.target.value))}
                    className="px-2 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    autoFocus
                  >
                    <option value="">Selecione o funil...</option>
                    {funisList.filter(f => f.id !== lead.funil_id).map(f => (
                      <option key={f.id} value={f.id}>{f.nome}</option>
                    ))}
                  </select>
                  <button
                    onClick={async () => {
                      if (!targetFunilId) return
                      await transferirFunilMutation.mutateAsync({ id: lead.id, novoFunilId: targetFunilId })
                      setShowTransferirFunil(false)
                      setTargetFunilId(undefined)
                      onClose()
                    }}
                    disabled={!targetFunilId || transferirFunilMutation.isPending}
                    className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                  >
                    {transferirFunilMutation.isPending ? 'Movendo...' : 'Confirmar'}
                  </button>
                  <button
                    onClick={() => { setShowTransferirFunil(false); setTargetFunilId(undefined) }}
                    className="px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg"
                  >
                    Cancelar
                  </button>
                </>
              )}
            </div>
            {!showTransferirFunil && (
              <div className="text-xs text-gray-500">
                Criado em {formatarData(lead.created_at)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de Edição do Lead */}
      {showEditModal && (
        <LeadFormModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          funilId={lead.funil_id}
          mode="edit"
          initialLead={lead}
          onUpdate={() => setShowEditModal(false)}
        />
      )}
    </div>
  )
}
