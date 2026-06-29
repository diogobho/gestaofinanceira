import api from './client';

export interface Plano {
  id: number;
  nome: string;
  descricao: string;
  preco_mensal: number;
  max_usuarios: number | null;
  features: string[];
  destaque: boolean;
}

export interface Assinatura {
  id: number;
  empresa_id: number;
  plano_id: number | null;
  status: 'trial' | 'ativa' | 'aguardando_pagamento' | 'suspensa' | 'cancelada' | 'expirada';
  trial_expira_em: string | null;
  plano_ativo_ate: string | null;
  asaas_customer_id: string | null;
  asaas_subscription_id: string | null;
  asaas_next_due_date: string | null;
  plano?: Plano;
}

export const assinaturasApi = {
  async getPlanos(): Promise<Plano[]> {
    const res = await api.get('/planos');
    return res.data.planos;
  },

  async getMinhaAssinatura(): Promise<Assinatura | null> {
    const res = await api.get('/assinaturas/minha');
    return res.data.assinatura;
  },

  async getStatus(): Promise<{ ativa: boolean; status: string; motivo?: string }> {
    const res = await api.get('/assinaturas/status');
    return res.data;
  },

  async assinar(data: {
    plano_id: number;
    billing_type: 'BOLETO' | 'CREDIT_CARD' | 'PIX';
    cpf_cnpj?: string;
    credit_card?: object;
    credit_card_holder_info?: object;
  }): Promise<{ assinatura: Assinatura; paymentUrl?: string; pixQrCode?: string; pixQrCodeImage?: string }> {
    const res = await api.post('/assinaturas/assinar', data);
    return res.data;
  },

  async cancelar(motivo?: string): Promise<void> {
    await api.post('/assinaturas/cancelar', { motivo });
  },

  async ativarEmpresaIndefinidamente(empresaId: number): Promise<void> {
    await api.post(`/assinaturas/${empresaId}/ativar`);
  },

  async suspenderEmpresa(empresaId: number, motivo?: string): Promise<void> {
    await api.post(`/assinaturas/${empresaId}/suspender`, { motivo });
  },

  async cancelarEmpresa(empresaId: number, motivo?: string): Promise<void> {
    await api.post(`/assinaturas/${empresaId}/cancelar-admin`, { motivo });
  },
};
