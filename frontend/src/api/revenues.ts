import api from './client'
import type { Revenue, CreateRevenueRequest, UpdateRevenueRequest } from '@/types'

interface PaginatedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export const revenuesApi = {
  list: async (filters?: {
    cliente_id?: string
    data_ini?: string
    data_fim?: string
    status?: string
    fonte?: string
    tipo_pagamento?: string
    valor_min?: number
    valor_max?: number
    page?: number
    pageSize?: number
  }): Promise<Revenue[]> => {
    try {
      const { data } = await api.get<PaginatedResponse<Revenue>>('/receitas', { params: { ...filters, pageSize: filters?.pageSize || 100 } })
      return data?.data || [] // Retorna apenas o array ou array vazio se undefined
    } catch (error) {
      console.error('Error fetching revenues:', error)
      return [] // Retorna array vazio em caso de erro
    }
  },

  getById: async (id: string): Promise<Revenue> => {
    const { data } = await api.get<Revenue>(`/receitas/${id}`)
    return data
  },

  create: async (revenueData: CreateRevenueRequest): Promise<Revenue> => {
    const { data } = await api.post<Revenue>('/receitas', revenueData)
    return data
  },

  update: async (id: string, revenueData: UpdateRevenueRequest): Promise<Revenue> => {
    const { data } = await api.put<Revenue>(`/receitas/${id}`, revenueData)
    return data
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/receitas/${id}`)
  },

  // NOVO: Listar receitas sem cliente vinculado
  listSemCliente: async (): Promise<Revenue[]> => {
    try {
      const { data } = await api.get<Revenue[]>('/receitas/sem-cliente/list')
      return data || []
    } catch (error) {
      console.error('Error fetching revenues sem cliente:', error)
      return []
    }
  },

  // NOVO: Vincular cliente a receita
  vincularCliente: async (receitaId: string, clienteId: number): Promise<Revenue> => {
    const { data } = await api.patch<Revenue>(`/receitas/${receitaId}/vincular-cliente`, {
      cliente_id: clienteId
    })
    return data
  },
}
