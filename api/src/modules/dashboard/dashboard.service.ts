import { escopoDono } from '../../shared/escopoFinanceiro';
import { query } from '../../config/database';

export const dashboardService = {
  async getDashboardData(filters: any) {
    const params: any[] = [];
    let whereClause = '1=1';
    let paramCount = 1;

    // Quem vê o quê: master/creator, a empresa inteira (shared/escopoFinanceiro.ts)
    whereClause += escopoDono(filters, params, 'r.usuario_id');
    paramCount = params.length + 1;

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

    despesasWhereClause += escopoDono(filters, despesasParams, 'd.usuario_id');
    despesasParamCount = despesasParams.length + 1;

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

    // A receber daqui para frente — NÃO segue o período do filtro (que por padrão termina hoje
    // e por isso escondia tudo o que vence no futuro). Pedido da Dani (empresa 44, 06/10/2026).
    const futuroParams: any[] = [];
    let futuroWhere = `pr.status <> 'PAGO' AND pr.data_vencimento >= (now() AT TIME ZONE 'America/Sao_Paulo')::date`;
    futuroWhere += escopoDono(filters, futuroParams, 'r.usuario_id');
    const futuroResult = await query(
      `SELECT to_char(pr.data_vencimento, 'YYYY-MM') AS mes, SUM(pr.valor) AS valor, COUNT(*)::int AS parcelas
         FROM parcelas_receitas pr
         INNER JOIN receitas r ON pr.receita_id = r.id
        WHERE ${futuroWhere}
        GROUP BY 1 ORDER BY 1`,
      futuroParams
    );
    const porMes = futuroResult.rows.map((x: any) => ({ mes: x.mes, valor: parseFloat(x.valor), parcelas: x.parcelas }));
    const aReceberFuturo = {
      total: porMes.reduce((t: number, m: any) => t + m.valor, 0),
      parcelas: porMes.reduce((t: number, m: any) => t + m.parcelas, 0),
      porMes,
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
      aReceberFuturo,
      periodo: {
        data_ini: filters.data_ini || null,
        data_fim: filters.data_fim || null
      }
    };
  }
};
