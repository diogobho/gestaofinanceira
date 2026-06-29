import { query } from '../../config/database';
import { buildPaginationQuery, buildPaginatedResponse } from '../../shared/utils';

export const sessoesService = {
  async list(filters: any, page: number, pageSize: number) {
    const { limit, offset } = buildPaginationQuery(page, pageSize);
    let where = '1=1';
    const params: any[] = [];

    // Multi-tenancy: filtrar por usuario_id (ADMIN vê tudo, MENTOR vê apenas seus dados)
    if (filters.usuario_id && filters.nivel !== 'super_admin') {
      params.push(filters.usuario_id);
      where += ` AND s.usuario_id = $${params.length}`;
    }

    if (filters.cliente_id) { params.push(filters.cliente_id); where += ` AND s.cliente_id = $${params.length}`; }
    if (filters.mentor_id) { params.push(filters.mentor_id); where += ` AND s.mentor_id = $${params.length}`; }
    if (filters.modalidade) { params.push(filters.modalidade); where += ` AND s.modalidade = $${params.length}`; }
    if (filters.data_ini) { params.push(filters.data_ini); where += ` AND s.data >= $${params.length}`; }
    if (filters.data_fim) { params.push(filters.data_fim); where += ` AND s.data <= $${params.length}`; }
    
    const countResult = await query(`SELECT COUNT(*) FROM sessoes s WHERE ${where}`, params);
    const dataResult = await query(
      `SELECT s.*, c.nome as cliente_nome, c.email as cliente_email, u.nome as mentor_nome
       FROM sessoes s
       LEFT JOIN clientes c ON s.cliente_id = c.id
       LEFT JOIN usuarios u ON s.mentor_id = u.id
       WHERE ${where} ORDER BY s.data DESC, s.horario DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    
    return buildPaginatedResponse(dataResult.rows, parseInt(countResult.rows[0].count), page, pageSize);
  },

  async getById(id: string, filters?: any) {
    let where = 's.id = $1';
    const params: any[] = [id];

    // Multi-tenancy: verificar permissão de acesso
    if (filters?.usuario_id && filters?.nivel !== 'super_admin') {
      params.push(filters.usuario_id);
      where += ` AND s.usuario_id = $${params.length}`;
    }

    const result = await query(
      `SELECT s.*, c.nome as cliente_nome, c.email as cliente_email, u.nome as mentor_nome
       FROM sessoes s
       LEFT JOIN clientes c ON s.cliente_id = c.id
       LEFT JOIN usuarios u ON s.mentor_id = u.id
       WHERE ${where}`,
      params
    );
    if (result.rows.length === 0) throw new Error('Sessão não encontrada');
    return result.rows[0];
  },

  async create(data: any) {
    // Multi-tenancy: usuario_id é obrigatório
    if (!data.usuario_id) {
      throw new Error('Campo "usuario_id" é obrigatório');
    }

    const result = await query(
      `INSERT INTO sessoes (
        cliente_id, mentor_id, tipo_sessao, data, horario, duracao_minutos,
        modalidade, plataforma, link_sessao, titulo, descricao, notas_internas, usuario_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [
        data.cliente_id, data.mentor_id, data.tipo_sessao, data.data, data.horario,
        data.duracao_minutos, data.modalidade, data.plataforma, data.link_sessao,
        data.titulo, data.descricao, data.notas_internas, data.usuario_id
      ]
    );
    return result.rows[0];
  },

  async update(id: string, data: any, filters?: any) {
    // Buscar sessão atual para fazer merge (PATCH parcial)
    const current = await this.getById(id);

    const merged = {
      tipo_sessao:      data.tipo_sessao      !== undefined ? data.tipo_sessao      : current.tipo_sessao,
      data:             data.data             !== undefined ? data.data             : current.data,
      horario:          data.horario          !== undefined ? data.horario          : current.horario,
      duracao_minutos:  data.duracao_minutos  !== undefined ? data.duracao_minutos  : current.duracao_minutos,
      modalidade:       data.modalidade       !== undefined ? data.modalidade       : current.modalidade,
      plataforma:       data.plataforma       !== undefined ? data.plataforma       : current.plataforma,
      link_sessao:      data.link_sessao      !== undefined ? data.link_sessao      : current.link_sessao,
      titulo:           data.titulo           !== undefined ? data.titulo           : current.titulo,
      descricao:        data.descricao        !== undefined ? data.descricao        : current.descricao,
      notas_internas:   data.notas_internas   !== undefined ? data.notas_internas   : current.notas_internas,
    };

    let where = 'id = $11';
    const params: any[] = [
      merged.tipo_sessao, merged.data, merged.horario, merged.duracao_minutos,
      merged.modalidade, merged.plataforma, merged.link_sessao,
      merged.titulo, merged.descricao, merged.notas_internas, id
    ];

    // Multi-tenancy: garantir que apenas o dono pode atualizar
    if (filters?.usuario_id && filters?.nivel !== 'super_admin') {
      where += ' AND usuario_id = $12';
      params.push(filters.usuario_id);
    }

    const result = await query(
      `UPDATE sessoes SET
        tipo_sessao = $1, data = $2, horario = $3, duracao_minutos = $4,
        modalidade = $5, plataforma = $6, link_sessao = $7,
        titulo = $8, descricao = $9, notas_internas = $10
       WHERE ${where} RETURNING *`,
      params
    );
    if (result.rows.length === 0) throw new Error('Sessão não encontrada ou sem permissão');
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

    const result = await query(`DELETE FROM sessoes WHERE ${where} RETURNING id`, params);
    if (result.rows.length === 0) throw new Error('Sessão não encontrada ou sem permissão');
  }
};
