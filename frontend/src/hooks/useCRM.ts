import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { funisApi, estagiosApi, leadsApi, contatosApi, tagsApi, tarefasApi, anotacoesApi, dashboardApi, agenteIaApi, usuariosEmpresaApi, followupsApi, FiltrosLead } from '@/api/crm'
import type { CreateLeadDto, UpdateLeadDto, MoverLeadDto, CreateTagDto, CreateTarefaDto, UpdateTarefaDto, CreateAnotacaoDto, Lead, EstagioFunil, AgenteIAConfig } from '@/types/crm'

// ========== FUNIS ==========

export const useFunis = () => {
  return useQuery({
    queryKey: ['crm', 'funis'],
    queryFn: () => funisApi.list(),
  })
}

export const useFunil = (id: number | undefined) => {
  return useQuery({
    queryKey: ['crm', 'funis', id],
    queryFn: () => funisApi.getById(id!),
    enabled: !!id,
  })
}

export const useFunilDefault = () => {
  return useQuery({
    queryKey: ['crm', 'funis', 'default'],
    queryFn: () => funisApi.getDefault(),
  })
}

export const useFunilDefaultCX = () => {
  return useQuery({
    queryKey: ['crm', 'funis', 'default-cx'],
    queryFn: () => funisApi.getDefaultCX(),
  })
}

export const useFunisCX = () => {
  return useQuery({
    queryKey: ['crm', 'funis', 'tipo', 'cx'],
    queryFn: () => funisApi.listByTipo('cx'),
  })
}

export const useFunisAquisicao = () => {
  return useQuery({
    queryKey: ['crm', 'funis', 'tipo', 'aquisicao'],
    queryFn: () => funisApi.listByTipo('aquisicao'),
  })
}

export const useFunilStats = (funilId: number | undefined) => {
  return useQuery({
    queryKey: ['crm', 'funis', funilId, 'stats'],
    queryFn: () => funisApi.getStats(funilId!),
    enabled: !!funilId,
  })
}

// ========== ESTAGIOS ==========

export const useEstagios = (funilId: number | undefined) => {
  return useQuery({
    queryKey: ['crm', 'estagios', funilId],
    queryFn: () => estagiosApi.listByFunil(funilId!),
    enabled: !!funilId,
  })
}

export const useCreateEstagio = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ funilId, data }: { funilId: number; data: Partial<{ nome: string; cor: string; is_ganho?: boolean; is_perdido?: boolean }> }) =>
      estagiosApi.create(funilId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'estagios'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'funis'] })
      toast.success('Estágio criado!')
    },
    onError: () => {
      toast.error('Erro ao criar estágio')
    },
  })
}

export const useUpdateEstagio = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<{ nome: string; cor: string; is_ganho?: boolean; is_perdido?: boolean; agente_ia_ativo?: boolean; instrucoes_agente_ia?: string; estagio_apos_resposta_id?: number | null; followup_config?: import('@/types/crm').EstagioFollowupConfig | null }> }) =>
      estagiosApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'estagios'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'funis'] })
      toast.success('Estágio atualizado!')
    },
    onError: () => {
      toast.error('Erro ao atualizar estágio')
    },
  })
}

export const useDeleteEstagio = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => estagiosApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'estagios'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'funis'] })
      toast.success('Estágio removido!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao remover estágio')
    },
  })
}

export const useReorderEstagios = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ funilId, estagios }: { funilId: number; estagios: { id: number; ordem: number }[] }) =>
      estagiosApi.reorder(funilId, estagios),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'estagios'] })
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'estagios'] })
      toast.error('Erro ao reordenar estágios')
    },
  })
}

// ========== LEADS ==========

export const useLeads = (funilId: number | undefined, filtros: FiltrosLead = {}) => {
  return useQuery({
    queryKey: ['crm', 'leads', funilId, filtros],
    queryFn: () => leadsApi.listByFunil(funilId!, filtros),
    enabled: !!funilId,
    refetchInterval: 30000,
  })
}

export const useOrigens = (funilId?: number) => {
  return useQuery({
    queryKey: ['crm', 'leads', 'origens', funilId],
    queryFn: () => leadsApi.getOrigens(funilId),
    staleTime: 60000,
  })
}

