// Estrutura completa com suporte a parcelamento
export interface Revenue {
  id: string
  descricao: string
  valor: number
  data: Date | string
  fonte: string  // Ex: "Consultoria", "Mentoria", "Outros"
  cliente_id?: number | null
  cliente_nome?: string  // JOIN com clientes
  cliente_email?: string  // JOIN com clientes
  // Novos campos
  tipo_pagamento: 'a_vista' | 'parcelado'
  status: 'pendente' | 'pago' | 'cancelado' | 'estornado' | 'atrasado'
  id_fatura?: string
  id_contrato?: string
  taxa_servico_percentual?: number  // Taxa do serviço em percentual (0-100)
  // Campos antigos (manter para backward compatibility)
  recebido: boolean
  parcelado: boolean
  numero_parcelas?: number | null
  parcela_atual?: number | null
  usuario_id: number
  created_at: Date | string
  updated_at: Date | string
  parcelas?: ParcelaReceita[]  // Se for parcelado e criar com parcelas
}

export interface ParcelaReceita {
  id: string
  receita_id: string
  numero_parcela: number
  total_parcelas: number
  valor: number
  data_vencimento: Date | string
  data_pagamento?: Date | string | null
  status: 'PENDENTE' | 'PAGO' | 'ATRASADO' | 'CANCELADO'
  created_at: Date | string
  updated_at: Date | string
  // Campos do JOIN (opcionais)
  receita_descricao?: string
  receita_valor_total?: number
  receita_fonte?: string
  cliente_id?: number
  cliente_nome?: string
  ultimo_email_enviado?: Date | string | null
}

export interface CreateRevenueRequest {
  descricao: string
  valor: number
  data: Date | string
  fonte?: string  // Padrão: "Outros"
  cliente_id?: number | string
  // Novos campos
  tipo_pagamento?: 'a_vista' | 'parcelado'  // Padrão: 'a_vista'
  status?: 'pendente' | 'pago' | 'cancelado' | 'estornado' | 'atrasado'  // Padrão: 'pendente'
  id_fatura?: string
  id_contrato?: string
  taxa_servico_percentual?: number  // Taxa do serviço em percentual (0-100)
  // Campos antigos (manter para backward compatibility)
  recebido?: boolean  // Padrão: false
  parcelado?: boolean  // Padrão: false
  numero_parcelas?: number  // Obrigatório se parcelado = true
  parcela_atual?: number | null
}

export interface UpdateRevenueRequest {
  descricao?: string
  valor?: number
  data?: Date | string
  fonte?: string
  // Novos campos
  tipo_pagamento?: 'a_vista' | 'parcelado'
  status?: 'pendente' | 'pago' | 'cancelado' | 'estornado' | 'atrasado'
  id_fatura?: string
  id_contrato?: string
  // Campos antigos (manter para backward compatibility)
  recebido?: boolean
  parcelado?: boolean
  numero_parcelas?: number | null
  parcela_atual?: number | null
}

export interface UpdateParcelaReceitaRequest {
  status?: 'PENDENTE' | 'PAGO' | 'ATRASADO' | 'CANCELADO'
  data_pagamento?: Date | string | null
  valor?: number
}
