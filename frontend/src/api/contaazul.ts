import api from './client'

export type TipoEvento = 'receber' | 'pagar'

/** Lançamento já normalizado pelo backend (contas a pagar/receber do Conta Azul). */
export interface EventoFinanceiro {
  id: string
  /** Conexão (produto) de origem — a Panteras tem duas contas do Conta Azul. */
  conexao_id: number
  conexao_nome: string
  tipo: TipoEvento
  descricao: string
  /** ACQUITTED | PENDING | OVERDUE | PARTIAL | LOST */
  status: string
  status_label: string
  vencimento: string
  competencia: string | null
  total: number
  pago: number
  aberto: number
  categoria: string
  centro_custo: string
  parte: string
  parte_id: string | null
  /** > 0 apenas quando ainda há saldo em aberto e o vencimento já passou */
  dias_atraso: number
}

export interface TotaisContaAzul {
  pago: number
  vencido: number
  vence_hoje: number
  pendente: number
  aberto: number
  todos: number
}

export interface TotaisPorTipo {
  receber: TotaisContaAzul
  pagar: TotaisContaAzul
}

/** Uma conta do Conta Azul dentro do consolidado. */
export interface ResumoConexao {
  id: number
  nome: string
  itens: number
  totais_api: TotaisPorTipo
  /** Preenchido quando ESTA conta falhou — as outras continuam no consolidado. */
  erro: string | null
}

export interface DadosContaAzul {
  periodo: { de: string; ate: string }
  gerado_em: string
  /** hoje em São Paulo, calculado no servidor — não confiar no relógio do navegador */
  hoje: string
  itens: EventoFinanceiro[]
  /** Soma das contas que responderam. */
  totais_api: TotaisPorTipo
  conexoes: ResumoConexao[]
}

export interface AcessoContaAzul {
  liberado: boolean
  empresa_id: number
  integracao: { configurado: boolean; autorizado: boolean } | null
  conexoes: Array<{ id: number; nome: string; ativo: boolean; autorizado: boolean }>
}

export const contaazulApi = {
  /**
   * 403 aqui significa "usuário não pode ver a aba" — o chamador trata como
   * negado, e por isso a chamada é silenciosa: é sondagem, não erro do usuário.
   */
  async acesso(): Promise<AcessoContaAzul> {
    const { data } = await api.get<AcessoContaAzul>('/contaazul/dashboard/acesso', {
      silenciarErro: true,
    } as any)
    return data
  },

  async dados(dataDe: string, dataAte: string, forcar = false): Promise<DadosContaAzul> {
    const params = new URLSearchParams({ data_de: dataDe, data_ate: dataAte })
    if (forcar) params.append('forcar', '1')
    const { data } = await api.get<DadosContaAzul>(`/contaazul/dashboard/dados?${params}`)
    return data
  },
}
