// Types para CRM Kanban

export interface Funil {
  id: number;
  usuario_id: number;
  nome: string;
  descricao?: string;
  ativo: boolean;
  padrao: boolean;
  tipo: 'aquisicao' | 'cx';
  padrao_cx: boolean;
  created_at: string;
  updated_at: string;
  total_leads?: number;
  total_estagios?: number;
}

export interface EstagioFollowupConfig {
  ativo: boolean;
  tipo: 'manual' | 'agente_ia';
  mensagem?: string;
  instrucao_ia?: string;
  data?: string;          // 'YYYY-MM-DD' — apenas para manual: data de envio
  hora_inicio?: string;   // 'HH:MM' — manual: hora de envio; agente_ia: início da janela
  hora_fim?: string;      // 'HH:MM' — agente_ia: fim da janela
  dias_semana?: number[]; // 0=Dom..6=Sáb, undefined = todos os dias
}

export interface FollowupAgendado {
  id: number;
  lead_id: number;
  usuario_id: number;
  empresa_id: number;
  agendado_para: string;
  tipo: 'manual' | 'agente_ia';
  mensagem?: string;
  instrucao_ia?: string;
  status: 'pendente' | 'enviado' | 'falhou' | 'cancelado';
  erro?: string;
  enviado_at?: string;
  origem: 'lead' | 'estagio';
  hora_inicio?: string;
  hora_fim?: string;
  dias_semana?: number[];
  created_at: string;
  updated_at: string;
  // Campos de joins
  usuario_nome?: string;
  lead_nome?: string;
  lead_telefone?: string;
  estagio_nome?: string;
  estagio_cor?: string;
}

export interface FollowupMetricas {
  total_pendentes: number;
  total_atrasados: number;
  pendentes_hoje: number;
  enviados_hoje: number;
  total_falhados: number;
}

export interface EstagioFunil {
  id: number;
  funil_id: number;
  nome: string;
  descricao?: string;
  cor: string;
  icone?: string;
  ordem: number;
  is_entrada: boolean;
  is_ganho: boolean;
  is_perdido: boolean;
  agente_ia_ativo?: boolean;
  instrucoes_agente_ia?: string;
  estagio_apos_resposta_id?: number | null;
  followup_config?: EstagioFollowupConfig | null;
  created_at: string;
  updated_at: string;
  total_leads?: number;
  valor_total?: number;
}

export interface Lead {
  id: number;
  usuario_id: number;
  funil_id: number;
  estagio_id: number;
  contato_whatsapp_id?: number;
  nome: string;
  telefone?: string;
  email?: string;
  empresa?: string;
  cargo?: string;
  titulo?: string;
  cpf_cnpj?: string;
  valor_potencial?: number;
  temperatura: 'frio' | 'morno' | 'quente';
  probabilidade?: number;
  origem?: LeadOrigem;
  data_previsao_fechamento?: string;
  notas?: string;
  ordem: number;
  arquivado: boolean;
  created_at: string;
  updated_at: string;
  // Campos de WhatsApp / não lidos
  mensagens_nao_lidas?: number;
  aguardando_resposta?: boolean;
  ultima_resposta_cliente_at?: string;
  // Campos adicionais vindos de joins
  estagio_nome?: string;
  estagio_cor?: string;
  foto_url?: string;
  contato?: ContatoWhatsApp;
  tags?: Tag[];
  codigo_externo?: string;
  // Agente IA
  agente_ia_ativo?: boolean | null;       // override por lead (null = segue estágio)
  estagio_agente_ia_ativo?: boolean;      // status do estágio (retornado pelo JOIN)
  // Responsável
  responsavel_id?: number;
  responsavel_nome?: string;
  // Tarefas
  proxima_tarefa?: {
    id: number;
    titulo: string;
    tipo: string;
    data_vencimento: string;
    status: string;
  };
  total_tarefas_pendentes?: number;
  total_anotacoes?: number;
  total_disparos?: number;
  ultimo_estagio_disparo?: string | null;
  total_no_estagio?: number;
  followup_pendente_count?: number;
  proximo_followup_at?: string;
}

export interface ContatoWhatsApp {
  id: number;
  usuario_id: number;
  whatsapp_id: string;
  numero: string;
  nome?: string;
  nome_push?: string;
  foto_url?: string;
  is_grupo: boolean;
  ultima_mensagem?: string;
  ultima_mensagem_at?: string;
  unread_count: number;
  created_at: string;
  updated_at: string;
  // Campo calculado
  ja_convertido?: boolean;
}

export interface Tag {
  id: number;
  usuario_id: number;
  nome: string;
  cor: string;
  created_at: string;
}

export interface AtividadeLead {
  id: number;
  lead_id: number;
  usuario_id: number;
  tipo: string;
  descricao: string;
  dados?: Record<string, unknown>;
  created_at: string;
}

// DTOs para criação/atualização

export interface TarefaInicialDto {
  tipo: TarefaTipo;
  titulo: string;
  descricao?: string;
  data_vencimento: string;
}

export interface CreateLeadDto {
  funil_id: number;
  estagio_id?: number;
  contato_whatsapp_id?: number;
  responsavel_id?: number;
  nome: string;
  telefone?: string;
  email?: string;
  empresa?: string;
  cargo?: string;
  titulo?: string;
  cpf_cnpj?: string;
  valor_potencial?: number;
  temperatura?: 'frio' | 'morno' | 'quente';
  probabilidade?: number;
  origem?: LeadOrigem;
  notas?: string;
  tarefa_inicial?: TarefaInicialDto;
}

export type LeadOrigem = string;

