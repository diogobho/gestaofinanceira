import { useState } from 'react'
import { X, RefreshCw, Search, UserPlus, MessageCircle, Clock, Users, ChevronLeft, CheckSquare, Square, Plus } from 'lucide-react'
import {
  useContatosNaoConvertidos,
  useSincronizarContatos,
  useCreateLeadFromWhatsApp,
  useGruposWhatsApp,
  useParticipantesGrupo,
  useImportarParticipantes,
  useFunis,
  useEstagios,
  useUsuariosEmpresa,
} from '@/hooks/useCRM'
import Avatar from '@/components/ui/Avatar'
import type { ContatoWhatsApp } from '@/types/crm'

interface ContatosWhatsAppModalProps {
  isOpen: boolean
  onClose: () => void
  funilId: number
}

type Tab = 'contatos' | 'grupos'

export default function ContatosWhatsAppModal({ isOpen, onClose, funilId }: ContatosWhatsAppModalProps) {
  const [tab, setTab] = useState<Tab>('contatos')
  const [search, setSearch] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(new Set())
  const [gruposEnabled, setGruposEnabled] = useState(false)

  // Contatos tab
  const { data: contatos, isLoading: loadingContatos, refetch } = useContatosNaoConvertidos(funilId)
  const sincronizar = useSincronizarContatos()
  const criarLead = useCreateLeadFromWhatsApp()

  // Grupos tab
  const { data: grupos, isLoading: loadingGrupos, error: gruposError, refetch: refetchGrupos } = useGruposWhatsApp(gruposEnabled)
  const { data: participantesData, isLoading: loadingParticipantes } = useParticipantesGrupo(selectedGroupId)
  const importar = useImportarParticipantes()

  const { data: funis } = useFunis()
  const [selectedFunilId, setSelectedFunilId] = useState<number>(funilId)
  const [selectedEstagioId, setSelectedEstagioId] = useState<number | null>(null)
  const { data: estagios } = useEstagios(selectedFunilId)
  const { data: usuarios } = useUsuariosEmpresa()
  const [selectedResponsavelId, setSelectedResponsavelId] = useState<number | null>(null)
  const [manualPhone, setManualPhone] = useState('')

  if (!isOpen) return null

  // ---- Contatos tab logic ----
  const contatosFiltrados = (contatos || []).filter((c) =>
    (c.nome || c.nome_push || c.numero).toLowerCase().includes(search.toLowerCase())
  )

  const handleSincronizar = async () => {
    await sincronizar.mutateAsync()
    refetch()
  }

  const handleAdicionarAoFunil = async (contato: ContatoWhatsApp) => {
    await criarLead.mutateAsync({ contatoId: contato.id, funilId })
  }

  // ---- Grupos tab logic ----
  const handleTabChange = (newTab: Tab) => {
    setTab(newTab)
    setSearch('')
    if (newTab === 'grupos' && !gruposEnabled) {
      setGruposEnabled(true)
    }
  }

  const handleSelectGroup = (groupId: string) => {
    setSelectedGroupId(groupId)
    setSelectedParticipants(new Set())
    setSearch('')
  }

  const handleBackToGroups = () => {
    setSelectedGroupId(null)
    setSelectedParticipants(new Set())
    setSearch('')
  }

  const toggleParticipant = (participantId: string) => {
    setSelectedParticipants((prev) => {
      const next = new Set(prev)
      if (next.has(participantId)) {
        next.delete(participantId)
      } else {
        next.add(participantId)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    const all = participantesData?.participants || []
    const apiIds = new Set(all.map((p) => p.id))
    const manualIds = Array.from(selectedParticipants).filter((id) => !apiIds.has(id))
    if (selectedParticipants.size === all.length + manualIds.length && all.every((p) => selectedParticipants.has(p.id))) {
      setSelectedParticipants(new Set(manualIds))
    } else {
      setSelectedParticipants(new Set([...all.map((p) => p.id), ...manualIds]))
    }
  }

  const handleImportar = async () => {
    if (!selectedGroupId || selectedParticipants.size === 0) return

    // Mapear id → number real (participantes @lid têm Meta ID como id, telefone em number)
    const numberMap = new Map<string, string>()
    for (const p of (participantesData?.participants || [])) {
      if (p.number) numberMap.set(p.id, p.number)
    }

    const participantes = Array.from(selectedParticipants).map(id => ({
      id,
      number: numberMap.get(id) || id.replace(/@.*$/, ''),
    }))

    await importar.mutateAsync({
      groupId: selectedGroupId,
      funilId: selectedFunilId,
      participantes,
      estagioId: selectedEstagioId ?? undefined,
      responsavelId: selectedResponsavelId ?? undefined,
    })
    setSelectedParticipants(new Set())
  }

  const handleAddManualPhone = () => {
    const digits = manualPhone.replace(/\D/g, '')
    if (!digits) return
    const normalized = digits.startsWith('55') ? digits : `55${digits}`
    const participantId = `${normalized}@c.us`
    setSelectedParticipants((prev) => {
      const next = new Set(prev)
      next.add(participantId)
      return next
    })
    setManualPhone('')
  }

  const gruposFiltrados = (grupos || []).filter((g) =>
    g.subject.toLowerCase().includes(search.toLowerCase())
  )

  const participantesFiltrados = (participantesData?.participants || []).filter((p) =>
    p.number.includes(search) || p.id.includes(search)
  )

  const selectedGroup = (grupos || []).find((g) => g.id === selectedGroupId)

  // ---- Formatters ----
  const formatarNumero = (numero: string) =>
    numero.replace(/^55/, '').replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')

  const formatarData = (data: string | undefined) => {
    if (!data) return ''
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(data))
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="text-green-500" size={24} />
            <h2 className="text-lg font-semibold text-gray-800">Contatos WhatsApp</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b flex">
          <button
            onClick={() => handleTabChange('contatos')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'contatos'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <MessageCircle size={16} />
            Contatos
          </button>
          <button
            onClick={() => handleTabChange('grupos')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'grupos'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users size={16} />
            Grupos
          </button>
        </div>

        {/* ============ CONTATOS TAB ============ */}
        {tab === 'contatos' && (
          <>
            <div className="p-4 border-b flex items-center gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Buscar contatos..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <button
                onClick={handleSincronizar}
                disabled={sincronizar.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
              >
                <RefreshCw size={18} className={sincronizar.isPending ? 'animate-spin' : ''} />
                {sincronizar.isPending ? 'Sincronizando...' : 'Sincronizar'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loadingContatos ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="animate-spin text-gray-400" size={24} />
                </div>
              ) : contatosFiltrados.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {search ? (
                    <p>Nenhum contato encontrado para "{search}"</p>
                  ) : (
                    <>
                      <MessageCircle size={48} className="mx-auto mb-2 text-gray-300" />
                      <p>Nenhum contato disponivel</p>
                      <p className="text-sm">Clique em "Sincronizar" para importar contatos do WhatsApp</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {contatosFiltrados.map((contato) => (
                    <div
                      key={contato.id}
                      className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50"
                    >
                      <Avatar
                        name={contato.nome || contato.nome_push || contato.numero}
                        src={contato.foto_url}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 truncate">
                          {contato.nome || contato.nome_push || formatarNumero(contato.numero)}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{formatarNumero(contato.numero)}</span>
                          {contato.ultima_mensagem_at && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Clock size={12} />
                                {formatarData(contato.ultima_mensagem_at)}
                              </span>
                            </>
                          )}
                        </div>
                        {contato.ultima_mensagem && (
                          <p className="text-xs text-gray-400 truncate mt-0.5">{contato.ultima_mensagem}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleAdicionarAoFunil(contato)}
                        disabled={criarLead.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 bg-primary-500 text-white text-sm rounded hover:bg-primary-600 disabled:opacity-50"
                      >
                        <UserPlus size={16} />
                        Adicionar ao Funil
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-gray-50 text-sm text-gray-500">
              {contatos && contatos.length > 0 && (
                <p>{contatos.length} contato{contatos.length !== 1 ? 's' : ''} disponivel{contatos.length !== 1 ? 'is' : ''}</p>
              )}
            </div>
          </>
        )}

        {/* ============ GRUPOS TAB ============ */}
        {tab === 'grupos' && (
          <>
            {/* Sub-header: back button when viewing participants */}
            {selectedGroupId ? (
              <div className="p-3 border-b flex items-center gap-3 bg-primary-50">
                <button
                  onClick={handleBackToGroups}
                  className="flex items-center gap-1 text-primary-600 hover:text-primary-800 text-sm font-medium"
                >
                  <ChevronLeft size={18} />
                  Grupos
                </button>
                <span className="text-gray-400">/</span>
                <span className="text-sm font-semibold text-gray-700 truncate">{selectedGroup?.subject}</span>
                <span className="ml-auto text-xs text-gray-500">{participantesData?.participants.length ?? '...'} participantes</span>
              </div>
            ) : null}

            {/* Toolbar */}
            <div className="p-4 border-b flex items-center gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder={selectedGroupId ? 'Buscar participantes...' : 'Buscar grupos...'}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              {!selectedGroupId && (
                <button
                  onClick={() => { setGruposEnabled(true); refetchGrupos() }}
                  disabled={loadingGrupos}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                >
                  <RefreshCw size={18} className={loadingGrupos ? 'animate-spin' : ''} />
                  {loadingGrupos ? 'Carregando...' : 'Atualizar'}
                </button>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* GROUP LIST */}
              {!selectedGroupId && (
                <>
                  {loadingGrupos ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <RefreshCw className="animate-spin text-gray-400" size={28} />
                      <p className="text-sm text-gray-500">Carregando grupos do WhatsApp...</p>
                    </div>
                  ) : gruposError ? (
                    <div className="text-center py-8 text-gray-500">
                      <Users size={48} className="mx-auto mb-2 text-gray-300" />
                      <p className="font-medium text-red-500">Erro ao carregar grupos</p>
                      <p className="text-sm mt-1">Verifique se o WhatsApp está conectado e tente novamente.</p>
                    </div>
                  ) : gruposFiltrados.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Users size={48} className="mx-auto mb-2 text-gray-300" />
                      {search ? (
                        <p>Nenhum grupo encontrado para "{search}"</p>
                      ) : (
                        <>
                          <p className="font-medium">Nenhum grupo encontrado</p>
                          <p className="text-sm mt-1">Clique em "Atualizar" para buscar grupos do WhatsApp</p>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {gruposFiltrados.map((grupo) => (
                        <button
                          key={grupo.id}
                          onClick={() => handleSelectGroup(grupo.id)}
                          className="w-full flex items-center gap-3 p-3 border rounded-lg hover:bg-primary-50 hover:border-primary-200 text-left transition-colors"
                        >
                          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                            <Users size={20} className="text-primary-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-800 truncate">{grupo.subject}</p>
                            <p className="text-xs text-gray-500">{grupo.participantCount} participante{grupo.participantCount !== 1 ? 's' : ''}</p>
                          </div>
                          <ChevronLeft size={16} className="text-gray-400 rotate-180 flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* PARTICIPANT LIST */}
              {selectedGroupId && (
                <>
                  {loadingParticipantes ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <RefreshCw className="animate-spin text-gray-400" size={28} />
                      <p className="text-sm text-gray-500">Carregando participantes...</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Manually added entries */}
                      {(() => {
                        const apiIds = new Set((participantesData?.participants || []).map((p) => p.id))
                        const manualEntries = Array.from(selectedParticipants).filter((id) => !apiIds.has(id))
                        return manualEntries.map((id) => {
                          const number = id.replace(/@.*/, '')
                          const display = formatarNumero(number)
                          return (
                            <div
                              key={id}
                              onClick={() => toggleParticipant(id)}
                              className="flex items-center gap-3 p-3 border border-primary-400 bg-primary-50 rounded-lg cursor-pointer transition-colors"
                            >
                              <CheckSquare size={20} className="text-primary-600 flex-shrink-0" />
                              <Avatar name={display} size="md" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-800">{display}</p>
                                <span className="text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded">Adicionado manualmente</span>
                              </div>
                            </div>
                          )
                        })
                      })()}

                      {/* Select all from API */}
                      {participantesFiltrados.length > 0 && (
                        <button
                          onClick={toggleSelectAll}
                          className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-800 mb-1"
                        >
                          {(participantesData?.participants || []).every((p) => selectedParticipants.has(p.id)) && (participantesData?.participants.length ?? 0) > 0 ? (
                            <CheckSquare size={18} />
                          ) : (
                            <Square size={18} />
                          )}
                          {(participantesData?.participants || []).every((p) => selectedParticipants.has(p.id)) && (participantesData?.participants.length ?? 0) > 0
                            ? 'Desmarcar todos'
                            : 'Selecionar todos'}
                        </button>
                      )}

                      {participantesFiltrados.length === 0 && (() => {
                        const apiIds = new Set((participantesData?.participants || []).map((p) => p.id))
                        const manualCount = Array.from(selectedParticipants).filter((id) => !apiIds.has(id)).length
                        return manualCount === 0
                      })() && (
                        <div className="text-center py-8 text-gray-500">
                          <p>{search ? `Nenhum participante encontrado para "${search}"` : 'Nenhum participante encontrado'}</p>
                        </div>
                      )}

                      {participantesFiltrados.map((p) => {
                        const displayNumber = p.number
                          ? formatarNumero(p.number)
                          : p.id.replace(/@.*/, '')
                        return (
                          <div
                            key={p.id}
                            onClick={() => toggleParticipant(p.id)}
                            className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                              selectedParticipants.has(p.id)
                                ? 'border-primary-400 bg-primary-50'
                                : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex-shrink-0">
                              {selectedParticipants.has(p.id) ? (
                                <CheckSquare size={20} className="text-primary-600" />
                              ) : (
                                <Square size={20} className="text-gray-300" />
                              )}
                            </div>
                            <Avatar name={displayNumber} size="md" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-800">{displayNumber}</p>
                              {p.isAdmin && (
                                <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">Admin</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer for groups tab */}
            {selectedGroupId && (
              <div className="p-3 border-t bg-gray-50 space-y-2">
                {/* Manual phone input */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Adicionar número manualmente (ex: 11989131275)"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddManualPhone()}
                    className="flex-1 text-sm border rounded px-2 py-1.5 focus:ring-2 focus:ring-primary-500"
                  />
                  <button
                    onClick={handleAddManualPhone}
                    disabled={!manualPhone.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 disabled:opacity-40"
                  >
                    <Plus size={14} />
                    Adicionar
                  </button>
                </div>

                {/* Funil + Estágio + Responsável + Import button */}
                <div className="flex items-center gap-2 flex-wrap">
                  {funis && funis.length > 1 && (
                    <select
                      value={selectedFunilId}
                      onChange={(e) => {
                        setSelectedFunilId(Number(e.target.value))
                        setSelectedEstagioId(null)
                      }}
                      className="text-sm border rounded px-2 py-1.5 focus:ring-2 focus:ring-primary-500"
                    >
                      {funis.map((f) => (
                        <option key={f.id} value={f.id}>{f.nome}</option>
                      ))}
                    </select>
                  )}
                  {estagios && estagios.filter(e => !e.is_ganho && !e.is_perdido).length > 0 && (
                    <select
                      value={selectedEstagioId ?? ''}
                      onChange={(e) => setSelectedEstagioId(e.target.value ? Number(e.target.value) : null)}
                      className="text-sm border rounded px-2 py-1.5 focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">Estágio de entrada (padrão)</option>
                      {estagios.filter(e => !e.is_ganho && !e.is_perdido).map((e) => (
                        <option key={e.id} value={e.id}>{e.nome}</option>
                      ))}
                    </select>
                  )}
                  {usuarios && usuarios.length > 0 && (
                    <select
                      value={selectedResponsavelId ?? ''}
                      onChange={(e) => setSelectedResponsavelId(e.target.value ? Number(e.target.value) : null)}
                      className="text-sm border rounded px-2 py-1.5 focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">Responsável (padrão)</option>
                      {usuarios.map((u: any) => (
                        <option key={u.id} value={u.id}>{u.nome}</option>
                      ))}
                    </select>
                  )}
                  <span className="text-sm text-gray-500 flex-1">
                    {selectedParticipants.size} selecionado{selectedParticipants.size !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={handleImportar}
                    disabled={selectedParticipants.size === 0 || importar.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    <UserPlus size={16} />
                    {importar.isPending ? 'Importando...' : 'Importar como Leads'}
                  </button>
                </div>
              </div>
            )}

            {!selectedGroupId && (
              <div className="p-4 border-t bg-gray-50 text-sm text-gray-500">
                {grupos && grupos.length > 0 && (
                  <p>{grupos.length} grupo{grupos.length !== 1 ? 's' : ''} encontrado{grupos.length !== 1 ? 's' : ''}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
