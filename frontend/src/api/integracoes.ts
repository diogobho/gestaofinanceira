import api from './client'

/** Um toque de integração num card — o bloco que ela escreveu nas notas. */
export interface ToqueIntegracao {
  integracao: string
  /** `dd/mm/yyyy, hh:mm:ss` (São Paulo). null quando o bloco nasceu com o lead. */
  carimbo: string | null
  titulo: string
}

export interface LeadIntegracao {
  id: number
  nome: string
  telefone: string | null
  email: string | null
  empresa: string | null
  origem: string | null
  /** Integração do primeiro toque — quem trouxe o lead. */
  integracao: string | null
  /** Toda integração que tocou o card. É por aqui que o filtro casa. */
  integracoes: string[]
  toques: ToqueIntegracao[]
  funil_id: number | null
  funil_nome: string | null
  estagio_id: number | null
  estagio_nome: string | null
  estagio_cor: string | null
  ganho: boolean
  perdido: boolean
  responsavel_id: number | null
  responsavel_nome: string | null
  temperatura: string | null
  valor_potencial: number
  arquivado: boolean
  criado_em: string
  /** Dia em São Paulo — `created_at` é gravado em UTC. */
  criado_em_dia: string
  /** `caixa_rapido.faturamento_hoje` → ['R$ 5k - R$ 10k'] */
  campos: Record<string, string[]>
}

export interface DefinicaoIntegracao {
  id: string
  nome: string
  descricao: string
  entrada: string
  canal: 'webhook' | 'banco' | 'interno'
  origens: string[]
}

export interface CampoDisponivel {
  chave: string
  rotulo: string
  integracao: string
  leads: number
  valores: number
}

export interface DadosIntegracoes {
  gerado_em: string
  /** Hoje em São Paulo, do servidor. */
  hoje: string
  catalogo: DefinicaoIntegracao[]
  campos_disponiveis: CampoDisponivel[]
  leads: LeadIntegracao[]
  truncado: boolean
}

export const integracoesApi = {
  async dashboard(): Promise<DadosIntegracoes> {
    const { data } = await api.get<DadosIntegracoes>('/crm/integracoes/dashboard')
    return data
  },
}
