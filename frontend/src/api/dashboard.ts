import api from './client'

export interface DashboardData {
  receitas: {
    realizadas: number
    previstas: number
    total: number
    quantidade: number
  }
  despesas: {
    realizadas: number
    previstas: number
    total: number
    quantidade: number
  }
  lucro: {
    realizado: number
    previsto: number
    total: number
  }
  periodo: {
    data_ini: string | null
    data_fim: string | null
  }
}

export interface DashboardFilters {
  data_ini?: string
  data_fim?: string
}

export const dashboardApi = {
  async getData(filters?: DashboardFilters): Promise<DashboardData> {
    const params = new URLSearchParams()

    if (filters?.data_ini) {
      params.append('data_ini', filters.data_ini)
    }
    if (filters?.data_fim) {
      params.append('data_fim', filters.data_fim)
    }

    const queryString = params.toString()
    const url = queryString ? `/dashboard?${queryString}` : '/dashboard'

    const { data } = await api.get<DashboardData>(url)
    return data
  }
}
