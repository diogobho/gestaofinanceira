import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Header } from '@/components/layout'
import { Button, MetricCard, Card, Modal, ModalFooter, Input, Select, Spinner, Badge, Textarea, Calendar, MobileCard, MobileCardHeader, MobileCardRow, MobileCardActions } from '@/components/ui'
import { Plus, Edit, Trash2, Video, MapPin, Calendar as CalendarIcon, List } from 'lucide-react'
import { sessionsApi, clientsApi } from '@/api'
import { useAuth } from '@/contexts/AuthContext'
import type { Session, CreateSessionRequest } from '@/types'

export const SessionsList: React.FC = () => {
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Session | null>(null)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { user } = useAuth()

  // Fetch sessions list
  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions-list'],
    queryFn: () => sessionsApi.list()
  })

  // Fetch clients for dropdown
  const { data: clients } = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => clientsApi.list()
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: sessionsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions-list'] })
      toast.success('Sessão criada com sucesso!')
      setIsModalOpen(false)
      setEditingItem(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao criar sessão')
    }
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => sessionsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions-list'] })
      toast.success('Sessão atualizada com sucesso!')
      setIsModalOpen(false)
      setEditingItem(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao atualizar sessão')
    }
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: sessionsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions-list'] })
      toast.success('Sessão deletada com sucesso!')
      setIsDeleteModalOpen(false)
      setItemToDelete(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao deletar sessão')
    }
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (createMutation.isPending || updateMutation.isPending) return
    const formData = new FormData(e.currentTarget)
    const data: any = {
      cliente_id: formData.get('cliente_id') as string,
      mentor_id: user?.id || '',
      tipo_sessao: formData.get('tipo_sessao') as string,
      data: formData.get('data') as string,
      horario: formData.get('horario') as string,
      duracao_minutos: parseInt(formData.get('duracao_minutos') as string),
      modalidade: formData.get('modalidade') as string,
      titulo: formData.get('titulo') as string,
      descricao: formData.get('descricao') as string,
      plataforma: formData.get('plataforma') as string || undefined,
      link_sessao: formData.get('link_sessao') as string || undefined,
      notas_internas: formData.get('notas_internas') as string || undefined,
    }

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data })
    } else {
      createMutation.mutate(data as CreateSessionRequest)
    }
  }

  const handleEdit = (session: Session) => {
    setEditingItem(session)
    setIsModalOpen(true)
  }

  const handleDelete = (id: string) => {
    setItemToDelete(id)
    setIsDeleteModalOpen(true)
  }

  const confirmDelete = () => {
    if (itemToDelete) {
      deleteMutation.mutate(itemToDelete)
    }
  }

  const handleOpenModal = () => {
    setEditingItem(null)
    setIsModalOpen(true)
  }

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('pt-BR')
  }

  const formatDateTime = (date: Date | string, horario: string) => {
    return `${formatDate(date)} às ${horario.substring(0, 5)}`
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner size="lg" />
      </div>
    )
  }

  const totalSessoes = sessions?.length || 0
  const sessoesOnline = sessions?.filter(s => s.modalidade?.toUpperCase() === 'ONLINE').length || 0
  const sessoesPresenciais = sessions?.filter(s => s.modalidade?.toUpperCase() === 'PRESENCIAL').length || 0

  // Prepare calendar events
  const calendarEvents = sessions?.map(session => ({
    id: session.id,
    title: `${session.titulo} - ${clients?.find(c => String(c.id) === String(session.cliente_id))?.nome || 'Cliente'}`,
    date: session.data,
    time: session.horario.substring(0, 5),
    color: session.tipo_sessao === 'MENTORIA' ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-primary-500 text-white hover:bg-primary-600',
    onClick: () => handleEdit(session)
  })) || []

  const handleDateClick = (_date: Date) => {
    setIsModalOpen(true)
    // You could pre-fill the date in the form here
  }

  const handleEventClick = (event: any) => {
    const session = sessions?.find(s => s.id === event.id)
    if (session) {
      handleEdit(session)
    }
  }

  return (
    <div>
      <Header
        title="Gestão de Sessões"
        subtitle="Agende e gerencie suas sessões de mentoria e coaching"
        tourId="sessoes"
        action={
          <div className="flex gap-2">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1" data-tour="sessoes-view">
              <Button
                variant={viewMode === 'calendar' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('calendar')}
              >
                <CalendarIcon className="w-4 h-4 mr-1" />
                Calendário
              </Button>
              <Button
                variant={viewMode === 'list' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List className="w-4 h-4 mr-1" />
                Lista
              </Button>
            </div>
            <Button data-tour="sessoes-nova" variant="primary" onClick={handleOpenModal}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Sessão
            </Button>
          </div>
        }
      />

      <div className="p-4 sm:p-6">
        {/* Métricas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <MetricCard
            title="Total de Sessões"
            value={totalSessoes}
            icon={CalendarIcon}
          />
          <MetricCard
            title="Sessões Online"
            value={sessoesOnline}
            icon={Video}
            iconColor="text-emerald-600"
            iconBg="bg-emerald-50 dark:bg-emerald-900/20"
            valueColor="text-emerald-600"
          />
          <MetricCard
            title="Sessões Presenciais"
            value={sessoesPresenciais}
            icon={MapPin}
            iconColor="text-gold-600"
            iconBg="bg-gold-50 dark:bg-gold-900/20"
          />
        </div>

        {/* Calendar or List View */}
        {viewMode === 'calendar' ? (
          <Calendar
            events={calendarEvents}
            onDateClick={handleDateClick}
            onEventClick={handleEventClick}
          />
        ) : (
          <>
          {/* Versão Mobile - Cards */}
          <div className="md:hidden space-y-3">
            {sessions && sessions.length > 0 ? sessions.map((session) => (
              <MobileCard key={session.id}>
                <MobileCardHeader
                  title={session.titulo}
                  subtitle={formatDateTime(session.data, session.horario)}
                  badge={<Badge variant="default">{session.tipo_sessao}</Badge>}
                />
                <MobileCardRow
                  label="Cliente"
                  value={clients?.find(c => String(c.id) === String(session.cliente_id))?.nome || '-'}
                />
                <MobileCardRow
                  label="Modalidade"
                  value={
                    <div className="flex items-center gap-1">
                      {session.modalidade === 'ONLINE' ? (
                        <><Video className="w-3 h-3 text-blue-600" /><span>Online</span></>
                      ) : (
                        <><MapPin className="w-3 h-3 text-green-600" /><span>Presencial</span></>
                      )}
                    </div>
                  }
                />
                <MobileCardRow label="Duração" value={`${session.duracao_minutos} min`} />
                <MobileCardActions>
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(session)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(session.id)}>
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </MobileCardActions>
              </MobileCard>
            )) : (
              <Card>
                <p className="text-center text-gray-500 py-6">Nenhuma sessão cadastrada</p>
              </Card>
            )}
          </div>

          {/* Versão Desktop - Tabela */}
          <Card className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data/Hora</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Título</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Modalidade</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duração</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sessions?.map((session) => (
                  <tr key={session.id}>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {formatDateTime(session.data, session.horario)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{session.titulo}</div>
                      {session.descricao && (
                        <div className="text-sm text-gray-500 truncate max-w-xs">{session.descricao}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {clients?.find(c => String(c.id) === String(session.cliente_id))?.nome || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="default">
                        {session.tipo_sessao}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        {session.modalidade === 'ONLINE' ? (
                          <>
                            <Video className="w-4 h-4 text-blue-600" />
                            <span className="text-sm text-gray-900">Online</span>
                          </>
                        ) : (
                          <>
                            <MapPin className="w-4 h-4 text-green-600" />
                            <span className="text-sm text-gray-900">Presencial</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {session.duracao_minutos} min
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(session)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(session.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
          </>
        )}
      </div>

      {/* Modal de Formulário */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setEditingItem(null)
        }}
        title={editingItem ? 'Editar Sessão' : 'Nova Sessão'}
        size="lg"
      >
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cliente *
              </label>
              <Select name="cliente_id" defaultValue={editingItem?.cliente_id} required>
                <option value="">Selecione...</option>
                {clients?.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.nome}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Sessão *
                </label>
                <Select name="tipo_sessao" defaultValue={editingItem?.tipo_sessao} required>
                  <option value="">Selecione...</option>
                  <option value="MENTORIA">MENTORIA</option>
                  <option value="COACHING">COACHING</option>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Modalidade *
                </label>
                <Select name="modalidade" defaultValue={editingItem?.modalidade} required>
                  <option value="">Selecione...</option>
                  <option value="ONLINE">ONLINE</option>
                  <option value="PRESENCIAL">PRESENCIAL</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data *
                </label>
                <Input
                  type="date"
                  name="data"
                  defaultValue={editingItem ? new Date(editingItem.data).toISOString().split('T')[0] : ''}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Horário *
                </label>
                <Input
                  type="time"
                  name="horario"
                  defaultValue={editingItem?.horario ? editingItem.horario.substring(0, 5) : ''}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duração (minutos) *
              </label>
              <Input
                type="number"
                name="duracao_minutos"
                defaultValue={editingItem?.duracao_minutos || 60}
                min="15"
                step="15"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Título *
              </label>
              <Input
                type="text"
                name="titulo"
                defaultValue={editingItem?.titulo}
                placeholder="Ex: Sessão de Planejamento Estratégico"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descrição *
              </label>
              <Textarea
                name="descricao"
                defaultValue={editingItem?.descricao}
                rows={3}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Plataforma
                </label>
                <Input
                  type="text"
                  name="plataforma"
                  defaultValue={editingItem?.plataforma}
                  placeholder="Ex: Zoom, Teams, Google Meet"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Link da Sessão
                </label>
                <Input
                  type="url"
                  name="link_sessao"
                  defaultValue={editingItem?.link_sessao}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notas Internas
              </label>
              <Textarea
                name="notas_internas"
                defaultValue={editingItem?.notas_internas}
                rows={2}
                placeholder="Anotações privadas sobre a sessão"
              />
            </div>
          </div>

          <ModalFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsModalOpen(false)
                setEditingItem(null)
              }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Salvando...
                </>
              ) : (
                editingItem ? 'Atualizar' : 'Criar'
              )}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Modal de Confirmação de Delete */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false)
          setItemToDelete(null)
        }}
        title="Confirmar Exclusão"
        size="sm"
      >
        <p className="text-gray-700 mb-6">
          Tem certeza que deseja deletar esta sessão? Esta ação não pode ser desfeita.
        </p>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setIsDeleteModalOpen(false)
              setItemToDelete(null)
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={confirmDelete}
            disabled={deleteMutation.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {deleteMutation.isPending ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Deletando...
              </>
            ) : (
              'Deletar'
            )}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
