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
