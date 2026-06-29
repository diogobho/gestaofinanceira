import { query } from '../../config/database';

export const categoriasService = {
  // ============================================================================
  // CATEGORIAS RECEITAS
  // ============================================================================

  async listCategoriasReceitas(usuario_id: number, nivel?: string) {
    let where = '1=1';
    const params: any[] = [];

    // Multi-tenancy: filtrar por usuario_id (super_admin vê tudo, outros veem apenas seus dados)
    if (usuario_id && nivel !== 'super_admin') {
      params.push(usuario_id);
      where += ` AND usuario_id = $${params.length}`;
    }

    const result = await query(
      `SELECT * FROM categorias_receitas WHERE ${where} ORDER BY nome ASC`,
      params
    );

    return result.rows;
  },

  async getCategoriaReceita(id: string, usuario_id: number, nivel?: string) {
    let where = 'id = $1';
    const params: any[] = [id];

    // Multi-tenancy: verificar permissão de acesso
    if (usuario_id && nivel !== 'super_admin') {
      params.push(usuario_id);
      where += ` AND usuario_id = $${params.length}`;
    }

    const result = await query(
      `SELECT * FROM categorias_receitas WHERE ${where}`,
      params
    );

    if (result.rows.length === 0) {
      throw new Error('Categoria de receita não encontrada');
    }

    return result.rows[0];
  },

  async createCategoriaReceita(data: any, usuario_id: number) {
    // Multi-tenancy: usuario_id é obrigatório
    if (!usuario_id) {
      throw new Error('Campo "usuario_id" é obrigatório');
    }

    // Validações
    if (!data.nome || data.nome.trim() === '') {
      throw new Error('Campo "nome" é obrigatório');
    }

    const result = await query(
      `INSERT INTO categorias_receitas (nome, usuario_id, ativo)
       VALUES ($1, $2, $3) RETURNING *`,
      [
        data.nome.trim(),
        usuario_id,
        data.ativo !== undefined ? data.ativo : true
      ]
    );

    return result.rows[0];
  },

  async updateCategoriaReceita(id: string, data: any, usuario_id: number, nivel?: string) {
    // Validações
    if (!data.nome || data.nome.trim() === '') {
      throw new Error('Campo "nome" é obrigatório');
    }

    let where = 'id = $3';
    const params: any[] = [
      data.nome.trim(),
      data.ativo !== undefined ? data.ativo : true,
      id
    ];

    // Multi-tenancy: garantir que apenas o dono pode atualizar
    if (usuario_id && nivel !== 'super_admin') {
      where += ' AND usuario_id = $4';
      params.push(usuario_id);
    }

    const result = await query(
      `UPDATE categorias_receitas SET
        nome = $1,
        ativo = $2,
        updated_at = CURRENT_TIMESTAMP
       WHERE ${where} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      throw new Error('Categoria de receita não encontrada ou sem permissão');
    }

    return result.rows[0];
  },

  async deleteCategoriaReceita(id: string, usuario_id: number, nivel?: string) {
    let where = 'id = $1';
    const params: any[] = [id];

    // Multi-tenancy: garantir que apenas o dono pode deletar
    if (usuario_id && nivel !== 'super_admin') {
      where += ' AND usuario_id = $2';
      params.push(usuario_id);
    }

    const result = await query(
      `DELETE FROM categorias_receitas WHERE ${where} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      throw new Error('Categoria de receita não encontrada ou sem permissão');
    }

    return result.rows[0];
  },

  // ============================================================================
  // CATEGORIAS DESPESAS
  // ============================================================================

  async listCategoriasDespesas(usuario_id: number, nivel?: string) {
    let where = '1=1';
    const params: any[] = [];

    // Multi-tenancy: filtrar por usuario_id (super_admin vê tudo, outros veem apenas seus dados)
    if (usuario_id && nivel !== 'super_admin') {
      params.push(usuario_id);
      where += ` AND usuario_id = $${params.length}`;
    }

    const result = await query(
      `SELECT * FROM categorias_despesas WHERE ${where} ORDER BY nome ASC`,
      params
    );

    return result.rows;
  },

  async getCategoriaDespesa(id: string, usuario_id: number, nivel?: string) {
    let where = 'id = $1';
    const params: any[] = [id];

    // Multi-tenancy: verificar permissão de acesso
    if (usuario_id && nivel !== 'super_admin') {
      params.push(usuario_id);
      where += ` AND usuario_id = $${params.length}`;
    }

    const result = await query(
      `SELECT * FROM categorias_despesas WHERE ${where}`,
      params
    );

    if (result.rows.length === 0) {
      throw new Error('Categoria de despesa não encontrada');
    }

    return result.rows[0];
  },

  async createCategoriaDespesa(data: any, usuario_id: number) {
    // Multi-tenancy: usuario_id é obrigatório
    if (!usuario_id) {
      throw new Error('Campo "usuario_id" é obrigatório');
    }

    // Validações
    if (!data.nome || data.nome.trim() === '') {
      throw new Error('Campo "nome" é obrigatório');
    }

    const result = await query(
      `INSERT INTO categorias_despesas (nome, usuario_id, ativo)
       VALUES ($1, $2, $3) RETURNING *`,
      [
        data.nome.trim(),
        usuario_id,
        data.ativo !== undefined ? data.ativo : true
      ]
    );

    return result.rows[0];
  },

  async updateCategoriaDespesa(id: string, data: any, usuario_id: number, nivel?: string) {
    // Validações
    if (!data.nome || data.nome.trim() === '') {
      throw new Error('Campo "nome" é obrigatório');
    }

    let where = 'id = $3';
    const params: any[] = [
      data.nome.trim(),
      data.ativo !== undefined ? data.ativo : true,
      id
    ];

    // Multi-tenancy: garantir que apenas o dono pode atualizar
    if (usuario_id && nivel !== 'super_admin') {
      where += ' AND usuario_id = $4';
      params.push(usuario_id);
    }

    const result = await query(
      `UPDATE categorias_despesas SET
        nome = $1,
        ativo = $2,
        updated_at = CURRENT_TIMESTAMP
       WHERE ${where} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      throw new Error('Categoria de despesa não encontrada ou sem permissão');
    }

    return result.rows[0];
  },

  async deleteCategoriaDespesa(id: string, usuario_id: number, nivel?: string) {
    let where = 'id = $1';
    const params: any[] = [id];

    // Multi-tenancy: garantir que apenas o dono pode deletar
    if (usuario_id && nivel !== 'super_admin') {
      where += ' AND usuario_id = $2';
      params.push(usuario_id);
    }

    const result = await query(
      `DELETE FROM categorias_despesas WHERE ${where} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      throw new Error('Categoria de despesa não encontrada ou sem permissão');
    }

    return result.rows[0];
  }
};
