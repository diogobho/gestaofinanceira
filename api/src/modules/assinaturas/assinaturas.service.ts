import { query } from '../../config/database';
import { asaasService } from '../../services/asaas.service';

export interface Plano {
  id: number;
  nome: string;
  descricao: string;
  preco_mensal: number;
  max_usuarios: number | null;
  features: string[];
  destaque: boolean;
  ativo: boolean;
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

export const assinaturasService = {
  async getPlanos(): Promise<Plano[]> {
    const res = await query('SELECT * FROM planos WHERE ativo = true ORDER BY preco_mensal ASC');
    return res.rows;
  },

  async getPlanoById(id: number): Promise<Plano | null> {
    const res = await query('SELECT * FROM planos WHERE id = $1 AND ativo = true', [id]);
    return res.rows[0] || null;
  },

  async getAssinaturaByEmpresa(empresaId: number): Promise<Assinatura | null> {
    const res = await query(`
      SELECT a.*, p.nome as plano_nome, p.preco_mensal, p.max_usuarios, p.features, p.descricao, p.destaque
      FROM assinaturas a
      LEFT JOIN planos p ON a.plano_id = p.id
      WHERE a.empresa_id = $1
    `, [empresaId]);

    if (!res.rows[0]) return null;
    const row = res.rows[0];
    return {
      ...row,
      plano: row.plano_id ? {
        id: row.plano_id,
        nome: row.plano_nome,
        descricao: row.descricao,
        preco_mensal: row.preco_mensal,
        max_usuarios: row.max_usuarios,
        features: row.features || [],
        destaque: row.destaque,
        ativo: true,
      } : null,
    };
  },

  /** Cria assinatura inicial para empresa recém-criada (ativa sem vencimento) */
  async criarTrialParaEmpresa(empresaId: number): Promise<void> {
    await query(`
      INSERT INTO assinaturas (empresa_id, status)
      VALUES ($1, 'ativa')
      ON CONFLICT (empresa_id) DO NOTHING
    `, [empresaId]);
  },

  /** Verifica se a assinatura está ativa (trial válido ou plano ativo) */
  async isAtiva(empresaId: number): Promise<{ ativa: boolean; motivo?: string; status: string }> {
    const assinatura = await this.getAssinaturaByEmpresa(empresaId);

    if (!assinatura) {
      // Empresa sem assinatura → criar trial automaticamente
      await this.criarTrialParaEmpresa(empresaId);
      return { ativa: true, status: 'trial' };
    }

    if (assinatura.status === 'ativa' || assinatura.status === 'trial') {
      // plano_ativo_ate = null → ativado pelo master sem vencimento → sempre ativo
      if (assinatura.plano_ativo_ate && new Date(assinatura.plano_ativo_ate) < new Date()) {
        await query(`UPDATE assinaturas SET status = 'expirada', updated_at = now() WHERE empresa_id = $1`, [empresaId]);
        return { ativa: false, motivo: 'Assinatura expirada', status: 'expirada' };
      }
      return { ativa: true, status: 'ativa' };
    }

    if (assinatura.status === 'aguardando_pagamento') {
      return { ativa: false, motivo: 'Aguardando confirmação do pagamento', status: 'aguardando_pagamento' };
    }

    if (assinatura.status === 'suspensa') {
      return { ativa: false, motivo: 'Assinatura suspensa por falta de pagamento', status: 'suspensa' };
    }

    if (assinatura.status === 'cancelada') {
      return { ativa: false, motivo: 'Assinatura cancelada', status: 'cancelada' };
    }

    return { ativa: false, motivo: 'Assinatura expirada', status: assinatura.status };
  },

  /** Inicia assinatura via Asaas (cria customer + subscription) */
  async assinar(params: {
    empresaId: number;
    planoId: number;
    billingType: 'BOLETO' | 'CREDIT_CARD' | 'PIX';
    nomeEmpresa: string;
    emailContato: string;
    cpfCnpj?: string;
    creditCard?: any;
    creditCardHolderInfo?: any;
    remoteIp?: string;
  }): Promise<{ assinatura: Assinatura; paymentUrl?: string; pixQrCode?: string; pixQrCodeImage?: string }> {
    const plano = await this.getPlanoById(params.planoId);
    if (!plano) throw new Error('Plano não encontrado');

    const assinatura = await this.getAssinaturaByEmpresa(params.empresaId);

    // 1. Criar ou recuperar customer no Asaas
    let customerId = assinatura?.asaas_customer_id;
    if (!customerId) {
      // Tentar achar customer existente pelo e-mail
      let customer = await asaasService.findCustomerByEmail(params.emailContato);
      if (!customer) {
        customer = await asaasService.createCustomer({
          name: params.nomeEmpresa,
          email: params.emailContato,
          cpfCnpj: params.cpfCnpj,
        });
      } else if (params.cpfCnpj && !customer.cpfCnpj) {
        // Atualizar CPF/CNPJ se customer existe mas está sem CPF
        await asaasService.updateCustomer(customer.id, { cpfCnpj: params.cpfCnpj });
      }
      customerId = customer.id;
    }

    // 2. Cancelar subscription anterior se existir
    if (assinatura?.asaas_subscription_id) {
      try {
        await asaasService.cancelSubscription(assinatura.asaas_subscription_id);
      } catch { /* ignore */ }
    }

    // 3. Calcular próxima data de vencimento (hoje + 1 dia)
    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + 1);
    const nextDueDate = nextDue.toISOString().split('T')[0];

    // 4. Criar subscription no Asaas
    const subscription = await asaasService.createSubscription({
      customerId,
      billingType: params.billingType,
      value: plano.preco_mensal,
      nextDueDate,
      description: `${plano.nome} - Gestão Financeira DuoFuturo`,
      creditCard: params.creditCard,
      creditCardHolderInfo: params.creditCardHolderInfo,
      remoteIp: params.remoteIp,
    });

    // 5. Atualizar assinatura no banco
    // Cartão de crédito: ativa imediatamente (pagamento síncrono)
    // PIX / Boleto: aguarda confirmação via webhook
    const statusInicial = params.billingType === 'CREDIT_CARD' ? 'ativa' : 'aguardando_pagamento';
    const planoAtivate = params.billingType === 'CREDIT_CARD' ? (() => {
      const d = new Date(); d.setMonth(d.getMonth() + 1); return d;
    })() : null;

    await query(`
      INSERT INTO assinaturas (empresa_id, plano_id, status, asaas_customer_id, asaas_subscription_id, asaas_next_due_date, plano_ativo_ate, updated_at)
      VALUES ($1, $2, $7, $3, $4, $5, $6, now())
      ON CONFLICT (empresa_id) DO UPDATE SET
        plano_id = $2, status = $7, asaas_customer_id = $3,
        asaas_subscription_id = $4, asaas_next_due_date = $5,
        plano_ativo_ate = $6, updated_at = now()
    `, [params.empresaId, params.planoId, customerId, subscription.id, nextDueDate, planoAtivate, statusInicial]);

    const novaAssinatura = await this.getAssinaturaByEmpresa(params.empresaId);

    // 6. Para BOLETO/PIX, buscar URL de pagamento do primeiro invoice
    let paymentUrl: string | undefined;
    let pixQrCode: string | undefined;
    let pixQrCodeImage: string | undefined;

    if (params.billingType === 'BOLETO' || params.billingType === 'PIX') {
      try {
        const payment = await asaasService.getPaymentBySubscription(subscription.id);
        if (payment) {
          paymentUrl = payment.invoiceUrl;
          if (params.billingType === 'PIX' && payment.id) {
            const qr = await asaasService.getPixQrCode(payment.id);
            pixQrCode = qr.payload;
            pixQrCodeImage = qr.encodedImage;
          }
        }
      } catch { /* payment info will arrive via webhook */ }
    }

    return { assinatura: novaAssinatura!, paymentUrl, pixQrCode, pixQrCodeImage };
  },

