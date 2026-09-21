import axios from 'axios';

const ASAAS_BASE_URL = process.env.ASAAS_API_URL || 'https://api.asaas.com/v3';

/**
 * Conta do Asaas que recebe as assinaturas do sistema: FUTURON INTELIGENCIA DE
 * NEGOCIO LTDA. Existe uma chave por conta do grupo (Futuron, Totem, Club) e
 * elas se parecem — o primeiro segmento é igual. Já houve troca por engano, com
 * a chave de uma conta de CLIENTE no `.env`. O CNPJ é a única coisa que
 * distingue de fato, então é por ele que a trava confere.
 */
const CNPJ_CONTA_ESPERADA = (process.env.ASAAS_CONTA_CNPJ || '53441843000190').replace(/\D/g, '');

const asaasHttp = axios.create({
  baseURL: ASAAS_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// A chave é lida a CADA request, não na carga do módulo: quando o PM2 não injeta
// ASAAS_API_KEY, quem a coloca em process.env é o dotenv de config/env.ts, e um
// import que chegue antes dele congelaria o header vazio (401 em tudo).
asaasHttp.interceptors.request.use(config => {
  config.headers.set('access_token', process.env.ASAAS_API_KEY || '');
  return config;
});

// Extrai mensagem legível dos erros da API Asaas
asaasHttp.interceptors.response.use(
  res => res,
  err => {
    const asaasErrors = err.response?.data?.errors;
    if (Array.isArray(asaasErrors) && asaasErrors.length > 0) {
      throw new Error(`Asaas: ${asaasErrors.map((e: any) => e.description || e.code).join(', ')}`);
    }
    const msg = err.response?.data?.message;
    if (msg) throw new Error(`Asaas: ${msg}`);
    throw err;
  }
);

export interface AsaasCustomer {
  id: string;
  name: string;
  email: string;
  cpfCnpj?: string;
  phone?: string;
}

/** Ciclos que usamos na fidelidade (a v3 aceita outros — WEEKLY, BIMONTHLY…). */
export type AsaasCycle = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY';

export interface AsaasSubscription {
  id: string;
  customer: string;
  billingType: 'BOLETO' | 'CREDIT_CARD' | 'PIX';
  value: number;
  nextDueDate: string;
  status: string;
  cycle: AsaasCycle;
  description?: string;
}

export interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  netValue: number;
  billingType: string;
  dueDate: string;
  invoiceUrl: string;
  bankSlipUrl?: string;
  pixQrCode?: string;
  pixKey?: string;
}

let contaEmCache: { nome: string; cnpj: string; verificadaEm: number } | null = null;
const CACHE_CONTA_MS = 10 * 60 * 1000;

export const asaasService = {
  /** Identidade da conta dona da chave em uso (empresa + CNPJ). */
  async getConta(): Promise<{ nome: string; cnpj: string }> {
    const res = await asaasHttp.get('/myAccount');
    return {
      nome: res.data?.company || res.data?.name || '',
      cnpj: String(res.data?.cpfCnpj || '').replace(/\D/g, ''),
    };
  },

  /**
   * Trava: nada de cliente/assinatura sai daqui sem que a chave em uso seja
   * comprovadamente da conta certa. Sem isso, uma chave trocada por engano
   * mandaria o dinheiro das assinaturas para outra empresa do grupo em silêncio
   * — e as cobranças antigas, que vivem na conta correta, sumiriam da API.
   *
   * Confere contra a API (10 min de cache, ~1 chamada por janela). Se a conta
   * não bater, falha o fluxo: perder uma assinatura é reparável, cobrar na
   * conta errada não.
   */
  async garantirContaCorreta(): Promise<void> {
    if (!process.env.ASAAS_API_KEY) {
      throw new Error('Asaas: ASAAS_API_KEY não configurada.');
    }

    const agora = Date.now();
    if (contaEmCache && contaEmCache.cnpj === CNPJ_CONTA_ESPERADA &&
        agora - contaEmCache.verificadaEm < CACHE_CONTA_MS) {
      return;
    }

    let conta: { nome: string; cnpj: string };
    try {
      conta = await this.getConta();
    } catch (err: any) {
      console.error('[asaas] não foi possível confirmar a conta da chave:', err?.message || err);
      throw new Error('Asaas: não foi possível confirmar a conta de cobrança. Tente novamente em instantes.');
    }

    contaEmCache = { ...conta, verificadaEm: agora };

    if (conta.cnpj !== CNPJ_CONTA_ESPERADA) {
      console.error(
        `[asaas] CONTA ERRADA — a chave em uso é de "${conta.nome}" (CNPJ ${conta.cnpj}); ` +
        `esperado o CNPJ ${CNPJ_CONTA_ESPERADA}. Corrija ASAAS_API_KEY no ecosystem.config.js ` +
        '(ele vence o api/.env) antes de aceitar assinaturas.'
      );
      throw new Error('Asaas: a chave configurada não é da conta que recebe as assinaturas. Nada foi cobrado.');
    }
  },

  async createCustomer(data: {
    name: string;
    email: string;
    cpfCnpj?: string;
    phone?: string;
  }): Promise<AsaasCustomer> {
    const res = await asaasHttp.post('/customers', {
      name: data.name,
      email: data.email,
      cpfCnpj: data.cpfCnpj,
      phone: data.phone,
    });
    return res.data;
  },

  async findCustomerByEmail(email: string): Promise<AsaasCustomer | null> {
    const res = await asaasHttp.get('/customers', { params: { email } });
    const list = res.data?.data || [];
    return list.length > 0 ? list[0] : null;
  },

  async updateCustomer(customerId: string, data: { cpfCnpj?: string; name?: string; phone?: string }): Promise<void> {
    await asaasHttp.put(`/customers/${customerId}`, data);
  },

  async createSubscription(data: {
    customerId: string;
    billingType: 'BOLETO' | 'CREDIT_CARD' | 'PIX';
    /** Valor cobrado A CADA ciclo — no anual é o ano inteiro, não o mês. */
    value: number;
    /** Compromisso de fidelidade. Sem isso, tudo vira mensal. */
    cycle?: AsaasCycle;
    nextDueDate: string; // YYYY-MM-DD
    description?: string;
    remoteIp?: string;
    creditCard?: {
      holderName: string;
      number: string;
      expiryMonth: string;
      expiryYear: string;
      ccv: string;
    };
    creditCardHolderInfo?: {
      name: string;
      email: string;
      cpfCnpj: string;
      postalCode?: string;
      addressNumber?: string;
      phone?: string;
    };
  }): Promise<AsaasSubscription> {
    const payload: any = {
      customer: data.customerId,
      billingType: data.billingType,
      value: data.value,
      nextDueDate: data.nextDueDate,
      cycle: data.cycle || 'MONTHLY',
      description: data.description || 'Gestão Financeira DuoFuturo',
    };

    if (data.billingType === 'CREDIT_CARD' && data.creditCard) {
      payload.creditCard = data.creditCard;
      payload.creditCardHolderInfo = data.creditCardHolderInfo;
      // remoteIp é obrigatório para cartão de crédito (prevenção de fraude)
      if (data.remoteIp) payload.remoteIp = data.remoteIp;
    }

    const res = await asaasHttp.post('/subscriptions', payload);
    return res.data;
  },

  async getSubscription(subscriptionId: string): Promise<AsaasSubscription | null> {
    try {
      const res = await asaasHttp.get(`/subscriptions/${subscriptionId}`);
      return res.data;
    } catch {
      return null;
    }
  },

  /**
   * Altera o valor/descrição de uma assinatura já existente.
   *
   * Usado quando o cliente muda a quantidade de usuários contratados: preserva o
   * ciclo, a data de vencimento e o histórico de cobranças — diferente de cancelar
   * e recriar, que reiniciaria o vencimento e geraria cobrança imediata.
   *
   * `updatePendingPayments` faz o Asaas reprecificar as cobranças em aberto; sem
   * isso, a fatura do mês corrente continuaria com o valor antigo.
   */
  async updateSubscription(subscriptionId: string, data: {
    value?: number;
    description?: string;
    updatePendingPayments?: boolean;
  }): Promise<AsaasSubscription> {
    const payload: any = {};
    if (data.value !== undefined) payload.value = data.value;
    if (data.description !== undefined) payload.description = data.description;
    payload.updatePendingPayments = data.updatePendingPayments ?? true;

    const res = await asaasHttp.post(`/subscriptions/${subscriptionId}`, payload);
    return res.data;
  },

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await asaasHttp.delete(`/subscriptions/${subscriptionId}`);
  },

  async getSubscriptionPayments(subscriptionId: string): Promise<AsaasPayment[]> {
    const res = await asaasHttp.get(`/subscriptions/${subscriptionId}/payments`);
    return res.data?.data || [];
  },

  async getPaymentBySubscription(subscriptionId: string): Promise<AsaasPayment | null> {
    // Retorna o pagamento mais recente/pendente
    const payments = await this.getSubscriptionPayments(subscriptionId);
    const pending = payments.find(p => p.status === 'PENDING');
    return pending || (payments.length > 0 ? payments[0] : null);
  },

  async createOneTimePayment(data: {
    customerId: string;
    billingType: 'BOLETO' | 'PIX';
    value: number;
    dueDate: string;
    description?: string;
  }): Promise<AsaasPayment> {
    const res = await asaasHttp.post('/payments', {
      customer: data.customerId,
      billingType: data.billingType,
      value: data.value,
      dueDate: data.dueDate,
      description: data.description || 'Gestão Financeira DuoFuturo',
    });
    return res.data;
  },

  async getPayment(paymentId: string): Promise<AsaasPayment | null> {
    try {
      const res = await asaasHttp.get(`/payments/${paymentId}`);
      return res.data;
    } catch {
      return null;
    }
  },

  async getPixQrCode(paymentId: string): Promise<{ encodedImage: string; payload: string; expirationDate: string }> {
    const res = await asaasHttp.get(`/payments/${paymentId}/pixQrCode`);
    return res.data;
  },
};
