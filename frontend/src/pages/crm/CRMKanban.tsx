import { useState, useEffect, useRef } from 'react'
import { MessageCircle, Plus, RefreshCw, BarChart3, Upload, Settings, Search, Send, Mail, Bell } from 'lucide-react'
import toast from 'react-hot-toast'
import { useKanban, useFunilStats, useRegistrarWebhook, useFunisAquisicao, useUsuariosEmpresa, useReorderEstagios } from '@/hooks/useCRM'
import KanbanBoard from '@/components/crm/KanbanBoard'
import KanbanFilters from '@/components/crm/KanbanFilters'
import ContatosWhatsAppModal from '@/components/crm/ContatosWhatsAppModal'
import LeadDetailsModal from '@/components/crm/LeadDetailsModal'
import LeadFormModal from '@/components/crm/LeadFormModal'
import ImportLeadsModal from '@/components/crm/ImportLeadsModal'
import DisparoMensagemModal from '@/components/crm/DisparoMensagemModal'
import DisparoEmailModal from '@/components/crm/DisparoEmailModal'
import EstagioSettingsModal from '@/components/crm/EstagioSettingsModal'
import FunilSelector from '@/components/crm/FunilSelector'
import { TourHelpButton } from '@/components/tour/TourHelpButton'
import FunilFormModal from '@/components/crm/FunilFormModal'
import ConversaoGanhoModal, { type ConversaoGanhoData } from '@/components/crm/ConversaoGanhoModal'
import type { Lead, EstagioFunil, Funil } from '@/types/crm'
import type { FiltrosLead } from '@/api/crm'

