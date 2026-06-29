import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Header } from '@/components/layout'
import { Button, MetricCard, Card, Modal, ModalFooter, Input, Select, Spinner, Badge, MobileCard, MobileCardHeader, MobileCardRow, MobileCardActions } from '@/components/ui'
import { Plus, Edit, Trash2, CreditCard, Calendar, Filter, TrendingUp, DollarSign, CheckCircle, Clock } from 'lucide-react'
import { revenuesApi, categoriasReceitasApi, clientsApi } from '@/api'
import type { Revenue, CreateRevenueRequest, CreateCategoriaRequest } from '@/types'

export const RevenuesList: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Revenue | null>(null)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [tipoPagamento, setTipoPagamento] = useState<'a_vista' | 'parcelado'>('a_vista')
  const queryClient = useQueryClient()

  // Estados para filtros
  const [filters, setFilters] = useState({
    data_ini: '',
    data_fim: '',
    cliente_id: '',
    fonte: '',
    tipo_pagamento: '',
    valor_min: '',
    valor_max: ''
  })

  // Fetch revenues list com filtros
  const { data: revenues, isLoading } = useQuery({
    queryKey: ['revenues-list', filters],
    queryFn: () => revenuesApi.list({
      data_ini: filters.data_ini || undefined,
      data_fim: filters.data_fim || undefined,
      cliente_id: filters.cliente_id || undefined,
      fonte: filters.fonte || undefined,
      tipo_pagamento: filters.tipo_pagamento || undefined,
      valor_min: filters.valor_min ? parseFloat(filters.valor_min) : undefined,
      valor_max: filters.valor_max ? parseFloat(filters.valor_max) : undefined
    })
  })

  // Fetch categorias receitas
  const { data: categorias } = useQuery({
    queryKey: ['categorias-receitas'],
    queryFn: () => categoriasReceitasApi.list()
  })

  // Fetch clients for dropdown
  const { data: clients } = useQuery({
    queryKey: ['clients-list'],
    queryFn: () => clientsApi.list()
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: revenuesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['revenues-list'] })
      queryClient.invalidateQueries({ queryKey: ['revenues-dashboard'] })
      toast.success('Receita criada com sucesso!')
      setIsModalOpen(false)
      setEditingItem(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao criar receita')
    }
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => revenuesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['revenues-list'] })
      queryClient.invalidateQueries({ queryKey: ['revenues-dashboard'] })
      toast.success('Receita atualizada com sucesso!')
      setIsModalOpen(false)
      setEditingItem(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao atualizar receita')
    }
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: revenuesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['revenues-list'] })
      queryClient.invalidateQueries({ queryKey: ['revenues-dashboard'] })
      toast.success('Receita deletada com sucesso!')
      setIsDeleteModalOpen(false)
      setItemToDelete(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao deletar receita')
    }
  })

  // Create categoria mutation
  const createCategoriaMutation = useMutation({
    mutationFn: categoriasReceitasApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias-receitas'] })
      toast.success('Produto criado com sucesso!')
      setIsCategoryModalOpen(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao criar produto')
    }
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    const valorString = formData.get('valor') as string
    const valor = valorString ? parseFloat(valorString.replace(',', '.')) : 0

    if (isNaN(valor) || valor <= 0) {
      toast.error('Por favor, insira um valor válido')
      return
    }

    const tipo_pagamento = formData.get('tipo_pagamento') as 'a_vista' | 'parcelado'
    const numero_parcelas = formData.get('numero_parcelas') as string

    const cliente_id = formData.get('cliente_id') as string

    // Taxa do Serviço
    const taxaString = formData.get('taxa_servico_percentual') as string
    const taxa_servico_percentual = taxaString ? parseFloat(taxaString.replace(',', '.')) : undefined

    // Validar taxa se fornecida
    if (taxa_servico_percentual !== undefined && (isNaN(taxa_servico_percentual) || taxa_servico_percentual < 0 || taxa_servico_percentual > 100)) {
      toast.error('Taxa do serviço deve estar entre 0 e 100')
      return
    }

    const data: CreateRevenueRequest = {
      descricao: formData.get('descricao') as string,
      valor: valor,
      data: formData.get('data') as string,
      fonte: formData.get('fonte') as string || 'Outros',
      cliente_id: cliente_id || undefined,
      // New fields
      tipo_pagamento: tipo_pagamento || 'a_vista',
      status: 'pendente', // Status agora é controlado APENAS pelas parcelas
      numero_parcelas: tipo_pagamento === 'parcelado' && numero_parcelas ? parseInt(numero_parcelas) : undefined,
      taxa_servico_percentual: taxa_servico_percentual,
      // Backward compatibility
      recebido: false, // Sempre false - controle via parcelas
      parcelado: tipo_pagamento === 'parcelado',
    }

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const handleCategorySubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    const data: CreateCategoriaRequest = {
      nome: formData.get('nome') as string,
      ativo: true
    }

    createCategoriaMutation.mutate(data)
  }

  const handleEdit = (revenue: Revenue) => {
    setEditingItem(revenue)
    setTipoPagamento(revenue.tipo_pagamento || 'a_vista')
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
    setTipoPagamento('a_vista')
    setIsModalOpen(true)
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('pt-BR')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner size="lg" />
      </div>
    )
  }

  const totalReceitas = revenues?.reduce((acc, rev) => acc + Number(rev.valor || 0), 0) || 0
  const receitasRecebidas = revenues?.filter(r => r.recebido).length || 0
  const receitasPendentes = revenues?.filter(r => !r.recebido).length || 0
  const valorRecebido = revenues?.filter(r => r.recebido).reduce((acc, r) => acc + Number(r.valor || 0), 0) || 0

  return (
    <div>
      <Header
        title="Gestão de Receitas"
        subtitle="Gerencie todas as receitas do negócio"
        tourId="receitas"
        action={
          <Button data-tour="receitas-nova" variant="primary" onClick={handleOpenModal}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Receita
          </Button>
        }
      />

      <div className="p-4 sm:p-6">
        {/* Métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
          <MetricCard
            title="Total de Receitas"
            value={revenues?.length || 0}
            icon={TrendingUp}
          />
          <MetricCard
            title="Valor Total"
            value={formatCurrency(totalReceitas)}
            icon={DollarSign}
            iconColor="text-gold-600"
            iconBg="bg-gold-50 dark:bg-gold-900/20"
          />
          <MetricCard
            title="Recebidas"
            value={receitasRecebidas}
            icon={CheckCircle}
            iconColor="text-emerald-600"
            iconBg="bg-emerald-50 dark:bg-emerald-900/20"
            valueColor="text-emerald-600"
            subtitle={formatCurrency(valorRecebido)}
          />
          <MetricCard
            title="Pendentes"
            value={receitasPendentes}
            icon={Clock}
            iconColor="text-amber-600"
            iconBg="bg-amber-50 dark:bg-amber-900/20"
            valueColor="text-amber-600"
            subtitle={formatCurrency(totalReceitas - valorRecebido)}
          />
        </div>

        {/* Alerta: receitas À Vista sem confirmação de recebimento */}
        {(() => {
          const avistasSemPagamento = revenues?.filter(r => r.tipo_pagamento === 'a_vista' && !r.recebido) || []
          if (avistasSemPagamento.length === 0) return null
          return (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm font-medium text-amber-800">
                ⚠️ {avistasSemPagamento.length} receita{avistasSemPagamento.length > 1 ? 's' : ''} "À Vista" sem confirmação de recebimento.
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Receitas à vista não criam parcelas automaticamente. Acesse a tela de Parcelas e marque o status como <strong>PAGO</strong> quando o pagamento for recebido.
              </p>
            </div>
          )
        })()}

        {/* Filtros */}
        <Card className="mb-6" data-tour="receitas-filtros">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filtros</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Data Inicial */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data Inicial
              </label>
              <Input
                type="date"
                value={filters.data_ini}
                onChange={(e) => setFilters({ ...filters, data_ini: e.target.value })}
              />
            </div>

            {/* Data Final */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data Final
              </label>
              <Input
                type="date"
                value={filters.data_fim}
                onChange={(e) => setFilters({ ...filters, data_fim: e.target.value })}
              />
            </div>

            {/* Cliente */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cliente
              </label>
              <Select
                value={filters.cliente_id}
                onChange={(e) => setFilters({ ...filters, cliente_id: e.target.value })}
              >
                <option value="">Todos os clientes</option>
                {clients?.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.nome}
                  </option>
                ))}
              </Select>
            </div>

            {/* Produto (Fonte) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Produto/Serviço
              </label>
              <Select
                value={filters.fonte}
                onChange={(e) => setFilters({ ...filters, fonte: e.target.value })}
              >
                <option value="">Todos os produtos</option>
                {categorias?.map((cat) => (
                  <option key={cat.id} value={cat.nome}>
                    {cat.nome}
                  </option>
                ))}
              </Select>
            </div>

            {/* Tipo de Pagamento */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de Pagamento
              </label>
              <Select
                value={filters.tipo_pagamento}
                onChange={(e) => setFilters({ ...filters, tipo_pagamento: e.target.value })}
              >
                <option value="">Todos os tipos</option>
                <option value="a_vista">À Vista</option>
                <option value="parcelado">Parcelado</option>
              </Select>
            </div>

            {/* Valor Mínimo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valor Mínimo
              </label>
              <Input
                type="number"
                step="0.01"
                placeholder="R$ 0,00"
                value={filters.valor_min}
                onChange={(e) => setFilters({ ...filters, valor_min: e.target.value })}
              />
            </div>

            {/* Valor Máximo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valor Máximo
              </label>
              <Input
                type="number"
                step="0.01"
                placeholder="R$ 0,00"
                value={filters.valor_max}
                onChange={(e) => setFilters({ ...filters, valor_max: e.target.value })}
              />
            </div>

            {/* Botão Limpar Filtros */}
            <div className="flex items-end">
              <Button
                variant="secondary"
                onClick={() => setFilters({
                  data_ini: '',
                  data_fim: '',
                  cliente_id: '',
                  fonte: '',
                  tipo_pagamento: '',
                  valor_min: '',
                  valor_max: ''
                })}
                className="w-full"
              >
                Limpar Filtros
              </Button>
            </div>
          </div>
        </Card>

        {/* Versão Mobile - Cards */}
        <div className="md:hidden space-y-3">
          {revenues && revenues.length > 0 ? (
            revenues.map((revenue) => (
              <MobileCard key={revenue.id}>
                <MobileCardHeader
                  title={revenue.descricao}
                  subtitle={formatDate(revenue.data)}
                  badge={
                    <Badge variant={revenue.tipo_pagamento === 'parcelado' ? 'info' : 'success'}>
                      {revenue.tipo_pagamento === 'parcelado' ? 'Parcelado' : 'À Vista'}
                    </Badge>
                  }
                />
                {revenue.cliente_nome && (
                  <MobileCardRow label="Cliente" value={revenue.cliente_nome} />
                )}
                <MobileCardRow label="Produto" value={revenue.fonte} />
                <MobileCardRow
                  label="Valor"
                  value={<span className="font-semibold text-green-600">{formatCurrency(Number(revenue.valor || 0))}</span>}
                />
                <MobileCardActions>
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(revenue)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(revenue.id)}>
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </MobileCardActions>
              </MobileCard>
            ))
          ) : (
            <Card>
              <p className="text-center text-gray-500 py-6">Nenhuma receita cadastrada</p>
            </Card>
          )}
        </div>

        {/* Versão Desktop - Tabela */}
        <Card className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Produto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo Pgto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {revenues && revenues.length > 0 ? (
                  revenues.map((revenue) => (
                    <tr key={revenue.id}>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {formatDate(revenue.data)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{revenue.descricao}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {revenue.cliente_nome ? (
                          <div>
                            <div className="font-medium">{revenue.cliente_nome}</div>
                            {revenue.cliente_email && (
                              <div className="text-xs text-gray-400">{revenue.cliente_email}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {revenue.fonte}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {formatCurrency(Number(revenue.valor || 0))}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={revenue.tipo_pagamento === 'parcelado' ? 'info' : 'success'}>
                          <div className="flex items-center gap-1">
                            {revenue.tipo_pagamento === 'parcelado' ? (
                              <>
                                <Calendar className="w-3 h-3" />
                                Parcelado
                              </>
                            ) : (
                              <>
                                <CreditCard className="w-3 h-3" />
                                À Vista
                              </>
                            )}
                          </div>
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(revenue)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(revenue.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      Nenhuma receita cadastrada
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Modal de Formulário */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setEditingItem(null)
        }}
        title={editingItem ? 'Editar Receita' : 'Nova Receita'}
        size="lg"
      >
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descrição *
              </label>
              <Input
                type="text"
                name="descricao"
                defaultValue={editingItem?.descricao}
                placeholder="Ex: Venda de mentoria para João"
                required
              />
            </div>

            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
              <label className="block text-sm font-semibold text-blue-900 mb-1">
                Cliente (Origem da Receita) ⭐ Recomendado
              </label>
              <Select
                name="cliente_id"
                defaultValue={editingItem?.cliente_id || ''}
                className="w-full border-blue-300 focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="">⚠️ Nenhum cliente (não recomendado)</option>
                {clients
                  ?.filter((client, index, self) =>
                    index === self.findIndex((c) => c.id === client.id)
                  )
                  .map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.nome} {client.email ? `- ${client.email}` : ''}
                    </option>
                  ))
                }
              </Select>
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-2">
                <p className="text-xs font-medium text-amber-800">
                  💡 <strong>Por que vincular um cliente?</strong>
                </p>
                <ul className="text-xs text-amber-700 mt-1 ml-4 list-disc space-y-0.5">
                  <li>Permite enviar e-mails de cobrança automáticos</li>
                  <li>Facilita rastreamento de receitas por cliente</li>
                  <li>Melhora a organização do seu fluxo financeiro</li>
                </ul>
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
                <p className="text-xs text-blue-600 mt-1">
                  ℹ️ Esta é a data de vencimento da receita
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Valor *
                </label>
                <Input
                  type="number"
                  name="valor"
                  step="0.01"
                  min="0.01"
                  defaultValue={editingItem?.valor}
                  placeholder="0.00"
                  required
                />
                <p className="text-xs text-blue-600 mt-1">
                  ℹ️ Informe o valor total do serviço vendido (deve ser maior que zero)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Taxa do Serviço (%)
                </label>
                <Input
                  type="number"
                  name="taxa_servico_percentual"
                  step="0.01"
                  min="0"
                  max="100"
                  defaultValue={editingItem?.taxa_servico_percentual}
                  placeholder="0.00"
                />
                <p className="text-xs text-gray-600 mt-1">
                  💡 A taxa será descontada do valor e gerará uma despesa automática (opcional)
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Produto *
              </label>
              <div className="flex gap-2">
                <Select name="fonte" defaultValue={editingItem?.fonte || 'Outros'} required className="flex-1">
                  <option value="Outros">Outros</option>
                  {categorias
                    ?.filter(c => c.ativo)
                    .filter((categoria, index, self) =>
                      index === self.findIndex((c) => c.nome === categoria.nome)
                    )
                    .map((categoria) => (
                      <option key={categoria.id} value={categoria.nome}>
                        {categoria.nome}
                      </option>
                    ))
                  }
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCategoryModalOpen(true)}
                  title="Adicionar novo produto"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Pagamento *
                </label>
                <Select
                  name="tipo_pagamento"
                  defaultValue={editingItem?.tipo_pagamento || 'a_vista'}
                  required
                  onChange={(e) => setTipoPagamento(e.target.value as 'a_vista' | 'parcelado')}
                >
                  <option value="a_vista">À Vista</option>
                  <option value="parcelado">Parcelado</option>
                </Select>
              </div>
            </div>

            {tipoPagamento === 'parcelado' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Número de Parcelas *
                </label>
                <Input
                  type="number"
                  name="numero_parcelas"
                  min="2"
                  max="120"
                  defaultValue={editingItem?.numero_parcelas || 2}
                  placeholder="Ex: 12"
                  required={tipoPagamento === 'parcelado'}
                />
              </div>
            )}
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
          Tem certeza que deseja deletar esta receita? Esta ação não pode ser desfeita.
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

      {/* Modal de Novo Produto */}
      <Modal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        title="Novo Produto/Serviço"
        size="sm"
      >
        <form onSubmit={handleCategorySubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome do Produto/Serviço *
              </label>
              <Input
                type="text"
                name="nome"
                placeholder="Ex: Consultoria, Mentoria, Treinamento"
                required
              />
            </div>
          </div>

          <ModalFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCategoryModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={createCategoriaMutation.isPending}
            >
              {createCategoriaMutation.isPending ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Criando...
                </>
              ) : (
                'Criar'
              )}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  )
}
