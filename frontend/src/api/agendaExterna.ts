import api from './client'

/** Agenda externa (migration 103): reuniões do CRM no Google Agenda ou no Microsoft 365. */
export type ProvedorAgenda = 'google' | 'microsoft'

export interface StatusAgenda {
  provedores: { provedor: ProvedorAgenda; configurado: boolean }[]
  conta: { provedor: ProvedorAgenda; email: string | null; erro: string | null; conectado_em: string } | null
}

export const agendaExternaApi = {
  status: () => api.get<StatusAgenda>('/agenda-externa/status').then(r => r.data),
  conectar: (p: ProvedorAgenda) => api.post<{ url: string }>(`/agenda-externa/conectar/${p}`).then(r => r.data),
  desconectar: () => api.delete('/agenda-externa/conta').then(r => r.data),
}