export const useLead = (id: number | undefined) => {
  return useQuery({
    queryKey: ['crm', 'leads', 'detail', id],
    queryFn: () => leadsApi.getById(id!),
    enabled: !!id,
  })
}

export const useCreateLead = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateLeadDto) => leadsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'estagios'] })
      toast.success('Lead criado com sucesso!')
    },
    onError: () => {
      toast.error('Erro ao criar lead')
    },
  })
}

export const useCreateLeadFromWhatsApp = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ contatoId, funilId }: { contatoId: number; funilId: number }) =>
      leadsApi.createFromWhatsApp(contatoId, funilId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'estagios'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'contatos'] })
      toast.success('Lead criado a partir do contato!')
    },
    onError: () => {
      toast.error('Erro ao criar lead')
    },
  })
}

export const useUpdateLead = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateLeadDto }) =>
      leadsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      toast.success('Lead atualizado!')
    },
    onError: () => {
      toast.error('Erro ao atualizar lead')
    },
  })
}

export const useMoverLead = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: MoverLeadDto }) =>
      leadsApi.mover(id, data),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'estagios'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'funis', 'tipo', 'cx'] })
      if (data?.cliente_criado) {
        queryClient.invalidateQueries({ queryKey: ['clients'] })
        queryClient.invalidateQueries({ queryKey: ['clients-list'] })
        toast.success('Lead ganho! Cliente criado em Clientes e CRM-CX.', { duration: 5000 })
      }
    },
  })
}

export const useTransferirFunil = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, novoFunilId }: { id: number; novoFunilId: number }) =>
      leadsApi.transferirFunil(id, novoFunilId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'estagios'] })
      toast.success('Lead transferido para o novo funil!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao transferir lead')
    },
  })
}

export const useArquivarLead = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => leadsApi.arquivar(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'estagios'] })
      toast.success('Lead arquivado!')
    },
  })
}

export const useReativarLead = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => leadsApi.reativar(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'estagios'] })
      toast.success('Lead reativado!')
    },
  })
}

export const useDeleteLead = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => leadsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'estagios'] })
      toast.success('Lead deletado!')
    },
  })
}

export const useLeadAtividades = (leadId: number | undefined) => {
  return useQuery({
    queryKey: ['crm', 'leads', leadId, 'atividades'],
    queryFn: () => leadsApi.getAtividades(leadId!),
    enabled: !!leadId,
  })
}

// ========== CONTATOS WHATSAPP ==========

export const useContatos = (incluirGrupos = false) => {
  return useQuery({
    queryKey: ['crm', 'contatos', { incluirGrupos }],
    queryFn: () => contatosApi.list(incluirGrupos),
  })
}

export const useContatosNaoConvertidos = (funilId?: number) => {
  return useQuery({
    queryKey: ['crm', 'contatos', 'nao-convertidos', funilId],
    queryFn: () => contatosApi.listNaoConvertidos(funilId),
  })
}

export const useSincronizarContatos = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => contatosApi.sincronizar(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'contatos'] })
      toast.success(result.message)
    },
    onError: () => {
      toast.error('Erro ao sincronizar contatos')
    },
  })
}

export const useEnviarMensagem = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ contatoId, mensagem, leadId }: { contatoId: number; mensagem: string; leadId?: number }) =>
      contatosApi.enviarMensagem(contatoId, mensagem, leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'historico'] })
      toast.success('Mensagem enviada!')
    },
    onError: () => {
      toast.error('Erro ao enviar mensagem')
    },
  })
}

export const useEnviarMedia = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ contatoId, file, caption, leadId }: { contatoId: number; file: File; caption?: string; leadId?: number }) =>
      contatosApi.enviarMedia(contatoId, file, caption, leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'historico'] })
      toast.success('Midia enviada!')
    },
    onError: () => {
      toast.error('Erro ao enviar midia')
    },
  })
}

export const useMarcarLido = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ contatoId, leadId }: { contatoId: number; leadId?: number }) =>
      contatosApi.marcarLido(contatoId, leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
    },
  })
}

export const useHistoricoMensagens = (contatoId: number | undefined) => {
  return useQuery({
    queryKey: ['crm', 'historico', contatoId],
    queryFn: () => contatosApi.getHistorico(contatoId!, 100),
    enabled: !!contatoId,
    refetchInterval: 10000,
  })
}

