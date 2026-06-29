// Estrutura real da tabela clientes
export interface Client {
  id: number
  codigo: string
  nome: string
  cpf_cnpj: string  // CPF (11 dígitos) ou CNPJ (14 dígitos) - obrigatório
  email?: string
  telefone?: string
  aniversario?: Date | string
  cidade?: string
  servico?: string
  // Campos de endereço completo
  endereco_rua?: string
  endereco_numero?: string
  endereco_complemento?: string
  endereco_bairro?: string
  endereco_cidade?: string
  endereco_estado?: string
  endereco_cep?: string
  empresa_id?: number
  usuario_id: number
  created_at: Date | string
  updated_at: Date | string
}

export interface CreateClientRequest {
  codigo?: string  // Gerado automaticamente se não fornecido
  nome: string
  cpf_cnpj: string  // Obrigatório
  email?: string
  telefone?: string
  aniversario?: Date | string
  cidade?: string
  servico?: string
  // Campos de endereço - obrigatórios
  endereco_rua: string
  endereco_numero: string
  endereco_complemento?: string
  endereco_bairro?: string
  endereco_cidade: string
  endereco_estado: string
  endereco_cep: string
  empresa_id?: number
}

export interface UpdateClientRequest {
  codigo?: string
  nome?: string
  cpf_cnpj?: string
  email?: string
  telefone?: string
  aniversario?: Date | string
  cidade?: string
  servico?: string
  endereco_rua?: string
  endereco_numero?: string
  endereco_complemento?: string
  endereco_bairro?: string
  endereco_cidade?: string
  endereco_estado?: string
  endereco_cep?: string
  empresa_id?: number
}
