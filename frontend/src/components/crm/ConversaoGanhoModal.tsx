import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Trophy, Package, DollarSign, Calendar, CreditCard, AlertCircle, Percent, FileText } from 'lucide-react'
import { categoriasReceitasApi } from '@/api'
import type { Lead } from '@/types/crm'

export interface ConversaoGanhoData {
  numero_parcelas: number
  valor_venda: number
  criar_receita: boolean
  descricao?: string
  data?: string
  taxa_servico_percentual?: number
  produto?: string
  tipo_pagamento?: 'a_vista' | 'parcelado'
}

interface ConversaoGanhoProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (data: ConversaoGanhoData) => void
  lead: Lead | null
  funilNome: string
}

export default function ConversaoGanhoModal({
  isOpen,
  onClose,
  onConfirm,
  lead,
  funilNome,
}: ConversaoGanhoProps) {
  const [descricao, setDescricao] = useState('')
  const [valorVenda, setValorVenda] = useState('')
  const [taxaServico, setTaxaServico] = useState('')
  const [tipoPagamento, setTipoPagamento] = useState<'a_vista' | 'parcelado'>('a_vista')
  const [numeroParcelas, setNumeroParcelas] = useState(1)
  const [dataVencimento, setDataVencimento] = useState('')
  const [produto, setProduto] = useState('')

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias-receitas'],
    queryFn: () => categoriasReceitasApi.list(),
    enabled: isOpen
  })

  useEffect(() => {
    if (!isOpen || !lead) return
    const hojeIso = new Date().toISOString().split('T')[0]
    setDescricao('')
    setValorVenda(lead.valor_potencial != null ? String(lead.valor_potencial) : '')
    setTaxaServico('')
    setTipoPagamento('a_vista')
    setNumeroParcelas(1)
    setDataVencimento(hojeIso)
    setProduto(funilNome || 'Outros')
  }, [isOpen, lead, funilNome])

  if (!isOpen || !lead) return null

  const valorNum = parseFloat(valorVenda) || 0
  const taxaNum = parseFloat(taxaServico.replace(',', '.')) || 0
  const valorLiquido = valorNum - (valorNum * taxaNum) / 100
  const parcelasUsar = tipoPagamento === 'parcelado' ? Math.max(2, numeroParcelas) : 1
  const valorParcela = parcelasUsar > 1 ? valorNum / parcelasUsar : valorNum
  const valorPreenchido = valorNum > 0
  const taxaInvalida = taxaServico !== '' && (isNaN(taxaNum) || taxaNum < 0 || taxaNum > 100)

  const fmt = (n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)

  const handleConfirm = () => {
    if (taxaInvalida) return
    onConfirm({
      numero_parcelas: parcelasUsar,
      valor_venda: valorNum,
      criar_receita: true,
      descricao: descricao.trim() || undefined,
      data: dataVencimento || undefined,
      taxa_servico_percentual: taxaNum > 0 ? taxaNum : undefined,
      produto: produto.trim() || undefined,
      tipo_pagamento: tipoPagamento
    })
  }

  const handleSemReceita = () => {
    onConfirm({ numero_parcelas: 1, valor_venda: 0, criar_receita: false })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <Trophy className="text-yellow-500" size={22} />
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Confirmar Conversão</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-700 dark:text-gray-200">{lead.nome}</span> será convertido em cliente e movido para o CRM-CX. Os dados abaixo seguem o mesmo padrão do formulário de Receita.
          </p>

          {!valorPreenchido && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
              <AlertCircle size={16} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Sem valor preenchido nenhuma receita será gerada. Você pode preencher agora ou converter apenas como cliente.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              <FileText size={13} className="inline mr-1" /> Descrição
            </label>
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder={`Conversão CRM - ${lead.nome}`}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">Opcional. Se vazio, usa "Conversão CRM - {lead.nome}".</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                <Calendar size={13} className="inline mr-1" /> Data de Vencimento *
              </label>
              <input
                type="date"
                value={dataVencimento}
                onChange={(e) => setDataVencimento(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none"
              />
              <p className="text-xs text-blue-600 mt-1">Vencimento da receita (ou da 1ª parcela).</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                <DollarSign size={13} className="inline mr-1" /> Valor Total (R$) *
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={valorVenda}
                onChange={(e) => setValorVenda(e.target.value)}
                placeholder="0,00"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              <Percent size={13} className="inline mr-1" /> Taxa do Serviço (%)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={taxaServico}
              onChange={(e) => setTaxaServico(e.target.value)}
              placeholder="0,00"
              className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none ${
                taxaInvalida ? 'border-red-400' : 'border-gray-200 dark:border-gray-600'
              }`}
            />
            <p className="text-xs text-gray-500 mt-1">
              💡 A taxa será descontada do valor e gerará uma despesa automática.
              {taxaNum > 0 && valorNum > 0 && (
                <> {' '}Líquido estimado: <strong>{fmt(valorLiquido)}</strong></>
              )}
            </p>
            {taxaInvalida && <p className="text-xs text-red-500 mt-1">Valor inválido (use 0–100).</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              <Package size={13} className="inline mr-1" /> Produto
            </label>
            <input
              list="produtos-conversao"
              type="text"
              value={produto}
              onChange={(e) => setProduto(e.target.value)}
              placeholder="Ex: Mentoria, Curso, Consultoria..."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none"
            />
            <datalist id="produtos-conversao">
              {categorias.filter(c => c.ativo).map(c => (
                <option key={c.id} value={c.nome} />
              ))}
              {funilNome && !categorias.find(c => c.nome === funilNome) && (
                <option value={funilNome} />
              )}
            </datalist>
            <p className="text-xs text-gray-400 mt-1">
              Sugestões das suas categorias cadastradas. Se digitar um produto novo, ele será criado automaticamente.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                <CreditCard size={13} className="inline mr-1" /> Tipo de Pagamento *
              </label>
              <select
                value={tipoPagamento}
                onChange={(e) => setTipoPagamento(e.target.value as 'a_vista' | 'parcelado')}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none"
              >
                <option value="a_vista">À Vista</option>
                <option value="parcelado">Parcelado</option>
              </select>
            </div>

            {tipoPagamento === 'parcelado' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Número de Parcelas *
                </label>
                <input
                  type="number"
                  min="2"
                  max="120"
                  value={numeroParcelas}
                  onChange={(e) => setNumeroParcelas(Math.max(2, parseInt(e.target.value) || 2))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm focus:ring-2 focus:ring-primary-400 focus:outline-none"
                />
                {valorNum > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {parcelasUsar}x de <strong>{fmt(valorParcela)}</strong>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <button
            onClick={handleSemReceita}
            className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Converter sem receita
          </button>
          <div className="flex items-center gap-3 sm:justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={!valorPreenchido || taxaInvalida}
              className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
            >
              <Trophy size={15} />
              Confirmar Ganho
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
