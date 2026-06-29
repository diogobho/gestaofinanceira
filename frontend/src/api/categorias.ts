import api from './client'
import type {
  CategoriaReceita,
  CategoriaDespesa,
  CreateCategoriaRequest,
  UpdateCategoriaRequest
} from '@/types'

// ============================================================================
// API CLIENT - CATEGORIAS RECEITAS
// ============================================================================

export const categoriasReceitasApi = {
  list: async (): Promise<CategoriaReceita[]> => {
    try {
      const { data } = await api.get<CategoriaReceita[]>('/categorias/receitas')
      return data || []
    } catch (error) {
      console.error('Error fetching categorias receitas:', error)
      return []
    }
  },

  getById: async (id: number): Promise<CategoriaReceita> => {
    const { data } = await api.get<CategoriaReceita>(`/categorias/receitas/${id}`)
    return data
  },

  create: async (categoriaData: CreateCategoriaRequest): Promise<CategoriaReceita> => {
    const { data } = await api.post<CategoriaReceita>('/categorias/receitas', categoriaData)
    return data
  },

  update: async (id: number, categoriaData: UpdateCategoriaRequest): Promise<CategoriaReceita> => {
    const { data } = await api.put<CategoriaReceita>(`/categorias/receitas/${id}`, categoriaData)
    return data
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/categorias/receitas/${id}`)
  },
}

// ============================================================================
// API CLIENT - CATEGORIAS DESPESAS
// ============================================================================

export const categoriasDespesasApi = {
  list: async (): Promise<CategoriaDespesa[]> => {
    try {
      const { data } = await api.get<CategoriaDespesa[]>('/categorias/despesas')
      return data || []
    } catch (error) {
      console.error('Error fetching categorias despesas:', error)
      return []
    }
  },

  getById: async (id: number): Promise<CategoriaDespesa> => {
    const { data } = await api.get<CategoriaDespesa>(`/categorias/despesas/${id}`)
    return data
  },

  create: async (categoriaData: CreateCategoriaRequest): Promise<CategoriaDespesa> => {
    const { data } = await api.post<CategoriaDespesa>('/categorias/despesas', categoriaData)
    return data
  },

  update: async (id: number, categoriaData: UpdateCategoriaRequest): Promise<CategoriaDespesa> => {
    const { data } = await api.put<CategoriaDespesa>(`/categorias/despesas/${id}`, categoriaData)
    return data
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/categorias/despesas/${id}`)
  },
}