export interface UpdateLeadDto {
  responsavel_id?: number;
  nome?: string;
  telefone?: string;
  email?: string;
  empresa?: string;
  cargo?: string;
  titulo?: string;
  cpf_cnpj?: string;
  valor_potencial?: number;
  temperatura?: 'frio' | 'morno' | 'quente';
  probabilidade?: number;
  data_previsao_fechamento?: string;
  notas?: string;
  arquivado?: boolean;
  origem?: LeadOrigem;
}

export interface MoverLeadDto {
  novo_estagio_id: number;
  nova_ordem?: number;
  numero_parcelas?: number;
  valor_venda?: number;
  criar_receita?: boolean;
}

export interface CreateTagDto {
  nome: string;
  cor?: string;
}

// Tipos para o Kanban

export interface KanbanColumn {
  id: number;
  titulo: string;
  cor: string;
  icone?: string;
  is_entrada: boolean;
  is_ganho: boolean;
  is_perdido: boolean;
  leads: Lead[];
  total_leads: number;
  valor_total: number;
}

export interface KanbanBoard {
  funil: Funil;
  colunas: KanbanColumn[];
}

// Grupos e Participantes WhatsApp

export interface GrupoWhatsApp {
  id: string;
  subject: string;
  participantCount: number;
}

export interface ParticipanteGrupo {
  id: string;
  number: string;
  isAdmin: boolean;
}

export interface ImportarParticipantesResult {
  importados: number;
  ignorados: number;
  erros: number;
}

// Resultado da sincronização

export interface SyncResult {
  success: boolean;
  total: number;
  novos: number;
  atualizados: number;
  message: string;
}

// Funil Analytics (visão histórica correta)

export interface FunilEstagioAcumulado {
  estagio_id: number;
  estagio_nome: string;
  estagio_cor: string;
  estagio_ordem: number;
  is_entrada: boolean;
  is_ganho: boolean;
  leads_passaram: number;
  taxa_etapa: number | null;
  taxa_geral: number;
}

export interface FunilDiarioEntry {
  dia: string;
  por_estagio: Array<{ estagio_id: number; estagio_nome: string; total: number }>;
}

export interface FunilAnalytics {
  acumulado: FunilEstagioAcumulado[];
  diario: FunilDiarioEntry[];
  boca_funil: number;
  taxa_conversao_geral: number;
}

// Estatísticas do funil

export interface FunilStats {
  total_leads: number;
  leads_ativos: number;
  valor_total: number;
  leads_ganhos: number;
  leads_perdidos: number;
  valor_ganho: number;
}

// Tarefas

export type TarefaTipo = 'ligacao' | 'reuniao' | 'email' | 'follow_up' | 'proposta' | 'visita' | 'outros';
export type TarefaStatus = 'pendente' | 'em_andamento' | 'concluida' | 'cancelada';
export type TarefaPrioridade = 'baixa' | 'normal' | 'alta' | 'urgente';
export type TarefaStatusVisual = 'cinza' | 'verde' | 'amarelo' | 'vermelho';

export interface Tarefa {
  id: number;
  lead_id: number;
  empresa_id: number;
  responsavel_id: number;
  criado_por_id: number;
  tipo: TarefaTipo;
  titulo: string;
  descricao?: string;
  data_vencimento: string;
  data_conclusao?: string;
  status: TarefaStatus;
  prioridade: TarefaPrioridade;
  status_visual?: TarefaStatusVisual;
  created_at: string;
  updated_at: string;
}

export interface CreateTarefaDto {
  lead_id: number;
  tipo: TarefaTipo;
  titulo: string;
  descricao?: string;
  data_vencimento: string;
  prioridade?: TarefaPrioridade;
  responsavel_id?: number;
}

export interface UpdateTarefaDto {
  tipo?: TarefaTipo;
  titulo?: string;
  descricao?: string;
  data_vencimento?: string;
  prioridade?: TarefaPrioridade;
  status?: TarefaStatus;
  responsavel_id?: number;
}

// Anotacoes

export type AnotacaoTipo = 'nota' | 'importante' | 'lembrete';

export interface Anotacao {
  id: number;
  lead_id: number;
  empresa_id: number;
  usuario_id: number;
  usuario_nome?: string;
  conteudo: string;
  tipo: AnotacaoTipo;
  created_at: string;
  updated_at: string;
}

export interface CreateAnotacaoDto {
  lead_id: number;
  conteudo: string;
  tipo?: AnotacaoTipo;
}

// Historico de mensagens WhatsApp

export interface HistoricoMensagem {
  id: number;
  lead_id?: number;
  contato_whatsapp_id: number;
  usuario_id: number;
  whatsapp_message_id?: string;
  direcao: 'entrada' | 'saida';
  tipo: 'texto' | 'imagem' | 'audio' | 'documento' | 'video' | 'sticker' | 'location';
  conteudo?: string;
  media_url?: string;
  media_filename?: string;
  media_mimetype?: string;
  media_tamanho?: number;
  gifPlayback?: boolean;
  enviado_at: string;
  lido_at?: string;
  entregue_at?: string;
  erro?: string;
  created_at: string;
}

// Agente IA
export interface AgenteIAConfig {
  id?: number;
  empresa_id?: number;
  ativo: boolean;
  provider?: string;
  api_key?: string | null;
  api_key_configurada?: boolean;
  gemini_api_key?: string | null;
  gemini_api_key_configurada?: boolean;
  modelo: string;
  nome_agente: string;
  tom: 'formal' | 'casual' | 'amigavel';
  area_negocio?: string;
  system_prompt_extra?: string;
  max_tokens: number;
  contexto_mensagens: number;
  usuarios_habilitados: number[];
  delay_segundos: number;
}

export interface AgenteIALeadStatus {
  ativo: boolean;
  fonte: 'lead' | 'estagio' | 'inativo';
}
