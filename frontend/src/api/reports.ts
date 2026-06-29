import api from './client'
import type { DashboardData } from '@/types'

export interface RelatorioKPIs {
  receita_total: number
  receita_paga: number
  receita_pendente: number
  despesa_total: number
  despesa_paga: number
  despesa_pendente: number
  lucro_liquido: number
  clientes_ativos: number
  roi: number
}

export interface ProjecaoMensal {
  mes: string
  receitas: number
  despesas: number
  saldo: number
}

export interface RelatorioProjecoes {
  valores_a_receber: {
    total_pendente: number
    quantidade_total: number
    parcelas_futuras: number
    quantidade_futuras: number
  }
  valores_a_pagar: {
    total_pendente: number
    quantidade_total: number
    parcelas_futuras: number
    quantidade_futuras: number
  }
  projecao_mensal: ProjecaoMensal[]
}

export const reportsApi = {
  getDashboard: async (filters?: {
    data_inicio?: string
    data_fim?: string
    mentor_id?: string
  }): Promise<DashboardData> => {
    const { data } = await api.get<DashboardData>('/relatorios/dashboard', { params: filters })
    return data
  },

  getKPIs: async (filters?: { data_ini?: string; data_fim?: string }): Promise<RelatorioKPIs> => {
    const { data } = await api.get<RelatorioKPIs>('/relatorios/kpis', { params: filters })
    return data
  },

  getProjecoes: async (filters?: { data_ini?: string; data_fim?: string }): Promise<RelatorioProjecoes> => {
    const { data } = await api.get<RelatorioProjecoes>('/relatorios/projecoes', { params: filters })
    return data
  },
}