// Lead-level WhatsApp messaging (auto-creates contato if needed)
export const useLeadEnviarMensagem = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ leadId, mensagem }: { leadId: number; mensagem: string }) =>
      leadsApi.enviarMensagem(leadId, mensagem),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'historico'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'lead-historico'] })
      toast.success('Mensagem enviada!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao enviar mensagem')
    },
  })
}

export const useLeadEnviarMedia = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ leadId, file, caption }: { leadId: number; file: File; caption?: string }) =>
      leadsApi.enviarMedia(leadId, file, caption),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'historico'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'lead-historico'] })
      toast.success('Midia enviada!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao enviar midia')
    },
  })
}

export const useLeadHistoricoWhatsApp = (leadId: number | undefined, enabled = false) => {
  return useQuery({
    queryKey: ['crm', 'lead-historico', leadId],
    queryFn: () => leadsApi.getHistoricoWhatsApp(leadId!, 100),
    enabled: !!leadId && enabled,
    refetchInterval: 10000,
  })
}

export const useLeadMarcarLido = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (leadId: number) => leadsApi.marcarLidoWhatsApp(leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
    },
  })
}

// ========== TAGS ==========

export const useTags = () => {
  return useQuery({
    queryKey: ['crm', 'tags'],
    queryFn: () => tagsApi.list(),
  })
}

export const useCreateTag = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateTagDto) => tagsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'tags'] })
      toast.success('Tag criada!')
    },
  })
}

export const useDeleteTag = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => tagsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'tags'] })
      toast.success('Tag deletada!')
    },
  })
}

export const useAddTagToLead = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ leadId, tagId }: { leadId: number; tagId: number }) =>
      leadsApi.addTag(leadId, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
    },
  })
}

export const useRemoveTagFromLead = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ leadId, tagId }: { leadId: number; tagId: number }) =>
      leadsApi.removeTag(leadId, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
    },
  })
}

// ========== TAREFAS ==========

export const useTarefasLead = (leadId: number | undefined) => {
  return useQuery({
    queryKey: ['crm', 'tarefas', leadId],
    queryFn: () => tarefasApi.listByLead(leadId!),
    enabled: !!leadId,
  })
}

export const useCreateTarefa = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateTarefaDto) => tarefasApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'tarefas'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      toast.success('Tarefa criada!')
    },
    onError: () => {
      toast.error('Erro ao criar tarefa')
    },
  })
}

export const useUpdateTarefa = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateTarefaDto }) =>
      tarefasApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'tarefas'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      toast.success('Tarefa atualizada!')
    },
    onError: () => {
      toast.error('Erro ao atualizar tarefa')
    },
  })
}

export const useConcluirTarefa = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => tarefasApi.concluir(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'tarefas'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      toast.success('Tarefa concluida!')
    },
    onError: () => {
      toast.error('Erro ao concluir tarefa')
    },
  })
}

export const useDeleteTarefa = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => tarefasApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'tarefas'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      toast.success('Tarefa excluida!')
    },
    onError: () => {
      toast.error('Erro ao excluir tarefa')
    },
  })
}

// ========== ANOTACOES ==========

export const useAnotacoesLead = (leadId: number | undefined) => {
  return useQuery({
    queryKey: ['crm', 'anotacoes', leadId],
    queryFn: () => anotacoesApi.listByLead(leadId!),
    enabled: !!leadId,
  })
}

export const useCreateAnotacao = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateAnotacaoDto) => anotacoesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'anotacoes'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      toast.success('Anotacao adicionada!')
    },
    onError: () => {
      toast.error('Erro ao adicionar anotacao')
    },
  })
}

export const useUpdateAnotacao = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { conteudo?: string; tipo?: string } }) =>
      anotacoesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'anotacoes'] })
      toast.success('Anotacao atualizada!')
    },
    onError: () => {
      toast.error('Erro ao atualizar anotacao')
    },
  })
}

export const useDeleteAnotacao = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => anotacoesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'anotacoes'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      toast.success('Anotacao excluida!')
    },
    onError: () => {
      toast.error('Erro ao excluir anotacao')
    },
  })
}

// ========== GRUPOS WHATSAPP ==========

export const useGruposWhatsApp = (enabled = false) => {
  return useQuery({
    queryKey: ['crm', 'grupos-whatsapp'],
    queryFn: () => contatosApi.getGrupos(),
    enabled,
    staleTime: 30000,
    retry: 1,
  })
}

