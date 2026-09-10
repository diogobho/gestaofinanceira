import api from './client'

export interface MetaConfig {
  configurado: boolean
  /** Variáveis do .env que faltam — a tela nomeia cada uma. */
  faltando: string[]
  phoneNumberId: string | null
  wabaId: string | null
}

export interface MetaNumero {
  id: string
  display_phone_number: string
  verified_name: string
  quality_rating?: string
  code_verification_status?: string
  platform_type?: string
  throughput?: { level?: string }
}

export interface MetaStatus {
  config: MetaConfig
  numero: MetaNumero | null
  /** Configurado, porém a Meta recusou — caso diferente de "falta credencial". */
  erro: string | null
}

export interface MetaTemplate {
  id: string
  name: string
  status: string
  category: string
  language: string
  rejected_reason?: string
  components?: any[]
}

export interface NovoTemplate {
  nome: string
  categoria: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'
  idioma: string
  corpo: string
  exemplos: string[]
}

export const metaWhatsappApi = {
  getStatus: async (): Promise<MetaStatus> => {
    const { data } = await api.get('/whatsapp/meta/status')
    return data
  },

  enviarTexto: async (numero: string, texto: string) => {
    const { data } = await api.post('/whatsapp/meta/enviar', { numero, texto })
    return data as { success: boolean; messageId: string | null; destino: string | null }
  },

  getTemplates: async (): Promise<MetaTemplate[]> => {
    const { data } = await api.get('/whatsapp/meta/templates')
    return data.templates ?? []
  },

  criarTemplate: async (novo: NovoTemplate) => {
    const { data } = await api.post('/whatsapp/meta/templates', novo)
    return data as { success: boolean; id?: string; status?: string }
  },
}
