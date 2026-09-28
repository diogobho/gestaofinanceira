import api from './client'

/** Página de Grupos (migration 088). Só QR Code — ver `grupos.service.ts` na API. */

export interface CanalGrupos {
  provedor: 'baileys' | 'cloud_api' | null
  conectado: boolean
  numero?: string | null
  aviso?: string
}

export interface GrupoWhatsApp {
  id: string
  nome: string
  participantes: number
  soAdminsEnviam: boolean
  souAdmin: boolean
  descricao: string | null
}

export type ModoEnvio = 'agora' | 'agendada' | 'recorrente'

export interface MensagemGrupo {
  id: number
  usuario_id: number
  usuario_nome: string
  titulo: string
  texto: string
  media_url: string | null
  media_mimetype: string | null
  media_filename: string | null
  mencionar_todos: boolean
  grupos: { id: string; nome?: string }[]
  modo: ModoEnvio
  agendado_para: string | null
  recorrencia: { dias: number[]; hora: string } | null
  proxima_execucao: string | null
  ultima_execucao: string | null
  ativa: boolean
  intervalo_segundos: number
  total_enviados: number
  total_falhas: number
}

export type EntradaMensagemGrupo = Pick<
  MensagemGrupo,
  'titulo' | 'texto' | 'media_url' | 'media_mimetype' | 'media_filename' | 'mencionar_todos' | 'grupos' | 'modo' | 'recorrencia' | 'intervalo_segundos'
> & { agendado_para?: string | null }

export interface EnvioGrupo {
  grupo_id: string
  grupo_nome: string | null
  execucao_em: string
  status: 'enviado' | 'falhou'
  erro: string | null
  enviado_at: string
}

export interface BoasVindas {
  id: number
  usuario_id: number
  usuario_nome: string
  grupo_whatsapp_id: string
  grupo_nome: string | null
  mensagem: string
  ativa: boolean
  delay_segundos: number
  mencionar: boolean
  total_disparos: number
  ultimo_disparo_at: string | null
}

export interface EntradaBoasVindas {
  grupo_id?: string
  grupo_nome?: string
  mensagem: string
  delay_segundos: number
  mencionar: boolean
  ativa: boolean
}

export const gruposApi = {
  canal: () => api.get<CanalGrupos>('/grupos/canal').then(r => r.data),
  lista: () => api.get<GrupoWhatsApp[]>('/grupos/lista').then(r => r.data),

  mensagens: () => api.get<MensagemGrupo[]>('/grupos/mensagens').then(r => r.data),
  criarMensagem: (d: EntradaMensagemGrupo) => api.post('/grupos/mensagens', d).then(r => r.data),
  atualizarMensagem: (id: number, d: EntradaMensagemGrupo) => api.put(`/grupos/mensagens/${id}`, d).then(r => r.data),
  alternarMensagem: (id: number, ativa: boolean) => api.post(`/grupos/mensagens/${id}/ativa`, { ativa }).then(r => r.data),
  enviarAgora: (id: number) => api.post(`/grupos/mensagens/${id}/enviar-agora`).then(r => r.data),
  envios: (id: number) => api.get<EnvioGrupo[]>(`/grupos/mensagens/${id}/envios`).then(r => r.data),
  excluirMensagem: (id: number) => api.delete(`/grupos/mensagens/${id}`).then(r => r.data),

  boasVindas: () => api.get<BoasVindas[]>('/grupos/boas-vindas').then(r => r.data),
  criarBoasVindas: (d: EntradaBoasVindas) => api.post('/grupos/boas-vindas', d).then(r => r.data),
  atualizarBoasVindas: (id: number, d: EntradaBoasVindas) => api.put(`/grupos/boas-vindas/${id}`, d).then(r => r.data),
  excluirBoasVindas: (id: number) => api.delete(`/grupos/boas-vindas/${id}`).then(r => r.data),
}
