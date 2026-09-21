import api from './client'
import type { LoginRequest, LoginResponse, User } from '@/types'

export const authApi = {
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    const { data } = await api.post<LoginResponse>('/auth/login', credentials)
    return data
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout')
  },

  me: async (): Promise<User> => {
    const { data } = await api.get<User>('/auth/me')
    return data
  },

  updatePerfil: async (payload: { nome?: string; email?: string; foto_perfil?: string | null; assinatura_email?: string | null }): Promise<User> => {
    const { data } = await api.put<User>('/auth/perfil', payload)
    return data
  },

  updateSenha: async (payload: { senhaAtual: string; novaSenha: string }): Promise<void> => {
    await api.put('/auth/senha', payload)
  },

  registrar: async (payload: {
    nome_empresa: string;
    nome_usuario: string;
    email: string;
    senha: string;
    plano_id: number;
    billing_type: 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'TRIAL';
    cpf_cnpj?: string;
    /** WhatsApp de contato da conta; o material só sai por ele com opt-in. */
    telefone?: string;
    /** Compromisso de fidelidade escolhido. */
    ciclo?: string;
    aceite_termos: boolean;
    /** Opt-in (LGPD) para receber o material de boas-vindas pelo WhatsApp. */
    whatsapp_optin?: boolean;
  }): Promise<{
    token: string;
    user: any;
    paymentUrl?: string;
    pixQrCode?: string;
    /** Link `wa.me` pronto — só vem quando houve opt-in. */
    whatsappUrl?: string;
  }> => {
    const { data } = await api.post('/auth/registrar', payload)
    return data
  },
}
