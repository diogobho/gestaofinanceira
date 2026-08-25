import api from './client';

export type StatusTicket = 'aberto' | 'aguardando_cliente' | 'aguardando_suporte' | 'resolvido' | 'fechado';
export type AutorMensagem = 'cliente' | 'agente_ia' | 'suporte';

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
  created_at: string;
  autor_nome?: string;
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

  async responder(id: number, conteudo: string): Promise<TicketMensagem> {
    const res = await api.post(`/suporte/tickets/${id}/mensagens`, { conteudo });
    return res.data.mensagem;
  },

  async alterarStatus(id: number, status: StatusTicket): Promise<Ticket> {
    const res = await api.patch(`/suporte/tickets/${id}/status`, { status });
    return res.data.ticket;
  },
};