export const useParticipantesGrupo = (groupId: string | null) => {
  return useQuery({
    queryKey: ['crm', 'grupos-whatsapp', groupId, 'participantes'],
    queryFn: () => contatosApi.getParticipantes(groupId!),
    enabled: !!groupId,
    staleTime: 30000,
  })
}

export const useImportarParticipantes = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, funilId, participantes, estagioId, responsavelId }: { groupId: string; funilId: number; participantes: Array<{id: string, number: string}>; estagioId?: number; responsavelId?: number }) =>
      contatosApi.importarParticipantes(groupId, funilId, participantes, estagioId, responsavelId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'contatos'] })
      toast.success(`${data.importados} lead(s) importado(s) com sucesso!`)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao importar participantes')
    },
  })
}

// ========== REGISTRAR WEBHOOK ==========

export const useRegistrarWebhook = () => {
  return useMutation({
    mutationFn: () => contatosApi.registrarWebhook(),
    onError: (error: any) => {
      console.warn('Erro ao registrar webhook WhatsApp:', error.response?.data?.message || error.message)
    },
  })
}

// ========== FUNIS CRUD ==========

export const useCreateFunil = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { nome: string; descricao?: string; padrao?: boolean; tipo?: 'aquisicao' | 'cx'; padrao_cx?: boolean }) =>
      funisApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'funis'] })
      toast.success('Funil criado!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao criar funil')
    },
  })
}

export const useUpdateFunil = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<{ nome: string; descricao: string; padrao: boolean }> }) =>
      funisApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'funis'] })
      toast.success('Funil atualizado!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao atualizar funil')
    },
  })
}

export const useDeleteFunil = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => funisApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'funis'] })
      toast.success('Funil excluido!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao excluir funil')
    },
  })
}

// ========== DASHBOARD CRM ==========

export interface DashboardDateFilters {
  data_inicio?: string
  data_fim?: string
  responsavel_id?: number
}

export const useCRMDashboard = (funilId?: number, filters?: DashboardDateFilters) => {
  return useQuery({
    queryKey: ['crm', 'dashboard', funilId, filters?.data_inicio, filters?.data_fim, filters?.responsavel_id],
    queryFn: () => dashboardApi.getMetricas(funilId, filters),
    staleTime: 60000,
  })
}

export const useCRMFunilAnalytics = (funilId?: number, dias?: number, filters?: DashboardDateFilters) => {
  return useQuery({
    queryKey: ['crm', 'dashboard', 'funil', funilId, dias, filters?.data_inicio, filters?.data_fim, filters?.responsavel_id],
    queryFn: () => dashboardApi.getFunilAnalytics(funilId, dias, filters),
    staleTime: 60000,
  })
}

// ========== KANBAN HELPER ==========

export interface KanbanData {
  funil: ReturnType<typeof useFunilDefault>
  estagios: ReturnType<typeof useEstagios>
  leads: ReturnType<typeof useLeads>
  moverLead: ReturnType<typeof useMoverLead>
}

const LEADS_PER_COLUMN = 100

