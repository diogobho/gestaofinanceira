// Categoria de Receita
export interface CategoriaReceita {
  id: number
  nome: string
  usuario_id: number
  ativo: boolean
  created_at: Date | string
  updated_at: Date | string
}

// Categoria de Despesa
export interface CategoriaDespesa {
  id: number
  nome: string
  usuario_id: number
  ativo: boolean
  created_at: Date | string
  updated_at: Date | string
}

// Request para criar categoria (receita ou despesa)
export interface CreateCategoriaRequest {
  nome: string
  ativo?: boolean  // Padrão: true
}

// Request para atualizar categoria (receita ou despesa)
export interface UpdateCategoriaRequest {
  nome?: string
  ativo?: boolean
}
