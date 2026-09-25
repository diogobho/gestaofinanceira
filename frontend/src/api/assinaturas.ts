import api from './client';
import type { Capacidade } from '@/utils/capacidades';

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
  /** Compromissos de fidelidade (migration 067). */
  ciclos?: PlanoCiclo[];
}

export type Ciclo = 'mensal' | 'trimestral' | 'semestral' | 'anual';

export interface PlanoCiclo {
  ciclo: Ciclo;
  meses: number;
  /** Equivalente MENSAL já com desconto — o total do ciclo é preco_mensal * meses. */
  preco_mensal: number;
  asaas_cycle: string;
}

export const ROTULO_CICLO: Record<Ciclo, string> = {
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

/** Como o compromisso aparece por extenso em resumo de pedido. */
export const COMPROMISSO_CICLO: Record<Ciclo, string> = {
  mensal: 'sem fidelidade, cancele quando quiser',
  trimestral: 'compromisso de 3 meses',
  semestral: 'compromisso de 6 meses',
  anual: 'compromisso de 12 meses',
};

/** Mesma regra do backend (assinaturas.service.calcularPreco). */
export function calcularPreco(plano: Plano, usuarios: number, cortesia = 0): number {
  const base = plano.usuarios_base ?? usuarios;
  const cobraveis = Math.max(0, usuarios - base - cortesia);
  const total = Number(plano.preco_mensal) + cobraveis * Number(plano.preco_usuario_adicional || 0);
  return Math.round(total * 100) / 100;
}

/**
 * O compromisso de menor prazo À VENDA é a referência de preço: é contra ele que
 * se mede o desconto dos demais. Era o mensal até 21/09/2026, quando mensal e
 * trimestral saíram de venda — riscar "R$ 219" ao lado de um preço que ninguém
 * mais consegue contratar seria anunciar um desconto que não existe.
 * A API só devolve ciclos ativos, já ordenados por meses.
 */
export function cicloReferencia(plano: Plano): PlanoCiclo {
  return plano.ciclos?.[0] ?? { ciclo: 'mensal', meses: 1, preco_mensal: Number(plano.preco_mensal), asaas_cycle: 'MONTHLY' };
}

/** Compromissos à venda, na ordem do seletor. */
export function ciclosDisponiveis(plano?: Plano): Ciclo[] {
  return plano?.ciclos?.map(c => c.ciclo) ?? []
}

export function cicloDe(plano: Plano, ciclo: Ciclo): PlanoCiclo {
  return plano.ciclos?.find(c => c.ciclo === ciclo) ?? cicloReferencia(plano);
}

/**
 * Mesma regra do backend (assinaturas.service.calcularCobranca): o desconto é do
 * plano, o usuário adicional continua a preço cheio por mês.
 */
export function calcularCobranca(
  plano: Plano,
  ciclo: PlanoCiclo,
  usuarios: number,
  cortesia = 0
): { mensal: number; total: number; meses: number } {
  const base = plano.usuarios_base ?? usuarios;
  const cobraveis = Math.max(0, usuarios - base - cortesia);
  const mensal = Math.round(
    (Number(ciclo.preco_mensal) + cobraveis * Number(plano.preco_usuario_adicional || 0)) * 100
  ) / 100;
  return { mensal, total: Math.round(mensal * ciclo.meses * 100) / 100, meses: ciclo.meses };
}

/** Quanto se economiza no ano contra o compromisso de referência. */
export function economiaAnual(plano: Plano, ciclo: PlanoCiclo): number {
  const referencia = Number(cicloReferencia(plano).preco_mensal);
  return Math.round((referencia - Number(ciclo.preco_mensal)) * 12 * 100) / 100;
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
  /** Compromisso contratado. */
  ciclo?: Ciclo;
  /** Valor cobrado a cada ciclo (mensal * meses). */
  preco_por_ciclo?: number;
  /** Meses de cada cobrança — 1, 3, 6 ou 12. */
  ciclo_meses?: number;
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

  /**
   * Assinatura + o que o plano permite, na MESMA resposta. São duas perguntas que
   * sempre andam juntas e que não podem discordar: o backend responde as duas de
   * uma vez para não existir o instante em que a tela sabe o plano novo e ainda
   * usa as capacidades do antigo.
   */
  async getMinhaAssinaturaComCapacidades(): Promise<{
    assinatura: Assinatura | null
    capacidades: Capacidade[]
  }> {
    const res = await api.get('/assinaturas/minha');
    return {
      assinatura: res.data.assinatura ?? null,
      capacidades: Array.isArray(res.data.capacidades) ? res.data.capacidades : [],
    };
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
    /** Compromisso de fidelidade; omitido é o de menor prazo à venda. */
    ciclo?: Ciclo;
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