export const useKanban = (filtros: FiltrosLead = {}, selectedFunilId?: number) => {
  const funilDefaultQuery = useFunilDefault()
  const funilId = selectedFunilId || funilDefaultQuery.data?.id
  const funilByIdQuery = useFunil(selectedFunilId)
  const funilQuery = selectedFunilId ? funilByIdQuery : funilDefaultQuery
  const estagiosQuery = useEstagios(funilId)
  const leadsQuery = useLeads(funilId, filtros)
  const moverLead = useMoverLead()

  // Extra leads carregados via "Carregar mais" (chave: estagioId)
  const [extraLeads, setExtraLeads] = useState<Record<number, Lead[]>>({})
  const [loadingMore, setLoadingMore] = useState<Record<number, boolean>>({})

  // Organizar leads por estágio
  const leadsPorEstagio = (leadsQuery.data || []).reduce((acc, lead) => {
    const estagioId = lead.estagio_id
    if (!acc[estagioId]) {
      acc[estagioId] = []
    }
    acc[estagioId].push(lead)
    return acc
  }, {} as Record<number, Lead[]>)

  // Total por estágio (do campo total_no_estagio retornado pelo backend)
  const totalPorEstagio = (leadsQuery.data || []).reduce((acc, lead) => {
    if (lead.total_no_estagio !== undefined && !acc[lead.estagio_id]) {
      acc[lead.estagio_id] = lead.total_no_estagio
    }
    return acc
  }, {} as Record<number, number>)

  // Montar colunas do Kanban combinando leads iniciais + extras
  const colunas = (estagiosQuery.data || []).map((estagio: EstagioFunil) => {
    const base = leadsPorEstagio[estagio.id] || []
    const extras = extraLeads[estagio.id] || []
    return {
      ...estagio,
      leads: [...base, ...extras],
      total_no_estagio: totalPorEstagio[estagio.id] ?? base.length,
    }
  })

  const loadMore = useCallback(async (estagioId: number) => {
    const base = leadsPorEstagio[estagioId] || []
    const extras = extraLeads[estagioId] || []
    const offset = base.length + extras.length
    setLoadingMore(prev => ({ ...prev, [estagioId]: true }))
    try {
      const novos = await leadsApi.listByEstagio(estagioId, filtros, LEADS_PER_COLUMN, offset)
      setExtraLeads(prev => ({
        ...prev,
        [estagioId]: [...(prev[estagioId] || []), ...novos]
      }))
    } finally {
      setLoadingMore(prev => ({ ...prev, [estagioId]: false }))
    }
  }, [leadsQuery.data, extraLeads, filtros])

  return {
    funil: funilQuery.data,
    colunas,
    totalPorEstagio,
    loadMore,
    loadingMore,
    isLoading: funilQuery.isLoading || estagiosQuery.isLoading || leadsQuery.isLoading,
    isError: funilQuery.isError || estagiosQuery.isError || leadsQuery.isError,
    moverLead,
    refetch: () => {
      funilQuery.refetch()
      estagiosQuery.refetch()
      leadsQuery.refetch()
      setExtraLeads({})
    },
  }
}

export const useKanbanCX = (filtros: FiltrosLead = {}, selectedFunilId?: number) => {
  const funilDefaultCXQuery = useFunilDefaultCX()
  const funilId = selectedFunilId || funilDefaultCXQuery.data?.id
  const funilByIdQuery = useFunil(selectedFunilId)
  const funilQuery = selectedFunilId ? funilByIdQuery : funilDefaultCXQuery
  const estagiosQuery = useEstagios(funilId)
  const leadsQuery = useLeads(funilId, filtros)
  const moverLead = useMoverLead()

  const [extraLeads, setExtraLeads] = useState<Record<number, Lead[]>>({})
  const [loadingMore, setLoadingMore] = useState<Record<number, boolean>>({})

  const leadsPorEstagio = (leadsQuery.data || []).reduce((acc, lead) => {
    const estagioId = lead.estagio_id
    if (!acc[estagioId]) acc[estagioId] = []
    acc[estagioId].push(lead)
    return acc
  }, {} as Record<number, Lead[]>)

  const totalPorEstagio = (leadsQuery.data || []).reduce((acc, lead) => {
    if (lead.total_no_estagio !== undefined && !acc[lead.estagio_id]) {
      acc[lead.estagio_id] = lead.total_no_estagio
    }
    return acc
  }, {} as Record<number, number>)

  const colunas = (estagiosQuery.data || []).map((estagio: EstagioFunil) => {
    const base = leadsPorEstagio[estagio.id] || []
    const extras = extraLeads[estagio.id] || []
    return {
      ...estagio,
      leads: [...base, ...extras],
      total_no_estagio: totalPorEstagio[estagio.id] ?? base.length,
    }
  })

  const loadMore = useCallback(async (estagioId: number) => {
    const base = leadsPorEstagio[estagioId] || []
    const extras = extraLeads[estagioId] || []
    const offset = base.length + extras.length
    setLoadingMore(prev => ({ ...prev, [estagioId]: true }))
    try {
      const novos = await leadsApi.listByEstagio(estagioId, filtros, LEADS_PER_COLUMN, offset)
      setExtraLeads(prev => ({ ...prev, [estagioId]: [...(prev[estagioId] || []), ...novos] }))
    } finally {
      setLoadingMore(prev => ({ ...prev, [estagioId]: false }))
    }
  }, [leadsQuery.data, extraLeads, filtros])

  return {
    funil: funilQuery.data,
    colunas,
    totalPorEstagio,
    loadMore,
    loadingMore,
    isLoading: funilQuery.isLoading || estagiosQuery.isLoading || leadsQuery.isLoading,
    isError: funilQuery.isError || estagiosQuery.isError || leadsQuery.isError,
    moverLead,
    refetch: () => {
      funilQuery.refetch()
      estagiosQuery.refetch()
      leadsQuery.refetch()
      setExtraLeads({})
    },
  }
}

