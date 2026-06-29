import api from './client'
import type {
  ParcelaReceita,
  ParcelaDespesa,
  UpdateParcelaReceitaRequest,
  UpdateParcelaDespesaRequest
} from '@/types'

export const parcelasApi = {
  getParcelasReceitas: async (filters?: {
    status?: string
    cliente_id?: number
    data_ini?: string
    data_fim?: string
  }): Promise<ParcelaReceita[]> => {
    try {
      const { data } = await api.get<ParcelaReceita[]>('/parcelas/receitas', { params: filters })
      return data || []
    } catch (error) {
      console.error('Error fetching parcelas receitas:', error)
      return []
    }
  },

  getParcelasDespesas: async (filters?: {
    status?: string
    data_ini?: string
    data_fim?: string
  }): Promise<ParcelaDespesa[]> => {
    try {
      const { data } = await api.get<ParcelaDespesa[]>('/parcelas/despesas', { params: filters })
      return data || []
    } catch (error) {
      console.error('Error fetching parcelas despesas:', error)
      return []
    }
  },

  updateParcelaReceita: async (id: string, data: UpdateParcelaReceitaRequest): Promise<ParcelaReceita> => {
    const { data: result } = await api.patch<ParcelaReceita>(`/parcelas/receitas/${id}`, data)
    return result
  },

  updateParcelaDespesa: async (id: string, data: UpdateParcelaDespesaRequest): Promise<ParcelaDespesa> => {
    const { data: result } = await api.patch<ParcelaDespesa>(`/parcelas/despesas/${id}`, data)
    return result
  },

  enviarEmailsCobranca: async (parcelaIds: string[]): Promise<{
    totalProcessado: number
    totalEnviados: number
    totalErros: number
    totalJaEnviados: number
    detalhes: {
      enviados: any[]
      erros: any[]
      jaEnviados: any[]
    }
  }> => {
    const { data } = await api.post('/parcelas/enviar-emails-cobranca', { parcela_ids: parcelaIds })
    return data
  },

  enviarWhatsAppCobranca: async (parcelaIds: string[]): Promise<{
    totalProcessado: number
    totalEnviados: number
    totalErros: number
    totalJaEnviados: number
    detalhes: {
      enviados: any[]
      erros: any[]
      jaEnviados: any[]
    }
  }> => {
    const { data } = await api.post('/parcelas/enviar-whatsapp-cobranca', { parcela_ids: parcelaIds })
    return data
  },
}