export default function CRMKanban() {
  const [filtros, setFiltros] = useState<FiltrosLead>({})
  const [searchInput, setSearchInput] = useState('')
  const [selectedFunilId, setSelectedFunilId] = useState<number | undefined>()
  const [showFunilFormModal, setShowFunilFormModal] = useState(false)
  const [editingFunil, setEditingFunil] = useState<Funil | null>(null)

  const { data: funisList = [] } = useFunisAquisicao()
  const { data: usuariosEmpresa = [] } = useUsuariosEmpresa()
  const { funil, colunas, isLoading, isError, moverLead, refetch, loadMore, loadingMore } = useKanban(filtros, selectedFunilId)
  const reorderEstagios = useReorderEstagios()

  // Auto-registrar webhook ao montar o CRM
  const registrarWebhook = useRegistrarWebhook()
  useEffect(() => {
    registrarWebhook.mutate()
  }, [])

  // Debounce search input
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

  const [showContatosModal, setShowContatosModal] = useState(false)
  const [showLeadFormModal, setShowLeadFormModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showDisparoModal, setShowDisparoModal] = useState(false)
  const [showDisparoEmailModal, setShowDisparoEmailModal] = useState(false)
  const [showEstagioModal, setShowEstagioModal] = useState(false)
  const [estagioModalMode, setEstagioModalMode] = useState<'edit' | 'create'>('edit')
  const [selectedEstagioId, setSelectedEstagioId] = useState<number | undefined>()
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [selectedEstagio, setSelectedEstagio] = useState<EstagioFunil | null>(null)

  // Estado para modal de conversão ganho
  const [conversaoGanho, setConversaoGanho] = useState<{
    leadId: number
    novoEstagioId: number
    novaOrdem: number
    lead: Lead
  } | null>(null)

  const handleMoverLead = (leadId: number, novoEstagioId: number, novaOrdem: number) => {
    // Verificar se o estágio destino é "ganho"
    const estagioDestino = colunas.find(c => c.id === novoEstagioId)
    if (estagioDestino?.is_ganho) {
      const lead = colunas.flatMap(c => c.leads).find(l => l.id === leadId)
      if (lead) {
        setConversaoGanho({ leadId, novoEstagioId, novaOrdem, lead })
        return
      }
    }
    moverLead.mutate({
      id: leadId,
      data: { novo_estagio_id: novoEstagioId, nova_ordem: novaOrdem },
    })
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

  // Contar leads filtrados
  const totalLeadsFiltrados = colunas.reduce((acc, col) => acc + (col.leads?.length || 0), 0)

  // Total de mensagens nao lidas
  const totalNaoLidas = colunas.reduce((acc, col) =>
    acc + col.leads.reduce((sum, lead) => sum + (lead.mensagens_nao_lidas || 0), 0), 0)

  // Notificar quando novas mensagens chegam
  const prevNaoLidasRef = useRef(totalNaoLidas)
  useEffect(() => {
    if (totalNaoLidas > prevNaoLidasRef.current && prevNaoLidasRef.current >= 0) {
      const novas = totalNaoLidas - prevNaoLidasRef.current
      toast(`${novas} nova${novas > 1 ? 's' : ''} mensagem${novas > 1 ? 'ns' : ''} recebida${novas > 1 ? 's' : ''}`, {
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
        <p>Erro ao carregar o CRM</p>
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
              <h1 className="text-xl font-bold text-gray-800 md:text-2xl">CRM</h1>
              <FunilSelector
                funis={funisList}
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
              {Object.keys(filtros).length > 0 && (
                <span className="text-primary-600">
                  ({totalLeadsFiltrados} leads encontrados)
                </span>
              )}
            </p>
          </div>

          {/* Barra de ações — scroll horizontal no mobile */}
          <div className="flex items-center gap-1.5 md:gap-3 overflow-x-auto pb-1 md:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

            {/* Stats — só desktop */}
            {stats && (
              <div className="hidden md:flex items-center gap-4 mr-2 text-sm shrink-0">
                <div className="flex items-center gap-1">
                  <BarChart3 size={16} className="text-gray-400" />
                  <span className="text-gray-600">{stats.leads_ativos} leads ativos</span>
                </div>
                <div className="text-green-600 font-medium">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.valor_total || 0)}
                </div>
              </div>
            )}

            {/* Busca */}
            <div className="relative shrink-0" data-tour="crm-busca">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar..."
                className="pl-9 pr-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-36 md:w-56 lg:w-64"
              />
            </div>

            {/* Filtros */}
            <div className="shrink-0" data-tour="crm-filtros">
              <KanbanFilters
                filtros={filtros}
                onChange={setFiltros}
                usuarios={usuariosEmpresa}
                estagios={colunas.map(c => ({ id: c.id, nome: c.nome }))}
                funilId={funil?.id}
              />
            </div>

            <button
              data-tour="crm-contatos"
              onClick={() => setShowContatosModal(true)}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 md:px-4 md:py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm"
            >
              <MessageCircle size={16} />
              <span className="hidden md:inline">Contatos</span>
            </button>

            <button
              data-tour="crm-importar"
              onClick={() => setShowImportModal(true)}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 md:px-4 md:py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm"
              title="Importar leads de CSV/Excel"
            >
              <Upload size={16} />
              <span className="hidden md:inline">Importar</span>
            </button>

            <button
              data-tour="crm-disparar"
              onClick={() => setShowDisparoModal(true)}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 md:px-4 md:py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm"
              title="Disparo em massa via WhatsApp"
            >
              <Send size={16} />
              <span className="hidden md:inline">Disparar</span>
              {totalLeadsFiltrados > 0 && (
                <span className="hidden md:inline px-1.5 py-0.5 bg-white/20 rounded text-xs font-bold">
                  {totalLeadsFiltrados}
                </span>
              )}
            </button>

            <button
              data-tour="crm-email"
              onClick={() => setShowDisparoEmailModal(true)}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 md:px-4 md:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              title="Disparo em massa via E-mail"
            >
              <Mail size={16} />
              <span className="hidden md:inline">E-mail</span>
            </button>

            <button
              data-tour="crm-novo-lead"
              onClick={() => {
                setSelectedEstagioId(colunas[0]?.id)
                setShowLeadFormModal(true)
              }}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 md:px-4 md:py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Novo Lead</span>
            </button>

            <button
              data-tour="crm-config"
              onClick={handleAddEstagio}
              className="shrink-0 p-1.5 md:p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
              title="Adicionar estágio"
            >
              <Settings size={17} />
            </button>

            <button
              onClick={() => refetch()}
              className="shrink-0 p-1.5 md:p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
              title="Atualizar"
            >
              <RefreshCw size={17} />
            </button>

            <TourHelpButton tourId="crm" label="" />
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-hidden p-4 bg-gray-50 dark:bg-gray-900" data-tour="crm-kanban">
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

      {/* Modals */}
      {funil && (
        <>
          <ContatosWhatsAppModal
            isOpen={showContatosModal}
            onClose={() => setShowContatosModal(false)}
            funilId={funil.id}
          />

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

          <ImportLeadsModal
            isOpen={showImportModal}
            onClose={() => setShowImportModal(false)}
            defaultFunilId={funil.id}
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
        </>
      )}

      <FunilFormModal
        isOpen={showFunilFormModal}
        onClose={() => {
          setShowFunilFormModal(false)
          setEditingFunil(null)
        }}
        funil={editingFunil}
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
