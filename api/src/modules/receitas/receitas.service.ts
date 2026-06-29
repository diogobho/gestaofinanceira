import { query } from '../../config/database';
import { buildPaginationQuery, buildPaginatedResponse } from '../../shared/utils';

export const receitasService = {
  async list(filters: any, page: number, pageSize: number) {
    const { limit, offset } = buildPaginationQuery(page, pageSize);
    let where = '1=1';
    const params: any[] = [];

    // Multi-tenancy: filtrar por usuario_id (super_admin vê tudo, outros veem apenas seus dados)
    if (filters.usuario_id && filters.nivel !== 'super_admin') {
      params.push(filters.usuario_id);
      where += ` AND r.usuario_id = $${params.length}`;
    }

    // Suportar novo campo "status" e manter compatibilidade com "recebido"
    if (filters.status !== undefined && filters.status !== '') {
      params.push(filters.status);
      where += ` AND r.status = $${params.length}`;
    } else if (filters.recebido !== undefined && filters.recebido !== '') {
      // Backward compatibility: converter recebido para status
      const recebidoValue = filters.recebido === 'true' || filters.recebido === true;
      params.push(recebidoValue ? 'pago' : 'pendente');
      where += ` AND r.status = $${params.length}`;
    }

    if (filters.fonte) {
      params.push(filters.fonte);
      where += ` AND r.fonte ILIKE '%' || $${params.length} || '%'`;
    }
    if (filters.data_ini) {
      params.push(filters.data_ini);
      where += ` AND r.data >= $${params.length}`;
    }
    if (filters.data_fim) {
      params.push(filters.data_fim);
      where += ` AND r.data <= $${params.length}`;
    }

    // Filtro por cliente
    if (filters.cliente_id) {
      params.push(filters.cliente_id);
      where += ` AND r.cliente_id = $${params.length}`;
    }

    // Filtro por tipo de pagamento
    if (filters.tipo_pagamento) {
      params.push(filters.tipo_pagamento);
      where += ` AND r.tipo_pagamento = $${params.length}`;
    }

    // Filtro por valor mínimo
    if (filters.valor_min) {
      params.push(filters.valor_min);
      where += ` AND r.valor >= $${params.length}`;
    }

    // Filtro por valor máximo
    if (filters.valor_max) {
      params.push(filters.valor_max);
      where += ` AND r.valor <= $${params.length}`;
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM receitas r WHERE ${where}`,
      params
    );
    const dataResult = await query(
      `SELECT r.*, c.nome as cliente_nome, c.email as cliente_email
       FROM receitas r
       LEFT JOIN clientes c ON r.cliente_id = c.id
       WHERE ${where} ORDER BY r.data DESC, r.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
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

    const result = await query(`SELECT * FROM receitas WHERE ${where}`, params);
    if (result.rows.length === 0) throw new Error('Receita não encontrada');
    return result.rows[0];
  },

  async create(data: any) {
    // Determinar tipo_pagamento (priorizar novo campo, fallback para parcelado)
    const tipoPagamento = data.tipo_pagamento || (data.parcelado && data.numero_parcelas > 1 ? 'parcelado' : 'a_vista');

    // Se parcelado, criar parcelas automaticamente
    if (tipoPagamento === 'parcelado' && data.numero_parcelas > 1) {
      return this.createComParcelas(data);
    }

    // Determinar status (priorizar novo campo, fallback para recebido)
    const status = data.status || (data.recebido ? 'pago' : 'pendente');

    const result = await query(
      `INSERT INTO receitas (descricao, valor, data, fonte, tipo_pagamento, status, recebido, parcelado, numero_parcelas, parcela_atual, usuario_id, cliente_id, taxa_servico_percentual, produto, lead_origem_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [
        data.descricao,
        data.valor,
        data.data,
        data.fonte || 'Outros',
        tipoPagamento,
        status,
        status === 'pago', // Manter sincronizado com status
        tipoPagamento === 'parcelado', // Manter sincronizado com tipo_pagamento
        data.numero_parcelas || null,
        data.parcela_atual || null,
        data.usuario_id,
        data.cliente_id || null,
        data.taxa_servico_percentual || null,
        data.produto || null,
        data.lead_origem_id || null
      ]
    );

    const receita = result.rows[0];

    // Se há taxa de serviço, criar despesa automática
    if (data.taxa_servico_percentual && data.taxa_servico_percentual > 0) {
      await this.criarDespesaTaxaServico(receita, data.usuario_id);
    }

    return receita;
  },

  async createComParcelas(data: any) {
    // Criar receita "mãe" (parcela 0 ou referência)
    const receitaPrincipal = await query(
      `INSERT INTO receitas (descricao, valor, data, fonte, tipo_pagamento, status, recebido, parcelado, numero_parcelas, parcela_atual, usuario_id, cliente_id, taxa_servico_percentual, produto, lead_origem_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [
        data.descricao,
        data.valor, // Valor total
        data.data,
        data.fonte || 'Outros',
        'parcelado', // tipo_pagamento
        'pendente', // status
        false, // Não recebida ainda
        true, // É parcelada (manter compatibilidade)
        data.numero_parcelas,
        null, // Receita mãe não tem parcela_atual
        data.usuario_id,
        data.cliente_id || null,
        data.taxa_servico_percentual || null,
        data.produto || null,
        data.lead_origem_id || null
      ]
    );

    const receita = receitaPrincipal.rows[0];
    const receita_id = receita.id;
    const valorParcela = parseFloat(data.valor) / parseInt(data.numero_parcelas);
    const dataBase = new Date(data.data);

    // Criar parcelas na tabela parcelas_receitas
    const parcelas = [];
    for (let i = 1; i <= data.numero_parcelas; i++) {
      const dataVencimento = new Date(dataBase);
      dataVencimento.setMonth(dataVencimento.getMonth() + (i - 1));

      const parcela = await query(
        `INSERT INTO parcelas_receitas (
          receita_id, numero_parcela, total_parcelas, valor, data_vencimento, status
        ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          receita_id,
          i,
          data.numero_parcelas,
          valorParcela.toFixed(2),
          dataVencimento.toISOString().split('T')[0],
          'PENDENTE'
        ]
      );
      parcelas.push(parcela.rows[0]);
    }

    // Se há taxa de serviço, criar despesa automática parcelada
    if (data.taxa_servico_percentual && data.taxa_servico_percentual > 0) {
      await this.criarDespesaTaxaServico(receita, data.usuario_id);
    }

    return {
      ...receita,
      parcelas
    };
  },

  async update(id: string, data: any, filters?: any) {
    // Buscar registro atual para suportar atualização parcial
    const existing = await this.getById(id, filters);

    const descricao = data.descricao ?? existing.descricao;
    const valor = data.valor ?? existing.valor;
    const dataField = data.data ?? existing.data;
    const fonte = data.fonte ?? existing.fonte ?? 'Outros';
    const tipoPagamento = data.tipo_pagamento ?? existing.tipo_pagamento ?? (data.parcelado ? 'parcelado' : 'a_vista');
    const status = data.status ?? existing.status ?? (data.recebido ? 'pago' : 'pendente');
    const numeroParcelas = data.numero_parcelas ?? existing.numero_parcelas ?? null;
    const parcelaAtual = data.parcela_atual ?? existing.parcela_atual ?? null;
    // Permite desvincular cliente enviando cliente_id: null explicitamente
    const clienteId = 'cliente_id' in data ? (data.cliente_id || null) : existing.cliente_id;

    let where = 'id = $12';
    const params: any[] = [
      descricao,
      valor,
      dataField,
      fonte,
      tipoPagamento,
      status,
      status === 'pago',
      tipoPagamento === 'parcelado',
      numeroParcelas,
      parcelaAtual,
      clienteId,
      id
    ];

    // Multi-tenancy: garantir que apenas o dono pode atualizar
    if (filters?.usuario_id && filters?.nivel !== 'super_admin') {
      where += ' AND usuario_id = $13';
      params.push(filters.usuario_id);
    }

    const result = await query(
      `UPDATE receitas SET
        descricao = $1,
        valor = $2,
        data = $3,
        fonte = $4,
        tipo_pagamento = $5,
        status = $6,
        recebido = $7,
        parcelado = $8,
        numero_parcelas = $9,
        parcela_atual = $10,
        cliente_id = $11,
        updated_at = CURRENT_TIMESTAMP
       WHERE ${where} RETURNING *`,
      params
    );

    if (result.rows.length === 0) throw new Error('Receita não encontrada ou sem permissão');
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

    const result = await query(`DELETE FROM receitas WHERE ${where} RETURNING *`, params);
    if (result.rows.length === 0) throw new Error('Receita não encontrada ou sem permissão');
    return result.rows[0];
  },

  // NOVO: Listar receitas sem cliente vinculado
  async listSemCliente(filters: any) {
    let where = 'r.cliente_id IS NULL';
    const params: any[] = [];

    // Multi-tenancy: filtrar por usuario_id
    if (filters?.usuario_id && filters?.nivel !== 'super_admin') {
      params.push(filters.usuario_id);
      where += ` AND r.usuario_id = $${params.length}`;
    }

    const result = await query(
      `SELECT
        r.id,
        r.descricao,
        r.valor,
        r.data,
        r.fonte,
        r.tipo_pagamento,
        r.status,
        r.numero_parcelas,
        r.created_at
       FROM receitas r
       WHERE ${where}
       ORDER BY r.created_at DESC`,
      params
    );

    return result.rows;
  },

  // NOVO: Vincular cliente a uma receita existente
  async vincularCliente(receitaId: string, clienteId: number, filters?: any) {
    let where = 'id = $1';
    const params: any[] = [receitaId];

    // Multi-tenancy: garantir que apenas o dono pode atualizar
    if (filters?.usuario_id && filters?.nivel !== 'super_admin') {
      params.push(filters.usuario_id);
      where += ` AND usuario_id = $${params.length}`;
    }

    // Verificar se a receita existe e o usuário tem permissão
    const checkResult = await query(
      `SELECT id FROM receitas WHERE ${where}`,
      params
    );

    if (checkResult.rows.length === 0) {
      throw new Error('Receita não encontrada ou sem permissão');
    }

    // Atualizar cliente_id
    const result = await query(
      `UPDATE receitas
       SET cliente_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [clienteId, receitaId]
    );

    return result.rows[0];
  },

  // Criar despesa automática quando há taxa de serviço
  async criarDespesaTaxaServico(receita: any, usuario_id: number) {
    // Calcular valor da taxa
    const valorTaxa = (parseFloat(receita.valor) * parseFloat(receita.taxa_servico_percentual)) / 100;

    // Preparar dados da despesa
    const despesaData = {
      descricao: `Taxa de Serviço - ${receita.descricao}`,
      valor: valorTaxa,
      data: receita.data,
      categoria: 'Taxa de Serviço',
      tipo_pagamento: receita.tipo_pagamento || 'a_vista',
      status: 'pendente',
      usuario_id: usuario_id,
      // Campos de vinculação
      receita_origem_id: receita.id,
      taxa_percentual: receita.taxa_servico_percentual,
      // Se a receita for parcelada, a despesa também será
      numero_parcelas: receita.numero_parcelas || null,
      parcelado: receita.tipo_pagamento === 'parcelado'
    };

    // Inserir despesa com vinculação
    const result = await query(
      `INSERT INTO despesas (
        descricao, valor, data, categoria, tipo_pagamento, status, pago,
        parcelado, numero_parcelas, recorrente, usuario_id,
        receita_origem_id, taxa_percentual
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        despesaData.descricao,
        despesaData.valor,
        despesaData.data,
        despesaData.categoria,
        despesaData.tipo_pagamento,
        despesaData.status,
        false, // pago = false
        despesaData.parcelado,
        despesaData.numero_parcelas,
        false, // recorrente = false
        despesaData.usuario_id,
        despesaData.receita_origem_id,
        despesaData.taxa_percentual
      ]
    );

    const despesa = result.rows[0];

    // Se a despesa for parcelada, criar parcelas automáticas
    if (despesaData.tipo_pagamento === 'parcelado' && despesaData.numero_parcelas > 1) {
      const valorParcela = valorTaxa / despesaData.numero_parcelas;
      const dataBase = new Date(despesaData.data);

      for (let i = 1; i <= despesaData.numero_parcelas; i++) {
        const dataVencimento = new Date(dataBase);
        dataVencimento.setMonth(dataVencimento.getMonth() + (i - 1));

        await query(
          `INSERT INTO parcelas_despesas (
            despesa_id, numero_parcela, total_parcelas, valor, data_vencimento, status
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            despesa.id,
            i,
            despesaData.numero_parcelas,
            valorParcela.toFixed(2),
            dataVencimento.toISOString().split('T')[0],
            'PENDENTE'
          ]
        );
      }
    }

    return despesa;
  }
};
