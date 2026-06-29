import api from './client'
import type {
  Funil,
  EstagioFunil,
  Lead,
  ContatoWhatsApp,
  GrupoWhatsApp,
  ParticipanteGrupo,
  ImportarParticipantesResult,
  Tag,
  AtividadeLead,
  CreateLeadDto,
  UpdateLeadDto,
  MoverLeadDto,
  CreateTagDto,
  SyncResult,
  FunilStats,
  HistoricoMensagem,
  Tarefa,
  CreateTarefaDto,
  UpdateTarefaDto,
  Anotacao,
  CreateAnotacaoDto,
  FunilAnalytics
} from '../types/crm'

// Funis
export const funisApi = {
  list: () => api.get<Funil[]>('/crm/funis').then(r => r.data),

  listByTipo: (tipo: 'aquisicao' | 'cx') =>
    api.get<Funil[]>('/crm/funis', { params: { tipo } }).then(r => r.data),

  getById: (id: number) => api.get<Funil>(`/crm/funis/${id}`).then(r => r.data),

  getDefault: () => api.get<Funil>('/crm/funis/default').then(r => r.data),

  getDefaultCX: () => api.get<Funil>('/crm/funis/default-cx').then(r => r.data),

  getStats: (id: number) => api.get<FunilStats>(`/crm/funis/${id}/stats`).then(r => r.data),

  create: (data: { nome: string; descricao?: string; padrao?: boolean; tipo?: 'aquisicao' | 'cx'; padrao_cx?: boolean }) =>
    api.post<Funil>('/crm/funis', data).then(r => r.data),

  update: (id: number, data: Partial<Funil>) =>
    api.put<Funil>(`/crm/funis/${id}`, data).then(r => r.data),

  delete: (id: number) => api.delete(`/crm/funis/${id}`),
}

// Estagios
export const estagiosApi = {
  listByFunil: (funilId: number) =>
    api.get<EstagioFunil[]>(`/crm/funis/${funilId}/estagios`).then(r => r.data),

  getById: (id: number) =>
    api.get<EstagioFunil>(`/crm/estagios/${id}`).then(r => r.data),

  create: (funilId: number, data: Partial<EstagioFunil>) =>
    api.post<EstagioFunil>(`/crm/funis/${funilId}/estagios`, data).then(r => r.data),

  update: (id: number, data: Partial<EstagioFunil>) =>
    api.put<EstagioFunil>(`/crm/estagios/${id}`, data).then(r => r.data),

  reorder: (funilId: number, estagios: { id: number; ordem: number }[]) =>
    api.put(`/crm/funis/${funilId}/estagios/reorder`, { estagios }),

  delete: (id: number) => api.delete(`/crm/estagios/${id}`),
}

// Filtros de leads
export interface FiltrosLead {
  arquivados?: boolean
  estagio_id?: number
  responsavel_id?: number
  temperatura?: 'frio' | 'morno' | 'quente'
  origem?: string
  com_tarefa_atrasada?: boolean
  com_tarefa_hoje?: boolean
  sem_tarefa?: boolean
  aguardando_resposta?: boolean
  com_mensagens_nao_lidas?: boolean
  com_telefone?: boolean
  sem_nome_real?: boolean
  search?: string
}

