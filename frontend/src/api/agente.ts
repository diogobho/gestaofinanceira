import api from './client'

export const agenteApi = {
  enviarMensagem: (mensagem: string) =>
    api.post('/chat-financeiro/mensagem', { mensagem }).then(r => r.data),

  getHistorico: (limite?: number) =>
    api.get('/chat-financeiro/historico', { params: { limite } }).then(r => r.data),

  limparHistorico: () =>
    api.delete('/chat-financeiro/historico').then(r => r.data),

  getConfig: () =>
    api.get('/chat-financeiro/config').then(r => r.data),

  updateConfig: (data: {
    ativo?: boolean
    max_tokens?: number
    contexto_mensagens?: number
  }) => api.put('/chat-financeiro/config', data).then(r => r.data),
}

// Crédito do Duo (111): saldo, recarga pelo Asaas e extrato.
export interface CreditosDuo {
  saldo: number
  sem_cobranca: boolean
  pode_comprar: boolean
  pacotes: number[]
  compras: { id: number; valor: number; status: 'pendente' | 'paga' | 'cancelada'; invoice_url: string | null; created_at: string; paga_at: string | null }[]
  extrato: { dia: string; tipo: 'teste' | 'compra' | 'consumo' | 'ajuste' | 'indicacao'; valor: number; qtd: number }[]
}

export const creditosDuoApi = {
  get: (): Promise<CreditosDuo> => api.get('/chat-financeiro/creditos').then(r => r.data),
  comprar: (valor: number, cpf_cnpj?: string): Promise<{ compra_id: number; invoice_url: string }> =>
    api.post('/chat-financeiro/creditos/comprar', { valor, cpf_cnpj }).then(r => r.data),
}

// Conector MCP (112): endereço para colar no Claude e as conexões autorizadas.
export interface ConexoesMcp {
  url: string
  conexoes: { id: number; aplicativo: string; created_at: string; ultimo_uso_em: string | null }[]
}

export const mcpApi = {
  get: (): Promise<ConexoesMcp> => api.get('/mcp-conexoes').then(r => r.data),
  revogar: (id: number) => api.delete(`/mcp-conexoes/${id}`).then(r => r.data),
}
