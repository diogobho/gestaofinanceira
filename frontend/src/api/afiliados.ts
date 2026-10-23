import api from './client'

export interface PainelAfiliado {
  pode_indicar: boolean
  link: string | null
  codigo: string | null
  /** Valor de cada recompensa (R$ 20 por indicada que assina). */
  recompensa: number
  /** Só assinatura recorrente tem "próxima cobrança" para abater. */
  pode_abater: boolean
  disponivel: number
  em_credito: number
  a_abater: number
  abatido: number
  indicadas: {
    nome: string
    created_at: string
    situacao: string
    recompensa_id: number | null
    valor: number | null
    recompensa_status: 'disponivel' | 'credito_duo' | 'desconto_pendente' | 'descontado' | 'cancelada' | null
  }[]
}

export const afiliadosApi = {
  meu: (): Promise<PainelAfiliado> => api.get('/afiliados/meu').then(r => r.data),
  escolher: (id: number, destino: 'credito_duo' | 'desconto') =>
    api.post(`/afiliados/recompensas/${id}/escolher`, { destino }).then(r => r.data),
}