// Leads
export const leadsApi = {
  listByFunil: (funilId: number, filtros: FiltrosLead = {}) =>
    api.get<Lead[]>(`/crm/funis/${funilId}/leads`, { params: filtros }).then(r => r.data),

  getById: (id: number) =>
    api.get<Lead>(`/crm/leads/${id}`).then(r => r.data),

  create: (data: CreateLeadDto) =>
    api.post<Lead>('/crm/leads', data).then(r => r.data),

  createFromWhatsApp: (contatoWhatsappId: number, funilId: number) =>
    api.post<Lead>('/crm/leads/do-whatsapp', {
      contato_whatsapp_id: contatoWhatsappId,
      funil_id: funilId
    }).then(r => r.data),

  update: (id: number, data: UpdateLeadDto) =>
    api.put<Lead>(`/crm/leads/${id}`, data).then(r => r.data),

  mover: (id: number, data: MoverLeadDto) =>
    api.put<Lead>(`/crm/leads/${id}/mover`, data).then(r => r.data),

  transferirFunil: (id: number, novoFunilId: number) =>
    api.put<Lead>(`/crm/leads/${id}/transferir-funil`, { novo_funil_id: novoFunilId }).then(r => r.data),

  arquivar: (id: number) =>
    api.post<Lead>(`/crm/leads/${id}/arquivar`).then(r => r.data),

  reativar: (id: number) =>
    api.post<Lead>(`/crm/leads/${id}/reativar`).then(r => r.data),

  delete: (id: number) => api.delete(`/crm/leads/${id}`),

  // Atividades
  getAtividades: (id: number, limit = 50) =>
    api.get<AtividadeLead[]>(`/crm/leads/${id}/atividades`, { params: { limit } }).then(r => r.data),

  // Tags
  addTag: (id: number, tagId: number) =>
    api.post(`/crm/leads/${id}/tags`, { tag_id: tagId }),

  removeTag: (id: number, tagId: number) =>
    api.delete(`/crm/leads/${id}/tags/${tagId}`),

  // WhatsApp messaging via lead
  enviarMensagem: (id: number, mensagem: string) =>
    api.post(`/crm/leads/${id}/mensagem`, { mensagem }).then(r => r.data),

  enviarMedia: (id: number, file: File, caption?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    if (caption) formData.append('caption', caption)
    return api.post(`/crm/leads/${id}/media`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data)
  },

  getHistoricoWhatsApp: (id: number, limit = 100) =>
    api.get<HistoricoMensagem[]>(`/crm/leads/${id}/historico-whatsapp`, { params: { limit } }).then(r => r.data),

  marcarLidoWhatsApp: (id: number) =>
    api.post(`/crm/leads/${id}/marcar-lido`).then(r => r.data),

  getOrigens: (funilId?: number) =>
    api.get<string[]>('/crm/leads/origens', { params: funilId ? { funilId } : {} }).then(r => r.data),

  listByEstagio: (estagioId: number, filtros: FiltrosLead = {}, limit = 100, offset = 0) =>
    api.get<Lead[]>(`/crm/estagios/${estagioId}/leads`, { params: { ...filtros, limit, offset } }).then(r => r.data),
}

// Contatos WhatsApp
export const contatosApi = {
  list: (incluirGrupos = false) =>
    api.get<ContatoWhatsApp[]>('/crm/contatos', { params: { grupos: incluirGrupos } }).then(r => r.data),

  listNaoConvertidos: (funilId?: number) =>
    api.get<ContatoWhatsApp[]>('/crm/contatos/nao-convertidos', { params: { funil_id: funilId } }).then(r => r.data),

  getById: (id: number) =>
    api.get<ContatoWhatsApp>(`/crm/contatos/${id}`).then(r => r.data),

  sincronizar: () =>
    api.post<SyncResult>('/crm/contatos/sincronizar').then(r => r.data),

  enviarMensagem: (id: number, mensagem: string, leadId?: number) =>
    api.post(`/crm/contatos/${id}/mensagem`, { mensagem, lead_id: leadId }).then(r => r.data),

  getHistorico: (id: number, limit = 50) =>
    api.get<HistoricoMensagem[]>(`/crm/contatos/${id}/historico`, { params: { limit } }).then(r => r.data),

  enviarMedia: (id: number, file: File, caption?: string, leadId?: number) => {
    const formData = new FormData()
    formData.append('file', file)
    if (caption) formData.append('caption', caption)
    if (leadId) formData.append('lead_id', String(leadId))
    return api.post(`/crm/contatos/${id}/media`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data)
  },

  marcarLido: (id: number, leadId?: number) =>
    api.post(`/crm/contatos/${id}/marcar-lido`, { lead_id: leadId }).then(r => r.data),

  registrarWebhook: () =>
    api.post('/crm/contatos/registrar-webhook').then(r => r.data),

  getGrupos: () =>
    api.get<{ success: boolean; grupos: GrupoWhatsApp[] }>('/crm/contatos/grupos').then(r => r.data.grupos),

  getParticipantes: (groupId: string) =>
    api.get<{ success: boolean; groupId: string; participants: ParticipanteGrupo[] }>(
      `/crm/contatos/grupos/${encodeURIComponent(groupId)}/participantes`
    ).then(r => r.data),

  importarParticipantes: (groupId: string, funilId: number, participantes: Array<{id: string, number: string}>, estagioId?: number, responsavelId?: number) =>
    api.post<ImportarParticipantesResult>(
      `/crm/contatos/grupos/${encodeURIComponent(groupId)}/importar`,
      { funil_id: funilId, estagio_id: estagioId, participantes, responsavel_id: responsavelId }
    ).then(r => r.data),
}

