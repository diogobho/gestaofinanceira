import { query } from '../../config/database';
import { leadsService } from '../crm/leads/leads.service';

export const clientesService = {
  async list(filters?: any) {
    let where = '1=1';
    const params: any[] = [];
    let paramCount = 1;

    // Multi-tenancy: filtrar por usuario_id (ADMIN vê tudo, MENTOR vê apenas seus dados)
    if (filters?.usuario_id && filters?.nivel !== 'super_admin') {
      where += ` AND usuario_id = $${paramCount}`;
      params.push(filters.usuario_id);
      paramCount++;
    }

    if (filters?.mentor_id) {
      where += ` AND mentor_id = $${paramCount}`;
      params.push(filters.mentor_id);
      paramCount++;
    }

    if (filters?.status) {
      where += ` AND status = $${paramCount}`;
      params.push(filters.status);
      paramCount++;
    }

    const result = await query(
      `SELECT * FROM clientes WHERE ${where} ORDER BY created_at DESC`,
      params
    );

    return result.rows;
  },

  async getById(id: string, filters?: any) {
    let where = 'id = $1';
    const params: any[] = [id];
    let paramCount = 2;

    // Multi-tenancy: verificar permissão de acesso
    if (filters?.usuario_id && filters?.nivel !== 'super_admin') {
      where += ` AND usuario_id = $${paramCount}`;
      params.push(filters.usuario_id);
    }

    const result = await query(`SELECT * FROM clientes WHERE ${where}`, params);
    if (result.rows.length === 0) throw new Error('Cliente não encontrado');
    return result.rows[0];
  },

  async create(data: any) {
    // Validações de campos obrigatórios
    if (!data.nome) {
      throw new Error('Campo "nome" é obrigatório');
    }

    // Multi-tenancy: usuario_id é obrigatório
    if (!data.usuario_id) {
      throw new Error('Campo "usuario_id" é obrigatório');
    }

    // Validação CPF/CNPJ obrigatório
    if (!data.cpf_cnpj) {
      throw new Error('Campo "cpf_cnpj" é obrigatório');
    }

    // Validar formato CPF/CNPJ (apenas números, 11 ou 14 dígitos)
    const cpfCnpj = (data.cpf_cnpj || '').replace(/\D/g, '');
    if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
      throw new Error('CPF deve ter 11 dígitos ou CNPJ deve ter 14 dígitos');
    }

    // Validar CEP apenas se fornecido
    const cep = data.endereco_cep ? (data.endereco_cep || '').replace(/\D/g, '') : null;
    if (cep && cep.length !== 8) {
      throw new Error('CEP deve ter 8 dígitos');
    }

    // Validar UF apenas se fornecida
    if (data.endereco_estado && data.endereco_estado.length !== 2) {
      throw new Error('Estado deve ter 2 caracteres (UF)');
    }

    // Verificar duplicata por CPF/CNPJ na mesma empresa
    const duplicataCpfCnpj = await query(
      `SELECT id, nome FROM clientes WHERE cpf_cnpj = $1 AND usuario_id = $2 LIMIT 1`,
      [cpfCnpj, data.usuario_id]
    );
    if (duplicataCpfCnpj.rows.length > 0) {
      throw new Error(`Já existe um cliente com este CPF/CNPJ: ${duplicataCpfCnpj.rows[0].nome}`);
    }

    // Gerar código único se não fornecido
    const codigo = data.codigo || `CLI-${Date.now()}`;

    const result = await query(
      `INSERT INTO clientes (
        codigo, nome, cpf_cnpj, email, telefone, aniversario,
        endereco_rua, endereco_numero, endereco_complemento, endereco_bairro,
        endereco_cidade, endereco_estado, endereco_cep,
        cidade, servico, empresa_id, usuario_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        codigo,
        data.nome,
        cpfCnpj,
        data.email || null,
        data.telefone || null,
        data.aniversario || null,
        data.endereco_rua || null,
        data.endereco_numero || null,
        data.endereco_complemento || null,
        data.endereco_bairro || null,
        data.endereco_cidade || null,
        data.endereco_estado ? data.endereco_estado.toUpperCase() : null,
        cep || null,
        data.cidade || data.endereco_cidade || null,
        data.servico || null,
        data.empresa_id || null,
        data.usuario_id
      ]
    );

    const cliente = result.rows[0];

    // Auto-criar lead CX para rastreamento pós-venda (apenas se empresa_id presente)
    if (cliente.empresa_id) {
      leadsService.criarLeadCXParaCliente(cliente.id, cliente, cliente.empresa_id, cliente.usuario_id)
        .catch(() => { /* falha silenciosa — não bloquear criação do cliente */ });
    }

    return cliente;
  },

  async update(id: string, data: any, filters?: any) {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Campos reais permitidos para atualização
    const allowedFields = [
      'codigo', 'nome', 'email', 'telefone', 'aniversario', 'cidade', 'servico', 'empresa_id'
    ];

    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        fields.push(`${field} = $${paramCount}`);
        values.push(data[field]);
        paramCount++;
      }
    });

    if (fields.length === 0) throw new Error('Nenhum campo para atualizar');

    values.push(id);

    // Multi-tenancy: garantir que apenas o dono pode atualizar
    let where = `id = $${paramCount}`;
    if (filters?.usuario_id && filters?.nivel !== 'super_admin') {
      paramCount++;
      where += ` AND usuario_id = $${paramCount}`;
      values.push(filters.usuario_id);
    }

    const result = await query(
      `UPDATE clientes SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE ${where} RETURNING *`,
      values
    );

    if (result.rows.length === 0) throw new Error('Cliente não encontrado ou sem permissão');

    return result.rows[0];
  },

  async delete(id: string, filters?: any) {
    let where = 'id = $1';
    const params: any[] = [id];

    // Multi-tenancy: garantir que apenas o dono pode deletar
    if (filters?.usuario_id && filters?.nivel !== 'super_admin') {
      where += ' AND usuario_id = $2';
      params.push(filters.usuario_id);
    }

    const result = await query(`DELETE FROM clientes WHERE ${where} RETURNING id`, params);
    if (result.rows.length === 0) throw new Error('Cliente não encontrado ou sem permissão');
    return { message: 'Cliente deletado com sucesso' };
  },

  async notificarWhatsApp(id: string, filters?: any) {
    // Buscar cliente com verificação de permissão
    const cliente = await this.getById(id, filters);

    // Validar se cliente tem telefone
    if (!cliente.telefone) {
      throw new Error('Cliente não possui telefone cadastrado');
    }

    // Calcular dias de atraso (se houver)
    let diasAtraso = 0;
    let tipoNotificacao = 'lembrete_pagamento';

    if (cliente.data_vencimento_pagamento) {
      const dataVencimento = new Date(cliente.data_vencimento_pagamento);
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      dataVencimento.setHours(0, 0, 0, 0);

      diasAtraso = Math.floor((hoje.getTime() - dataVencimento.getTime()) / (1000 * 60 * 60 * 24));

      if (diasAtraso > 0) {
        tipoNotificacao = 'pagamento_vencido';
      } else if (diasAtraso === -1) {
        tipoNotificacao = 'pagamento_proximo_vencimento';
      }
    }

    // Formatar mensagem baseado no tipo
    let mensagem = '';
    const valorFormatado = cliente.valor_mensalidade
      ? `R$ ${parseFloat(cliente.valor_mensalidade).toFixed(2)}`
      : 'não informado';

    if (tipoNotificacao === 'pagamento_vencido') {
      mensagem = `🔴 *PAGAMENTO VENCIDO*\n\nOlá ${cliente.nome}!\n\nSeu pagamento está atrasado há *${diasAtraso} dia(s)*.\n\n💰 Valor: ${valorFormatado}\n📅 Vencimento: ${new Date(cliente.data_vencimento_pagamento).toLocaleDateString('pt-BR')}\n\n⚠️ Por favor, regularize sua situação o quanto antes.\n\n_Mensagem automática - Gestão Financeira DuoFuturo_`;
    } else if (tipoNotificacao === 'pagamento_proximo_vencimento') {
      mensagem = `🟡 *LEMBRETE DE PAGAMENTO*\n\nOlá ${cliente.nome}!\n\nSeu pagamento vence *amanhã*.\n\n💰 Valor: ${valorFormatado}\n📅 Vencimento: ${new Date(cliente.data_vencimento_pagamento).toLocaleDateString('pt-BR')}\n\n✅ Não esqueça de realizar o pagamento!\n\n_Mensagem automática - Gestão Financeira DuoFuturo_`;
    } else {
      mensagem = `📋 *LEMBRETE DE PAGAMENTO*\n\nOlá ${cliente.nome}!\n\nEste é um lembrete sobre seu pagamento.\n\n💰 Valor: ${valorFormatado}\n${cliente.data_vencimento_pagamento ? `📅 Vencimento: ${new Date(cliente.data_vencimento_pagamento).toLocaleDateString('pt-BR')}` : ''}\n\n_Mensagem automática - Gestão Financeira DuoFuturo_`;
    }

    // Buscar porta WhatsApp do usuário responsável
    const usuarioResult = await query(
      'SELECT whatsapp_porta, whatsapp_conectado FROM usuarios WHERE id = $1',
      [cliente.usuario_id]
    );

    if (usuarioResult.rows.length === 0 || !usuarioResult.rows[0].whatsapp_porta) {
      throw new Error('WhatsApp não configurado para este usuário');
    }

    const { whatsapp_porta: whatsappPorta, whatsapp_conectado: whatsappConectado } = usuarioResult.rows[0];

    if (!whatsappConectado) {
      throw new Error('WhatsApp não conectado');
    }

    // Enviar via WhatsApp API
    const axios = require('axios');
    try {
      const response = await axios.post(`http://localhost:${whatsappPorta}/send`, {
        number: cliente.telefone,
        message: mensagem
      }, { timeout: 10000 });

      if (!response.data.success) {
        throw new Error('Falha ao enviar mensagem WhatsApp');
      }

      // Registrar notificação enviada
      await query(`
        INSERT INTO notificacoes_enviadas (
          cliente_id,
          usuario_id,
          tipo,
          email_destinatario,
          assunto,
          corpo,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        cliente.id,
        cliente.usuario_id,
        tipoNotificacao,
        cliente.telefone,
        tipoNotificacao === 'pagamento_vencido' ? `Pagamento vencido - ${diasAtraso} dia(s)` : 'Lembrete de pagamento',
        mensagem,
        'enviado'
      ]);

      return {
        success: true,
        message: 'Notificação enviada com sucesso via WhatsApp',
        whatsapp_to: response.data.to,
        tipo_notificacao: tipoNotificacao,
        dias_atraso: diasAtraso > 0 ? diasAtraso : undefined
      };

    } catch (error: any) {
      // Registrar erro
      await query(`
        INSERT INTO notificacoes_enviadas (
          cliente_id,
          usuario_id,
          tipo,
          email_destinatario,
          status,
          erro
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        cliente.id,
        cliente.usuario_id,
        tipoNotificacao,
        cliente.telefone,
        'erro',
        error.message
      ]);

      throw new Error(`Erro ao enviar WhatsApp: ${error.message}`);
    }
  }
};
