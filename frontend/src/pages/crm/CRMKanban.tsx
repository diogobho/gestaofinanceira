import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageCircle, Plus, RefreshCw, BarChart3, Upload, Settings, Search, Send, Mail, Bell, LayoutGrid, LayoutList, Workflow } from 'lucide-react'
import toast from 'react-hot-toast'
import { useKanban, useFunilStats, useRegistrarWebhook, useFunisAquisicao, useUsuariosEmpresa, useReorderEstagios, useLead } from '@/hooks/useCRM'
import { useAbaNaUrl, useFunilNaUrl } from '@/hooks/useEstadoNaUrl'
import OrdenarCards, { ORDENS_CARDS } from '@/components/crm/OrdenarCards'
import KanbanBoard from '@/components/crm/KanbanBoard'
import KanbanFilters from '@/components/crm/KanbanFilters'
import CRMListView from '@/components/crm/CRMListView'
import FluxoAutomacaoView from '@/components/crm/FluxoAutomacaoView'
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
import DeleteFunilModal from '@/components/crm/DeleteFunilModal'
import ConversaoGanhoModal, { type ConversaoGanhoData } from '@/components/crm/ConversaoGanhoModal'
import type { Lead, EstagioFunil, Funil } from '@/types/crm'
import type { FiltrosLead } from '@/api/crm'
import { BotaoDoPlano } from '@/components/plano/BotaoDoPlano'

