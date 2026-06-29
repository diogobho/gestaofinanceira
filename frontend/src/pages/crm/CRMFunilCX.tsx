import { useState, useEffect, useRef } from 'react'
import {
  RefreshCw, BarChart3, Settings, Search, Plus, LayoutList, LayoutGrid,
  Bell, User, Calendar, DollarSign,
  CheckCircle2, Clock, MessageCircle, Mail, Send
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  useKanbanCX, useFunilStats, useRegistrarWebhook, useFunisCX, useUsuariosEmpresa,
  useReorderEstagios
} from '@/hooks/useCRM'
import KanbanBoard from '@/components/crm/KanbanBoard'
import KanbanFilters from '@/components/crm/KanbanFilters'
import LeadDetailsModal from '@/components/crm/LeadDetailsModal'
import LeadFormModal from '@/components/crm/LeadFormModal'
import EstagioSettingsModal from '@/components/crm/EstagioSettingsModal'
import FunilSelector from '@/components/crm/FunilSelector'
import FunilFormModal from '@/components/crm/FunilFormModal'
import ConversaoGanhoModal, { type ConversaoGanhoData } from '@/components/crm/ConversaoGanhoModal'
import ContatosWhatsAppModal from '@/components/crm/ContatosWhatsAppModal'
import { TourHelpButton } from '@/components/tour/TourHelpButton'
import DisparoMensagemModal from '@/components/crm/DisparoMensagemModal'
import DisparoEmailModal from '@/components/crm/DisparoEmailModal'
import type { Lead, EstagioFunil, Funil } from '@/types/crm'
import type { FiltrosLead } from '@/api/crm'

// ─── Temperatura badge ─────────────────────────────────────────────────────────
function TemperaturaBadge({ value }: { value: 'frio' | 'morno' | 'quente' }) {
  const map = {
    frio:   { label: 'Frio',   cls: 'bg-blue-100 text-blue-700' },
    morno:  { label: 'Morno',  cls: 'bg-yellow-100 text-yellow-700' },
    quente: { label: 'Quente', cls: 'bg-red-100 text-red-700' },
  }
  const { label, cls } = map[value] ?? map.frio
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>
}

// ─── List View ─────────────────────────────────────────────────────────────────
interface ListViewProps {
  colunas: (EstagioFunil & { leads: Lead[] })[]
  onCardClick: (lead: Lead) => void
}

