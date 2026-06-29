import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Header } from '@/components/layout'
import { Button, MetricCard, Card, Modal, ModalFooter, Input, Select, Spinner, Badge } from '@/components/ui'
import {
  Plus, Edit, Trash2, UserCheck, UserX, Shield, Sparkles,
  Users, Building2, Settings2
} from 'lucide-react'
import { usuariosApi } from '@/api'
import { agenteApi } from '@/api/agente'
import { assinaturasApi } from '@/api/assinaturas'
import { useAuth } from '@/contexts/AuthContext'
import type { User, CreateUserRequest, UpdateUserRequest, UserPermissoes } from '@/types'

// ─── Tipos de permissão ──────────────────────────────────────────────────────

const DEFAULT_PERMISSOES_PJ: UserPermissoes = {
  dashboard: true, crm: true, clientes: true, receitas: true,
  despesas: true, parcelas: true, sessoes: true, whatsapp: true, agente: true,
}

const PERMISSOES_PJ: Array<{ key: keyof UserPermissoes; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'crm',       label: 'CRM / Funil' },
  { key: 'clientes',  label: 'Clientes' },
  { key: 'receitas',  label: 'Receitas' },
  { key: 'despesas',  label: 'Despesas' },
  { key: 'parcelas',  label: 'Parcelas' },
  { key: 'sessoes',   label: 'Sessões' },
  { key: 'whatsapp',  label: 'WhatsApp' },
  { key: 'agente',    label: 'Agente IA' },
]

const PERMISSOES_LABELS: Record<keyof UserPermissoes, string> = {
  dashboard: 'Dashboard', crm: 'CRM / Funil', clientes: 'Clientes',
  receitas: 'Receitas', despesas: 'Despesas', parcelas: 'Parcelas',
  sessoes: 'Sessões', whatsapp: 'WhatsApp', agente: 'Agente IA',
}

// ─── Status badge de assinatura ──────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; class: string }> = {
  trial:               { label: 'Trial',          class: 'bg-amber-100 text-amber-700' },
  ativa:               { label: 'Ativa',          class: 'bg-green-100 text-green-700' },
  aguardando_pagamento:{ label: 'Ag. Pagamento',  class: 'bg-blue-100 text-blue-700' },
  suspensa:            { label: 'Suspensa',        class: 'bg-orange-100 text-orange-700' },
  cancelada:           { label: 'Cancelada',       class: 'bg-red-100 text-red-700' },
  expirada:            { label: 'Expirada',        class: 'bg-gray-100 text-gray-700' },
}

// ─── Aba: Configurações (Assistente IA) ──────────────────────────────────────

