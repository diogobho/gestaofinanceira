import bcrypt from 'bcryptjs';
import { query } from '../../config/database';
import { signAccessToken } from '../../config/jwt';
import { assinaturasService } from '../assinaturas/assinaturas.service';
import { asaasService } from '../../services/asaas.service';

export const authService = {
  async login(email: string, senha: string) {
    const result = await query('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (result.rows.length === 0) throw new Error('Credenciais inválidas');

    const user = result.rows[0];
    const isValid = await bcrypt.compare(senha, user.senha);
    if (!isValid) throw new Error('Credenciais inválidas');

    // Atualizar último acesso
    await query('UPDATE usuarios SET ultimo_acesso_em = now() WHERE id = $1', [user.id]);

    // Buscar dados da empresa
    let empresaInfo = null;
    if (user.empresa_id) {
      const empresaResult = await query('SELECT id, nome FROM empresas WHERE id = $1', [user.empresa_id]);
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
        empresa: empresaInfo
      }
    };
  },

  async updatePerfil(userId: number, data: { nome?: string; email?: string; foto_perfil?: string | null }) {
    if (data.email) {
      const existing = await query('SELECT id FROM usuarios WHERE email = $1 AND id != $2', [data.email, userId]);
      if (existing.rows.length > 0) throw new Error('Este e-mail já está em uso por outro usuário');
    }

    if (data.foto_perfil && Buffer.byteLength(data.foto_perfil, 'utf8') > 400 * 1024) {
      throw new Error('Imagem muito grande. Máximo 300KB');
    }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.nome !== undefined) { fields.push(`nome = $${idx++}`); values.push(data.nome); }
    if (data.email !== undefined) { fields.push(`email = $${idx++}`); values.push(data.email); }
    if (data.foto_perfil !== undefined) { fields.push(`foto_perfil = $${idx++}`); values.push(data.foto_perfil); }

    if (fields.length === 0) throw new Error('Nenhum campo para atualizar');

    values.push(userId);
    const result = await query(
      `UPDATE usuarios SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, nome, email, nivel, empresa_id, tipo_usuario, permissoes, foto_perfil`,
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
    billingType: 'PIX' | 'CREDIT_CARD' | 'BOLETO';
    cpfCnpj?: string;
  }): Promise<{ token: string; user: any; paymentUrl?: string; pixQrCode?: string }> {
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
      `INSERT INTO empresas (nome, slug, email, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now()) RETURNING id`,
      [data.nomeEmpresa, slug, data.email]
    );
    const empresaId: number = empresaResult.rows[0].id;

    try {
      // 2. Criar usuário master da empresa
      const hash = await bcrypt.hash(data.senha, 10);
      const userResult = await query(
        `INSERT INTO usuarios (nome, email, senha, nivel, tipo_usuario, empresa_id, created_at)
         VALUES ($1, $2, $3, 'admin_empresa', 'master', $4, now()) RETURNING id`,
        [data.nomeUsuario, data.email, hash, empresaId]
      );
      const userId: number = userResult.rows[0].id;

      let paymentUrl: string | undefined;
      let pixQrCode: string | undefined;

      const asaasKey = process.env.ASAAS_API_KEY;

      if (asaasKey) {
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

        // 5. Criar subscription no Asaas
        const subscription = await asaasService.createSubscription({
          customerId: customer.id,
          billingType: data.billingType,
          value: plano.preco_mensal,
          nextDueDate,
          description: `${plano.nome} - Gestão Financeira DuoFuturo`,
        });

        // 6. Salvar assinatura como aguardando_pagamento
        const planoAtivate = new Date();
        planoAtivate.setMonth(planoAtivate.getMonth() + 1);
        await query(
          `INSERT INTO assinaturas (empresa_id, plano_id, status, asaas_customer_id, asaas_subscription_id, asaas_next_due_date, plano_ativo_ate, updated_at)
           VALUES ($1, $2, 'aguardando_pagamento', $3, $4, $5, $6, now())
           ON CONFLICT (empresa_id) DO UPDATE SET
             plano_id=$2, status='aguardando_pagamento', asaas_customer_id=$3,
             asaas_subscription_id=$4, asaas_next_due_date=$5, plano_ativo_ate=$6, updated_at=now()`,
          [empresaId, data.planoId, customer.id, subscription.id, nextDueDate, planoAtivate]
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
        tipo_usuario: 'master',
        permissoes: {},
      });

      return {
        token,
        user: {
          id: userId,
          nome: data.nomeUsuario,
          email: data.email,
          nivel: 'admin_empresa',
          empresa_id: empresaId,
          tipo_usuario: 'master',
          permissoes: {},
          empresa: { id: empresaId, nome: data.nomeEmpresa },
        },
        paymentUrl,
        pixQrCode,
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
             e.nome as empresa_nome
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
      empresa: user.empresa_nome ? { id: user.empresa_id, nome: user.empresa_nome } : null
    };
  }
};
