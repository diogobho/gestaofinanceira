import api from './client';

export interface Plano {
  id: number;
  nome: string;
  descricao: string;
  preco_mensal: number;
  max_usuarios: number | null;
  features: string[];
  destaque: boolean;
  /** Usuários inclusos no preço base (conta o master da empresa). */
  usuarios_base: number | null;
  /** Teto de usuários do plano, mesmo comprando adicionais. */
  usuarios_max: number | null;
  /** Preço mensal de cada usuário acima da base. */
  preco_usuario_adicional: number;
  /** Se o cliente pode comprar usuários adicionais. */
  customizavel: boolean;
}

/** Mesma regra do backend (assinaturas.service.calcularPreco). */
export function calcularPreco(plano: Plano, usuarios: number, cortesia = 0): number {
  const base = plano.usuarios_base ?? usuarios;
  const cobraveis = Math.max(0, usuarios - base - cortesia);
  const total = Number(plano.preco_mensal) + cobraveis * Number(plano.preco_usuario_adicional || 0);
  return Math.round(total * 100) / 100;
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
  /** Total de usuários contratado (inclui o master). */
  usuarios_contratados: number | null;
  /** Usuários acima da base sem cobrança (cliente anterior ao modelo customizável). */
  usuarios_cortesia: number;
  /** Quantos já existem de fato. */
  usuarios_em_uso?: number;
  /** Valor mensal já com os adicionais. */
  preco_total?: number;
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
    /** Total de usuários contratados; omitido usa a base do plano. */
    usuarios?: number;
  }): Promise<{ assinatura: Assinatura; paymentUrl?: string; pixQrCode?: string; pixQrCodeImage?: string }> {
    const res = await api.post('/assinaturas/assinar', data);
    return res.data;
  },

  async alterarUsuarios(usuarios: number): Promise<Assinatura> {
    const res = await api.put('/assinaturas/usuarios', { usuarios });
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
