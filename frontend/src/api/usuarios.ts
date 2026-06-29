import api from './client'
import type { User, CreateUserRequest, UpdateUserRequest, UserPermissoes } from '@/types'

interface Empresa {
  id: number
  nome: string
  slug: string
  ativo: boolean
}

export interface UsuarioEmpresa {
  id: number
  nome: string
  email: string
  empresa_id: number
  tipo_usuario: 'master' | 'comum'
  ativo: boolean
}

export const usuariosApi = {
  list: async (): Promise<User[]> => {
    try {
      const { data } = await api.get<User[]>('/usuarios', { params: { pageSize: 100 } })
      return Array.isArray(data) ? data : []
    } catch (error) {
      console.error('Error fetching users:', error)
      return []
    }
  },

  getById: async (id: string): Promise<User> => {
    const { data } = await api.get<User>(`/usuarios/${id}`)
    return data
  },

  create: async (userData: CreateUserRequest): Promise<User> => {
    const { data } = await api.post<User>('/usuarios', userData)
    return data
  },

  update: async (id: string, userData: UpdateUserRequest): Promise<User> => {
    const { data } = await api.put<User>(`/usuarios/${id}`, userData)
    return data
  },

  updatePermissoes: async (id: string, permissoes: UserPermissoes): Promise<User> => {
    const { data } = await api.put<User>(`/usuarios/${id}/permissoes`, { permissoes })
    return data
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/usuarios/${id}`)
  },

  listByEmpresa: async (): Promise<UsuarioEmpresa[]> => {
    try {
      const { data } = await api.get<UsuarioEmpresa[]>('/usuarios/empresa')
      return Array.isArray(data) ? data : []
    } catch (error) {
      console.error('Error fetching usuarios da empresa:', error)
      return []
    }
  },

  listEmpresas: async (): Promise<Empresa[]> => {
    try {
      const { data } = await api.get<Empresa[]>('/usuarios/empresas')
      return Array.isArray(data) ? data : []
    } catch (error) {
      console.error('Error fetching empresas:', error)
      return []
    }
  },

  createEmpresa: async (payload: { nome: string }): Promise<Empresa> => {
    const { data } = await api.post<Empresa>('/usuarios/empresas', payload)
    return data
  },
}
