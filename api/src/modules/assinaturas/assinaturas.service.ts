import { query } from '../../config/database';
import { asaasService } from '../../services/asaas.service';
import { addMonthsClamped } from '../../shared/utils';

export interface Plano {
  id: number;
  nome: string;
  descricao: string;
  preco_mensal: number;
  max_usuarios: number | null;
  features: string[];
  destaque: boolean;
  ativo: boolean;
  /** Usuários inclusos no preço base (conta o master da empresa). */
  usuarios_base: number | null;
  /** Teto de usuários do plano, mesmo comprando adicionais. */
  usuarios_max: number | null;
  /** Preço mensal de cada usuário acima da base. */
  preco_usuario_adicional: number;
  /** Se o cliente pode comprar usuários adicionais. */
  customizavel: boolean;
}

/**
 * Preço mensal de uma assinatura para uma dada quantidade de usuários.
 *
 * Cada usuário acima da base custa `preco_usuario_adicional`. Usuários de
 * cortesia (concedidos a quem já era cliente antes do modelo customizável)
 * não entram na conta — ver migration 061.
 */
export function calcularPreco(
  plano: Pick<Plano, 'preco_mensal' | 'usuarios_base' | 'preco_usuario_adicional'>,
  usuariosContratados: number,
  usuariosCortesia = 0
): number {
  const base = plano.usuarios_base ?? usuariosContratados;
  const cobraveis = Math.max(0, usuariosContratados - base - usuariosCortesia);
  const total = Number(plano.preco_mensal) + cobraveis * Number(plano.preco_usuario_adicional || 0);
  // Evita 219.00000000000003 em ponto flutuante.
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
  /** Total de usuários que a empresa contratou (inclui o master). */
  usuarios_contratados: number | null;
  /** Usuários acima da base que não são cobrados (cliente anterior ao modelo). */
  usuarios_cortesia: number;
  /** Quantos já existem de fato — para a tela mostrar "5 de 8". */
  usuarios_em_uso?: number;
  /** Valor mensal já com os adicionais. */
  preco_total?: number;
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
      SELECT a.*, p.nome as plano_nome, p.preco_mensal, p.max_usuarios, p.features, p.descricao, p.destaque,
             p.usuarios_base, p.usuarios_max, p.preco_usuario_adicional, p.customizavel,
             (SELECT COUNT(*)::int FROM usuarios u WHERE u.empresa_id = a.empresa_id AND u.ativo) AS usuarios_em_uso
      FROM assinaturas a
      LEFT JOIN planos p ON a.plano_id = p.id
      WHERE a.empresa_id = $1
    `, [empresaId]);

    if (!res.rows[0]) return null;
    const row = res.rows[0];

    const plano: Plano | null = row.plano_id ? {
      id: row.plano_id,
      nome: row.plano_nome,
      descricao: row.descricao,
      preco_mensal: row.preco_mensal,
      max_usuarios: row.max_usuarios,
      features: row.features || [],
      destaque: row.destaque,
      ativo: true,
      usuarios_base: row.usuarios_base,
      usuarios_max: row.usuarios_max,
      preco_usuario_adicional: Number(row.preco_usuario_adicional || 0),
      customizavel: !!row.customizavel,
    } : null;

    // Assinatura antiga sem quantidade definida cai na base do plano.
    const contratados = row.usuarios_contratados ?? plano?.usuarios_base ?? null;

    return {
      ...row,
      plano,
      usuarios_contratados: contratados,
      usuarios_cortesia: row.usuarios_cortesia ?? 0,
      usuarios_em_uso: row.usuarios_em_uso ?? 0,
      preco_total: plano && contratados
        ? calcularPreco(plano, contratados, row.usuarios_cortesia ?? 0)
        : plano ? Number(plano.preco_mensal) : undefined,
    };
  },

  /**
   * Limite de usuários da empresa. É o que a empresa CONTRATOU, não o que o
   * plano inclui — quem comprou adicionais tem limite maior, e quem já era
   * cliente antes do modelo customizável mantém o que tinha (cortesia).
   * Sem assinatura ou sem plano, não há limite a aplicar.
   */
  async getLimiteUsuarios(empresaId: number): Promise<{ limite: number | null; emUso: number }> {
    const res = await query(`
      SELECT a.usuarios_contratados, p.usuarios_base,
             (SELECT COUNT(*)::int FROM usuarios u WHERE u.empresa_id = $1 AND u.ativo) AS em_uso
        FROM assinaturas a
        LEFT JOIN planos p ON p.id = a.plano_id
       WHERE a.empresa_id = $1
    `, [empresaId]);

    const row = res.rows[0];
    if (!row) return { limite: null, emUso: 0 };
    const limite = row.usuarios_contratados ?? row.usuarios_base ?? null;
    return { limite, emUso: row.em_uso ?? 0 };
  },

  /**
   * Altera a quantidade de usuários contratados e reprecifica a assinatura no
   * Asaas. Reduzir abaixo do que já está em uso é recusado: o efeito seria
   * deixar contas ativas fora do limite, sem critério para escolher quais.
   */
  async alterarQuantidadeUsuarios(empresaId: number, novaQuantidade: number): Promise<Assinatura> {
    const assinatura = await this.getAssinaturaByEmpresa(empresaId);
    if (!assinatura) throw new Error('Assinatura não encontrada');
    const plano = assinatura.plano;
    if (!plano) throw new Error('Assinatura sem plano definido');
    if (!plano.customizavel) {
      throw new Error(`O plano ${plano.nome} não permite adicionar usuários. Faça upgrade para o Profissional ou Enterprise.`);
    }

    const base = plano.usuarios_base ?? 0;
    const teto = plano.usuarios_max ?? base;
    const qtd = Math.trunc(Number(novaQuantidade));

    if (!Number.isFinite(qtd) || qtd < base) {
      throw new Error(`A quantidade mínima do plano ${plano.nome} é ${base} usuários.`);
    }
    if (qtd > teto) {
      throw new Error(`O plano ${plano.nome} aceita no máximo ${teto} usuários. Para mais que isso, fale com o suporte.`);
    }
    const emUso = assinatura.usuarios_em_uso ?? 0;
    if (qtd < emUso) {
      throw new Error(`A empresa tem ${emUso} usuários ativos. Desative ${emUso - qtd} antes de reduzir para ${qtd}.`);
    }

    const novoPreco = calcularPreco(plano, qtd, assinatura.usuarios_cortesia);

    // Reprecifica no Asaas antes de gravar: se a cobrança falhar, o limite não muda.
    if (assinatura.asaas_subscription_id) {
      await asaasService.updateSubscription(assinatura.asaas_subscription_id, {
        value: novoPreco,
        description: `${plano.nome} — ${qtd} usuários — Gestão Financeira DuoFuturo`,
        updatePendingPayments: true,
      });
    }

    await query(
      `UPDATE assinaturas SET usuarios_contratados = $2, updated_at = now() WHERE empresa_id = $1`,
      [empresaId, qtd]
    );

    return (await this.getAssinaturaByEmpresa(empresaId))!;
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
    /** Total de usuários contratados (inclui o master). Default: base do plano. */
    usuarios?: number;
  }): Promise<{ assinatura: Assinatura; paymentUrl?: string; pixQrCode?: string; pixQrCodeImage?: string }> {
    const plano = await this.getPlanoById(params.planoId);
    if (!plano) throw new Error('Plano não encontrado');

    const assinatura = await this.getAssinaturaByEmpresa(params.empresaId);

    // Quantidade contratada: só o plano customizável aceita valor diferente da base.
    const base = plano.usuarios_base ?? 0;
    const teto = plano.customizavel ? (plano.usuarios_max ?? base) : base;
    let usuarios = params.usuarios != null ? Math.trunc(Number(params.usuarios)) : base;
    if (!Number.isFinite(usuarios) || usuarios < base) usuarios = base;
    if (usuarios > teto) {
      throw new Error(`O plano ${plano.nome} aceita no máximo ${teto} usuários.`);
    }

    // Trocar de plano não pode deixar contas ativas fora do limite contratado.
    const emUso = assinatura?.usuarios_em_uso ?? 0;
    if (usuarios < emUso) {
      throw new Error(`A empresa tem ${emUso} usuários ativos. Contrate ao menos ${emUso} usuários ou desative os excedentes.`);
    }

    // A cortesia é do plano anterior: ao contratar, o cliente passa a pagar o que escolheu.
    const precoTotal = calcularPreco(plano, usuarios, 0);

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
      value: precoTotal,
      nextDueDate,
      description: `${plano.nome} — ${usuarios} usuários — Gestão Financeira DuoFuturo`,
      creditCard: params.creditCard,
      creditCardHolderInfo: params.creditCardHolderInfo,
      remoteIp: params.remoteIp,
    });

    // 5. Atualizar assinatura no banco
    // Cartão de crédito: ativa imediatamente (pagamento síncrono)
    // PIX / Boleto: aguarda confirmação via webhook
    const statusInicial = params.billingType === 'CREDIT_CARD' ? 'ativa' : 'aguardando_pagamento';
    const planoAtivate = params.billingType === 'CREDIT_CARD' ? addMonthsClamped(new Date(), 1) : null;

    // usuarios_cortesia zera: o cliente passa a pagar pela quantidade que contratou.
    await query(`
      INSERT INTO assinaturas (empresa_id, plano_id, status, asaas_customer_id, asaas_subscription_id, asaas_next_due_date, plano_ativo_ate, usuarios_contratados, usuarios_cortesia, updated_at)
      VALUES ($1, $2, $7, $3, $4, $5, $6, $8, 0, now())
      ON CONFLICT (empresa_id) DO UPDATE SET
        plano_id = $2, status = $7, asaas_customer_id = $3,
        asaas_subscription_id = $4, asaas_next_due_date = $5,
        plano_ativo_ate = $6, usuarios_contratados = $8, usuarios_cortesia = 0,
        updated_at = now()
    `, [params.empresaId, params.planoId, customerId, subscription.id, nextDueDate, planoAtivate, statusInicial, usuarios]);

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
        const novoVencimento = addMonthsClamped(new Date(), 1);
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
