import api from './client'

/** Monitoramento de sites (migration 102) — só a conta master@gestao.com. */
export const EMAILS_MONITOR = ['master@gestao.com']

export interface MonitorSite {
  id: number
  nome: string
  url: string
  textos_fechado: string[]
  destino: string
  remetente_id: number
  intervalo_min: number
  avisar_fechamento: boolean
  ativo: boolean
  estado: 'aberto' | 'fechado' | null
  estado_desde: string | null
  ultimo_check_at: string | null
  ultimo_erro: string | null
  erros_seguidos: number
  ultimo_aviso_at: string | null
  ultimo_aviso_erro: string | null
}

export interface EntradaMonitor {
  nome: string
  url: string
  textos_fechado: string[]
  destino: string
  intervalo_min: number
  avisar_fechamento: boolean
  ativo: boolean
}

export const monitorSitesApi = {
  listar: () => api.get<MonitorSite[]>('/monitor-sites').then(r => r.data),
  criar: (d: EntradaMonitor) => api.post<MonitorSite>('/monitor-sites', d).then(r => r.data),
  atualizar: (id: number, d: EntradaMonitor) => api.put<MonitorSite>(`/monitor-sites/${id}`, d).then(r => r.data),
  excluir: (id: number) => api.delete(`/monitor-sites/${id}`).then(r => r.data),
  verificar: (id: number) => api.post<{ estado: string | null; erro?: string; achado?: string | null }>(`/monitor-sites/${id}/verificar`).then(r => r.data),
  testarAviso: (id: number) => api.post(`/monitor-sites/${id}/testar-aviso`).then(r => r.data),
}
