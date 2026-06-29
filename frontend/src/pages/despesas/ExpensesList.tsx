import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Header } from '@/components/layout'
import { Button, MetricCard, Card, Modal, ModalFooter, Input, Select, Spinner, Badge, Textarea, MobileCard, MobileCardHeader, MobileCardRow, MobileCardActions } from '@/components/ui'
import { Plus, Edit, Trash2, CreditCard, Calendar, Filter, X, Landmark, AlertTriangle, TrendingDown, DollarSign, CheckCircle, Clock } from 'lucide-react'
import { expensesApi, categoriasDespesasApi } from '@/api'
import { pluggyApi } from '@/api/pluggy'
import { PluggyConnect } from 'react-pluggy-connect'
import { PluggyConnectionsModal } from './PluggyConnectionsModal'
import type { Expense, CreateExpenseRequest, CreateCategoriaRequest } from '@/types'

export const ExpensesList: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Expense | null>(null)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [tipoPagamento, setTipoPagamento] = useState<'a_vista' | 'parcelado'>('a_vista')
  const queryClient = useQueryClient()
  const [isPluggyOpen, setIsPluggyOpen] = useState(false)
  const [pluggyToken, setPluggyToken] = useState('')
  const [pluggyIncludeSandbox, setPluggyIncludeSandbox] = useState(false)
  const [isConexoesOpen, setIsConexoesOpen] = useState(false)

  // Filtros
  const [filters, setFilters] = useState({
    data_ini: '',
    data_fim: '',
    categoria: '',
    tipo_pagamento: '',
  })
  const hasActiveFilters = filters.data_ini || filters.data_fim || filters.categoria || filters.tipo_pagamento

  const handleLimparFiltros = () => {
    setFilters({ data_ini: '', data_fim: '', categoria: '', tipo_pagamento: '' })
  }

  const handlePluggyConnect = async () => {
    try {
      const { accessToken, includeSandbox } = await pluggyApi.getConnectToken()
      setPluggyToken(accessToken)
      setPluggyIncludeSandbox(includeSandbox)
      setIsPluggyOpen(true)
    } catch {
      toast.error('Erro ao iniciar conexão com Open Finance')
    }
  }

  const handlePluggySuccess = async (itemData: any) => {
    try {
      await pluggyApi.registrarItem(itemData.item.id)
      toast.success('Banco conectado! Importando despesas em segundo plano...')
      setIsPluggyOpen(false)
      queryClient.invalidateQueries({ queryKey: ['expenses-list'] })
    } catch {
      toast.error('Erro ao registrar conexão bancária')
    }
  }

  // Fetch list
  const { data: expenses, isLoading } = useQuery({
    queryKey: ['expenses-list', filters],
    queryFn: () => expensesApi.list({
      data_ini: filters.data_ini || undefined,
      data_fim: filters.data_fim || undefined,
      categoria: filters.categoria || undefined,
      tipo: filters.tipo_pagamento || undefined,
    })
  })

  // Fetch categorias despesas
  const { data: categorias } = useQuery({
    queryKey: ['categorias-despesas'],
    queryFn: () => categoriasDespesasApi.list()
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: expensesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses-list'] })
      queryClient.invalidateQueries({ queryKey: ['expenses-dashboard'] })
      toast.success('Despesa criada com sucesso!')
      setIsModalOpen(false)
      setEditingItem(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao criar despesa')
    }
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => expensesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses-list'] })
      queryClient.invalidateQueries({ queryKey: ['expenses-dashboard'] })
      toast.success('Despesa atualizada com sucesso!')
      setIsModalOpen(false)
      setEditingItem(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao atualizar despesa')
    }
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: expensesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses-list'] })
      queryClient.invalidateQueries({ queryKey: ['expenses-dashboard'] })
      toast.success('Despesa deletada com sucesso!')
      setIsDeleteModalOpen(false)
      setItemToDelete(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao deletar despesa')
    }
  })

  // Create categoria mutation
  const createCategoriaMutation = useMutation({
    mutationFn: categoriasDespesasApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias-despesas'] })
      toast.success('Categoria criada com sucesso!')
      setIsCategoryModalOpen(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao criar categoria')
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

    const data: CreateExpenseRequest = {
      descricao: formData.get('descricao') as string,
      valor: valor,
      data: formData.get('data') as string,
      categoria: formData.get('categoria') as string || 'Outros',
      // New fields
      tipo_pagamento: tipo_pagamento || 'a_vista',
      status: 'pendente', // Status agora é controlado APENAS pelas parcelas
      numero_parcelas: tipo_pagamento === 'parcelado' && numero_parcelas ? parseInt(numero_parcelas) : undefined,
      // Backward compatibility
      pago: false, // Sempre false - controle via parcelas
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

  const handleEdit = (expense: Expense) => {
    setEditingItem(expense)
    setTipoPagamento(expense.tipo_pagamento || 'a_vista')
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

  const totalDespesas = expenses?.reduce((acc, exp) => acc + Number(exp.valor || 0), 0) || 0
  const despesasPagas = expenses?.filter(e => e.pago).length || 0
  const despesasPendentes = expenses?.filter(e => !e.pago).length || 0
  const valorPago = expenses?.filter(e => e.pago).reduce((acc, e) => acc + Number(e.valor || 0), 0) || 0

  return (
    <div>
      <Header
        title="Gestão de Despesas"
        subtitle="Gerencie todas as despesas do negócio"
        tourId="despesas"
        action={
          <div className="flex flex-wrap gap-2">
            <Button data-tour="despesas-banco" variant="ghost" onClick={() => setIsConexoesOpen(true)}>
              <Landmark className="w-4 h-4 mr-2" />
              Bancos conectados
            </Button>
            <Button variant="secondary" onClick={handlePluggyConnect}>
              <Landmark className="w-4 h-4 mr-2" />
              Conectar banco
            </Button>
            <Button data-tour="despesas-nova" variant="primary" onClick={handleOpenModal}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Despesa
            </Button>
          </div>
        }
      />

      <div className="p-4 sm:p-6">
        {/* Métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
          <MetricCard
            title="Total de Despesas"
            value={expenses?.length || 0}
            icon={TrendingDown}
          />
          <MetricCard
            title="Valor Total"
            value={formatCurrency(totalDespesas)}
            icon={DollarSign}
            iconColor="text-gold-600"
            iconBg="bg-gold-50 dark:bg-gold-900/20"
          />
          <MetricCard
            title="Pagas"
            value={despesasPagas}
            icon={CheckCircle}
            iconColor="text-emerald-600"
            iconBg="bg-emerald-50 dark:bg-emerald-900/20"
            valueColor="text-emerald-600"
            subtitle={formatCurrency(valorPago)}
          />
          <MetricCard
            title="Pendentes"
            value={despesasPendentes}
            icon={Clock}
            iconColor="text-amber-600"
            iconBg="bg-amber-50 dark:bg-amber-900/20"
            valueColor="text-amber-600"
            subtitle={formatCurrency(totalDespesas - valorPago)}
          />
        </div>

        {/* Filtros */}
        <Card className="mb-6" data-tour="despesas-filtros">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">Filtros</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                Data Inicial
              </label>
              <Input
                type="date"
                value={filters.data_ini}
                onChange={(e) => setFilters(f => ({ ...f, data_ini: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                Data Final
              </label>
              <Input
                type="date"
                value={filters.data_fim}
                onChange={(e) => setFilters(f => ({ ...f, data_fim: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
              <Select
                value={filters.categoria}
                onChange={(e) => setFilters(f => ({ ...f, categoria: e.target.value }))}
              >
                <option value="">Todas</option>
                {categorias?.filter(c => c.ativo).map(c => (
                  <option key={c.id} value={c.nome}>{c.nome}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Pagamento</label>
              <Select
                value={filters.tipo_pagamento}
                onChange={(e) => setFilters(f => ({ ...f, tipo_pagamento: e.target.value }))}
              >
                <option value="">Todos</option>
                <option value="a_vista">À Vista</option>
                <option value="parcelado">Parcelado</option>
              </Select>
            </div>
          </div>
          {hasActiveFilters && (
            <div className="mt-4 flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleLimparFiltros}>
                <X className="w-4 h-4 mr-1" />
                Limpar Filtros
              </Button>
              <span className="text-sm text-gray-500">
                {[filters.data_ini, filters.data_fim, filters.categoria, filters.tipo_pagamento].filter(Boolean).length} filtro(s) ativo(s)
              </span>
            </div>
          )}
        </Card>

        {/* Versão Mobile - Cards */}
        <div className="md:hidden space-y-3">
          {expenses && expenses.length > 0 ? (
            expenses.map((expense) => (
              <MobileCard key={expense.id}>
                <MobileCardHeader
                  title={expense.descricao}
                  subtitle={formatDate(expense.data)}
                  badge={
                    <Badge variant={expense.tipo_pagamento === 'parcelado' ? 'info' : 'success'}>
                      {expense.tipo_pagamento === 'parcelado' ? 'Parcelado' : 'À Vista'}
                    </Badge>
                  }
                />
                <MobileCardRow label="Categoria" value={expense.categoria} />
                <MobileCardRow
                  label="Valor"
                  value={<span className="font-semibold text-red-600">{formatCurrency(expense.valor)}</span>}
                />
                {expense.id_fatura && (
                  <MobileCardRow
                    label="ID Fatura"
                    value={<code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">{expense.id_fatura}</code>}
                  />
                )}
                <MobileCardActions>
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(expense)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(expense.id)}>
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </MobileCardActions>
              </MobileCard>
            ))
          ) : (
            <Card>
              <p className="text-center text-gray-500 py-6">Nenhuma despesa cadastrada</p>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo Pgto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID Fatura</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {expenses && expenses.length > 0 ? (
                  expenses.map((expense) => (
                    <tr key={expense.id}>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {formatDate(expense.data)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{expense.descricao}</div>
                        {expense.origem === 'open_finance' && (
                          <div className="flex items-center gap-1 mt-1">
                            <Landmark className="w-3 h-3 text-blue-500" />
                            <span className="text-xs text-blue-500">{expense.instituicao ?? 'Open Finance'}</span>
                            {expense.status_conciliacao === 'possivel_duplicata' && (
                              <span title="Possível duplicata de lançamento manual">
                                <AlertTriangle className="w-3 h-3 text-amber-500" />
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {expense.categoria}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {formatCurrency(expense.valor)}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={expense.tipo_pagamento === 'parcelado' ? 'info' : 'success'}>
                          <div className="flex items-center gap-1">
                            {expense.tipo_pagamento === 'parcelado' ? (
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
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {expense.id_fatura ? (
                          <code className="px-2 py-1 bg-gray-100 rounded text-xs">
                            {expense.id_fatura}
                          </code>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(expense)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(expense.id)}
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
                      Nenhuma despesa cadastrada
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
        title={editingItem ? 'Editar Despesa' : 'Nova Despesa'}
        size="lg"
      >
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descrição *
              </label>
              <Textarea
                name="descricao"
                defaultValue={editingItem?.descricao}
                rows={3}
                placeholder="Ex: Pagamento de aluguel do escritório"
                required
              />
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
                  Valor *
                </label>
                <Input
                  type="number"
                  name="valor"
                  step="0.01"
                  defaultValue={editingItem?.valor}
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoria *
              </label>
              <div className="flex gap-2">
                <Select name="categoria" defaultValue={editingItem?.categoria || 'Outros'} required className="flex-1">
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
                  title="Adicionar nova categoria"
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
          Tem certeza que deseja deletar esta despesa? Esta ação não pode ser desfeita.
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

      {/* Modal de Nova Categoria */}
      <Modal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        title="Nova Categoria de Despesa"
        size="sm"
      >
        <form onSubmit={handleCategorySubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome da Categoria *
              </label>
              <Input
                type="text"
                name="nome"
                placeholder="Ex: Marketing, Software, Aluguel"
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

      {isPluggyOpen && pluggyToken && (
        <PluggyConnect
          connectToken={pluggyToken}
          includeSandbox={pluggyIncludeSandbox}
          onSuccess={handlePluggySuccess}
          onError={() => { toast.error('Erro na conexão bancária') }}
          onClose={() => setIsPluggyOpen(false)}
        />
      )}

      <PluggyConnectionsModal isOpen={isConexoesOpen} onClose={() => setIsConexoesOpen(false)} />
    </div>
  )
}
