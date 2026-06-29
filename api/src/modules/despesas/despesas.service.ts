import { query } from '../../config/database';
import { buildPaginationQuery, buildPaginatedResponse } from '../../shared/utils';

export const despesasService = {
  async list(filters: any, page: number, pageSize: number) {
    const { limit, offset } = buildPaginationQuery(page, pageSize);
    let where = '1=1';
    const params: any[] = [];

    // Multi-tenancy: filtrar por usuario_id (super_admin vê tudo, outros veem apenas seus dados)
    if (filters.usuario_id && filters.nivel !== 'super_admin') {
      params.push(filters.usuario_id);
      where += ` AND usuario_id = $${params.length}`;
    }

    // Suportar novo campo "status" e manter compatibilidade com "pago"
    if (filters.status !== undefined && filters.status !== '') {
      params.push(filters.status);
      where += ` AND status = $${params.length}`;
    } else if (filters.pago !== undefined && filters.pago !== '') {
      // Backward compatibility: converter pago para status
      const pagoValue = filters.pago === 'true' || filters.pago === true;
      params.push(pagoValue ? 'pago' : 'pendente');
      where += ` AND status = $${params.length}`;
    }

    if (filters.categoria) {
      params.push(filters.categoria);
      where += ` AND categoria ILIKE '%' || $${params.length} || '%'`;
    }
    if (filters.tipo || filters.tipo_pagamento) {
      params.push(filters.tipo || filters.tipo_pagamento);
      where += ` AND tipo_pagamento = $${params.length}`;
    }
    if (filters.data_ini) {
      params.push(filters.data_ini);
      where += ` AND data >= $${params.length}`;
    }
    if (filters.data_fim) {
      params.push(filters.data_fim);
      where += ` AND data <= $${params.length}`;
    }

    const countResult = await query(`SELECT COUNT(*) FROM despesas WHERE ${where}`, params);
    const dataResult = await query(
      `SELECT * FROM despesas WHERE ${where} ORDER BY data DESC, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return buildPaginatedResponse(dataResult.rows, parseInt(countResult.rows[0].count), page, pageSize);
  },

  async getById(id: string, filters?: any) {
    let where = 'id = $1';
    const params: any[] = [id];

    // Multi-tenancy: verificar permissão de acesso
    if (filters?.usuario_id && filters?.nivel !== 'super_admin') {
      params.push(filters.usuario_id);
      where += ` AND usuario_id = $${params.length}`;
    }

    const result = await query(`SELECT * FROM despesas WHERE ${where}`, params);
    if (result.rows.length === 0) throw new Error('Despesa não encontrada');
    return result.rows[0];
  },

  async create(data: any) {
    // Multi-tenancy: usuario_id é obrigatório
    if (!data.usuario_id) {
      throw new Error('Campo "usuario_id" é obrigatório');
    }

    // Determinar tipo_pagamento (priorizar novo campo, fallback para parcelado)
    const tipoPagamento = data.tipo_pagamento || (data.parcelado && data.numero_parcelas > 1 ? 'parcelado' : 'a_vista');

    // Se parcelado, criar parcelas automaticamente
    if (tipoPagamento === 'parcelado' && data.numero_parcelas > 1) {
      return this.createComParcelas(data);
    }

    // Determinar status (priorizar novo campo, fallback para pago)
    const status = data.status || (data.pago ? 'pago' : 'pendente');

    const result = await query(
      `INSERT INTO despesas (descricao, valor, data, categoria, tipo_pagamento, status, pago, parcelado, numero_parcelas, parcela_atual, recorrente, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        data.descricao,
        data.valor,
        data.data,
        data.categoria || 'Outros',
        tipoPagamento,
        status,
        status === 'pago', // Manter sincronizado com status
        tipoPagamento === 'parcelado', // Manter sincronizado com tipo_pagamento
        data.numero_parcelas || null,
        data.parcela_atual || null,
        data.recorrente || false,
        data.usuario_id
      ]
    );

    return result.rows[0];
  },

  async createComParcelas(data: any) {
    // Criar despesa "mãe"
    const despesaPrincipal = await query(
      `INSERT INTO despesas (descricao, valor, data, categoria, tipo_pagamento, status, pago, parcelado, numero_parcelas, parcela_atual, recorrente, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        data.descricao,
        data.valor, // Valor total
        data.data,
        data.categoria || 'Outros',
        'parcelado', // tipo_pagamento
        'pendente', // status
        false, // Não paga ainda
        true, // É parcelada (manter compatibilidade)
        data.numero_parcelas,
        null, // Despesa mãe não tem parcela_atual
        data.recorrente || false,
        data.usuario_id
      ]
    );

    const despesa_id = despesaPrincipal.rows[0].id;
    const valorParcela = parseFloat(data.valor) / parseInt(data.numero_parcelas);
    const dataBase = new Date(data.data);

    // Criar parcelas na tabela parcelas_despesas
    const parcelas = [];
    for (let i = 1; i <= data.numero_parcelas; i++) {
      const dataVencimento = new Date(dataBase);
      dataVencimento.setMonth(dataVencimento.getMonth() + (i - 1));

      const parcela = await query(
        `INSERT INTO parcelas_despesas (
          despesa_id, numero_parcela, total_parcelas, valor, data_vencimento, status
        ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          despesa_id,
          i,
          data.numero_parcelas,
          valorParcela.toFixed(2),
          dataVencimento.toISOString().split('T')[0],
          'PENDENTE'
        ]
      );
      parcelas.push(parcela.rows[0]);
    }

    return {
      ...despesaPrincipal.rows[0],
      parcelas
    };
  },

  async update(id: string, data: any, filters?: any) {
    // Determinar tipo_pagamento (priorizar novo campo, fallback para parcelado)
    const tipoPagamento = data.tipo_pagamento || (data.parcelado ? 'parcelado' : 'a_vista');

    // Determinar status (priorizar novo campo, fallback para pago)
    const status = data.status || (data.pago ? 'pago' : 'pendente');

    let where = 'id = $12';
    const params: any[] = [
      data.descricao,
      data.valor,
      data.data,
      data.categoria || 'Outros',
      tipoPagamento,
      status,
      status === 'pago', // Manter sincronizado com status
      tipoPagamento === 'parcelado', // Manter sincronizado com tipo_pagamento
      data.numero_parcelas || null,
      data.parcela_atual || null,
      data.recorrente || false,
      id
    ];

    // Multi-tenancy: garantir que apenas o dono pode atualizar
    if (filters?.usuario_id && filters?.nivel !== 'super_admin') {
      where += ' AND usuario_id = $13';
      params.push(filters.usuario_id);
    }

    const result = await query(
      `UPDATE despesas SET
        descricao = $1,
        valor = $2,
        data = $3,
        categoria = $4,
        tipo_pagamento = $5,
        status = $6,
        pago = $7,
        parcelado = $8,
        numero_parcelas = $9,
        parcela_atual = $10,
        recorrente = $11,
        updated_at = CURRENT_TIMESTAMP
       WHERE ${where} RETURNING *`,
      params
    );

    if (result.rows.length === 0) throw new Error('Despesa não encontrada ou sem permissão');
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

    const result = await query(`DELETE FROM despesas WHERE ${where} RETURNING *`, params);
    if (result.rows.length === 0) throw new Error('Despesa não encontrada ou sem permissão');
    return result.rows[0];
  }
};