export default function CRMKanban() {
  const [filtros, setFiltros] = useState<FiltrosLead>({})
  const [searchInput, setSearchInput] = useState('')
  // Funil e visão moram na URL: o F5 reabre no mesmo lugar.
  const [viewMode, setViewMode] = useAbaNaUrl('visao', 'kanban', ['kanban', 'list', 'fluxo'] as const)
  // Ordem dos cards (#59): na URL como o funil, e fora de `filtros` — limpar filtro não a desfaz.
  const [ordem, setOrdem] = useAbaNaUrl('ordem', 'manual', ORDENS_CARDS)
  const filtrosComOrdem = useMemo(() => (ordem === 'manual' ? filtros : { ...filtros, ordenar: ordem }), [filtros, ordem])
  const [showFunilFormModal, setShowFunilFormModal] = useState(false)
  const [editingFunil, setEditingFunil] = useState<Funil | null>(null)
  const [deletingFunil, setDeletingFunil] = useState<Funil | null>(null)

  const { data: funisCarregados } = useFunisAquisicao()
  const funisList = funisCarregados ?? []
  const [selectedFunilId, setSelectedFunilId] = useFunilNaUrl('aquisicao', funisCarregados)
  const { data: usuariosEmpresa = [] } = useUsuariosEmpresa()
  const { funil, colunas, isLoading, isError, moverLead, refetch, loadMore, loadingMore } = useKanban(filtrosComOrdem, selectedFunilId)
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

  /**
   * `/crm?lead=123` abre o card direto.
   *
   * É o destino dos links do dashboard de integrações: uma linha de tabela que
   * leva ao quadro genérico não leva a lugar nenhum. O funil também troca junto
   * quando o lead é de outro — sem isso o modal receberia os estágios do funil
   * errado e a lista de "mover para" viria de outro processo.
   */
  const [searchParams, setSearchParams] = useSearchParams()
  const leadDaUrl = Number(searchParams.get('lead')) || undefined
  const { data: leadCarregado } = useLead(leadDaUrl)

  useEffect(() => {
    if (!leadDaUrl || !leadCarregado) return
    if (leadCarregado.funil_id && leadCarregado.funil_id !== selectedFunilId) {
      setSelectedFunilId(leadCarregado.funil_id)
    }
    setSelectedLead((atual) => (atual?.id === leadCarregado.id ? atual : leadCarregado))
  }, [leadDaUrl, leadCarregado, selectedFunilId])

  const fecharLead = () => {
    setSelectedLead(null)
    if (searchParams.has('lead')) {
      // Funcional: a URL também carrega funil/visão/aba, e partir de uma cópia velha os apagaria.
      setSearchParams((atual) => {
        const proximo = new URLSearchParams(atual)
        proximo.delete('lead')
        return proximo
      }, { replace: true })
    }
  }

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
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-3 py-2.5 md:px-6 md:py-3">
        {/*
          Título e barra de ações só dividem a mesma linha a partir de `xl`.
          Em `md` elas não cabiam: o bloco do título era espremido a 68px, o
          seletor de funil transbordava dele e ia parar por cima do botão
          "Kanban". Em `lg` cabia sem colidir, mas a barra virava quatro linhas.
          Empilhado, ela usa a largura inteira e fecha em duas.
          O título não encolhe (`shrink-0`) e quem fica com a sobra é a barra,
          que quebra em linhas por conta própria.
        */}
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">

          {/* Título */}
          <div className="min-w-0 xl:shrink-0">
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
                onDelete={(f) => setDeletingFunil(f)}
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

          {/*
            Barra de ações. Ela QUEBRA em várias linhas em vez de rolar na
            horizontal: com `overflow-x-auto` + barra de rolagem escondida por
            CSS, tudo o que não coubesse ficava inalcançável no desktop — a
            medição em 1600px dava 476px de conteúdo fora da tela, engolindo
            Disparar, E-mail, Novo Lead, configurar estágio, atualizar e o botão
            do guia. Roda do mouse não rola eixo horizontal, então não havia
            gesto que trouxesse aquilo de volta.

            No celular a quebra também é melhor que o arrasto: o arrasto lateral
            competia com o gesto que abre a sidebar.
          */}
          <div className="flex flex-wrap items-center justify-start gap-1.5 md:gap-3 xl:min-w-0 xl:flex-1 xl:justify-end">

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
                className="pl-9 pr-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-36 md:w-44 lg:w-52"
              />
            </div>

            {/* Toggle Kanban / Lista / Fluxo */}
            <div data-tour="crm-visoes" className="shrink-0 flex items-center border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('kanban')}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-sm transition-colors ${
                  viewMode === 'kanban' ? 'bg-primary-500 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title="Visualização Kanban"
              >
                <LayoutGrid size={15} />
                <span className="hidden sm:inline text-xs">Kanban</span>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-sm transition-colors ${
                  viewMode === 'list' ? 'bg-primary-500 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title="Visualização Lista"
              >
                <LayoutList size={15} />
                <span className="hidden sm:inline text-xs">Lista</span>
              </button>
              <button
                onClick={() => setViewMode('fluxo')}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-sm transition-colors ${
                  viewMode === 'fluxo' ? 'bg-primary-500 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title="Visualização Fluxo de automações"
              >
                <Workflow size={15} />
                <span className="hidden sm:inline text-xs">Fluxo</span>
              </button>
            </div>

            {/* Ordem dos cards */}
            <div className="shrink-0">
              <OrdenarCards valor={ordem} onChange={setOrdem} />
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
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 md:px-3 md:py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm"
            >
              <MessageCircle size={16} />
              <span className="hidden md:inline">Contatos</span>
            </button>

            <button
              data-tour="crm-importar"
              onClick={() => setShowImportModal(true)}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 md:px-3 md:py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm"
              title="Importar leads de CSV/Excel"
            >
              <Upload size={16} />
              <span className="hidden md:inline">Importar</span>
            </button>

            {/* Disparo em massa por WhatsApp é do Enterprise (API Oficial da Meta):
                num número comum ele é o que mais causa bloqueio. O botão fica no
                lugar, apagado, explicando — quem não pode precisa saber por quê. */}
            <BotaoDoPlano capacidade="disparo_whatsapp">
              <button
                data-tour="crm-disparar"
                onClick={() => setShowDisparoModal(true)}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 md:px-3 md:py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm"
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
            </BotaoDoPlano>

            <button
              data-tour="crm-email"
              onClick={() => setShowDisparoEmailModal(true)}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 md:px-3 md:py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
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
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 md:px-3 md:py-1.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 text-sm"
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

      {/* Conteúdo: Kanban / Lista / Fluxo */}
      {viewMode === 'kanban' ? (
        <div className="flex-1 overflow-hidden p-3 bg-gray-50 dark:bg-gray-900" data-tour="crm-kanban">
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
      ) : viewMode === 'fluxo' ? (
        <div className="flex-1 overflow-auto p-6 bg-gray-50 dark:bg-gray-900">
          <FluxoAutomacaoView variante="aquisicao" funilId={funil?.id} />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-6 bg-gray-50 dark:bg-gray-900">
          <CRMListView colunas={colunas} onCardClick={handleCardClick} ordem={ordem} />
        </div>
      )}

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
            onClose={fecharLead}
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

      <DeleteFunilModal
        isOpen={!!deletingFunil}
        onClose={() => setDeletingFunil(null)}
        funil={deletingFunil}
        onDeleted={(id) => {
          // Se o funil excluído era o que estava aberto, volta para o padrão.
          if (funil?.id === id) setSelectedFunilId(undefined)
        }}
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
