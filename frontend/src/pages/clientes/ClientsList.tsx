import React, { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Header } from '@/components/layout'
import { Button, MetricCard, Card, Spinner, Modal, ModalFooter, Input, Badge, MobileCard, MobileCardHeader, MobileCardRow, MobileCardActions } from '@/components/ui'
import { Plus, Edit, Trash2, Mail, X, Send, Users, Cake } from 'lucide-react'
import { clientsApi } from '@/api'
import api from '@/api/client'
import type { Client, CreateClientRequest } from '@/types'
import EmailEditor from '@/components/crm/EmailEditor'

function applyVars(tpl: string, nome: string, email: string, telefone: string): string {
  const primeiro = nome.split(' ')[0] || ''
  return tpl
    .replace(/\[Nome\]/gi, nome)
    .replace(/\[PrimeiroNome\]/gi, primeiro)
    .replace(/\[Email\]/gi, email)
    .replace(/\[Telefone\]/gi, telefone)
}

export const ClientsList: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Client | null>(null)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<number | null>(null)

  // Email state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailTarget, setEmailTarget] = useState<'selected' | Client>('selected')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailResult, setEmailResult] = useState<{ enviados: number; falhas: number; semEmail: number } | null>(null)

  const queryClient = useQueryClient()

  const { data: clients, isLoading } = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => clientsApi.list()
  })

  const createMutation = useMutation({
    mutationFn: clientsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients-list'] })
      toast.success('Cliente criado com sucesso!')
      setIsModalOpen(false)
      setEditingItem(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao criar cliente')
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => clientsApi.update(String(id), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients-list'] })
      toast.success('Cliente atualizado com sucesso!')
      setIsModalOpen(false)
      setEditingItem(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao atualizar cliente')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => clientsApi.delete(String(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients-list'] })
      toast.success('Cliente deletado com sucesso!')
      setIsDeleteModalOpen(false)
      setItemToDelete(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao deletar cliente')
    }
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data: any = {
      nome: formData.get('nome') as string,
      cpf_cnpj: formData.get('cpf_cnpj') as string,
      email: formData.get('email') as string || undefined,
      telefone: formData.get('telefone') as string || undefined,
      aniversario: formData.get('aniversario') as string || undefined,
      cidade: formData.get('cidade') as string || undefined,
      servico: formData.get('servico') as string || undefined,
      endereco_rua: formData.get('endereco_rua') as string,
      endereco_numero: formData.get('endereco_numero') as string,
      endereco_complemento: formData.get('endereco_complemento') as string || undefined,
      endereco_bairro: formData.get('endereco_bairro') as string || undefined,
      endereco_cidade: formData.get('endereco_cidade') as string,
      endereco_estado: formData.get('endereco_estado') as string,
      endereco_cep: formData.get('endereco_cep') as string,
    }
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data })
    } else {
      createMutation.mutate(data as CreateClientRequest)
    }
  }

  const handleEdit = (client: Client) => {
    setEditingItem(client)
    setIsModalOpen(true)
  }

  const handleDelete = (id: number) => {
    setItemToDelete(id)
    setIsDeleteModalOpen(true)
  }

  const confirmDelete = () => {
    if (itemToDelete) deleteMutation.mutate(itemToDelete)
  }

  const handleOpenModal = () => {
    setEditingItem(null)
    setIsModalOpen(true)
  }

  // Checkbox helpers
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = (clients?.length ?? 0) > 0 && selectedIds.size === (clients?.length ?? 0)
  const someSelected = selectedIds.size > 0 && !allSelected

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(clients?.map(c => c.id) || []))
    }
  }

  // Email helpers
  const openBulkEmailModal = () => {
    setEmailTarget('selected')
    setEmailSubject('')
    setEmailBody('')
    setEmailResult(null)
    setShowEmailModal(true)
  }

  const openIndividualEmailModal = (client: Client) => {
    setEmailTarget(client)
    setEmailSubject('')
    setEmailBody('')
    setEmailResult(null)
    setShowEmailModal(true)
  }

  const insertVarRef = useRef<((variable: string) => void) | null>(null)
  const insertVar = (v: string) => {
    if (insertVarRef.current) {
      insertVarRef.current(v)
    } else {
      setEmailBody(p => p + v)
    }
  }

  const handleSendEmail = async () => {
    if (!emailSubject.trim()) { toast.error('Informe o assunto'); return }
    if (!emailBody.trim()) { toast.error('Informe o corpo do e-mail'); return }

    let clienteIds: number[]
    if (emailTarget === 'selected') {
      clienteIds = Array.from(selectedIds)
    } else {
      clienteIds = [(emailTarget as Client).id]
    }

    setEmailSending(true)
    try {
      const res = await api.post('/clientes/enviar-email', {
        cliente_ids: clienteIds,
        assunto: emailSubject,
        template: emailBody,
      })
      setEmailResult(res.data)
      const { enviados, falhas } = res.data
      if (enviados > 0) toast.success(`${enviados} e-mail${enviados > 1 ? 's' : ''} enviado${enviados > 1 ? 's' : ''}!`)
      if (falhas > 0) toast.error(`${falhas} e-mail${falhas > 1 ? 's' : ''} falhou`)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao enviar e-mails')
    } finally {
      setEmailSending(false)
    }
  }

  const formatCpfCnpj = (value?: string) => {
    if (!value) return '-'
    const cleaned = value.replace(/\D/g, '')
    if (cleaned.length === 11) return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    if (cleaned.length === 14) return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    return value
  }

  // Count selected with email
  const selectedWithEmail = clients?.filter(c => selectedIds.has(c.id) && c.email).length || 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div>
      <Header
        title="Gestão de Clientes"
        subtitle="Gerencie seus clientes"
        tourId="clientes"
        action={
          <Button data-tour="clientes-novo" variant="primary" onClick={handleOpenModal} size="sm" className="sm:size-md">
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Novo Cliente</span>
          </Button>
        }
      />

      <div className="p-4 sm:p-6">
        {/* Métricas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
          <MetricCard
            title="Total de Clientes"
            value={clients?.length || 0}
            icon={Users}
          />
          <MetricCard
            title="Com Aniversário Cadastrado"
            value={clients?.filter(c => c.aniversario).length || 0}
            icon={Cake}
            iconColor="text-gold-600"
            iconBg="bg-gold-50 dark:bg-gold-900/20"
          />
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="text-sm font-medium text-blue-800">
              {selectedIds.size} cliente{selectedIds.size > 1 ? 's' : ''} selecionado{selectedIds.size > 1 ? 's' : ''}
              {selectedWithEmail > 0 && (
                <span className="ml-1 text-blue-600">({selectedWithEmail} com e-mail)</span>
              )}
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={openBulkEmailModal}
              disabled={selectedWithEmail === 0}
              className="bg-blue-600 hover:bg-blue-700 flex items-center gap-1"
            >
              <Mail className="w-4 h-4" />
              Enviar E-mail
            </Button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm"
            >
              <X className="w-4 h-4" />
              Limpar seleção
            </button>
          </div>
        )}

        {/* Versão Desktop - Tabela */}
        <Card className="hidden md:block" data-tour="clientes-lista">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected }}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">CPF/CNPJ</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Telefone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cidade</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {clients?.map((client) => (
                  <tr key={client.id} className={selectedIds.has(client.id) ? 'bg-blue-50' : ''}>
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(client.id)}
                        onChange={() => toggleSelect(client.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{client.codigo}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{client.nome}</div>
                      {client.servico && <div className="text-sm text-gray-500">{client.servico}</div>}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatCpfCnpj(client.cpf_cnpj)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{client.email || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{client.telefone || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{client.endereco_cidade || client.cidade || '-'}</td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex gap-2">
                        {client.email && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openIndividualEmailModal(client)}
                            title={`Enviar e-mail para ${client.email}`}
                          >
                            <Mail className="w-4 h-4 text-blue-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(client)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(client.id)}>
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

        {/* Versão Mobile - Cards */}
        <div className="md:hidden space-y-3">
          {clients?.map((client) => (
            <MobileCard key={client.id} className={selectedIds.has(client.id) ? 'ring-2 ring-blue-400' : ''}>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(client.id)}
                  onChange={() => toggleSelect(client.id)}
                  className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <MobileCardHeader
                    title={client.nome}
                    subtitle={client.servico}
                    badge={<Badge variant="success">#{client.codigo}</Badge>}
                  />
                  <div className="space-y-1 mt-2">
                    <MobileCardRow label="CPF/CNPJ" value={formatCpfCnpj(client.cpf_cnpj)} />
                    <MobileCardRow label="Email" value={client.email || '-'} />
                    <MobileCardRow label="Telefone" value={client.telefone || '-'} />
                    <MobileCardRow label="Cidade" value={client.endereco_cidade || client.cidade || '-'} />
                  </div>
                  <MobileCardActions>
                    {client.email && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openIndividualEmailModal(client)}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        <Mail className="w-4 h-4 mr-1" />
                        E-mail
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(client)}>
                      <Edit className="w-4 h-4 mr-1" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(client.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Deletar
                    </Button>
                  </MobileCardActions>
                </div>
              </div>
            </MobileCard>
          ))}

          {!clients?.length && (
            <Card className="p-8 text-center">
              <p className="text-gray-500">Nenhum cliente cadastrado</p>
            </Card>
          )}
        </div>
      </div>

      {/* Modal de Formulário */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingItem(null) }}
        title={editingItem ? 'Editar Cliente' : 'Novo Cliente'}
        size="lg"
      >
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-2">Dados Básicos</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo *</label>
                  <Input type="text" name="nome" defaultValue={editingItem?.nome} required placeholder="Nome completo do cliente" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CPF ou CNPJ *</label>
                  <Input type="text" name="cpf_cnpj" defaultValue={editingItem?.cpf_cnpj} required placeholder="000.000.000-00 ou 00.000.000/0000-00" maxLength={18} />
                  <p className="text-xs text-gray-500 mt-1">Digite apenas números (11 dígitos para CPF ou 14 para CNPJ)</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <Input type="email" name="email" defaultValue={editingItem?.email} placeholder="email@exemplo.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                    <Input type="text" name="telefone" defaultValue={editingItem?.telefone} placeholder="(00) 00000-0000" maxLength={15} pattern="[\d\s\(\)\-\+]{8,15}" title="Digite um telefone válido com DDD (ex: (11) 99999-9999)" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Aniversário</label>
                    <Input type="date" name="aniversario" defaultValue={editingItem?.aniversario ? new Date(editingItem.aniversario).toISOString().split('T')[0] : ''} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Serviço</label>
                    <Input type="text" name="servico" defaultValue={editingItem?.servico} placeholder="Ex: Consultoria, Mentoria, etc." />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-2">Endereço</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rua/Avenida</label>
                    <Input type="text" name="endereco_rua" defaultValue={editingItem?.endereco_rua} placeholder="Nome da rua ou avenida" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                    <Input type="text" name="endereco_numero" defaultValue={editingItem?.endereco_numero} placeholder="123" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Complemento</label>
                    <Input type="text" name="endereco_complemento" defaultValue={editingItem?.endereco_complemento} placeholder="Apto, Sala, etc. (opcional)" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
                    <Input type="text" name="endereco_bairro" defaultValue={editingItem?.endereco_bairro} placeholder="Nome do bairro (opcional)" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
                    <Input type="text" name="endereco_cep" defaultValue={editingItem?.endereco_cep} placeholder="00000-000" maxLength={9} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                    <Input type="text" name="endereco_cidade" defaultValue={editingItem?.endereco_cidade || editingItem?.cidade} placeholder="Nome da cidade" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Estado (UF)</label>
                    <Input type="text" name="endereco_estado" defaultValue={editingItem?.endereco_estado} placeholder="SP" maxLength={2} style={{ textTransform: 'uppercase' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); setEditingItem(null) }}>Cancelar</Button>
            <Button type="submit" variant="primary" disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? (
                <><Spinner size="sm" className="mr-2" />Salvando...</>
              ) : (editingItem ? 'Atualizar' : 'Criar')}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Modal de Confirmação de Delete */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setItemToDelete(null) }}
        title="Confirmar Exclusão"
        size="sm"
      >
        <p className="text-gray-700 mb-6">Tem certeza que deseja deletar este cliente? Esta ação não pode ser desfeita.</p>
        <ModalFooter>
          <Button variant="outline" onClick={() => { setIsDeleteModalOpen(false); setItemToDelete(null) }}>Cancelar</Button>
          <Button variant="primary" onClick={confirmDelete} disabled={deleteMutation.isPending} className="bg-red-600 hover:bg-red-700">
            {deleteMutation.isPending ? <><Spinner size="sm" className="mr-2" />Deletando...</> : 'Deletar'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Modal de E-mail */}
      <Modal
        isOpen={showEmailModal}
        onClose={() => { if (!emailSending) { setShowEmailModal(false); setEmailResult(null) } }}
        title={emailTarget === 'selected' ? `Enviar E-mail para ${selectedIds.size} cliente${selectedIds.size > 1 ? 's' : ''}` : `Enviar E-mail para ${(emailTarget as Client).nome}`}
        size="lg"
      >
        {emailResult ? (
          <div className="py-4">
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-3xl font-bold text-green-600">{emailResult.enviados}</p>
                <p className="text-sm text-green-700 mt-1">Enviados</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-3xl font-bold text-red-600">{emailResult.falhas}</p>
                <p className="text-sm text-red-700 mt-1">Falhas</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-3xl font-bold text-gray-600">{emailResult.semEmail}</p>
                <p className="text-sm text-gray-700 mt-1">Sem e-mail</p>
              </div>
            </div>
            <ModalFooter>
              <Button variant="primary" onClick={() => { setShowEmailModal(false); setEmailResult(null) }}>Fechar</Button>
            </ModalFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              {emailTarget === 'selected' && (
                <p className="text-sm text-gray-500">
                  {selectedWithEmail} de {selectedIds.size} cliente{selectedIds.size > 1 ? 's' : ''} possui{selectedIds.size === 1 ? '' : 'm'} e-mail cadastrado.
                </p>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assunto *</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={e => setEmailSubject(e.target.value)}
                  placeholder="Assunto do e-mail"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">Mensagem *</label>
                  <div className="flex gap-1">
                    {['[Nome]', '[PrimeiroNome]', '[Email]', '[Telefone]'].map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertVar(v)}
                        className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-mono"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <EmailEditor
                  value={emailBody}
                  onChange={setEmailBody}
                  placeholder="Escreva sua mensagem aqui..."
                  onInsertVariable={(fn) => { insertVarRef.current = fn }}
                  minHeight={220}
                />
              </div>

              {emailBody && emailTarget !== 'selected' && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                  <p className="text-xs font-medium text-gray-500 mb-1">Prévia</p>
                  <p className="font-medium text-gray-700">{applyVars(emailSubject, (emailTarget as Client).nome, (emailTarget as Client).email || '', (emailTarget as Client).telefone || '')}</p>
                  <div
                    className="prose prose-sm max-w-none mt-1 text-gray-600"
                    dangerouslySetInnerHTML={{
                      __html: applyVars(emailBody, (emailTarget as Client).nome, (emailTarget as Client).email || '', (emailTarget as Client).telefone || '')
                    }}
                  />
                </div>
              )}
            </div>

            <ModalFooter>
              <Button variant="outline" onClick={() => setShowEmailModal(false)} disabled={emailSending}>Cancelar</Button>
              <Button
                variant="primary"
                onClick={handleSendEmail}
                disabled={emailSending || !emailSubject.trim() || !emailBody.trim()}
                className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
              >
                {emailSending ? (
                  <><Spinner size="sm" />Enviando...</>
                ) : (
                  <><Send className="w-4 h-4" />Enviar E-mail</>
                )}
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>
    </div>
  )
}
