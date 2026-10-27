import api from './client'

/** Receitas do Asaas (migration 105): cada cobrança da conta do Asaas da empresa vira receita. */
export interface StatusAsaas {
  conectado: boolean
  conta_nome?: string | null
  conta_cnpj?: string | null
  importar_desde?: string
  ultima_sync_em?: string | null
  webhook_ativo?: boolean
  erro?: string | null
  receitas?: number
  receitas_pagas?: number
  valor_pago?: number
}

export const asaasReceitasApi = {
  status: () => api.get<StatusAsaas>('/asaas-receitas/status').then(r => r.data),
  conectar: (api_key: string, importar_desde: string) =>
    api.post<StatusAsaas>('/asaas-receitas/conectar', { api_key, importar_desde }).then(r => r.data),
  sincronizar: () => api.post('/asaas-receitas/sincronizar').then(r => r.data),
  desconectar: () => api.delete('/asaas-receitas/conexao').then(r => r.data),
}
