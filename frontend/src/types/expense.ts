// Estrutura completa com suporte a parcelamento e recorrência
export interface Expense {
  id: string
  descricao: string
  valor: number
  data: Date | string
  categoria: string  // Ex: "Marketing", "Software", "Outros"
  // Novos campos
  tipo_pagamento: 'a_vista' | 'parcelado'
  status: 'pendente' | 'pago' | 'cancelado' | 'estornado' | 'atrasado'
  id_fatura?: string
  // Campos antigos (manter para backward compatibility)
  pago: boolean
  parcelado: boolean
  numero_parcelas?: number | null
  parcela_atual?: number | null
  recorrente: boolean
  usuario_id: number
  created_at: Date | string
  updated_at: Date | string
  parcelas?: ParcelaDespesa[]  // Se for parcelado e criar com parcelas
  // Open Finance (Pluggy)
  origem?: 'manual' | 'open_finance'
  pluggy_transaction_id?: string
  conexao_pluggy_id?: string
  instituicao?: string
  status_conciliacao?: 'ok' | 'possivel_duplicata'
}

export interface ParcelaDespesa {
  id: string
  despesa_id: string
  numero_parcela: number
  total_parcelas: number
  valor: number
  data_vencimento: Date | string
  data_pagamento?: Date | string | null
  status: 'PENDENTE' | 'PAGO' | 'ATRASADO' | 'CANCELADO'
  created_at: Date | string
  updated_at: Date | string
  // Campos do JOIN (opcionais)
  despesa_descricao?: string
  despesa_valor_total?: number
  despesa_categoria?: string
}

export interface CreateExpenseRequest {
  descricao: string
  valor: number
  data: Date | string
  categoria?: string  // Padrão: "Outros"
  // Novos campos
  tipo_pagamento?: 'a_vista' | 'parcelado'  // Padrão: 'a_vista'
  status?: 'pendente' | 'pago' | 'cancelado' | 'estornado' | 'atrasado'  // Padrão: 'pendente'
  id_fatura?: string
  // Campos antigos (manter para backward compatibility)
  pago?: boolean  // Padrão: false
  parcelado?: boolean  // Padrão: false
  numero_parcelas?: number  // Obrigatório se parcelado = true
  parcela_atual?: number | null
  recorrente?: boolean  // Padrão: false
}

export interface UpdateExpenseRequest {
  descricao?: string
  valor?: number
  data?: Date | string
  categoria?: string
  // Novos campos
  tipo_pagamento?: 'a_vista' | 'parcelado'
  status?: 'pendente' | 'pago' | 'cancelado' | 'estornado' | 'atrasado'
  id_fatura?: string
  // Campos antigos (manter para backward compatibility)
  pago?: boolean
  parcelado?: boolean
  numero_parcelas?: number | null
  parcela_atual?: number | null
  recorrente?: boolean
}

export interface UpdateParcelaDespesaRequest {
  status?: 'PENDENTE' | 'PAGO' | 'ATRASADO' | 'CANCELADO'
  data_pagamento?: Date | string | null
  valor?: number
}
