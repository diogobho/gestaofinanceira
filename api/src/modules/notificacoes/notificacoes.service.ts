import { query } from '../../config/database';

export const notificacoesService = {
  async list(filters?: any) {
    let where = '1=1';
    const params: any[] = [];
    let paramCount = 1;

    // Multi-tenancy: filtrar por usuario_id
    if (filters?.usuario_id && filters?.nivel !== 'super_admin') {
      where += ` AND n.usuario_id = $${paramCount}`;
      params.push(filters.usuario_id);
      paramCount++;
    }

    if (filters?.cliente_id) {
      where += ` AND n.cliente_id = $${paramCount}`;
      params.push(filters.cliente_id);
      paramCount++;
    }

    if (filters?.tipo) {
      where += ` AND n.tipo = $${paramCount}`;
      params.push(filters.tipo);
      paramCount++;
    }

    if (filters?.status) {
      where += ` AND n.status = $${paramCount}`;
      params.push(filters.status);
      paramCount++;
    }

    // Filtro de data
    if (filters?.data_inicio) {
      where += ` AND n.data_envio >= $${paramCount}`;
      params.push(filters.data_inicio);
      paramCount++;
    }

    if (filters?.data_fim) {
      where += ` AND n.data_envio <= $${paramCount}`;
      params.push(filters.data_fim);
      paramCount++;
    }

    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const result = await query(
      `SELECT
        n.*,
        c.nome as cliente_nome,
        c.email as cliente_email,
        c.codigo as cliente_codigo,
        u.nome as usuario_nome,
        u.email as usuario_email
      FROM notificacoes_enviadas n
      INNER JOIN clientes c ON n.cliente_id = c.id
      INNER JOIN usuarios u ON n.usuario_id = u.id
      WHERE ${where}
      ORDER BY n.data_envio DESC
      LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    // Contar total
    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM notificacoes_enviadas n
       WHERE ${where}`,
      params
    );

    return {
      data: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit,
      offset
    };
  },

  async getById(id: string, filters?: any) {
    let where = 'n.id = $1';
    const params: any[] = [id];
    let paramCount = 2;

    // Multi-tenancy: verificar permissão de acesso
    if (filters?.usuario_id && filters?.nivel !== 'super_admin') {
      where += ` AND n.usuario_id = $${paramCount}`;
      params.push(filters.usuario_id);
    }

    const result = await query(
      `SELECT
        n.*,
        c.nome as cliente_nome,
        c.email as cliente_email,
        c.codigo as cliente_codigo,
        u.nome as usuario_nome,
        u.email as usuario_email
      FROM notificacoes_enviadas n
      INNER JOIN clientes c ON n.cliente_id = c.id
      INNER JOIN usuarios u ON n.usuario_id = u.id
      WHERE ${where}`,
      params
    );

    if (result.rows.length === 0) {
      throw new Error('Notificação não encontrada');
    }

    return result.rows[0];
  },

  async getStats(filters?: any) {
    let where = '1=1';
    const params: any[] = [];
    let paramCount = 1;

    // Multi-tenancy: filtrar por usuario_id
    if (filters?.usuario_id && filters?.nivel !== 'super_admin') {
      where += ` AND n.usuario_id = $${paramCount}`;
      params.push(filters.usuario_id);
      paramCount++;
    }

    const result = await query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'enviado') as enviados,
        COUNT(*) FILTER (WHERE status = 'erro') as erros,
        COUNT(DISTINCT cliente_id) as clientes_notificados,
        COUNT(*) FILTER (WHERE data_envio >= CURRENT_DATE) as hoje,
        COUNT(*) FILTER (WHERE data_envio >= CURRENT_DATE - INTERVAL '7 days') as ultimos_7_dias,
        COUNT(*) FILTER (WHERE data_envio >= CURRENT_DATE - INTERVAL '30 days') as ultimos_30_dias
      FROM notificacoes_enviadas n
      WHERE ${where}`,
      params
    );

    return result.rows[0];
  },

  async getByCliente(clienteId: number, filters?: any) {
    let where = 'n.cliente_id = $1';
    const params: any[] = [clienteId];
    let paramCount = 2;

    // Multi-tenancy: verificar permissão de acesso
    if (filters?.usuario_id && filters?.nivel !== 'super_admin') {
      where += ` AND n.usuario_id = $${paramCount}`;
      params.push(filters.usuario_id);
      paramCount++;
    }

    const result = await query(
      `SELECT
        n.*,
        c.nome as cliente_nome,
        c.email as cliente_email
      FROM notificacoes_enviadas n
      INNER JOIN clientes c ON n.cliente_id = c.id
      WHERE ${where}
      ORDER BY n.data_envio DESC
      LIMIT 20`,
      params
    );

    return result.rows;
  }
};
