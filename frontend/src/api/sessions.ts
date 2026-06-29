import api from './client'
import type { Session, CreateSessionRequest, UpdateSessionRequest } from '@/types'

interface PaginatedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export const sessionsApi = {
  list: async (filters?: {
    cliente_id?: string
    mentor_id?: string
    data_inicio?: string
    data_fim?: string
    page?: number
    pageSize?: number
  }): Promise<Session[]> => {
    try {
      const { data } = await api.get<PaginatedResponse<Session>>('/sessoes', { params: { ...filters, pageSize: filters?.pageSize || 100 } })
      return data?.data || [] // Retorna apenas o array ou array vazio se undefined
    } catch (error) {
      console.error('Error fetching sessions:', error)
      return [] // Retorna array vazio em caso de erro
    }
  },

  getById: async (id: string): Promise<Session> => {
    const { data } = await api.get<Session>(`/sessoes/${id}`)
    return data
  },

  create: async (sessionData: CreateSessionRequest): Promise<Session> => {
    const { data } = await api.post<Session>('/sessoes', sessionData)
    return data
  },

  update: async (id: string, sessionData: UpdateSessionRequest): Promise<Session> => {
    const { data } = await api.put<Session>(`/sessoes/${id}`, sessionData)
    return data
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/sessoes/${id}`)
  },
}
