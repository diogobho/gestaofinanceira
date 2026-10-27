import api from './client'

/**
 * Boas-vindas de conta nova — o que cada conta recebeu e o que a equipe pode
 * editar. Tudo aqui é da DuoFuturo: o backend só responde a `super_admin`.
 */

export interface EnvioOnboarding {
  id: number
  empresa_id: number
  empresa_atual: string | null
  usuario_id: number | null
  plano_id: number | null
  plano_nome: string | null
  assinatura_status: string | null
  nome_usuario: string
  nome_empresa: string
  email: string
  telefone: string | null
  codigo: string
  email_status: 'pendente' | 'enviado' | 'falhou'
  email_erro: string | null
  email_em: string | null
  whatsapp_optin: boolean
  optin_em: string | null
  whatsapp_status: 'nao_solicitado' | 'aguardando_contato' | 'contato_recebido' | 'enviado' | 'falhou'
  whatsapp_erro: string | null
  contato_em: string | null
  whatsapp_em: string | null
  criado_at: string
}

export interface ResumoOnboarding {
  total: number
  email_ok: number
  email_falhou: number
  optin: number
  whatsapp_ok: number
  whatsapp_falhou: number
}

export interface MensagemOnboarding {
  id: number
  message_id: string
  de_numero: string
  tipo: string | null
  texto: string | null
  envio_id: number | null
  nome_empresa: string | null
  codigo: string | null
  desfecho: string | null
  recebida_em: string
}

export interface ModeloOnboarding {
  plano_id: number
  plano_nome: string
  slug: 'starter' | 'profissional' | 'enterprise'
  email_assunto: string
  email_corpo: string
  whatsapp_texto: string
  pdf_arquivo: string
  updated_at?: string
}

export interface FiltrosOnboarding {
  data_inicio?: string
  data_fim?: string
  plano_id?: number
  status?: string
  busca?: string
}

export const onboardingApi = {
  getEnvios: async (filtros: FiltrosOnboarding = {}): Promise<{ envios: EnvioOnboarding[]; resumo: ResumoOnboarding }> => {
    const { data } = await api.get('/onboarding/envios', { params: filtros })
    return data
  },

  getMensagens: async (): Promise<MensagemOnboarding[]> => {
    const { data } = await api.get('/onboarding/mensagens')
    return data
  },

  reenviarEmail: async (id: number): Promise<{ success: boolean }> => {
    const { data } = await api.post(`/onboarding/envios/${id}/reenviar-email`)
    return data
  },

  enviarWhatsApp: async (id: number): Promise<{ success: boolean; desfecho: string }> => {
    const { data } = await api.post(`/onboarding/envios/${id}/enviar-whatsapp`)
    return data
  },

  getModelos: async (): Promise<ModeloOnboarding[]> => {
    const { data } = await api.get('/onboarding/modelos')
    return data
  },

  salvarModelo: async (planoId: number, corpo: Partial<ModeloOnboarding>): Promise<ModeloOnboarding> => {
    const { data } = await api.put(`/onboarding/modelos/${planoId}`, corpo)
    return data
  },

  previa: async (planoId: number, trial = true): Promise<{ assunto: string; html: string; anexo: string | null }> => {
    const { data } = await api.post(`/onboarding/modelos/${planoId}/previa`, { trial })
    return data
  },

  enviarTeste: async (planoId: number, email: string, trial = true): Promise<{ success: boolean; to: string }> => {
    const { data } = await api.post(`/onboarding/modelos/${planoId}/teste`, { email, trial })
    return data
  },
}