  /** Suspender assinatura de empresa — apenas super_admin */
  async suspender(empresaId: number, motivo?: string): Promise<void> {
    const assinatura = await this.getAssinaturaByEmpresa(empresaId);
    if (!assinatura) throw new Error('Assinatura não encontrada');

    await query(`
      UPDATE assinaturas
      SET status = 'suspensa', cancelamento_motivo = $2, updated_at = now()
      WHERE empresa_id = $1
    `, [empresaId, motivo || null]);
  },

  /** Ativar empresa indefinidamente (sem vencimento) — apenas super_admin */
  async ativarIndefinidamente(empresaId: number): Promise<void> {
    await query(`
      INSERT INTO assinaturas (empresa_id, status, plano_ativo_ate, updated_at)
      VALUES ($1, 'ativa', NULL, now())
      ON CONFLICT (empresa_id) DO UPDATE SET
        status = 'ativa', plano_ativo_ate = NULL, updated_at = now()
    `, [empresaId]);
  },

  /** Cancelar assinatura */
  async cancelar(empresaId: number, motivo?: string): Promise<void> {
    const assinatura = await this.getAssinaturaByEmpresa(empresaId);
    if (!assinatura) throw new Error('Assinatura não encontrada');

    if (assinatura.asaas_subscription_id) {
      try {
        await asaasService.cancelSubscription(assinatura.asaas_subscription_id);
      } catch { /* ignore */ }
    }

    await query(`
      UPDATE assinaturas
      SET status = 'cancelada', cancelamento_motivo = $2, updated_at = now()
      WHERE empresa_id = $1
    `, [empresaId, motivo || null]);
  },

  /** Processar webhook do Asaas */
  async processarWebhook(event: string, payload: any): Promise<void> {
    const subscriptionId: string | undefined = payload.subscription;

    if (!subscriptionId) return;

    // Encontrar assinatura pelo ID do Asaas
    const res = await query(
      'SELECT * FROM assinaturas WHERE asaas_subscription_id = $1',
      [subscriptionId]
    );
    if (!res.rows[0]) return;

    const assinatura = res.rows[0];

    switch (event) {
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED': {
        // Pagamento confirmado → ativa por mais 1 mês
        const novoVencimento = new Date();
        novoVencimento.setMonth(novoVencimento.getMonth() + 1);
        await query(`
          UPDATE assinaturas
          SET status = 'ativa', plano_ativo_ate = $2, asaas_next_due_date = $3, updated_at = now()
          WHERE id = $1
        `, [
          assinatura.id,
          novoVencimento,
          payload.dueDate || null,
        ]);
        break;
      }

      case 'PAYMENT_OVERDUE': {
        // Pagamento vencido → suspende
        await query(`
          UPDATE assinaturas SET status = 'suspensa', updated_at = now() WHERE id = $1
        `, [assinatura.id]);
        break;
      }

      case 'PAYMENT_DELETED':
      case 'SUBSCRIPTION_DELETED': {
        await query(`
          UPDATE assinaturas SET status = 'cancelada', updated_at = now() WHERE id = $1
        `, [assinatura.id]);
        break;
      }
    }
  },
};