const TabConfiguracoes: React.FC = () => {
  const queryClient = useQueryClient()

  const { data: config, isLoading } = useQuery({
    queryKey: ['chat-financeiro-config'],
    queryFn: () => agenteApi.getConfig(),
  })

  const updateMutation = useMutation({
    mutationFn: (data: any) => agenteApi.updateConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-financeiro-config'] })
      toast.success('Configurações do Assistente IA salvas!')
    },
    onError: () => toast.error('Erro ao salvar configurações'),
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    updateMutation.mutate({
      ativo:              fd.get('ativo') === 'true',
      max_tokens:         parseInt(fd.get('max_tokens') as string) || 2048,
      contexto_mensagens: parseInt(fd.get('contexto_mensagens') as string) || 20,
    })
  }

  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  return (
    <Card>
      <div className="flex items-center gap-2 mb-6">
        <Sparkles className="w-5 h-5 text-primary-600" />
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Assistente Financeiro IA</h3>
        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${config?.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {config?.ativo ? 'Ativo' : 'Inativo'}
        </span>
      </div>

      <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          As credenciais de IA (provedor, chave API e modelo) são gerenciadas em <strong>Agente IA → Configurar Agente</strong> e compartilhadas entre todos os módulos.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Máx. Tokens por Resposta</label>
            <Input type="number" name="max_tokens" defaultValue={config?.max_tokens || 2048} min={512} max={8192} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mensagens de Contexto</label>
            <Input type="number" name="contexto_mensagens" defaultValue={config?.contexto_mensagens || 20} min={5} max={100} />
            <p className="text-xs text-gray-500 mt-1">Quantas mensagens do histórico incluir em cada conversa</p>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
            <Select name="ativo" defaultValue={String(config?.ativo !== false)}>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </Select>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" variant="primary" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <><Spinner size="sm" className="mr-2" />Salvando...</> : 'Salvar Configurações'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

// ─── Aba: Empresas ───────────────────────────────────────────────────────────

const TabEmpresas: React.FC = () => {
  const queryClient = useQueryClient()
  const { data: empresas, isLoading } = useQuery({
    queryKey: ['empresas-assinaturas'],
    queryFn: () => usuariosApi.listEmpresas(),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['empresas-assinaturas'] })
    queryClient.invalidateQueries({ queryKey: ['empresas-list'] })
  }

  const ativarMutation = useMutation({
    mutationFn: (empresaId: number) => assinaturasApi.ativarEmpresaIndefinidamente(empresaId),
    onSuccess: () => { invalidate(); toast.success('Empresa ativada indefinidamente!') },
    onError: () => toast.error('Erro ao ativar empresa'),
  })

  const suspenderMutation = useMutation({
    mutationFn: (empresaId: number) => assinaturasApi.suspenderEmpresa(empresaId, 'Suspenso pelo administrador'),
    onSuccess: () => { invalidate(); toast.success('Empresa suspensa!') },
    onError: () => toast.error('Erro ao suspender empresa'),
  })

  const cancelarMutation = useMutation({
    mutationFn: (empresaId: number) => assinaturasApi.cancelarEmpresa(empresaId, 'Cancelado pelo administrador'),
    onSuccess: () => { invalidate(); toast.success('Empresa cancelada!') },
    onError: () => toast.error('Erro ao cancelar empresa'),
  })

  const anyPending = ativarMutation.isPending || suspenderMutation.isPending || cancelarMutation.isPending

  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
          <thead>
            <tr>
              {['Empresa', 'Assinatura', 'Vencimento', 'Ações'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {(empresas || []).map((e: any) => {
              const statusKey    = e.assinatura_status || 'sem_assinatura'
              const badge        = STATUS_BADGE[statusKey] || { label: statusKey, class: 'bg-gray-100 text-gray-600' }
              const isIndefinite = e.assinatura_status === 'ativa' && !e.plano_ativo_ate
              const isAtiva      = e.assinatura_status === 'ativa'
              const isSuspensa   = e.assinatura_status === 'suspensa'
              const isCancelada  = e.assinatura_status === 'cancelada'
              return (
                <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{e.nome}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.class}`}>{badge.label}</span>
                    {isIndefinite && <span className="ml-1 text-xs text-green-600">∞</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                    {isIndefinite ? 'Sem vencimento'
                     : e.plano_ativo_ate ? new Date(e.plano_ativo_ate).toLocaleDateString('pt-BR')
                     : e.trial_expira_em ? `Trial até ${new Date(e.trial_expira_em).toLocaleDateString('pt-BR')}`
                     : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {!isAtiva && (
                        <button
                          onClick={() => {
                            if (confirm(`Ativar "${e.nome}" indefinidamente sem necessidade de pagamento?`)) {
                              ativarMutation.mutate(e.id)
                            }
                          }}
                          disabled={anyPending}
                          className="text-xs px-2.5 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 font-medium transition-colors disabled:opacity-50"
                        >
                          Ativar ∞
                        </button>
                      )}
                      {isAtiva && !isIndefinite && (
                        <button
                          onClick={() => {
                            if (confirm(`Ativar "${e.nome}" indefinidamente sem necessidade de pagamento?`)) {
                              ativarMutation.mutate(e.id)
                            }
                          }}
                          disabled={anyPending}
                          className="text-xs px-2.5 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 font-medium transition-colors disabled:opacity-50"
                        >
                          ∞
                        </button>
                      )}
                      {!isSuspensa && !isCancelada && (
                        <button
                          onClick={() => {
                            if (confirm(`Suspender a assinatura de "${e.nome}"? O acesso será bloqueado.`)) {
                              suspenderMutation.mutate(e.id)
                            }
                          }}
                          disabled={anyPending}
                          className="text-xs px-2.5 py-1 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 font-medium transition-colors disabled:opacity-50"
                        >
                          Suspender
                        </button>
                      )}
                      {!isCancelada && (
                        <button
                          onClick={() => {
                            if (confirm(`Cancelar a assinatura de "${e.nome}"? O acesso será bloqueado permanentemente.`)) {
                              cancelarMutation.mutate(e.id)
                            }
                          }}
                          disabled={anyPending}
                          className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 font-medium transition-colors disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      )}
                      {isCancelada && (
                        <span className="text-xs text-gray-400">Cancelada</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ─── Aba: Usuários ───────────────────────────────────────────────────────────

const TabUsuarios: React.FC<{ isAdmin: boolean; isMaster: boolean }> = ({ isAdmin, isMaster }) => {
  const queryClient = useQueryClient()

  const [isModalOpen,         setIsModalOpen]         = useState(false)
  const [isPermissoesModalOpen,setIsPermissoesModalOpen]= useState(false)
  const [isDeleteModalOpen,   setIsDeleteModalOpen]   = useState(false)
  const [editingItem,         setEditingItem]         = useState<User | null>(null)
  const [editingPermissoes,   setEditingPermissoes]   = useState<UserPermissoes>(DEFAULT_PERMISSOES_PJ)
  const [permissoesUserId,    setPermissoesUserId]    = useState<string | null>(null)
  const [itemToDelete,        setItemToDelete]        = useState<string | null>(null)
  const [empresaMode,         setEmpresaMode]         = useState<'existing' | 'new'>('existing')
  const [novaEmpresaNome,     setNovaEmpresaNome]     = useState('')

  const { data: users, isLoading } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => usuariosApi.list(),
  })

  const { data: empresas } = useQuery({
    queryKey: ['empresas-list'],
    queryFn: () => usuariosApi.listEmpresas(),
    enabled: isAdmin,
  })

  const createEmpresaMutation = useMutation({
    mutationFn: usuariosApi.createEmpresa,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['empresas-list'] }),
    onError: (error: any) => toast.error(error.response?.data?.message || 'Erro ao criar empresa'),
  })

  const createMutation = useMutation({
    mutationFn: usuariosApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-list'] })
      toast.success('Usuário criado com sucesso!')
      setIsModalOpen(false)
      setEditingItem(null)
      setEmpresaMode('existing')
      setNovaEmpresaNome('')
    },
    onError: (error: any) => toast.error(error.response?.data?.message || 'Erro ao criar usuário'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserRequest }) => usuariosApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-list'] })
      toast.success('Usuário atualizado com sucesso!')
      setIsModalOpen(false)
      setEditingItem(null)
    },
    onError: (error: any) => toast.error(error.response?.data?.message || 'Erro ao atualizar usuário'),
  })

  const updatePermissoesMutation = useMutation({
    mutationFn: ({ id, permissoes }: { id: string; permissoes: UserPermissoes }) =>
      usuariosApi.updatePermissoes(id, permissoes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-list'] })
      toast.success('Permissões atualizadas com sucesso!')
      setIsPermissoesModalOpen(false)
      setPermissoesUserId(null)
    },
    onError: (error: any) => toast.error(error.response?.data?.message || 'Erro ao atualizar permissões'),
  })

  const deleteMutation = useMutation({
    mutationFn: usuariosApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-list'] })
      toast.success('Usuário deletado com sucesso!')
      setIsDeleteModalOpen(false)
      setItemToDelete(null)
    },
    onError: (error: any) => toast.error(error.response?.data?.message || 'Erro ao deletar usuário'),
  })

  const permissoesDisponíveis   = PERMISSOES_PJ

  const canManageUser   = (user: User) => isAdmin || (isMaster && user.tipo_usuario === 'comum')
  const canEditPermissoes = (user: User) => user.tipo_usuario === 'comum' && canManageUser(user)

  const handleOpenModal = () => {
    setEditingItem(null)
    setEditingPermissoes(DEFAULT_PERMISSOES_PJ)
    setEmpresaMode('existing')
    setNovaEmpresaNome('')
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const senha = formData.get('senha') as string

    if (!editingItem && !senha) {
      toast.error('Senha é obrigatória para criar um novo usuário')
      return
    }

    const data: any = {
      nome:  formData.get('nome') as string,
      email: formData.get('email') as string,
      ativo: formData.get('ativo') === 'true',
    }

    if (isAdmin && !editingItem) {
      if (empresaMode === 'new') {
        if (!novaEmpresaNome.trim()) { toast.error('Digite o nome da nova empresa'); return }
        try {
          const novaEmpresa = await createEmpresaMutation.mutateAsync({ nome: novaEmpresaNome.trim() })
          data.empresa_id = novaEmpresa.id
        } catch { return }
      } else {
        const empresaId = formData.get('empresa_id') as string
        if (!empresaId) { toast.error('Selecione uma empresa'); return }
        data.empresa_id = parseInt(empresaId)
      }
      data.tipo_usuario = formData.get('tipo_usuario') as string
    }

    if (senha && senha.trim() !== '') data.senha = senha
    if (isMaster && !editingItem) data.permissoes = editingPermissoes

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data })
    } else {
      createMutation.mutate(data as CreateUserRequest)
    }
  }

  const getTipoBadge = (user: User) => {
    if (user.nivel === 'super_admin')   return <Badge variant="danger">Admin</Badge>
    if (user.tipo_usuario === 'master') return <Badge variant="warning">Master</Badge>
    return <Badge variant="info">Comum</Badge>
  }

  const formatDate = (date?: Date | string) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const totalUsers  = users?.length || 0
  const activeUsers = users?.filter((u: any) => u.ativo !== false).length || 0
  const masterUsers = users?.filter((u: any) => u.tipo_usuario === 'master' || u.nivel === 'super_admin').length || 0

  if (isLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  return (
    <>
      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <MetricCard title="Total de Usuários" value={totalUsers} icon={Users} />
        <MetricCard
          title="Usuários Ativos"
          value={activeUsers}
          icon={UserCheck}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50 dark:bg-emerald-900/20"
          valueColor="text-emerald-600"
        />
        <MetricCard
          title={isAdmin ? 'Masters' : 'Administradores'}
          value={masterUsers}
          icon={Shield}
          iconColor="text-gold-600"
          iconBg="bg-gold-50 dark:bg-gold-900/20"
        />
      </div>

      {/* Tabela */}
      <Card data-tour="admin-lista">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Lista de Usuários</h3>
          <Button data-tour="admin-novo" variant="primary" onClick={handleOpenModal}>
            <Plus className="w-4 h-4 mr-2" />
            {isAdmin ? 'Novo Usuário Master' : 'Novo Usuário'}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr>
                {['Nome', 'Email', ...(isAdmin ? ['Empresa'] : []), 'Tipo', 'Status', 'Criado em', 'Ações'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {users && users.length > 0 ? users.map((user: any) => (
                <tr key={user.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${user.nome?.toLowerCase().includes('chip') ? 'bg-amber-50 dark:bg-amber-900/10' : ''}`}>
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      {user.nome}
                      {user.nome?.toLowerCase().includes('chip') && (
                        <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded font-medium">
                          Chip WhatsApp
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{user.email}</td>
                  {isAdmin && <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{user.empresa_nome || '-'}</td>}
                  <td className="px-6 py-4">{getTipoBadge(user)}</td>
                  <td className="px-6 py-4">
                    <Badge variant={user.ativo !== false ? 'success' : 'default'}>
                      {user.ativo !== false ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{formatDate(user.created_at)}</td>
                  <td className="px-6 py-4 text-sm">
                    {canManageUser(user) && (
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => updateMutation.mutate({ id: user.id, data: { ativo: !user.ativo } })} title={user.ativo !== false ? 'Desativar' : 'Ativar'}>
                          {user.ativo !== false ? <UserX className="w-4 h-4 text-red-600" /> : <UserCheck className="w-4 h-4 text-green-600" />}
                        </Button>
                        {canEditPermissoes(user) && (
                          <Button variant="ghost" size="sm" onClick={() => { setPermissoesUserId(user.id); setEditingPermissoes(user.permissoes || DEFAULT_PERMISSOES_PJ); setIsPermissoesModalOpen(true) }} title="Editar permissões">
                            <Shield className="w-4 h-4 text-blue-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => { setEditingItem(user); setIsModalOpen(true) }}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setItemToDelete(user.id); setIsDeleteModalOpen(true) }}>
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-6 py-8 text-center text-gray-500">Nenhum usuário cadastrado</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal: Criar / Editar usuário */}
      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingItem(null) }} title={editingItem ? 'Editar Usuário' : (isAdmin ? 'Novo Usuário Master' : 'Novo Usuário')} size="lg">
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo *</label>
              <Input type="text" name="nome" defaultValue={editingItem?.nome}
                placeholder={isAdmin && !editingItem ? 'Ex: Carlos Souza (responsável)' : 'Ex: João da Silva'}
                required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <Input type="email" name="email" defaultValue={editingItem?.email} placeholder="usuario@exemplo.com" required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Senha {editingItem ? '(deixe em branco para manter a atual)' : '*'}
              </label>
              <Input type="password" name="senha" placeholder={editingItem ? 'Digite para alterar a senha' : 'Digite uma senha segura'} required={!editingItem} minLength={8} autoComplete="new-password" />
              <p className="mt-1 text-xs text-gray-500">Mínimo de 8 caracteres, com letras e números</p>
            </div>

            {isAdmin && !editingItem && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Empresa *</label>
                  <div className="flex gap-4 mb-3">
                    {(['existing', 'new'] as const).map(mode => (
                      <label key={mode} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="empresaMode" checked={empresaMode === mode} onChange={() => setEmpresaMode(mode)} className="h-4 w-4 text-blue-600" />
                        <span className="text-sm">{mode === 'existing' ? 'Selecionar existente' : 'Criar nova empresa'}</span>
                      </label>
                    ))}
                  </div>
                  {empresaMode === 'existing' ? (
                    <Select name="empresa_id">
                      <option value="">Selecione uma empresa</option>
                      {empresas?.map((empresa: any) => (
                        <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
                      ))}
                    </Select>
                  ) : (
                    <Input type="text" value={novaEmpresaNome} onChange={e => setNovaEmpresaNome(e.target.value)}
                      placeholder="Ex: Consultoria ABC Ltda" />
                  )}
                  <p className="mt-1.5 text-xs text-gray-400">🏢 Gestão empresarial e comercial</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Usuário *</label>
                  <Select name="tipo_usuario" defaultValue="master" required>
                    <option value="master">Master (administra a empresa)</option>
                    <option value="comum">Comum (acesso operacional)</option>
                  </Select>
                </div>
              </>
            )}

            {isMaster && !editingItem && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Permissões do Usuário</label>
                <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-lg">
                  {permissoesDisponíveis.map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={editingPermissoes[key] !== false}
                        onChange={e => setEditingPermissoes(prev => ({ ...prev, [key]: e.target.checked }))}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center pt-2">
              <input type="checkbox" name="ativo" id="ativo" value="true" defaultChecked={editingItem?.ativo !== false}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer" />
              <label htmlFor="ativo" className="ml-2 block text-sm text-gray-900 cursor-pointer">Usuário ativo</label>
            </div>
          </div>

          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); setEditingItem(null) }}>Cancelar</Button>
            <Button type="submit" variant="primary" disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? <><Spinner size="sm" className="mr-2" />Salvando...</> : editingItem ? 'Atualizar' : 'Criar'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Modal: Permissões */}
      <Modal isOpen={isPermissoesModalOpen} onClose={() => { setIsPermissoesModalOpen(false); setPermissoesUserId(null) }} title="Editar Permissões" size="md">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Selecione os módulos que este usuário pode acessar:</p>
          <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-lg">
            {Object.entries(PERMISSOES_LABELS).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editingPermissoes[key as keyof UserPermissoes] !== false}
                  onChange={e => setEditingPermissoes(prev => ({ ...prev, [key]: e.target.checked }))}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                <span className="text-sm text-gray-700">{label}</span>
              </label>
            ))}
          </div>
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={() => { setIsPermissoesModalOpen(false); setPermissoesUserId(null) }}>Cancelar</Button>
          <Button variant="primary" onClick={() => permissoesUserId && updatePermissoesMutation.mutate({ id: permissoesUserId, permissoes: editingPermissoes })} disabled={updatePermissoesMutation.isPending}>
            {updatePermissoesMutation.isPending ? <><Spinner size="sm" className="mr-2" />Salvando...</> : 'Salvar Permissões'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Modal: Confirmar exclusão */}
      <Modal isOpen={isDeleteModalOpen} onClose={() => { setIsDeleteModalOpen(false); setItemToDelete(null) }} title="Confirmar Exclusão" size="sm">
        <p className="text-gray-700 mb-6">Tem certeza que deseja deletar este usuário? Esta ação não pode ser desfeita.</p>
        <ModalFooter>
          <Button variant="outline" onClick={() => { setIsDeleteModalOpen(false); setItemToDelete(null) }}>Cancelar</Button>
          <Button variant="primary" onClick={() => itemToDelete && deleteMutation.mutate(itemToDelete)} disabled={deleteMutation.isPending} className="bg-red-600 hover:bg-red-700">
            {deleteMutation.isPending ? <><Spinner size="sm" className="mr-2" />Deletando...</> : 'Deletar'}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────

type Tab = 'usuarios' | 'empresas' | 'configuracoes'

const TABS: Array<{ id: Tab; label: string; icon: React.ElementType; adminOnly: boolean }> = [
  { id: 'usuarios',      label: 'Usuários',      icon: Users,    adminOnly: false },
  { id: 'empresas',      label: 'Empresas',       icon: Building2, adminOnly: true },
  { id: 'configuracoes', label: 'Configurações',  icon: Settings2, adminOnly: true },
]

export const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('usuarios')

  const isAdmin  = currentUser?.nivel === 'super_admin'
  const isMaster = currentUser?.tipo_usuario === 'master'

  const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin)

  return (
    <div>
      <Header
        title="Administração"
        subtitle={isAdmin ? 'Gerencie usuários, empresas e configurações do sistema' : 'Gerencie os usuários da sua empresa'}
        tourId="admin"
      />

      <div className="p-6">
        {/* Abas */}
        <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
          {visibleTabs.map(tab => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Conteúdo da aba ativa */}
        {activeTab === 'usuarios'      && <TabUsuarios isAdmin={isAdmin} isMaster={isMaster} />}
        {activeTab === 'empresas'      && isAdmin && <TabEmpresas />}
        {activeTab === 'configuracoes' && isAdmin && <TabConfiguracoes />}
      </div>
    </div>
  )
}
