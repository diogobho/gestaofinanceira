import axios from 'axios';

const ASAAS_BASE_URL = process.env.ASAAS_API_URL || 'https://api.asaas.com/v3';
const ASAAS_API_KEY = process.env.ASAAS_API_KEY || '';

const asaasHttp = axios.create({
  baseURL: ASAAS_BASE_URL,
  headers: {
    'access_token': ASAAS_API_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
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

export interface AsaasSubscription {
  id: string;
  customer: string;
  billingType: 'BOLETO' | 'CREDIT_CARD' | 'PIX';
  value: number;
  nextDueDate: string;
  status: string;
  cycle: 'MONTHLY';
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

export const asaasService = {
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
    value: number;
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
      cycle: 'MONTHLY',
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
