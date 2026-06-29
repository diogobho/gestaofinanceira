export interface EmpresaInfo {
  id: number
  nome: string
}

export interface UserPermissoes {
  dashboard?: boolean
  crm?: boolean
  clientes?: boolean
  receitas?: boolean
  despesas?: boolean
  parcelas?: boolean
  sessoes?: boolean
  whatsapp?: boolean
  agente?: boolean
}

export interface User {
  id: string
  nome: string
  email: string
  telefone?: string
  empresa?: EmpresaInfo | null
  empresa_id?: number
  funcao?: 'ADMIN' | 'MENTOR'
  nivel?: 'super_admin' | 'admin_empresa' | 'admin' | 'usuario'
  tipo_usuario?: 'master' | 'comum'
  permissoes?: UserPermissoes
  taxa_horaria?: number
  comissao_percentual?: number
  especialidades?: string
  biografia?: string
  status?: 'ATIVO' | 'INATIVO'
  ativo?: boolean
  created_at?: Date | string
  updated_at?: Date | string
}

export interface LoginRequest {
  email: string
  senha: string
}

export interface LoginResponse {
  token: string
  user: User
}

export interface CreateUserRequest {
  nome: string
  email: string
  senha: string
  telefone?: string
  empresa_id?: number
  funcao?: 'ADMIN' | 'MENTOR'
  nivel?: 'super_admin' | 'admin_empresa' | 'admin' | 'usuario'
  taxa_horaria?: number
  comissao_percentual?: number
  especialidades?: string
  biografia?: string
  status?: 'ATIVO' | 'INATIVO'
  ativo?: boolean
}

export interface UpdateUserRequest {
  nome?: string
  email?: string
  senha?: string
  telefone?: string
  empresa_id?: number
  funcao?: 'ADMIN' | 'MENTOR'
  nivel?: 'super_admin' | 'admin_empresa' | 'admin' | 'usuario'
  taxa_horaria?: number
  comissao_percentual?: number
  especialidades?: string
  biografia?: string
  status?: 'ATIVO' | 'INATIVO'
  ativo?: boolean
}
