import api from './client'
import type { Client, CreateClientRequest, UpdateClientRequest } from '@/types'

export const clientsApi = {
  list: async (): Promise<Client[]> => {
    try {
      const { data } = await api.get<Client[]>('/clientes', { params: { pageSize: 100 } })
      return Array.isArray(data) ? data : [] // Retorna o array diretamente ou array vazio
    } catch (error) {
      console.error('Error fetching clients:', error)
      return [] // Retorna array vazio em caso de erro
    }
  },

  getById: async (id: string): Promise<Client> => {
    const { data } = await api.get<Client>(`/clientes/${id}`)
    return data
  },

  create: async (clientData: CreateClientRequest): Promise<Client> => {
    const { data } = await api.post<Client>('/clientes', clientData)
    return data
  },

  update: async (id: string, clientData: UpdateClientRequest): Promise<Client> => {
    const { data } = await api.put<Client>(`/clientes/${id}`, clientData)
    return data
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/clientes/${id}`)
  },

  /** Importar de planilha — mesmo fluxo da importação de leads: preview → mapeamento → importar. */
  importacaoPreview: async (file: File): Promise<PreviewPlanilha> => {
    const form = new FormData()
    form.append('file', file)
    const { data } = await api.post<PreviewPlanilha>('/clientes/importacao/preview', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  importar: async (file: File, mapeamento: MapeamentoClientes): Promise<ResultadoImportacaoClientes> => {
    const form = new FormData()
    form.append('file', file)
    form.append('mapeamento', JSON.stringify(mapeamento))
    const { data } = await api.post<ResultadoImportacaoClientes>('/clientes/importacao/importar', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000,
    })
    return data
  },
}

export interface PreviewPlanilha {
  colunas: string[]
  linhas: Record<string, string>[]
  totalLinhas: number
}

export type MapeamentoClientes = { nome: string; cpf_cnpj: string } & Partial<Record<
  'email' | 'telefone' | 'aniversario' | 'servico' | 'endereco_rua' | 'endereco_numero' |
  'endereco_complemento' | 'endereco_bairro' | 'endereco_cidade' | 'endereco_estado' | 'endereco_cep',
  string
>>

export interface ResultadoImportacaoClientes {
  total: number
  importados: number
  duplicados: number
  erros: { linha: number; erro: string }[]
}
