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
}
