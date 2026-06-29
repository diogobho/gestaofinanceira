export type ParcelaStatus = 'PENDENTE' | 'PAGO' | 'ATRASADO' | 'CANCELADO'

export interface ParcelaReceita {
  id: string
  receita_id: string
  numero_parcela: number
  total_parcelas: number
  valor: number
  data_vencimento: Date | string
  data_pagamento?: Date | string | null
  status: ParcelaStatus
  observacoes?: string | null
  created_at: Date | string
  updated_at: Date | string
  // Campos extras da view/join
  receita_descricao?: string
  receita_valor_total?: number
  receita_tipo?: string
  cliente_id?: number
  cliente_nome?: string
  ultimo_email_enviado?: Date | string | null
}

export interface ParcelaDespesa {
  id: string
  despesa_id: string
  numero_parcela: number
  total_parcelas: number
  valor: number
  data_vencimento: Date | string
  data_pagamento?: Date | string | null
  status: ParcelaStatus
  observacoes?: string | null
  created_at: Date | string
  updated_at: Date | string
  // Campos extras da view/join
  despesa_descricao?: string
  despesa_valor_total?: number
  despesa_tipo?: string
}

export interface UpdateParcelaRequest {
  status?: ParcelaStatus
  data_pagamento?: Date | string | null
  observacoes?: string
}
