import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Header } from '@/components/layout'
import { Button, MetricCard, Card, Modal, ModalFooter, Input, Select, Spinner, Badge } from '@/components/ui'
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '@/components/ui/Table'
import { Edit, Filter, X, Calendar, CreditCard, DollarSign, CheckCircle, Clock } from 'lucide-react'
import { parcelasApi, clientsApi } from '@/api'
import type { ParcelaReceita, ParcelaDespesa } from '@/types'

type TabType = 'receitas' | 'despesas'

export const ParcelasList: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('receitas')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [clienteFilter, setClienteFilter] = useState<string>('')
  const [dataIni, setDataIni] = useState<string>('')
  const [dataFim, setDataFim] = useState<string>('')
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedParcela, setSelectedParcela] = useState<ParcelaReceita | ParcelaDespesa | null>(null)
  const [selectedParcelasIds, setSelectedParcelasIds] = useState<string[]>([])
  const [isSendingEmails, setIsSendingEmails] = useState(false)
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false)
  const [isEmailPreviewOpen, setIsEmailPreviewOpen] = useState(false)
  const queryClient = useQueryClient()

  // Build filters
  const buildReceitasFilters = () => {
    const filters: any = {}
    if (statusFilter) filters.status = statusFilter
    if (clienteFilter) filters.cliente_id = parseInt(clienteFilter)
    if (dataIni) filters.data_ini = dataIni
    if (dataFim) filters.data_fim = dataFim
    return Object.keys(filters).length > 0 ? filters : undefined
  }

  const buildDespesasFilters = () => {
    const filters: any = {}
    if (statusFilter) filters.status = statusFilter
    if (dataIni) filters.data_ini = dataIni
    if (dataFim) filters.data_fim = dataFim
    return Object.keys(filters).length > 0 ? filters : undefined
  }

  // Fetch parcelas receitas
  const { data: parcelasReceitasRaw, isLoading: isLoadingReceitas, error: errorReceitas } = useQuery({
    queryKey: ['parcelas-receitas', statusFilter, clienteFilter, dataIni, dataFim],
    queryFn: () => parcelasApi.getParcelasReceitas(buildReceitasFilters())
  })

  // Fetch parcelas despesas
  const { data: parcelasDespesasRaw, isLoading: isLoadingDespesas, error: errorDespesas } = useQuery({
    queryKey: ['parcelas-despesas', statusFilter, dataIni, dataFim],
    queryFn: () => parcelasApi.getParcelasDespesas(buildDespesasFilters())
  })

  // Fetch clients for filter
  const { data: clients } = useQuery({
    queryKey: ['clients-parcelas'],
    queryFn: () => clientsApi.list()
  })

  // Ordenar por vencimento mais próximo
  const sortByVencimento = (parcelas: any[] | undefined) => {
    if (!parcelas) return []
    return [...parcelas].sort((a, b) => {
      const dateA = new Date(a.data_vencimento).getTime()
      const dateB = new Date(b.data_vencimento).getTime()
      return dateA - dateB // Mais próximo primeiro
    })
  }

  const parcelasReceitas = sortByVencimento(parcelasReceitasRaw)
  const parcelasDespesas = sortByVencimento(parcelasDespesasRaw)

  // Update mutation for receitas
  const updateReceitaMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => parcelasApi.updateParcelaReceita(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parcelas-receitas'] })
      toast.success('Parcela atualizada com sucesso!')
      setIsEditModalOpen(false)
      setSelectedParcela(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao atualizar parcela')
    }
  })

  // Update mutation for despesas
  const updateDespesaMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => parcelasApi.updateParcelaDespesa(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parcelas-despesas'] })
      toast.success('Parcela atualizada com sucesso!')
      setIsEditModalOpen(false)
      setSelectedParcela(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao atualizar parcela')
    }
  })

  // Funções de seleção para envio de e-mails
  const toggleSelectParcela = (parcelaId: string) => {
    setSelectedParcelasIds(prev =>
      prev.includes(parcelaId)
        ? prev.filter(id => id !== parcelaId)
        : [...prev, parcelaId]
    )
  }

  const toggleSelectAll = () => {
    const parcelas = activeTab === 'receitas' ? parcelasReceitas : parcelasDespesas
    if (selectedParcelasIds.length === parcelas.length) {
      setSelectedParcelasIds([])
    } else {
      setSelectedParcelasIds(parcelas.map((p: any) => p.id))
    }
  }

  const handleEnviarEmailsCobranca = async () => {
    if (selectedParcelasIds.length === 0) {
      toast.error('Selecione pelo menos uma parcela atrasada')
      return
    }

    // Apenas parcelas de receitas podem ter e-mail enviado
    if (activeTab !== 'receitas') {
      toast.error('E-mails de cobrança só podem ser enviados para parcelas de receitas')
      return
    }

    setIsSendingEmails(true)

    try {
      const result = await parcelasApi.enviarEmailsCobranca(selectedParcelasIds)

      // Mostrar resultado
      if (result.totalEnviados > 0) {
        toast.success(`${result.totalEnviados} e-mail(s) enviado(s) com sucesso!`)
      }

      if (result.totalJaEnviados > 0) {
        toast(`${result.totalJaEnviados} e-mail(s) já haviam sido enviados nas últimas 24h`, {
          icon: 'ℹ️',
          duration: 5000
        })
      }

      if (result.totalErros > 0) {
        toast.error(`${result.totalErros} erro(s) ao enviar e-mails. Verifique os detalhes.`)
        console.error('Erros no envio:', result.detalhes.erros)
      }

      // Limpar seleção
      setSelectedParcelasIds([])

      // Atualizar lista de parcelas
      queryClient.invalidateQueries({ queryKey: ['parcelas-receitas'] })

    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao enviar e-mails')
      console.error('Erro completo:', error)
    } finally {
      setIsSendingEmails(false)
    }
  }

  const handleEnviarWhatsAppCobranca = async () => {
    if (selectedParcelasIds.length === 0) {
      toast.error('Selecione pelo menos uma parcela atrasada')
      return
    }

    // Apenas parcelas de receitas podem ter WhatsApp enviado
    if (activeTab !== 'receitas') {
      toast.error('Mensagens de cobrança só podem ser enviadas para parcelas de receitas')
      return
    }

    setIsSendingWhatsApp(true)

    try {
      const result = await parcelasApi.enviarWhatsAppCobranca(selectedParcelasIds)

      // Mostrar resultado
      if (result.totalEnviados > 0) {
        toast.success(`${result.totalEnviados} mensagem(ns) WhatsApp enviada(s) com sucesso!`)
      }

      if (result.totalJaEnviados > 0) {
        toast(`${result.totalJaEnviados} mensagem(ns) já haviam sido enviadas nas últimas 24h`, {
          icon: 'ℹ️',
          duration: 5000
        })
      }

      if (result.totalErros > 0) {
        toast.error(`${result.totalErros} erro(s) ao enviar mensagens. Verifique os detalhes.`)
        console.error('Erros no envio:', result.detalhes.erros)
      }

      // Limpar seleção
      setSelectedParcelasIds([])

      // Atualizar lista de parcelas
      queryClient.invalidateQueries({ queryKey: ['parcelas-receitas'] })

    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao enviar mensagens WhatsApp')
      console.error('Erro completo:', error)
    } finally {
      setIsSendingWhatsApp(false)
    }
  }

  const handleEditStatus = (parcela: ParcelaReceita | ParcelaDespesa) => {
    setSelectedParcela(parcela)
    setIsEditModalOpen(true)
  }

  const handleConfirmEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const novoStatus = formData.get('status') as string
    const data_pagamento = formData.get('data_pagamento') as string
    const valorString = formData.get('valor') as string
    const data_vencimento = formData.get('data_vencimento') as string

    if (!selectedParcela) return

    // Validar valor
    const valor = valorString ? parseFloat(valorString) : 0
    if (isNaN(valor) || valor <= 0) {
      toast.error('Por favor, insira um valor válido')
      return
    }

    const updateData: any = {
      status: novoStatus,
      valor: valor,
      data_vencimento: data_vencimento
    }

    // Se o novo status for PAGO, incluir data de pagamento
    if (novoStatus === 'PAGO') {
      if (!data_pagamento) {
        toast.error('Data de pagamento é obrigatória quando o status é PAGO')
        return
      }
      updateData.data_pagamento = data_pagamento
    } else {
      // Se voltar para PENDENTE ou outro status, limpar data de pagamento
      updateData.data_pagamento = null
    }

    if (activeTab === 'receitas') {
      updateReceitaMutation.mutate({ id: selectedParcela.id, data: updateData })
    } else {
      updateDespesaMutation.mutate({ id: selectedParcela.id, data: updateData })
    }
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

  const getStatusColor = (status: string) => {
    if (status === 'PAGO') return 'success'
    if (status === 'ATRASADO') return 'danger'
    if (status === 'CANCELADO') return 'default'
    return 'warning'
  }

  const getRowHighlight = (parcela: ParcelaReceita | ParcelaDespesa) => {
    if (parcela.status === 'PAGO' || parcela.status === 'CANCELADO') return ''

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const vencimento = new Date(parcela.data_vencimento)
    vencimento.setHours(0, 0, 0, 0)
    const diffDays = Math.floor((vencimento.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays < 0) return 'bg-red-50' // Overdue
    if (diffDays <= 7) return 'bg-yellow-50' // Due soon
    return ''
  }

  const getEmailStatus = (parcela: ParcelaReceita | ParcelaDespesa) => {
    const parcelaReceita = parcela as ParcelaReceita

    // Se tem data de último email enviado, mostrar
    if (parcelaReceita.ultimo_email_enviado) {
      const dataEnvio = new Date(parcelaReceita.ultimo_email_enviado)
      const dataFormatada = dataEnvio.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })

      return {
        text: `E-mail enviado em ${dataFormatada}`,
        color: 'text-green-700',
        bgColor: 'bg-green-100 px-2 py-1 rounded text-xs font-medium',
        icon: '✓'
      }
    }

    // Se não tem email enviado mas está atrasado, mostrar alerta
    if (parcela.status !== 'PAGO' && parcela.status !== 'CANCELADO') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const vencimento = new Date(parcela.data_vencimento)
      vencimento.setHours(0, 0, 0, 0)
      const diffDays = Math.floor((vencimento.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

      if (diffDays < 0) {
        return {
          text: `Atrasado ${Math.abs(diffDays)} dia${Math.abs(diffDays) > 1 ? 's' : ''}`,
          color: 'text-red-700',
          bgColor: 'bg-red-100 px-2 py-1 rounded text-xs font-medium',
          icon: '⚠'
        }
      }
    }

    return { text: 'Nenhum e-mail enviado', color: 'text-gray-400', bgColor: '', icon: '' }
  }

  const isLoading = activeTab === 'receitas' ? isLoadingReceitas : isLoadingDespesas
  const parcelas = activeTab === 'receitas' ? parcelasReceitas : parcelasDespesas
  const error = activeTab === 'receitas' ? errorReceitas : errorDespesas

  // Calculate metrics
  const totalParcelas = parcelas?.length || 0
  const parcelasPagas = parcelas?.filter(p => p.status === 'PAGO').length || 0
  const parcelasPendentes = parcelas?.filter(p => p.status === 'PENDENTE').length || 0
  const valorTotal = parcelas?.reduce((acc, p) => acc + Number(p.valor || 0), 0) || 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <Header
          title="Gestão de Parcelas"
          subtitle="Acompanhe e gerencie todas as parcelas de receitas e despesas"
        />
        <div className="p-4 sm:p-6">
          <Card>
            <div className="text-center py-12">
              <p className="text-red-600 font-medium">Erro ao carregar parcelas</p>
              <p className="text-gray-500 text-sm mt-2">{(error as any)?.message || 'Tente novamente'}</p>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Header
        title="Gestão de Parcelas"
        subtitle="Acompanhe e gerencie todas as parcelas de receitas e despesas"
        tourId="parcelas"
      />

      <div className="p-4 sm:p-6">
        {/* Tabs */}
        <div className="mb-6" data-tour="parcelas-abas">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8">
              <button
                onClick={() => {
                  setActiveTab('receitas')
                }}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'receitas'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Parcelas de Receitas
              </button>
              <button
                onClick={() => {
                  setActiveTab('despesas')
                  setClienteFilter('')
                }}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'despesas'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Parcelas de Despesas
              </button>
            </nav>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
          <MetricCard
            title="Total de Parcelas"
            value={totalParcelas}
            icon={CreditCard}
          />
          <MetricCard
            title="Valor Total"
            value={formatCurrency(valorTotal)}
            icon={DollarSign}
            iconColor="text-gold-600"
            iconBg="bg-gold-50 dark:bg-gold-900/20"
          />
          <MetricCard
            title="Pagas"
            value={parcelasPagas}
            icon={CheckCircle}
            iconColor="text-emerald-600"
            iconBg="bg-emerald-50 dark:bg-emerald-900/20"
            valueColor="text-emerald-600"
          />
          <MetricCard
            title="Pendentes"
            value={parcelasPendentes}
            icon={Clock}
            iconColor="text-amber-600"
            iconBg="bg-amber-50 dark:bg-amber-900/20"
            valueColor="text-amber-600"
          />
        </div>

        {/* Filters and Actions */}
        <Card className="mb-6" data-tour="parcelas-filtros">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">Filtros</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="PENDENTE">PENDENTE</option>
                <option value="PAGO">PAGO</option>
                <option value="ATRASADO">ATRASADO</option>
                <option value="CANCELADO">CANCELADO</option>
              </Select>
            </div>

            {activeTab === 'receitas' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cliente
                </label>
                <Select
                  value={clienteFilter}
                  onChange={(e) => setClienteFilter(e.target.value)}
                >
                  <option value="">Todos</option>
                  {clients?.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.nome}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                Data Inicial
              </label>
              <Input
                type="date"
                value={dataIni}
                onChange={(e) => setDataIni(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                Data Final
              </label>
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
          </div>

          {(statusFilter || clienteFilter || dataIni || dataFim) && (
            <div className="flex items-center gap-2 mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusFilter('')
                  setClienteFilter('')
                  setDataIni('')
                  setDataFim('')
                }}
              >
                <X className="w-4 h-4 mr-2" />
                Limpar Filtros
              </Button>
              <span className="text-sm text-gray-600">
                Filtros ativos: {[statusFilter, clienteFilter, dataIni, dataFim].filter(Boolean).length}
              </span>
            </div>
          )}

          {/* Botões de E-mail e WhatsApp (só para receitas de usuários PJ) */}
          {activeTab === 'receitas' && (
            <div className="flex items-center gap-2 pt-4 border-t border-gray-200" data-tour="parcelas-cobranca">
              <Button
                variant="outline"
                onClick={() => setIsEmailPreviewOpen(true)}
                className="whitespace-nowrap"
              >
                👁️ Preview do E-mail
              </Button>
              <Button
                variant={selectedParcelasIds.length > 0 ? 'primary' : 'outline'}
                onClick={handleEnviarEmailsCobranca}
                disabled={selectedParcelasIds.length === 0 || isSendingEmails || isSendingWhatsApp}
                className="whitespace-nowrap"
              >
                {isSendingEmails ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Enviando...
                  </>
                ) : (
                  <>
                    📧 Enviar E-mails ({selectedParcelasIds.length})
                  </>
                )}
              </Button>
              <Button
                variant={selectedParcelasIds.length > 0 ? 'primary' : 'outline'}
                onClick={handleEnviarWhatsAppCobranca}
                disabled={selectedParcelasIds.length === 0 || isSendingEmails || isSendingWhatsApp}
                className="whitespace-nowrap bg-green-600 hover:bg-green-700 text-white"
              >
                {isSendingWhatsApp ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Enviando...
                  </>
                ) : (
                  <>
                    📱 Enviar WhatsApp ({selectedParcelasIds.length})
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Informação sobre seleção */}
          {selectedParcelasIds.length > 0 && activeTab === 'receitas' && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                ✅ <strong>{selectedParcelasIds.length}</strong> parcela(s) selecionada(s) para envio de cobrança
              </p>
              <p className="text-xs text-blue-600 mt-1">
                💡 Somente parcelas atrasadas com cliente vinculado receberão notificações
              </p>
              <p className="text-xs text-blue-600 mt-1">
                📧 E-mail: Cliente deve ter e-mail cadastrado | 📱 WhatsApp: Cliente deve ter telefone cadastrado e WhatsApp conectado
              </p>
            </div>
          )}
        </Card>

        {/* Table */}
        <Card>
          <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                {activeTab === 'receitas' && (
                  <TableHeaderCell className="w-12">
                    <input
                      type="checkbox"
                      checked={selectedParcelasIds.length === parcelas.length && parcelas.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                  </TableHeaderCell>
                )}
                <TableHeaderCell>Parcela</TableHeaderCell>
                <TableHeaderCell>
                  {activeTab === 'receitas' ? 'Receita' : 'Despesa'}
                </TableHeaderCell>
                {activeTab === 'receitas' && <TableHeaderCell>Cliente</TableHeaderCell>}
                <TableHeaderCell>Valor</TableHeaderCell>
                <TableHeaderCell>Vencimento</TableHeaderCell>
                <TableHeaderCell>Pagamento</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Status de E-mail</TableHeaderCell>
                <TableHeaderCell>Ações</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {parcelas && parcelas.length > 0 ? (
                parcelas.map((parcela) => (
                  <TableRow key={parcela.id} className={getRowHighlight(parcela)}>
                    {activeTab === 'receitas' && (
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedParcelasIds.includes(parcela.id)}
                          onChange={() => toggleSelectParcela(parcela.id)}
                          className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      {parcela.numero_parcela}/{parcela.total_parcelas}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-gray-900">
                        {activeTab === 'receitas'
                          ? (parcela as ParcelaReceita).receita_descricao || 'Sem descrição'
                          : (parcela as ParcelaDespesa).despesa_descricao || 'Sem descrição'}
                      </div>
                    </TableCell>
                    {activeTab === 'receitas' && (
                      <TableCell>
                        {(parcela as ParcelaReceita).cliente_nome || '-'}
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      {formatCurrency(parcela.valor)}
                    </TableCell>
                    <TableCell>{formatDate(parcela.data_vencimento)}</TableCell>
                    <TableCell>
                      {parcela.data_pagamento
                        ? formatDate(parcela.data_pagamento)
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(parcela.status)}>
                        {parcela.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const emailStatus = getEmailStatus(parcela)
                        return (
                          <span className={`${emailStatus.color} ${emailStatus.bgColor}`}>
                            {emailStatus.icon && <span className="mr-1">{emailStatus.icon}</span>}
                            {emailStatus.text}
                          </span>
                        )
                      })()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditStatus(parcela)}
                        title="Editar parcela"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <tr>
                  <td colSpan={activeTab === 'receitas' ? 9 : 8} className="text-center py-12 text-gray-500">
                    <p>
                      {statusFilter
                        ? `Nenhuma parcela encontrada com status "${statusFilter}"`
                        : `Nenhuma parcela de ${activeTab === 'receitas' ? 'receitas' : 'despesas'} encontrada`}
                    </p>
                    <p className="text-sm text-gray-400 mt-2">
                      {activeTab === 'despesas'
                        ? 'Crie despesas com pagamento parcelado para visualizar parcelas aqui.'
                        : 'Crie receitas com pagamento parcelado para visualizar parcelas aqui.'}
                    </p>
                  </td>
                </tr>
              )}
            </TableBody>
          </Table>
          </div>
        </Card>
      </div>

      {/* Edit Parcela Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setSelectedParcela(null)
        }}
        title="Editar Parcela"
        size="md"
      >
        <form onSubmit={handleConfirmEdit}>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">
                Editando parcela <strong>{selectedParcela?.numero_parcela}/{selectedParcela?.total_parcelas}</strong>
              </p>
              <p className="text-xs text-gray-500">
                Status atual: <span className="font-semibold">{selectedParcela?.status}</span>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Valor da Parcela *
                </label>
                <Input
                  type="number"
                  name="valor"
                  step="0.01"
                  defaultValue={selectedParcela?.valor}
                  required
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data de Vencimento *
                </label>
                <Input
                  type="date"
                  name="data_vencimento"
                  defaultValue={
                    selectedParcela?.data_vencimento
                      ? new Date(selectedParcela.data_vencimento).toISOString().split('T')[0]
                      : ''
                  }
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status *
                </label>
                <Select
                  name="status"
                  defaultValue={selectedParcela?.status || 'PENDENTE'}
                  required
                >
                  <option value="PENDENTE">PENDENTE</option>
                  <option value="PAGO">PAGO</option>
                  <option value="ATRASADO">ATRASADO</option>
                  <option value="CANCELADO">CANCELADO</option>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data do Pagamento
                </label>
                <Input
                  type="date"
                  name="data_pagamento"
                  defaultValue={
                    selectedParcela?.data_pagamento
                      ? new Date(selectedParcela.data_pagamento).toISOString().split('T')[0]
                      : ''
                  }
                />
                <p className="text-xs text-gray-500 mt-1">
                  * Obrigatório se status for "PAGO"
                </p>
              </div>
            </div>
          </div>

          <ModalFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsEditModalOpen(false)
                setSelectedParcela(null)
              }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={updateReceitaMutation.isPending || updateDespesaMutation.isPending}
            >
              {updateReceitaMutation.isPending || updateDespesaMutation.isPending ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Salvando...
                </>
              ) : (
                'Salvar Alteração'
              )}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Email Preview Modal */}
      <Modal
        isOpen={isEmailPreviewOpen}
        onClose={() => setIsEmailPreviewOpen(false)}
        title="Preview do E-mail de Cobrança"
        size="lg"
      >
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              ℹ️ Este é o formato do e-mail que será enviado para clientes com parcelas atrasadas.
            </p>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gradient-to-r from-red-600 to-red-800 text-white p-6 text-center">
              <h2 className="text-2xl font-bold">⚠️ Cobrança de Parcela em Atraso</h2>
            </div>

            <div className="bg-gray-50 p-6">
              <div className="bg-red-50 border-l-4 border-red-600 p-4 mb-4">
                <p className="text-sm text-gray-700">
                  <strong>Prezado(a) [Nome do Cliente],</strong>
                </p>
                <p className="text-sm text-gray-700 mt-2">
                  Identificamos que existe uma parcela em atraso referente ao serviço/produto <strong>[Descrição]</strong>.
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-gray-800 mb-3">Detalhes da Parcela:</h3>
                <div className="space-y-2">
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="font-bold text-gray-600">Parcela:</span>
                    <span className="text-gray-900">[Número] / [Total]</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="font-bold text-gray-600">Valor:</span>
                    <span className="text-gray-900">R$ [Valor]</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="font-bold text-gray-600">Data de Vencimento:</span>
                    <span className="text-gray-900">[Data]</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="font-bold text-gray-600">Dias em Atraso:</span>
                    <span className="text-red-600 font-bold">[Dias] dia(s)</span>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-700">
                  <strong>📌 Ação necessária:</strong> Por favor, regularize este pagamento o quanto antes para evitar cobranças adicionais ou suspensão do serviço.
                </p>
              </div>

              <div className="text-center text-sm text-gray-500 mt-6">
                <p>Se você já realizou o pagamento, por favor desconsidere este e-mail.</p>
                <p className="mt-2">Em caso de dúvidas, entre em contato conosco.</p>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800">
              <strong>💡 Nota:</strong> O e-mail real será personalizado com os dados específicos de cada parcela e cliente.
            </p>
          </div>
        </div>

        <ModalFooter>
          <Button
            variant="primary"
            onClick={() => setIsEmailPreviewOpen(false)}
          >
            Fechar
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
