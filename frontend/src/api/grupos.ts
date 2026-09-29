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
  campanha_id: number | null
  campanha_nome: string | null
}

export type EntradaMensagemGrupo = Pick<
  MensagemGrupo,
  'titulo' | 'texto' | 'media_url' | 'media_mimetype' | 'media_filename' | 'mencionar_todos' | 'grupos' | 'modo' | 'recorrencia' | 'intervalo_segundos'
> & { agendado_para?: string | null; campanha_id?: number | null }

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

// ── Campanhas (migration 089, Enterprise) ─────────────────────────────────────

export interface ChipDaEmpresa { id: number; nome: string; porta: number }

export interface Campanha {
  id: number
  nome: string
  slug: string
  limite_por_grupo: number
  chips: number[]
  criar_grupos: boolean
  nome_grupo_modelo: string
  descricao_grupo: string | null
  so_admins_enviam: boolean
  criar_lead: boolean
  funil_id: number | null
  funil_nome: string | null
  estagio_id: number | null
  responsavel_id: number | null
  origem: string | null
  ativa: boolean
  total_grupos: number
  total_participantes: number
  total_cliques: number
  total_entradas: number
  total_saidas: number
  created_at: string
}

export interface GrupoDaCampanha {
  id: number
  grupo_id: string
  nome: string | null
  convite: string | null
  participantes: number
  participantes_em: string | null
  ordem: number
  cheio: boolean
  ativo: boolean
  criado_pela_campanha: boolean
  usuario_id: number
  chip_nome: string
}

export type CampanhaDetalhe = Campanha & { grupos: GrupoDaCampanha[] }

export type EntradaCampanha = Pick<Campanha,
  'nome' | 'slug' | 'limite_por_grupo' | 'chips' | 'criar_grupos' | 'nome_grupo_modelo' | 'descricao_grupo'
  | 'so_admins_enviam' | 'criar_lead' | 'funil_id' | 'estagio_id' | 'responsavel_id' | 'origem' | 'ativa'>

export interface PainelCampanha {
  porDia: { dia: string; cliques: number; entradas: number; saidas: number }[]
  porUtm: { origem: string; cliques: number }[]
  porGrupo: { grupo_id: string; nome: string | null; entradas: number; saidas: number }[]
  leads: number
}

/** O endereço público da campanha — o nginx repassa /gestao/g/ para a API. */
export const linkDaCampanha = (slug: string) => `https://duofuturo.tech/gestao/g/${slug}`

export const gruposApi = {
  canal: () => api.get<CanalGrupos>('/grupos/canal').then(r => r.data),
  lista: () => api.get<GrupoWhatsApp[]>('/grupos/lista', { silenciarErro: true } as any).then(r => r.data),

  mensagens: () => api.get<MensagemGrupo[]>('/grupos/mensagens').then(r => r.data),
  criarMensagem: (d: EntradaMensagemGrupo) => api.post('/grupos/mensagens', d).then(r => r.data),
  atualizarMensagem: (id: number, d: EntradaMensagemGrupo) => api.put(`/grupos/mensagens/${id}`, d).then(r => r.data),
  alternarMensagem: (id: number, ativa: boolean) => api.post(`/grupos/mensagens/${id}/ativa`, { ativa }).then(r => r.data),
  enviarAgora: (id: number) => api.post(`/grupos/mensagens/${id}/enviar-agora`).then(r => r.data),
  envios: (id: number) => api.get<EnvioGrupo[]>(`/grupos/mensagens/${id}/envios`, { silenciarErro: true } as any).then(r => r.data),
  excluirMensagem: (id: number) => api.delete(`/grupos/mensagens/${id}`).then(r => r.data),

  boasVindas: () => api.get<BoasVindas[]>('/grupos/boas-vindas').then(r => r.data),
  criarBoasVindas: (d: EntradaBoasVindas) => api.post('/grupos/boas-vindas', d).then(r => r.data),
  atualizarBoasVindas: (id: number, d: EntradaBoasVindas) => api.put(`/grupos/boas-vindas/${id}`, d).then(r => r.data),
  excluirBoasVindas: (id: number) => api.delete(`/grupos/boas-vindas/${id}`).then(r => r.data),

  chips: () => api.get<ChipDaEmpresa[]>('/grupos/chips').then(r => r.data),
  campanhas: () => api.get<Campanha[]>('/grupos/campanhas').then(r => r.data),
  campanha: (id: number) => api.get<CampanhaDetalhe>(`/grupos/campanhas/${id}`).then(r => r.data),
  criarCampanha: (d: EntradaCampanha) => api.post<{ id: number }>('/grupos/campanhas', d).then(r => r.data),
  atualizarCampanha: (id: number, d: EntradaCampanha) => api.put(`/grupos/campanhas/${id}`, d).then(r => r.data),
  excluirCampanha: (id: number) => api.delete(`/grupos/campanhas/${id}`).then(r => r.data),
  painelCampanha: (id: number, dias = 30) => api.get<PainelCampanha>(`/grupos/campanhas/${id}/painel`, { params: { dias } }).then(r => r.data),
  adicionarGrupoCampanha: (id: number, chip_id: number, grupo_id: string) =>
    api.post(`/grupos/campanhas/${id}/grupos`, { chip_id, grupo_id }).then(r => r.data),
  criarGrupoCampanha: (id: number) => api.post(`/grupos/campanhas/${id}/grupos/criar`).then(r => r.data),
  alternarGrupoCampanha: (id: number, gid: number, ativo: boolean) =>
    api.post(`/grupos/campanhas/${id}/grupos/${gid}/ativo`, { ativo }).then(r => r.data),
  removerGrupoCampanha: (id: number, gid: number) => api.delete(`/grupos/campanhas/${id}/grupos/${gid}`).then(r => r.data),
}
