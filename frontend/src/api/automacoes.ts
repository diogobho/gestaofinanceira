import api from './client'

export type TipoAcao =
  | 'envio_mensagem_grupo'
  | 'followup'
  | 'ativar_agente_estagio'
  | 'ativar_agente_lead'
  | 'disparo_lote'

export type ContextoTipo = 'grupo_whatsapp' | 'funil' | 'estagio' | 'lead'

export interface Automacao {
  id: number
  empresa_id: number
  usuario_id: number
  nome: string
  descricao: string | null
  tipo_acao: TipoAcao
  grupo_whatsapp_id: string | null
  funil_id: number | null
  estagio_id: number | null
  lead_id: number | null
  ativa: boolean
  config: Record<string, any>
  total_execucoes: number
  ultima_execucao_at: string | null
  automacao_grupo_id: number | null
  created_at: string
  updated_at: string

  funil_nome: string | null
  funil_tipo: string | null
  estagio_nome: string | null
  estagio_cor: string | null
  lead_nome: string | null
  contexto_tipo: ContextoTipo | null
}

export interface ListFilters {
  tipo_acao?: TipoAcao
  contexto_tipo?: ContextoTipo
  funil_id?: number
  funil_tipo?: 'aquisicao' | 'cx'
  estagio_id?: number
  lead_id?: number
  grupo_whatsapp_id?: string
  ativa?: boolean
}

export interface CreateAutomacaoInput {
  nome: string
  descricao?: string
  tipo_acao: TipoAcao
  grupo_whatsapp_id?: string | null
  funil_id?: number | null
  estagio_id?: number | null
  lead_id?: number | null
  ativa?: boolean
  config?: Record<string, any>
}

export interface UpdateAutomacaoInput {
  nome?: string
  descricao?: string
  ativa?: boolean
  config?: Record<string, any>
}

export interface AutomacaoExecucao {
  id: number
  lead_id: number | null
  alvo_externo: string | null
  status: 'sucesso' | 'falhou' | 'pendente' | 'cancelado'
  erro: string | null
  dados: Record<string, any> | null
  executada_at: string
}

interface ListResponse {
  success: boolean
  data: Automacao[]
  limite_por_grupo: number
}

interface SingleResponse {
  success: boolean
  data: Automacao
}

interface ExecucoesResponse {
  success: boolean
  data: AutomacaoExecucao[]
}

interface StatsResponse {
  success: boolean
  data: {
    tipo_acao: TipoAcao
    contexto_tipo: ContextoTipo
    ativas: string
    pausadas: string
    total: string
  }[]
}

export const automacoesApi = {
  async list(filtros: ListFilters = {}): Promise<ListResponse> {
    const res = await api.get<ListResponse>('/automacoes', { params: filtros })
    return res.data
  },

  async stats() {
    const res = await api.get<StatsResponse>('/automacoes/stats')
    return res.data.data
  },

  async getById(id: number): Promise<Automacao> {
    const res = await api.get<SingleResponse>(`/automacoes/${id}`)
    return res.data.data
  },

  async listExecucoes(id: number, limit = 50): Promise<AutomacaoExecucao[]> {
    const res = await api.get<ExecucoesResponse>(`/automacoes/${id}/execucoes`, { params: { limit } })
    return res.data.data
  },

  async create(input: CreateAutomacaoInput): Promise<Automacao> {
    const res = await api.post<SingleResponse>('/automacoes', input)
    return res.data.data
  },

  async update(id: number, input: UpdateAutomacaoInput): Promise<Automacao> {
    const res = await api.put<SingleResponse>(`/automacoes/${id}`, input)
    return res.data.data
  },

  async toggle(id: number): Promise<Automacao> {
    const res = await api.patch<SingleResponse>(`/automacoes/${id}/toggle`)
    return res.data.data
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/automacoes/${id}`)
  }
}

export const TIPO_ACAO_LABEL: Record<TipoAcao, string> = {
  envio_mensagem_grupo:    'Mensagem em grupo WhatsApp',
  followup:                'Follow-up automático',
  ativar_agente_estagio:   'Agente IA por estágio',
  ativar_agente_lead:      'Agente IA por lead',
  disparo_lote:            'Disparo em massa'
}