// ========== AGENTE IA ==========

export const useAgenteIAConfig = () => {
  return useQuery({
    queryKey: ['crm', 'agente-ia', 'config'],
    queryFn: () => agenteIaApi.getConfig(),
    staleTime: 30000,
    retry: false,
  })
}

export const useAgenteIAUpdateConfig = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<AgenteIAConfig>) => agenteIaApi.updateConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'agente-ia', 'config'] })
      toast.success('Configurações do agente salvas!')
    },
    onError: () => {
      toast.error('Erro ao salvar configurações')
    },
  })
}

export const useAgenteIAToggleEstagio = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ estagioId, ativo }: { estagioId: number; ativo: boolean }) =>
      agenteIaApi.toggleEstagio(estagioId, ativo),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'estagios'] })
      toast.success(vars.ativo ? 'Agente IA ativado para este estágio' : 'Agente IA desativado para este estágio')
    },
    onError: () => toast.error('Erro ao alterar agente IA'),
  })
}

export const useAgenteIAToggleLead = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, ativo }: { leadId: number; ativo: boolean | null }) =>
      agenteIaApi.toggleLead(leadId, ativo),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'agente-ia', 'lead', vars.leadId] })
    },
    onError: () => toast.error('Erro ao alterar agente IA'),
  })
}

export const useAgenteIALeadStatus = (leadId: number | undefined) => {
  return useQuery({
    queryKey: ['crm', 'agente-ia', 'lead', leadId],
    queryFn: () => agenteIaApi.getLeadStatus(leadId!),
    enabled: !!leadId,
    staleTime: 10000,
  })
}

export const useUsuariosEmpresa = () => {
  return useQuery({
    queryKey: ['crm', 'usuarios-empresa'],
    queryFn: () => usuariosEmpresaApi.list(),
    staleTime: 5 * 60 * 1000,
  })
}

// ========== FOLLOW-UPS AGENDADOS ==========

export const useFollowupsLead = (leadId: number | undefined) => {
  return useQuery({
    queryKey: ['crm', 'followups', leadId],
    queryFn: () => followupsApi.listar(leadId!),
    enabled: !!leadId,
    refetchInterval: 30000,
  })
}

export const useCreateFollowup = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, data }: {
      leadId: number
      data: { agendado_para: string; tipo: 'manual' | 'agente_ia'; mensagem?: string; instrucao_ia?: string; hora_inicio?: string; hora_fim?: string; dias_semana?: number[] }
    }) => followupsApi.criar(leadId, data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'followups', vars.leadId] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'followups-todos'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      toast.success('Follow-up agendado!')
    },
    onError: () => toast.error('Erro ao agendar follow-up'),
  })
}

export const useCancelarFollowup = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: number; leadId: number }) => followupsApi.cancelar(id),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'followups', vars.leadId] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      toast.success('Follow-up cancelado')
    },
    onError: () => toast.error('Erro ao cancelar follow-up'),
  })
}

export const useReagendarFollowup = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, agendado_para }: { id: number; agendado_para: string }) =>
      followupsApi.reagendar(id, agendado_para),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'followups'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'followups-todos'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      toast.success('Follow-up reagendado!')
    },
    onError: () => toast.error('Erro ao reagendar follow-up'),
  })
}

export const useAllFollowups = (filtro: 'hoje' | 'semana' | 'atrasados' | 'todos' = 'hoje', status?: string) => {
  return useQuery({
    queryKey: ['crm', 'followups-todos', filtro, status],
    queryFn: () => followupsApi.listarTodos(filtro, status),
    refetchInterval: 60000,
  })
}

export const useFollowupMetricas = () => {
  return useQuery({
    queryKey: ['crm', 'followups-metricas'],
    queryFn: () => followupsApi.metricas(),
    refetchInterval: 60000,
  })
}