// Tarefas
export const tarefasApi = {
  listByLead: (leadId: number) =>
    api.get<Tarefa[]>(`/crm/leads/${leadId}/tarefas`).then(r => r.data),

  listByEmpresa: (filtros?: { status?: string; responsavel_id?: number; funil_tipo?: 'aquisicao' | 'cx' }) =>
    api.get<(Tarefa & { lead_nome?: string; responsavel_nome?: string; funil_tipo?: string })[]>(
      '/crm/tarefas',
      { params: filtros }
    ).then(r => r.data),

  getById: (id: number) =>
    api.get<Tarefa>(`/crm/tarefas/${id}`).then(r => r.data),

  create: (data: CreateTarefaDto) =>
    api.post<Tarefa>('/crm/tarefas', data).then(r => r.data),

  update: (id: number, data: UpdateTarefaDto) =>
    api.put<Tarefa>(`/crm/tarefas/${id}`, data).then(r => r.data),

  concluir: (id: number) =>
    api.post<Tarefa>(`/crm/tarefas/${id}/concluir`).then(r => r.data),

  delete: (id: number) => api.delete(`/crm/tarefas/${id}`),
}

// Anotacoes
export const anotacoesApi = {
  listByLead: (leadId: number) =>
    api.get<Anotacao[]>(`/crm/leads/${leadId}/anotacoes`).then(r => r.data),

  getById: (id: number) =>
    api.get<Anotacao>(`/crm/anotacoes/${id}`).then(r => r.data),

  create: (data: CreateAnotacaoDto) =>
    api.post<Anotacao>('/crm/anotacoes', data).then(r => r.data),

  update: (id: number, data: { conteudo?: string; tipo?: string }) =>
    api.put<Anotacao>(`/crm/anotacoes/${id}`, data).then(r => r.data),

  delete: (id: number) => api.delete(`/crm/anotacoes/${id}`),
}

// Tags
export const tagsApi = {
  list: () =>
    api.get<Tag[]>('/crm/tags').then(r => r.data),

  getById: (id: number) =>
    api.get<Tag>(`/crm/tags/${id}`).then(r => r.data),

  create: (data: CreateTagDto) =>
    api.post<Tag>('/crm/tags', data).then(r => r.data),

  update: (id: number, data: Partial<Tag>) =>
    api.put<Tag>(`/crm/tags/${id}`, data).then(r => r.data),

  delete: (id: number) => api.delete(`/crm/tags/${id}`),
}

// Importacao
export interface MapeamentoColunas {
  nome: string
  telefone?: string
  email?: string
  empresa?: string
  cargo?: string
  valor_potencial?: string
  temperatura?: string
  origem?: string
  notas?: string
}

export interface PreviewDados {
  colunas: string[]
  linhas: Record<string, string>[]
  totalLinhas: number
}

export interface ResultadoImportacao {
  total: number
  importados: number
  duplicados: number
  erros: Array<{ linha: number; erro: string; dados?: Record<string, unknown> }>
}

export const importacaoApi = {
  preview: (file: File): Promise<PreviewDados> => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<PreviewDados>('/crm/importacao/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data)
  },

  importar: (file: File, funilId: number, mapeamento: MapeamentoColunas): Promise<ResultadoImportacao> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('funil_id', String(funilId))
    formData.append('mapeamento', JSON.stringify(mapeamento))
    return api.post<ResultadoImportacao>('/crm/importacao/importar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000 // 5 minutos para arquivos grandes
    }).then(r => r.data)
  }
}

// Dashboard
export interface DashboardMetricas {
  totalLeads: number
  leadsAtivos: number
  leadsGanhos: number
  leadsPerdidos: number
  valorTotal: number
  valorGanho: number
  taxaConversao: number
  leadsPorMes: Array<{ mes: string; total: number; ganhos: number; perdidos: number }>
  valorPorMes: Array<{ mes: string; valor: number }>
  leadsPorEstagio: Array<{ estagio: string; cor: string; total: number; valor: number }>
  leadsPorTemperatura: Array<{ temperatura: string; total: number; valor: number }>
  leadsPorOrigem: Array<{ origem: string; total: number }>
  atividadesRecentes: Array<{
    id: number
    tipo: string
    descricao: string
    lead_nome: string
    lead_id: number
    created_at: string
  }>
  tarefasAtrasadas: number
  tarefasHoje: number
  tarefasPendentes: number
  tempoMedioConversao: number | null
  leadsSemContato7Dias: number
}

export interface DashboardDateFilters {
  data_inicio?: string
  data_fim?: string
  responsavel_id?: number
}

export const dashboardApi = {
  getMetricas: (funilId?: number, filters?: DashboardDateFilters) =>
    api.get<DashboardMetricas>('/crm/dashboard', {
      params: { funil_id: funilId, data_inicio: filters?.data_inicio, data_fim: filters?.data_fim, responsavel_id: filters?.responsavel_id }
    }).then(r => r.data),

  getFunilAnalytics: (funilId?: number, dias?: number, filters?: DashboardDateFilters) =>
    api.get<FunilAnalytics>('/crm/dashboard/funil', {
      params: { funil_id: funilId, dias, data_inicio: filters?.data_inicio, data_fim: filters?.data_fim, responsavel_id: filters?.responsavel_id }
    }).then(r => r.data)
}