function CRMListView({ colunas, onCardClick }: ListViewProps) {
  const leads = colunas.flatMap(col =>
    col.leads.map(l => ({ ...l, estagio_nome: l.estagio_nome ?? col.nome, estagio_cor: l.estagio_cor ?? col.cor }))
  )

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <LayoutList size={40} className="mb-2 opacity-40" />
        <p>Nenhum cliente no funil CX</p>
      </div>
    )
  }

  return (
    <div className="overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            <th className="px-4 py-3">Cliente</th>
            <th className="px-4 py-3">Estágio</th>
            <th className="px-4 py-3">Valor</th>
            <th className="px-4 py-3">Temperatura</th>
            <th className="px-4 py-3">Responsável</th>
            <th className="px-4 py-3">Próx. Tarefa</th>
            <th className="px-4 py-3">Entrada</th>
          </tr>
        </thead>
        <tbody>
          {leads.map(lead => (
            <tr
              key={lead.id}
              onClick={() => onCardClick(lead)}
              className="border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
            >
              {/* Cliente */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: lead.estagio_cor ?? '#6366f1' }}
                  />
                  <div>
                    <p className="font-medium text-gray-800 dark:text-gray-100">{lead.nome}</p>
                    {lead.empresa && (
                      <p className="text-xs text-gray-400">{lead.empresa}</p>
                    )}
                  </div>
                  {(lead.mensagens_nao_lidas ?? 0) > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-green-500 text-white text-xs font-bold rounded-full">
                      {lead.mensagens_nao_lidas}
                    </span>
                  )}
                </div>
              </td>

              {/* Estágio */}
              <td className="px-4 py-3">
                <span
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: `${lead.estagio_cor ?? '#6366f1'}20`, color: lead.estagio_cor ?? '#6366f1' }}
                >
                  {lead.estagio_nome ?? '—'}
                </span>
              </td>

              {/* Valor */}
              <td className="px-4 py-3">
                {lead.valor_potencial != null ? (
                  <span className="font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <DollarSign size={12} />
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lead.valor_potencial)}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>

              {/* Temperatura */}
              <td className="px-4 py-3">
                <TemperaturaBadge value={lead.temperatura} />
              </td>

              {/* Responsável */}
              <td className="px-4 py-3">
                {lead.responsavel_nome ? (
                  <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
                    <User size={13} />
                    {lead.responsavel_nome}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>

              {/* Próx. Tarefa */}
              <td className="px-4 py-3">
                {lead.proxima_tarefa ? (
                  <div className="flex items-center gap-1 text-xs">
                    {lead.proxima_tarefa.status === 'concluida' ? (
                      <CheckCircle2 size={13} className="text-green-500" />
                    ) : (
                      <Clock size={13} className="text-amber-500" />
                    )}
                    <span className="text-gray-600 dark:text-gray-300 truncate max-w-[120px]">
                      {lead.proxima_tarefa.titulo}
                    </span>
                  </div>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>

              {/* Entrada */}
              <td className="px-4 py-3 text-gray-400 text-xs">
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function CRMFunilCX() {
  const [filtros, setFiltros] = useState<FiltrosLead>({})
  const [searchInput, setSearchInput] = useState('')
  const [selectedFunilId, setSelectedFunilId] = useState<number | undefined>()
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const [showFunilFormModal, setShowFunilFormModal] = useState(false)
  const [editingFunil, setEditingFunil] = useState<Funil | null>(null)

  const { data: funisCXList = [] } = useFunisCX()
  const { data: usuariosEmpresa = [] } = useUsuariosEmpresa()
  const { funil, colunas, isLoading, isError, moverLead, refetch, loadMore, loadingMore } =
    useKanbanCX(filtros, selectedFunilId)
  const reorderEstagios = useReorderEstagios()

  // Auto-registrar webhook
  const registrarWebhook = useRegistrarWebhook()
  useEffect(() => {
    registrarWebhook.mutate()
  }, [])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setFiltros(prev => {
        const trimmed = searchInput.trim()
        if (trimmed === (prev.search || '')) return prev
        return { ...prev, search: trimmed || undefined }
      })
    }, 500)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { data: stats } = useFunilStats(funil?.id)

  const [showLeadFormModal, setShowLeadFormModal] = useState(false)
  const [showContatosModal, setShowContatosModal] = useState(false)
  const [showDisparoModal, setShowDisparoModal] = useState(false)
  const [showDisparoEmailModal, setShowDisparoEmailModal] = useState(false)
  const [showEstagioModal, setShowEstagioModal] = useState(false)
  const [estagioModalMode, setEstagioModalMode] = useState<'edit' | 'create'>('edit')
  const [selectedEstagioId, setSelectedEstagioId] = useState<number | undefined>()
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [selectedEstagio, setSelectedEstagio] = useState<EstagioFunil | null>(null)

  const [conversaoGanho, setConversaoGanho] = useState<{
    leadId: number
    novoEstagioId: number
    novaOrdem: number
    lead: Lead
  } | null>(null)

  const handleMoverLead = (leadId: number, novoEstagioId: number, novaOrdem: number) => {
    const estagioDestino = colunas.find(c => c.id === novoEstagioId)
    if (estagioDestino?.is_ganho) {
      const lead = colunas.flatMap(c => c.leads).find(l => l.id === leadId)
      if (lead) {
        setConversaoGanho({ leadId, novoEstagioId, novaOrdem, lead })
        return
      }
    }
    moverLead.mutate({ id: leadId, data: { novo_estagio_id: novoEstagioId, nova_ordem: novaOrdem } })
  }

  const handleConfirmarConversao = (data: ConversaoGanhoData) => {
    if (!conversaoGanho) return
    moverLead.mutate({
      id: conversaoGanho.leadId,
      data: {
        novo_estagio_id: conversaoGanho.novoEstagioId,
        nova_ordem: conversaoGanho.novaOrdem,
        numero_parcelas: data.criar_receita ? data.numero_parcelas : undefined,
        valor_venda:    data.criar_receita ? data.valor_venda    : undefined,
        criar_receita:  data.criar_receita,
        descricao:                data.descricao,
        data:                     data.data,
        taxa_servico_percentual:  data.taxa_servico_percentual,
        produto:                  data.produto,
        tipo_pagamento:           data.tipo_pagamento,
      } as any,
    })
    setConversaoGanho(null)
  }

  const handleReorderEstagios = (estagios: { id: number; ordem: number }[]) => {
    if (!funil) return
    reorderEstagios.mutate({ funilId: funil.id, estagios })
  }

  const handleAddClick = (estagioId: number) => {
    setSelectedEstagioId(estagioId)
    setShowLeadFormModal(true)
  }

  const handleCardClick = (lead: Lead) => {
    setSelectedLead(lead)
  }

  const handleEditEstagio = (estagio: EstagioFunil) => {
    setSelectedEstagio(estagio)
    setEstagioModalMode('edit')
    setShowEstagioModal(true)
  }

  const handleAddEstagio = () => {
    setSelectedEstagio(null)
    setEstagioModalMode('create')
    setShowEstagioModal(true)
  }

  const totalLeadsFiltrados = colunas.reduce((acc, col) => acc + (col.leads?.length || 0), 0)

  const totalNaoLidas = colunas.reduce((acc, col) =>
    acc + col.leads.reduce((sum, lead) => sum + (lead.mensagens_nao_lidas || 0), 0), 0)

  const prevNaoLidasRef = useRef(totalNaoLidas)
  useEffect(() => {
    if (totalNaoLidas > prevNaoLidasRef.current && prevNaoLidasRef.current >= 0) {
      const novas = totalNaoLidas - prevNaoLidasRef.current
      toast(`${novas} nova${novas > 1 ? 's' : ''} ${novas > 1 ? 'mensagens' : 'mensagem'} recebida${novas > 1 ? 's' : ''}`, {
        icon: '💬',
        duration: 4000,
      })
    }
    prevNaoLidasRef.current = totalNaoLidas
  }, [totalNaoLidas])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="animate-spin text-primary-500" size={32} />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-500">
        <p>Erro ao carregar o CRM CX</p>
        <button
          onClick={() => refetch()}
          className="mt-2 px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-3 py-3 md:px-6 md:py-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">

          {/* Título */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 md:text-2xl">CRM CX</h1>
              <FunilSelector
                funis={funisCXList}
                selectedFunilId={funil?.id}
                onSelect={(id) => setSelectedFunilId(id)}
                onCreateNew={() => {
                  setEditingFunil(null)
                  setShowFunilFormModal(true)
                }}
                onEdit={(f) => {
                  setEditingFunil(f)
                  setShowFunilFormModal(true)
                }}
              />
              {totalNaoLidas > 0 && (
                <span className="flex items-center gap-1 px-2 py-1 bg-green-500 text-white text-xs font-bold rounded-full animate-pulse">
                  <Bell size={12} />
                  {totalNaoLidas}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 md:text-sm">
              {Object.keys(filtros).length > 0 ? (
                <span className="text-primary-600">({totalLeadsFiltrados} clientes encontrados)</span>
              ) : (
                <span className="text-gray-400">Funil pós-venda / Customer Experience</span>
              )}
            </p>
          </div>

          {/* Barra de ações — scroll horizontal no mobile */}
          <div className="flex items-center gap-1.5 md:gap-2 overflow-x-auto pb-1 md:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

            {/* Stats — só desktop */}
            {stats && (
              <div className="hidden md:flex items-center gap-4 mr-2 text-sm shrink-0">
                <div className="flex items-center gap-1">
                  <BarChart3 size={16} className="text-gray-400" />
                  <span className="text-gray-600 dark:text-gray-300">{stats.leads_ativos} ativos</span>
                </div>
                <div className="text-emerald-600 font-medium">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.valor_total || 0)}
                </div>
              </div>
            )}

            {/* Toggle Kanban / Lista */}
            <div className="shrink-0 flex items-center border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('kanban')}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-sm transition-colors ${
                  viewMode === 'kanban'
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title="Visualização Kanban"
              >
                <LayoutGrid size={15} />
                <span className="hidden sm:inline text-xs">Kanban</span>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-sm transition-colors ${
                  viewMode === 'list'
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title="Visualização Lista"
              >
                <LayoutList size={15} />
                <span className="hidden sm:inline text-xs">Lista</span>
              </button>
            </div>

            {/* Busca */}
            <div className="relative shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar..."
                className="pl-9 pr-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-32 md:w-44 lg:w-52 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
              />
            </div>

            {/* Filtros */}
            <div className="shrink-0" data-tour="cx-filtros">
              <KanbanFilters
                filtros={filtros}
                onChange={setFiltros}
                usuarios={usuariosEmpresa}
                estagios={colunas.map(c => ({ id: c.id, nome: c.nome }))}
                funilId={funil?.id}
              />
            </div>

            {/* Contatos WhatsApp */}
            {funil && (
              <button
                data-tour="cx-contatos"
                onClick={() => setShowContatosModal(true)}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 border border-green-500 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-sm"
                title="Contatos WhatsApp"
              >
                <MessageCircle size={15} />
                <span className="hidden md:inline">WhatsApp</span>
              </button>
            )}

            {/* Disparo WhatsApp */}
            {funil && (
              <button
                data-tour="cx-disparar"
                onClick={() => setShowDisparoModal(true)}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 border border-emerald-600 text-emerald-600 dark:text-emerald-400 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-sm"
                title="Disparo em massa via WhatsApp"
              >
                <Send size={15} />
                <span className="hidden md:inline">Disparar</span>
                {totalLeadsFiltrados > 0 && (
                  <span className="hidden md:inline px-1 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 rounded text-xs font-bold">
                    {totalLeadsFiltrados}
                  </span>
                )}
              </button>
            )}

            {/* Disparo E-mail */}
            {funil && (
              <button
                data-tour="cx-email"
                onClick={() => setShowDisparoEmailModal(true)}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 border border-blue-500 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm"
                title="Disparo em massa por e-mail"
              >
                <Mail size={15} />
                <span className="hidden md:inline">E-mail</span>
              </button>
            )}

            {/* Novo cliente CX */}
            <button
              data-tour="cx-novo"
              onClick={() => {
                setSelectedEstagioId(colunas[0]?.id)
                setShowLeadFormModal(true)
              }}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 md:px-4 md:py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Novo</span>
            </button>

            <button
              onClick={handleAddEstagio}
              className="shrink-0 p-1.5 md:p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              title="Adicionar estágio"
            >
              <Settings size={17} />
            </button>

            <button
              onClick={() => refetch()}
              className="shrink-0 p-1.5 md:p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              title="Atualizar"
            >
              <RefreshCw size={17} />
            </button>

            <TourHelpButton tourId="crm-cx" label="" />
          </div>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'kanban' ? (
        <div className="flex-1 overflow-hidden p-4 bg-gray-50 dark:bg-gray-900" data-tour="cx-kanban">
          <KanbanBoard
            colunas={colunas}
            onMoverLead={handleMoverLead}
            onReorderEstagios={handleReorderEstagios}
            onCardClick={handleCardClick}
            onAddClick={handleAddClick}
            onEditEstagio={handleEditEstagio}
            onLoadMore={loadMore}
            loadingMore={loadingMore}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-6 bg-gray-50 dark:bg-gray-900">
          <CRMListView colunas={colunas} onCardClick={handleCardClick} />
        </div>
      )}

      {/* Modals */}
      {funil && (
        <>
          <LeadFormModal
            isOpen={showLeadFormModal}
            onClose={() => {
              setShowLeadFormModal(false)
              setSelectedEstagioId(undefined)
            }}
            funilId={funil.id}
            estagioId={selectedEstagioId}
          />

          <LeadDetailsModal
            lead={selectedLead}
            estagios={colunas as EstagioFunil[]}
            isOpen={!!selectedLead}
            onClose={() => setSelectedLead(null)}
          />

          <EstagioSettingsModal
            isOpen={showEstagioModal}
            onClose={() => {
              setShowEstagioModal(false)
              setSelectedEstagio(null)
            }}
            estagio={selectedEstagio}
            funilId={funil.id}
            mode={estagioModalMode}
          />

          <ContatosWhatsAppModal
            isOpen={showContatosModal}
            onClose={() => setShowContatosModal(false)}
            funilId={funil.id}
          />

          <DisparoMensagemModal
            isOpen={showDisparoModal}
            onClose={() => setShowDisparoModal(false)}
            funilId={funil.id}
            filtros={filtros}
          />

          <DisparoEmailModal
            isOpen={showDisparoEmailModal}
            onClose={() => setShowDisparoEmailModal(false)}
            funilId={funil.id}
            filtros={filtros}
          />
        </>
      )}

      <FunilFormModal
        isOpen={showFunilFormModal}
        onClose={() => {
          setShowFunilFormModal(false)
          setEditingFunil(null)
        }}
        funil={editingFunil}
        defaultTipo="cx"
      />

      <ConversaoGanhoModal
        isOpen={!!conversaoGanho}
        onClose={() => setConversaoGanho(null)}
        onConfirm={handleConfirmarConversao}
        lead={conversaoGanho?.lead ?? null}
        funilNome={funil?.nome ?? ''}
      />
    </div>
  )
}
