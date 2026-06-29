import api from './client'
import type { Expense, CreateExpenseRequest, UpdateExpenseRequest } from '@/types'

interface PaginatedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export const expensesApi = {
  list: async (filters?: {
    data_ini?: string
    data_fim?: string
    status?: string
    categoria?: string
    tipo?: string
    page?: number
    pageSize?: number
  }): Promise<Expense[]> => {
    try {
      const { data } = await api.get<PaginatedResponse<Expense>>('/despesas', { params: { ...filters, pageSize: filters?.pageSize || 100 } })
      return data?.data || [] // Retorna apenas o array ou array vazio se undefined
    } catch (error) {
      console.error('Error fetching expenses:', error)
      return [] // Retorna array vazio em caso de erro
    }
  },

  getById: async (id: string): Promise<Expense> => {
    const { data } = await api.get<Expense>(`/despesas/${id}`)
    return data
  },

  create: async (expenseData: CreateExpenseRequest): Promise<Expense> => {
    const { data } = await api.post<Expense>('/despesas', expenseData)
    return data
  },

  update: async (id: string, expenseData: UpdateExpenseRequest): Promise<Expense> => {
    const { data } = await api.put<Expense>(`/despesas/${id}`, expenseData)
    return data
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/despesas/${id}`)
  },
}