// Agente IA
import type { AgenteIAConfig, AgenteIALeadStatus } from '../types/crm'

export const agenteIaApi = {
  getConfig: () =>
    api.get<AgenteIAConfig>('/crm/agente-ia/config').then(r => r.data),

  updateConfig: (data: Partial<AgenteIAConfig>) =>
    api.put<AgenteIAConfig>('/crm/agente-ia/config', data).then(r => r.data),

  toggleEstagio: (estagioId: number, ativo: boolean) =>
    api.put(`/crm/agente-ia/estagios/${estagioId}`, { ativo }).then(r => r.data),

  toggleLead: (leadId: number, ativo: boolean | null) =>
    api.put(`/crm/agente-ia/leads/${leadId}`, { ativo }).then(r => r.data),

  getLeadStatus: (leadId: number) =>
    api.get<AgenteIALeadStatus>(`/crm/agente-ia/leads/${leadId}/status`).then(r => r.data),
}

export const usuariosEmpresaApi = {
  list: () => api.get<{ id: number; nome: string; email: string }[]>('/crm/usuarios').then(r => r.data),
}

export interface Followup {
  id: number
  lead_id: number
  usuario_id: number
  empresa_id: number
  agendado_para: string
  tipo: 'manual' | 'agente_ia'
  mensagem: string | null
  instrucao_ia: string | null
  status: 'pendente' | 'enviado' | 'falhou' | 'cancelado'
  origem: 'lead' | 'estagio'
  erro: string | null
  enviado_at: string | null
  hora_inicio: string | null
  hora_fim: string | null
  dias_semana: number[] | null
  created_at: string
  usuario_nome?: string
  lead_nome?: string
  lead_telefone?: string
  estagio_nome?: string
  estagio_cor?: string
}

export interface FollowupMetricas {
  total_pendentes: number
  total_atrasados: number
  pendentes_hoje: number
  enviados_hoje: number
  total_falhados: number
}

export const followupsApi = {
  listar: (leadId: number) =>
    api.get<Followup[]>(`/crm/leads/${leadId}/followups`).then(r => r.data),

  criar: (leadId: number, data: {
    agendado_para: string
    tipo: 'manual' | 'agente_ia'
    mensagem?: string
    instrucao_ia?: string
    hora_inicio?: string
    hora_fim?: string
    dias_semana?: number[]
  }) => api.post<Followup>(`/crm/leads/${leadId}/followups`, data).then(r => r.data),

  listarTodos: (filtro?: 'hoje' | 'semana' | 'atrasados' | 'todos', status?: string, funilTipo?: 'aquisicao' | 'cx') =>
    api.get<Followup[]>('/crm/followups', { params: { filtro, status, funil_tipo: funilTipo } }).then(r => r.data),

  metricas: () =>
    api.get<FollowupMetricas>('/crm/followups/metricas').then(r => r.data),

  cancelar: (id: number) =>
    api.delete<Followup>(`/crm/followups/${id}`).then(r => r.data),

  reagendar: (id: number, agendado_para: string) =>
    api.patch<Followup>(`/crm/followups/${id}/reagendar`, { agendado_para }).then(r => r.data),
}

export interface DisparoAgendado {
  id: number
  total: number
  enviados: number
  falhas: number
  status: string
  template: string
  agendado_para: string
  tipo: string
  criado_por: string
  created_at: string
  funil_id: number | null
  funil_tipo: 'aquisicao' | 'cx' | null
  funil_nome: string | null
}

export const disparosAgendadosApi = {
  listar: (funilTipo?: 'aquisicao' | 'cx') =>
    api.get<DisparoAgendado[]>('/crm/disparos/agendados', {
      params: funilTipo ? { funil_tipo: funilTipo } : undefined
    }).then(r => r.data),
  cancelar: (id: number) =>
    api.delete(`/crm/disparos/${id}/cancelar`).then(r => r.data),
  editar: (id: number, data: { template?: string; agendado_para?: string }) =>
    api.patch(`/crm/disparos/${id}/agendado`, data).then(r => r.data),
}

export default {
  funis: funisApi,
  estagios: estagiosApi,
  leads: leadsApi,
  contatos: contatosApi,
  tags: tagsApi,
  tarefas: tarefasApi,
  anotacoes: anotacoesApi,
  importacao: importacaoApi,
  dashboard: dashboardApi,
  agenteIa: agenteIaApi,
  followups: followupsApi,
}
