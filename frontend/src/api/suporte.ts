import api from './client';

export type StatusTicket = 'aberto' | 'aguardando_cliente' | 'aguardando_suporte' | 'resolvido' | 'fechado';
export type AutorMensagem = 'cliente' | 'suporte';
export type TipoMensagem = 'mensagem' | 'nota_interna' | 'evento';

export interface Ticket {
  id: number;
  empresa_id: number;
  usuario_id: number;
  assunto: string;
  categoria: string;
  prioridade: string;
  status: StatusTicket;
  canal: string;
  email_contato: string | null;
  created_at: string;
  updated_at: string;
  resolvido_at: string | null;
  primeira_resposta_at: string | null;
  usuario_nome?: string;
  empresa_nome?: string;
  total_mensagens?: number;
}

export interface TicketMensagem {
  id: number;
  ticket_id: number;
  autor: AutorMensagem;
  usuario_id: number | null;
  conteudo: string;
  automatica: boolean;
  tipo: TipoMensagem;
  visivel_cliente: boolean;
  created_at: string;
  autor_nome?: string;
  anexos?: TicketAnexo[];
}

export interface TicketAnexo {
  id: number;
  ticket_id: number;
  mensagem_id: number | null;
  nome_original: string;
  mimetype: string;
  tamanho_bytes: number;
  created_at: string;
}

export interface MetricasSuporte {
  total: number;
  na_fila: number;
  com_cliente: number;
  encerrados: number;
  abertos_alta: number;
  min_primeira_resposta: number | null;
  min_resolucao: number | null;
  sem_resposta: number;
  por_categoria: Array<{ categoria: string; total: number }>;
  atendente: boolean;
}

export const ROTULO_PRIORIDADE: Record<string, string> = {
  baixa: 'Baixa', normal: 'Normal', alta: 'Alta',
};

/**
 * URL de download de um anexo, com o token na query.
 *
 * Mesma razão da mídia do WhatsApp: `<img src>` é requisição nativa do navegador e
 * não manda o header `Authorization`. O endpoint aceita os dois.
 */
export function urlAnexo(anexoId: number): string {
  const base = import.meta.env.VITE_API_URL || '/api/gestao';
  const token = localStorage.getItem('token');
  return `${base}/suporte/anexos/${anexoId}${token ? `?t=${encodeURIComponent(token)}` : ''}`;
}

export const ROTULO_STATUS: Record<StatusTicket, string> = {
  aberto: 'Aberto',
  aguardando_cliente: 'Aguardando você',
  aguardando_suporte: 'Com a equipe',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
};

export const ROTULO_CATEGORIA: Record<string, string> = {
  duvida: 'Dúvida',
  problema: 'Problema',
  sugestao: 'Sugestão',
  cobranca: 'Cobrança',
};

export const suporteApi = {
  async listar(status?: string): Promise<{ tickets: Ticket[]; atendente: boolean }> {
    const res = await api.get('/suporte/tickets', { params: status ? { status } : undefined });
    return res.data;
  },

  async criar(data: {
    assunto: string;
    categoria: string;
    prioridade?: string;
    mensagem: string;
  }): Promise<Ticket> {
    const res = await api.post('/suporte/tickets', data);
    return res.data.ticket;
  },

  async detalhe(id: number): Promise<{ ticket: Ticket; mensagens: TicketMensagem[]; atendente: boolean }> {
    const res = await api.get(`/suporte/tickets/${id}`);
    return res.data;
  },

  async responder(
    id: number, conteudo: string,
    opcoes: { anexoIds?: number[]; interna?: boolean } = {}
  ): Promise<TicketMensagem> {
    const res = await api.post(`/suporte/tickets/${id}/mensagens`, {
      conteudo, anexo_ids: opcoes.anexoIds, interna: opcoes.interna,
    });
    return res.data.mensagem;
  },

  async alterarStatus(id: number, status: StatusTicket): Promise<Ticket> {
    const res = await api.patch(`/suporte/tickets/${id}/status`, { status });
    return res.data.ticket;
  },

  async alterarPrioridade(id: number, prioridade: string): Promise<Ticket> {
    const res = await api.patch(`/suporte/tickets/${id}/prioridade`, { prioridade });
    return res.data.ticket;
  },

  /** Sobe UM arquivo e devolve o anexo, ainda sem mensagem associada. */
  async subirAnexo(ticketId: number, arquivo: File): Promise<TicketAnexo> {
    const fd = new FormData();
    fd.append('file', arquivo);
    const res = await api.post(`/suporte/tickets/${ticketId}/anexos`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.anexo;
  },

  /** Sugestão para o ATENDENTE. Nada daqui é enviado ao cliente sem revisão. */
  async metricas(): Promise<MetricasSuporte> {
    const res = await api.get('/suporte/metricas');
    return res.data;
  },
};
