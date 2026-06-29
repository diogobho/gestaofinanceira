import { query } from '../../config/database';

export const dashboardService = {
  async getDashboardData(filters: any) {
    const params: any[] = [];
    let whereClause = '1=1';
    let paramCount = 1;

    // Multi-tenancy
    if (filters.usuario_id && filters.nivel !== 'super_admin') {
      whereClause += ` AND r.usuario_id = $${paramCount}`;
      params.push(filters.usuario_id);
      paramCount++;
    }

    // Filtros de data
    if (filters.data_ini) {
      whereClause += ` AND pr.data_vencimento >= $${paramCount}`;
      params.push(filters.data_ini);
      paramCount++;
    }
    if (filters.data_fim) {
      whereClause += ` AND pr.data_vencimento <= $${paramCount}`;
      params.push(filters.data_fim);
      paramCount++;
    }

    // RECEITAS - baseado em parcelas
    const receitasQuery = `
      SELECT
        SUM(CASE WHEN pr.status = 'PAGO' THEN pr.valor ELSE 0 END) as realizadas,
        SUM(CASE WHEN pr.status != 'PAGO' THEN pr.valor ELSE 0 END) as previstas,
        SUM(pr.valor) as total,
        COUNT(DISTINCT pr.receita_id) as quantidade
      FROM parcelas_receitas pr
      INNER JOIN receitas r ON pr.receita_id = r.id
      WHERE ${whereClause}
    `;

    const receitasResult = await query(receitasQuery, params);

    // DESPESAS - baseado em parcelas
    let despesasWhereClause = '1=1';
    let despesasParams: any[] = [];
    let despesasParamCount = 1;

    if (filters.usuario_id && filters.nivel !== 'super_admin') {
      despesasWhereClause += ` AND d.usuario_id = $${despesasParamCount}`;
      despesasParams.push(filters.usuario_id);
      despesasParamCount++;
    }

    if (filters.data_ini) {
      despesasWhereClause += ` AND pd.data_vencimento >= $${despesasParamCount}`;
      despesasParams.push(filters.data_ini);
      despesasParamCount++;
    }
    if (filters.data_fim) {
      despesasWhereClause += ` AND pd.data_vencimento <= $${despesasParamCount}`;
      despesasParams.push(filters.data_fim);
      despesasParamCount++;
    }

    const despesasQuery = `
      SELECT
        SUM(CASE WHEN pd.status = 'PAGO' THEN pd.valor ELSE 0 END) as realizadas,
        SUM(CASE WHEN pd.status != 'PAGO' THEN pd.valor ELSE 0 END) as previstas,
        SUM(pd.valor) as total,
        COUNT(DISTINCT pd.despesa_id) as quantidade
      FROM parcelas_despesas pd
      INNER JOIN despesas d ON pd.despesa_id = d.id
      WHERE ${despesasWhereClause}
    `;

    const despesasResult = await query(despesasQuery, despesasParams);

    // Dados das receitas
    const receitas = {
      realizadas: parseFloat(receitasResult.rows[0]?.realizadas || 0),
      previstas: parseFloat(receitasResult.rows[0]?.previstas || 0),
      total: parseFloat(receitasResult.rows[0]?.total || 0),
      quantidade: parseInt(receitasResult.rows[0]?.quantidade || 0)
    };

    // Dados das despesas
    const despesas = {
      realizadas: parseFloat(despesasResult.rows[0]?.realizadas || 0),
      previstas: parseFloat(despesasResult.rows[0]?.previstas || 0),
      total: parseFloat(despesasResult.rows[0]?.total || 0),
      quantidade: parseInt(despesasResult.rows[0]?.quantidade || 0)
    };

    // Cálculos derivados
    const lucro = {
      realizado: receitas.realizadas - despesas.realizadas,
      previsto: receitas.previstas - despesas.previstas,
      total: receitas.total - despesas.total
    };

    return {
      receitas,
      despesas,
      lucro,
      periodo: {
        data_ini: filters.data_ini || null,
        data_fim: filters.data_fim || null
      }
    };
  }
};
