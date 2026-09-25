import bcrypt from 'bcryptjs';
import { query } from '../../config/database';
import { signAccessToken } from '../../config/jwt';
import { assinaturasService, calcularCobranca } from '../assinaturas/assinaturas.service';
import { asaasService } from '../../services/asaas.service';
import { addMonthsClamped } from '../../shared/utils';
import { enviarBoasVindas } from '../../services/boas-vindas.service';
import { registrarLeadDoCadastro } from '../onboarding/lead-cadastro';
import { digitosParaGravar } from '../crm/_shared/telefone';
import { podeUsarCloudApi } from '../whatsapp/meta/acesso';
import { whatsappProvisionService } from '../../services/whatsapp-provision.service';

// Versão vigente dos Termos de Uso / Política de Privacidade (atualize ao publicar nova versão).
export const TERMOS_VERSAO = '1.0';

export const authService = {
  async login(email: string, senha: string) {
    const result = await query('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (result.rows.length === 0) throw new Error('Credenciais inválidas');

    const user = result.rows[0];
    const isValid = await bcrypt.compare(senha, user.senha);
    if (!isValid) throw new Error('Credenciais inválidas');

    // Atualizar último acesso
    await query('UPDATE usuarios SET ultimo_acesso_em = now() WHERE id = $1', [user.id]);

    // Buscar dados da empresa (os de contato alimentam a assinatura de e-mail padrão)
    let empresaInfo = null;
    if (user.empresa_id) {
      const empresaResult = await query(
        'SELECT id, nome, email, telefone, endereco, logo_url, cor_primaria FROM empresas WHERE id = $1',
        [user.empresa_id]
      );
      empresaInfo = empresaResult.rows[0] || null;
    }

    const token = signAccessToken({
      userId: user.id,
      id: user.id,
      email: user.email,
      nivel: user.nivel,
      empresa_id: user.empresa_id,
      tipo_usuario: user.tipo_usuario || 'comum',
      permissoes: user.permissoes || {}
    });

    return {
      token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        nivel: user.nivel,
        empresa_id: user.empresa_id,
        tipo_usuario: user.tipo_usuario || 'comum',
        permissoes: user.permissoes || {},
        assinatura_email: user.assinatura_email || null,
        acesso_cloud_api: podeUsarCloudApi(user),
        empresa: empresaInfo
      }
    };
  },

  async updatePerfil(userId: number, data: { nome?: string; email?: string; foto_perfil?: string | null; assinatura_email?: string | null }) {
    if (data.email) {
      const existing = await query('SELECT id FROM usuarios WHERE email = $1 AND id != $2', [data.email, userId]);
      if (existing.rows.length > 0) throw new Error('Este e-mail já está em uso por outro usuário');
    }

    if (data.foto_perfil && Buffer.byteLength(data.foto_perfil, 'utf8') > 400 * 1024) {
      throw new Error('Imagem muito grande. Envie uma foto de até 400KB');
    }

    if (data.assinatura_email && Buffer.byteLength(data.assinatura_email, 'utf8') > 64 * 1024) {
      throw new Error('Assinatura muito grande. Máximo 64KB de HTML');
    }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.nome !== undefined) { fields.push(`nome = $${idx++}`); values.push(data.nome); }
    if (data.email !== undefined) { fields.push(`email = $${idx++}`); values.push(data.email); }
    if (data.foto_perfil !== undefined) { fields.push(`foto_perfil = $${idx++}`); values.push(data.foto_perfil); }
    // string vazia zera a assinatura: volta a valer o padrão gerado da empresa
    if (data.assinatura_email !== undefined) {
      fields.push(`assinatura_email = $${idx++}`);
      values.push(data.assinatura_email?.trim() ? data.assinatura_email : null);
    }

    if (fields.length === 0) throw new Error('Nenhum campo para atualizar');

    values.push(userId);
    const result = await query(
      `UPDATE usuarios SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, nome, email, nivel, empresa_id, tipo_usuario, permissoes, foto_perfil, assinatura_email`,
      values
    );
    return result.rows[0];
  },

  async updateSenha(userId: number, senhaAtual: string, novaSenha: string) {
    const result = await query('SELECT senha FROM usuarios WHERE id = $1', [userId]);
    if (result.rows.length === 0) throw new Error('Usuário não encontrado');

    const isValid = await bcrypt.compare(senhaAtual, result.rows[0].senha);
    if (!isValid) throw new Error('Senha atual incorreta');

    if (novaSenha.length < 8) throw new Error('Nova senha deve ter no mínimo 8 caracteres');

    const hash = await bcrypt.hash(novaSenha, 10);
    await query('UPDATE usuarios SET senha = $1 WHERE id = $2', [hash, userId]);
  },

  async registrar(data: {
    nomeEmpresa: string;
    nomeUsuario: string;
    email: string;
    senha: string;
    planoId: number;
    billingType: 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'TRIAL';
    /** Compromisso de fidelidade: mensal | trimestral | semestral | anual. */
    ciclo?: string;
    cpfCnpj?: string;
    /** WhatsApp de contato — é para onde vão as boas-vindas. */
    telefone?: string;
    /** Consentimento (LGPD) para receber o material também pelo WhatsApp. */
    optinWhatsapp?: boolean;
    aceiteIp?: string;
  }): Promise<{ token: string; user: any; paymentUrl?: string; pixQrCode?: string; whatsappUrl?: string }> {
    // Validar senha
    if (data.senha.length < 8) throw new Error('A senha deve ter no mínimo 8 caracteres');

    // Verificar e-mail duplicado
    const existing = await query('SELECT id FROM usuarios WHERE email = $1', [data.email]);
    if (existing.rows.length > 0) throw new Error('Este e-mail já está cadastrado');

    // Verificar plano
    const plano = await assinaturasService.getPlanoById(data.planoId);
    if (!plano) throw new Error('Plano não encontrado');

    // 1. Criar empresa
    // Gerar slug único a partir do nome
    const baseSlug = data.nomeEmpresa.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .substring(0, 50);
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    const empresaResult = await query(
      `INSERT INTO empresas (nome, slug, email, telefone, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now()) RETURNING id`,
      [data.nomeEmpresa, slug, data.email, digitosParaGravar(data.telefone)]
    );
    const empresaId: number = empresaResult.rows[0].id;

    try {
      // 2. Criar o DONO da empresa (com o aceite dos Termos/Política — LGPD).
      //
      // `creator`, não `master`: o creator é o único que abre Agente IA →
      // Configurar Agente. Nascendo master, um cliente Enterprise recebia no
      // e-mail de boas-vindas a instrução de configurar o próprio agente e
      // esbarrava numa tela que não era dele — e não havia ninguém acima para
      // promovê-lo, porque ele É o dono da conta. (A migration 065 fez o mesmo
      // com as contas que já existiam.)
      const hash = await bcrypt.hash(data.senha, 10);
      const userResult = await query(
        `INSERT INTO usuarios
           (nome, email, senha, nivel, tipo_usuario, empresa_id, created_at,
            aceite_termos_versao, aceite_termos_em, aceite_termos_ip)
         VALUES ($1, $2, $3, 'admin_empresa', 'creator', $4, now(), $5, now(), $6) RETURNING id`,
        [data.nomeUsuario, data.email, hash, empresaId, TERMOS_VERSAO, data.aceiteIp || null]
      );
      const userId: number = userResult.rows[0].id;

      let paymentUrl: string | undefined;
      let pixQrCode: string | undefined;

      const asaasKey = process.env.ASAAS_API_KEY;

      // TRIAL: 7 dias grátis sem cartão — pula o Asaas; a cobrança só entra se o
      // cliente assinar depois (via Minha Conta). Também é o fallback sem Asaas.
      if (asaasKey && data.billingType !== 'TRIAL') {
        // A assinatura tem que nascer na conta certa do Asaas (Futuron). Se a
        // chave em uso for de outra conta do grupo, isto falha antes de cobrar
        // qualquer coisa — a empresa/usuário criados acima são desfeitos pelo
        // catch, e o cliente vê erro em vez de pagar para o lugar errado.
        await asaasService.garantirContaCorreta();

        // O ciclo é conferido antes do Asaas: pedido de um compromisso fora de
        // venda (link antigo, tela em cache) para aqui, sem cliente criado lá.
        // `value` é o que se cobra POR CICLO: no anual, os 12 meses de uma vez.
        const ciclo = await assinaturasService.getCiclo(plano.id, data.ciclo);

        // 3. Criar customer no Asaas
        let customer = await asaasService.findCustomerByEmail(data.email);
        if (!customer) {
          customer = await asaasService.createCustomer({
            name: data.nomeEmpresa,
            email: data.email,
            cpfCnpj: data.cpfCnpj,
          });
        }

        // 4. Calcular data de vencimento (amanhã)
        const nextDue = new Date();
        nextDue.setDate(nextDue.getDate() + 1);
        const nextDueDate = nextDue.toISOString().split('T')[0];

        // 5. Criar subscription no Asaas — no ciclo escolhido.
        const cobranca = calcularCobranca(plano, ciclo, plano.usuarios_base ?? 1, 0);
        const subscription = await asaasService.createSubscription({
          customerId: customer.id,
          billingType: data.billingType,
          value: cobranca.total,
          cycle: ciclo.asaas_cycle,
          nextDueDate,
          description: `${plano.nome} — ${ciclo.ciclo} — Gestão Financeira DuoFuturo`,
        });

        // 6. Salvar assinatura como aguardando_pagamento
        const planoAtivate = addMonthsClamped(new Date(), ciclo.meses);
        await query(
          `INSERT INTO assinaturas (empresa_id, plano_id, status, asaas_customer_id, asaas_subscription_id, asaas_next_due_date, plano_ativo_ate, ciclo, updated_at)
           VALUES ($1, $2, 'aguardando_pagamento', $3, $4, $5, $6, $7, now())
           ON CONFLICT (empresa_id) DO UPDATE SET
             plano_id=$2, status='aguardando_pagamento', asaas_customer_id=$3,
             asaas_subscription_id=$4, asaas_next_due_date=$5, plano_ativo_ate=$6,
             ciclo=$7, updated_at=now()`,
          [empresaId, data.planoId, customer.id, subscription.id, nextDueDate, planoAtivate, ciclo.ciclo]
        );

        // 7. Buscar paymentUrl / PIX
        try {
          const payment = await asaasService.getPaymentBySubscription(subscription.id);
          if (payment) {
            paymentUrl = payment.invoiceUrl;
            if (data.billingType === 'PIX' && payment.id) {
              const qr = await asaasService.getPixQrCode(payment.id);
              pixQrCode = qr.payload;
            }
          }
        } catch { /* payment will arrive via webhook */ }
      } else {
        // Sem Asaas: criar como trial por 7 dias
        const trialExpira = new Date();
        trialExpira.setDate(trialExpira.getDate() + 7);
        await query(
          `INSERT INTO assinaturas (empresa_id, plano_id, status, trial_expira_em, updated_at)
           VALUES ($1, $2, 'trial', $3, now())
           ON CONFLICT (empresa_id) DO UPDATE SET
             plano_id=$2, status='trial', trial_expira_em=$3, updated_at=now()`,
          [empresaId, data.planoId, trialExpira]
        );
      }

      // 8. Gerar token JWT
      const token = signAccessToken({
        userId,
        id: userId,
        email: data.email,
        nivel: 'admin_empresa',
        empresa_id: empresaId,
        tipo_usuario: 'creator',
        permissoes: {},
      });

      // Boas-vindas depois de tudo dar certo. O registro do envio é aguardado —
      // é dele que sai o código do WhatsApp que a tela de confirmação mostra —,
      // mas dentro do PRÓPRIO try/catch: uma falha aqui não pode cair no catch
      // de baixo, cujo rollback apagaria a empresa de um cliente que já pagou.
      // O e-mail em si sai sem await lá dentro, para um SMTP lento não segurar
      // a resposta do cadastro.
      let whatsappUrl: string | undefined;
      try {
        const boasVindas = await enviarBoasVindas({
          empresaId,
          usuarioId: userId,
          nomeEmpresa: data.nomeEmpresa,
          nomeUsuario: data.nomeUsuario,
          email: data.email,
          telefone: data.telefone,
          planoId: plano.id,
          plano: plano.nome,
          assinaturaStatus: data.billingType === 'TRIAL' ? 'trial' : 'aguardando_pagamento',
          optinWhatsapp: !!data.optinWhatsapp,
          optinIp: data.aceiteIp || null,
        });
        whatsappUrl = boasVindas.whatsappUrl || undefined;
      } catch (err: any) {
        console.error('[registrar] boas-vindas falharam —', err?.message || err);
      }

      // Lead no CRM da DuoFuturo (Vendas CRM → Entrada), para o comercial acompanhar.
      // Sem await e sem lançar — mesmo motivo das boas-vindas.
      void registrarLeadDoCadastro({
        empresaId,
        usuarioId: userId,
        nomeUsuario: data.nomeUsuario,
        nomeEmpresa: data.nomeEmpresa,
        email: data.email,
        telefone: data.telefone,
        plano: plano.nome,
        precoMensal: Number(plano.preco_mensal),
        billingType: data.billingType,
        ciclo: data.ciclo,
        optinWhatsapp: !!data.optinWhatsapp,
      });

      // Porta e instância do WhatsApp já no cadastro: o dono chega na tela e o QR
      // está lá. Sem await e sem lançar — a instância leva segundos para subir.
      // Conta com direito ao número oficial (Enterprise) NÃO ganha instância aqui:
      // o canal dela é a Cloud API, e a tela abre na escolha entre os dois em vez
      // de num QR Code que o plano dela existe para não usar.
      void whatsappProvisionService.garantirWhatsApp(userId);

      return {
        token,
        user: {
          id: userId,
          nome: data.nomeUsuario,
          email: data.email,
          nivel: 'admin_empresa',
          empresa_id: empresaId,
          tipo_usuario: 'creator',
          permissoes: {},
          empresa: { id: empresaId, nome: data.nomeEmpresa },
        },
        paymentUrl,
        pixQrCode,
        whatsappUrl,
      };
    } catch (err) {
      // Rollback: deletar usuários e empresa criados se algo falhou
      try {
        await query('DELETE FROM usuarios WHERE empresa_id = $1', [empresaId]);
        await query('DELETE FROM assinaturas WHERE empresa_id = $1', [empresaId]);
        await query('DELETE FROM empresas WHERE id = $1', [empresaId]);
      } catch { /* ignore rollback errors */ }
      throw err;
    }
  },

  async me(userId: number) {
    const result = await query(`
      SELECT u.id, u.nome, u.email, u.nivel, u.empresa_id, u.tipo_usuario, u.permissoes,
             u.assinatura_email,
             e.nome as empresa_nome, e.email as empresa_email, e.telefone as empresa_telefone,
             e.endereco as empresa_endereco, e.logo_url as empresa_logo_url,
             e.cor_primaria as empresa_cor_primaria
      FROM usuarios u
      LEFT JOIN empresas e ON u.empresa_id = e.id
      WHERE u.id = $1
    `, [userId]);
    if (result.rows.length === 0) throw new Error('Usuário não encontrado');

    const user = result.rows[0];
    return {
      id: user.id,
      nome: user.nome,
      email: user.email,
      nivel: user.nivel,
      empresa_id: user.empresa_id,
      tipo_usuario: user.tipo_usuario || 'comum',
      permissoes: user.permissoes || {},
      // assinatura de e-mail do CRM; null = frontend gera o padrão da empresa
      assinatura_email: user.assinatura_email || null,
      acesso_cloud_api: podeUsarCloudApi(user),
      empresa: user.empresa_nome ? {
        id: user.empresa_id,
        nome: user.empresa_nome,
        email: user.empresa_email || null,
        telefone: user.empresa_telefone || null,
        endereco: user.empresa_endereco || null,
        logo_url: user.empresa_logo_url || null,
        cor_primaria: user.empresa_cor_primaria || null,
      } : null
    };
  }
};
