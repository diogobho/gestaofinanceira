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

/** Número oficial ligado (ou cadastrado) numa empresa — migration 074. */
export interface ContaOficial {
  id: number
  empresa_id: number
  empresa_nome: string
  /** Dono do número. null = número da empresa inteira. */
  usuario_id: number | null
  usuario_nome?: string | null
  /** 'manual' (cadastrado por nós) ou 'embedded_signup' (o cliente autorizou). */
  origem?: string
  phone_number_id: string
  waba_id: string
  numero: string | null
  nome_exibicao: string | null
  porta_virtual: number
  /** '(próprio)' quando a conta tem token só dela; null = token global do .env. */
  token_enc: string | null
  ativo: boolean
  portas_anteriores: Record<string, number | null>
  ativado_em: string | null
}

export interface PerfilComercial {
  about?: string
  address?: string
  description?: string
  email?: string
  profile_picture_url?: string
  websites?: string[]
  vertical?: string
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

  // ── Número oficial por empresa e perfil (só super_admin) ──
  getContas: async (): Promise<ContaOficial[]> => (await api.get('/whatsapp/meta/contas')).data.contas ?? [],

  salvarConta: async (dados: { empresa_id: number; phone_number_id?: string; waba_id?: string }) =>
    (await api.post('/whatsapp/meta/contas', dados)).data,

  // Por id da CONTA, não da empresa: desde a 084 uma empresa pode ter vários
  // números oficiais (um por operador), e o id da empresa deixou de identificar um.
  ligarConta: async (contaId: number) => (await api.post(`/whatsapp/meta/contas/${contaId}/ligar`)).data,

  desligarConta: async (contaId: number) => (await api.post(`/whatsapp/meta/contas/${contaId}/desligar`)).data,

  /** Sem empresa, vale o número do .env (o nosso). */
  getPerfil: async (empresaId?: number): Promise<PerfilComercial> =>
    (await api.get('/whatsapp/meta/perfil', { params: empresaId ? { empresa_id: empresaId } : {} })).data.perfil ?? {},

  salvarPerfil: async (campos: Omit<PerfilComercial, 'profile_picture_url'>, empresaId?: number) =>
    (await api.put('/whatsapp/meta/perfil', { ...campos, ...(empresaId ? { empresa_id: empresaId } : {}) })).data,

  trocarFoto: async (arquivo: File, empresaId?: number) => {
    const form = new FormData()
    form.append('foto', arquivo)
    if (empresaId) form.append('empresa_id', String(empresaId))
    return (await api.post('/whatsapp/meta/perfil/foto', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data
  },
}
