export interface EmpresaInfo {
  id: number
  nome: string
  // dados de contato da empresa — alimentam a assinatura de e-mail padrão
  email?: string | null
  telefone?: string | null
  endereco?: string | null
  logo_url?: string | null
  cor_primaria?: string | null
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
  tipo_usuario?: 'master' | 'comum' | 'creator'
  permissoes?: UserPermissoes
  /** HTML da assinatura anexada aos e-mails do CRM; null = usa o padrão da empresa */
  assinatura_email?: string | null
  /** Painel da Cloud API da DuoFuturo: super_admin ou revisor liberado no .env */
  acesso_cloud_api?: boolean
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
  tipo_usuario?: 'master' | 'comum'
  permissoes?: UserPermissoes
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
  tipo_usuario?: 'master' | 'comum'
  permissoes?: UserPermissoes
  taxa_horaria?: number
  comissao_percentual?: number
  especialidades?: string
  biografia?: string
  status?: 'ATIVO' | 'INATIVO'
  ativo?: boolean
}
