import { query } from '../../../config/database';

export interface FunilEstagioAcumulado {
  estagio_id: number;
  estagio_nome: string;
  estagio_cor: string;
  estagio_ordem: number;
  is_entrada: boolean;
  is_ganho: boolean;
  leads_passaram: number;
  taxa_etapa: number | null; // % do estágio anterior → este (null para o primeiro)
  taxa_geral: number;        // % boca → este
}

export interface FunilDiarioEntry {
  dia: string; // 'YYYY-MM-DD'
  por_estagio: Array<{ estagio_id: number; estagio_nome: string; total: number }>;
}

export interface FunilAnalytics {
  acumulado: FunilEstagioAcumulado[];
  diario: FunilDiarioEntry[];
  boca_funil: number;
  taxa_conversao_geral: number;
}

export interface DashboardMetricas {
  // Resumo geral
  totalLeads: number;
  leadsAtivos: number;
  leadsGanhos: number;
  leadsPerdidos: number;
  valorTotal: number;
  valorGanho: number;
  taxaConversao: number;

  // Por período
  leadsPorMes: Array<{ mes: string; total: number; ganhos: number; perdidos: number }>;
  valorPorMes: Array<{ mes: string; valor: number }>;

  // Por estágio
  leadsPorEstagio: Array<{ estagio: string; cor: string; total: number; valor: number }>;

  // Por temperatura
  leadsPorTemperatura: Array<{ temperatura: string; total: number; valor: number }>;

  // Por origem
  leadsPorOrigem: Array<{ origem: string; total: number }>;

  // Atividades recentes
  atividadesRecentes: Array<{
    id: number;
    tipo: string;
    descricao: string;
    lead_nome: string;
    lead_id: number;
    created_at: Date;
  }>;

  // Tarefas
  tarefasAtrasadas: number;
  tarefasHoje: number;
  tarefasPendentes: number;

  // Performance
  tempoMedioConversao: number | null; // em dias
  leadsSemContato7Dias: number;
}

export interface DashboardFiltros {
  funilId?: number;
  dataInicio?: string; // YYYY-MM-DD
  dataFim?: string;    // YYYY-MM-DD
}

function buildDateFilter(
  params: any[],
  dataInicio?: string,
  dataFim?: string,
  column: string = 'l.created_at'
): string {
  let clause = '';
  if (dataInicio) {
    params.push(dataInicio);
    clause += ` AND ${column} >= $${params.length}::date`;
  }
  if (dataFim) {
    params.push(dataFim);
    clause += ` AND ${column} < ($${params.length}::date + INTERVAL '1 day')`;
  }
  return clause;
}

export const dashboardService = {
  async getMetricas(empresaId: number, funilId?: number, dataInicio?: string, dataFim?: string, responsavelId?: number): Promise<DashboardMetricas> {
    // paramsBase: empresa + funil + responsavel — queries SEM filtro de data
    const paramsBase: any[] = [empresaId];
    let funilFilter = '';
    if (funilId) {
      paramsBase.push(funilId);
      funilFilter = `AND l.funil_id = $${paramsBase.length}`;
    }
    let responsavelFilter = '';
    if (responsavelId) {
      paramsBase.push(responsavelId);
      responsavelFilter = `AND l.responsavel_id = $${paramsBase.length}`;
    }

    // params: cópia do base + datas (l.created_at)
    const params = [...paramsBase];
    const dateFilterCreated = buildDateFilter(params, dataInicio, dataFim, 'l.created_at');

    // paramsGP: cópia do base + datas (data_ganho_perdido)
    const paramsGP = [...paramsBase];
    const dateFilterGP = buildDateFilter(paramsGP, dataInicio, dataFim, 'l.data_ganho_perdido');

    // Resumo: criações no período
    const resumoResult = await query(
      `SELECT
        COUNT(*) as total_leads,
        COUNT(*) FILTER (WHERE l.arquivado = false) as leads_ativos,
        COALESCE(SUM(l.valor_potencial) FILTER (WHERE l.arquivado = false), 0) as valor_total
       FROM leads l
       WHERE l.empresa_id = $1 ${funilFilter} ${responsavelFilter} ${dateFilterCreated}`,
      params
    );

    // Ganhos/perdidos: referência = data em que o evento ocorreu (data_ganho_perdido)
    const ganhoPerdidoResult = await query(
      `SELECT
        COUNT(*) FILTER (WHERE e.is_ganho = true) as leads_ganhos,
        COUNT(*) FILTER (WHERE e.is_perdido = true) as leads_perdidos,
        COALESCE(SUM(l.valor_potencial) FILTER (WHERE e.is_ganho = true), 0) as valor_ganho
       FROM leads l
       JOIN estagios_funil e ON l.estagio_id = e.id
       WHERE l.empresa_id = $1 ${funilFilter} ${responsavelFilter}
         AND l.data_ganho_perdido IS NOT NULL
         ${dateFilterGP}`,
      paramsGP
    );

    const resumo = resumoResult.rows[0];
    const gp = ganhoPerdidoResult.rows[0];
    const taxaConversao = resumo.total_leads > 0
      ? (parseInt(gp.leads_ganhos) / parseInt(resumo.total_leads)) * 100
      : 0;

    const temFiltroData = Boolean(dataInicio || dataFim);

    // Criações por mês (referência: l.created_at)
    const periodoCreated = temFiltroData ? dateFilterCreated : `AND l.created_at >= NOW() - INTERVAL '6 months'`;
    const criadosPorMesResult = await query(
      `SELECT TO_CHAR(l.created_at, 'YYYY-MM') as mes, COUNT(*)::int as total
       FROM leads l
       WHERE l.empresa_id = $1 ${funilFilter} ${responsavelFilter} ${periodoCreated}
       GROUP BY TO_CHAR(l.created_at, 'YYYY-MM')`,
      params
    );

    // Ganhos/perdidos por mês (referência: data_ganho_perdido)
    const periodoGP = temFiltroData ? dateFilterGP : `AND l.data_ganho_perdido >= NOW() - INTERVAL '6 months'`;
    const ganhoPorMesResult = await query(
      `SELECT
        TO_CHAR(l.data_ganho_perdido, 'YYYY-MM') as mes,
        COUNT(*) FILTER (WHERE e.is_ganho = true)::int as ganhos,
        COUNT(*) FILTER (WHERE e.is_perdido = true)::int as perdidos,
        COALESCE(SUM(l.valor_potencial) FILTER (WHERE e.is_ganho = true), 0) as valor
       FROM leads l
       JOIN estagios_funil e ON l.estagio_id = e.id
       WHERE l.empresa_id = $1 ${funilFilter} ${responsavelFilter}
         AND l.data_ganho_perdido IS NOT NULL
         ${periodoGP}
       GROUP BY TO_CHAR(l.data_ganho_perdido, 'YYYY-MM')`,
      paramsGP
    );

    // Merge: cada coluna referencia sua própria data
    const mesMap = new Map<string, { mes: string; total: number; ganhos: number; perdidos: number; valor: number }>();
    for (const r of criadosPorMesResult.rows) {
      mesMap.set(r.mes, { mes: r.mes, total: r.total, ganhos: 0, perdidos: 0, valor: 0 });
    }
    for (const r of ganhoPorMesResult.rows) {
      const entry = mesMap.get(r.mes) ?? { mes: r.mes, total: 0, ganhos: 0, perdidos: 0, valor: 0 };
      entry.ganhos = r.ganhos;
      entry.perdidos = r.perdidos;
      entry.valor = parseFloat(r.valor);
      mesMap.set(r.mes, entry);
    }
    const leadsPorMesMerged = Array.from(mesMap.values()).sort((a, b) => a.mes.localeCompare(b.mes));

    // Leads por estágio (snapshot atual — sem filtro de data)
    const leadsPorEstagioResult = await query(
      `SELECT
        e.nome as estagio,
        e.cor,
        COUNT(l.id) as total,
        COALESCE(SUM(l.valor_potencial), 0) as valor
       FROM estagios_funil e
       JOIN funis f ON e.funil_id = f.id
       LEFT JOIN leads l ON l.estagio_id = e.id AND l.arquivado = false AND l.empresa_id = $1
       WHERE f.empresa_id = $1
       ${funilId ? 'AND e.funil_id = $2' : ''}
       GROUP BY e.id, e.nome, e.cor, e.ordem
       ORDER BY e.ordem ASC`,
      paramsBase
    );

    // Leads por temperatura (referência: l.created_at)
    const leadsPorTemperaturaResult = await query(
      `SELECT
        l.temperatura,
        COUNT(*) as total,
        COALESCE(SUM(l.valor_potencial), 0) as valor
       FROM leads l
       WHERE l.empresa_id = $1 AND l.arquivado = false
       ${funilFilter} ${responsavelFilter} ${dateFilterCreated}
       GROUP BY l.temperatura`,
      params
    );

    // Leads por origem (referência: l.created_at)
    const leadsPorOrigemResult = await query(
      `SELECT
        COALESCE(l.origem, 'desconhecido') as origem,
        COUNT(*) as total
       FROM leads l
       WHERE l.empresa_id = $1 AND l.arquivado = false
       ${funilFilter} ${responsavelFilter} ${dateFilterCreated}
       GROUP BY l.origem
       ORDER BY total DESC
       LIMIT 10`,
      params
    );

    // Atividades recentes (últimas 10) — sem filtro de data
    const atividadesResult = await query(
      `SELECT
        a.id,
        a.tipo,
        a.descricao,
        l.nome as lead_nome,
        l.id as lead_id,
        a.created_at
       FROM atividades_lead a
       JOIN leads l ON a.lead_id = l.id
       WHERE l.empresa_id = $1
       ${funilFilter} ${responsavelFilter}
       ORDER BY a.created_at DESC
       LIMIT 10`,
      paramsBase
    );

    // Tarefas — sem filtro de data (sempre reflete estado atual)
    const tarefasResult = await query(
      `SELECT
        COUNT(*) FILTER (WHERE t.data_vencimento < CURRENT_DATE AND t.status NOT IN ('concluida', 'cancelada')) as atrasadas,
        COUNT(*) FILTER (WHERE t.data_vencimento::date = CURRENT_DATE AND t.status NOT IN ('concluida', 'cancelada')) as hoje,
        COUNT(*) FILTER (WHERE t.status NOT IN ('concluida', 'cancelada')) as pendentes
       FROM tarefas_lead t
       JOIN leads l ON t.lead_id = l.id
       WHERE l.empresa_id = $1
       ${funilFilter} ${responsavelFilter}`,
      paramsBase
    );

    const tarefas = tarefasResult.rows[0];

    // Tempo médio de conversão: dias entre criação e data_ganho_perdido (quando o evento ocorreu)
    const tempoConversaoResult = await query(
      `SELECT
        AVG(EXTRACT(EPOCH FROM (l.data_ganho_perdido - l.created_at)) / 86400)::numeric(10,1) as tempo_medio
       FROM leads l
       JOIN estagios_funil e ON l.estagio_id = e.id
       WHERE l.empresa_id = $1
         AND e.is_ganho = true
         AND l.data_ganho_perdido IS NOT NULL
         ${funilFilter} ${responsavelFilter} ${dateFilterGP}`,
      paramsGP
    );

    // Leads sem contato há 7 dias — sem filtro de data (estado atual)
    const semContatoResult = await query(
      `SELECT COUNT(*) as total
       FROM leads l
       WHERE l.empresa_id = $1
       AND l.arquivado = false
       AND (l.data_ultimo_contato IS NULL OR l.data_ultimo_contato < NOW() - INTERVAL '7 days')
       ${funilFilter} ${responsavelFilter}`,
      paramsBase
    );

    return {
      totalLeads: parseInt(resumo.total_leads),
      leadsAtivos: parseInt(resumo.leads_ativos),
      leadsGanhos: parseInt(gp.leads_ganhos),
      leadsPerdidos: parseInt(gp.leads_perdidos),
      valorTotal: parseFloat(resumo.valor_total),
      valorGanho: parseFloat(gp.valor_ganho),
      taxaConversao: Math.round(taxaConversao * 10) / 10,

      leadsPorMes: leadsPorMesMerged.map(r => ({
        mes: r.mes,
        total: r.total,
        ganhos: r.ganhos,
        perdidos: r.perdidos,
      })),

      valorPorMes: leadsPorMesMerged.map(r => ({
        mes: r.mes,
        valor: r.valor,
      })),

      leadsPorEstagio: leadsPorEstagioResult.rows.map(r => ({
        estagio: r.estagio,
        cor: r.cor,
        total: parseInt(r.total),
        valor: parseFloat(r.valor)
      })),

      leadsPorTemperatura: leadsPorTemperaturaResult.rows.map(r => ({
        temperatura: r.temperatura,
        total: parseInt(r.total),
        valor: parseFloat(r.valor)
      })),

      leadsPorOrigem: leadsPorOrigemResult.rows.map(r => ({
        origem: r.origem,
        total: parseInt(r.total)
      })),

      atividadesRecentes: atividadesResult.rows,

      tarefasAtrasadas: parseInt(tarefas.atrasadas),
      tarefasHoje: parseInt(tarefas.hoje),
      tarefasPendentes: parseInt(tarefas.pendentes),

      tempoMedioConversao: tempoConversaoResult.rows[0]?.tempo_medio
        ? parseFloat(tempoConversaoResult.rows[0].tempo_medio)
        : null,

      leadsSemContato7Dias: parseInt(semContatoResult.rows[0].total)
    };
  },

  async getFunilAnalytics(empresaId: number, funilId?: number, dias: number = 30, dataInicio?: string, dataFim?: string, responsavelId?: number): Promise<FunilAnalytics> {
    const params: any[] = [empresaId];
    let funilFilterLeads = '';
    let funilFilterEstagios = '';
    if (funilId) {
      params.push(funilId);
      funilFilterLeads = `AND l.funil_id = $${params.length}`;
      funilFilterEstagios = `AND e.funil_id = $${params.length}`;
    }
    let responsavelFilter = '';
    if (responsavelId) {
      params.push(responsavelId);
      responsavelFilter = `AND l.responsavel_id = $${params.length}`;
    }
    // Filtro para entradas no estágio de entrada (referência: l.created_at)
    const dateFilterCreated = buildDateFilter(params, dataInicio, dataFim, 'l.created_at');
    // Filtro para movimentações de estágio (referência: a.created_at — quando o evento ocorreu)
    const dateFilterActivity = buildDateFilter(params, dataInicio, dataFim, 'a.created_at');

    // Acumulado: para cada estágio, quantos leads únicos chegaram — por data do evento
    const acumuladoResult = await query(
      `WITH passagens AS (
         -- Leads que entraram no estágio de entrada: data referência = created_at
         SELECT l.id AS lead_id, l.estagio_id
         FROM leads l
         WHERE l.empresa_id = $1 ${funilFilterLeads} ${responsavelFilter} ${dateFilterCreated}
         UNION ALL
         -- Movimentações: data referência = quando a mudança ocorreu (a.created_at)
         SELECT a.lead_id, (a.dados->>'estagio_novo_id')::int AS estagio_id
         FROM atividades_lead a
         JOIN leads l ON a.lead_id = l.id
         WHERE l.empresa_id = $1 AND a.tipo = 'mudanca_estagio'
           AND a.dados->>'estagio_novo_id' IS NOT NULL
           ${funilFilterLeads} ${responsavelFilter} ${dateFilterActivity}
       )
       SELECT
         e.id AS estagio_id,
         e.nome AS estagio_nome,
         e.cor AS estagio_cor,
         e.ordem AS estagio_ordem,
         e.is_entrada,
         e.is_ganho,
         COUNT(DISTINCT p.lead_id) AS leads_passaram
       FROM estagios_funil e
       JOIN funis f ON e.funil_id = f.id
       LEFT JOIN passagens p ON p.estagio_id = e.id
       WHERE f.empresa_id = $1 AND e.is_perdido = false
       ${funilFilterEstagios}
       GROUP BY e.id, e.nome, e.cor, e.ordem, e.is_entrada, e.is_ganho
       ORDER BY e.ordem ASC`,
      params
    );

    // Calcular taxas em JS
    const estagios = acumuladoResult.rows;
    const bocaFunil = estagios.length > 0 ? parseInt(estagios[0].leads_passaram) : 0;
    const ganhoEstagio = estagios.find((e: any) => e.is_ganho);
    const taxaConversaoGeral = bocaFunil > 0 && ganhoEstagio
      ? Math.round((parseInt(ganhoEstagio.leads_passaram) / bocaFunil) * 1000) / 10
      : 0;

    const acumulado: FunilEstagioAcumulado[] = estagios.map((e: any, i: number) => {
      const leadsPassaram = parseInt(e.leads_passaram);
      const anterior = i > 0 ? parseInt(estagios[i - 1].leads_passaram) : null;
      const taxaEtapa = anterior !== null && anterior > 0
        ? Math.round((leadsPassaram / anterior) * 1000) / 10
        : null;
      const taxaGeral = bocaFunil > 0
        ? Math.round((leadsPassaram / bocaFunil) * 1000) / 10
        : 100;
      return {
        estagio_id: e.estagio_id,
        estagio_nome: e.estagio_nome,
        estagio_cor: e.estagio_cor,
        estagio_ordem: e.estagio_ordem,
        is_entrada: e.is_entrada,
        is_ganho: e.is_ganho,
        leads_passaram: leadsPassaram,
        taxa_etapa: taxaEtapa,
        taxa_geral: taxaGeral
      };
    });

    // Diário: entradas por estágio por dia nos últimos N dias
    const diasParam = Math.min(Math.max(parseInt(String(dias)) || 30, 1), 90);
    const paramsDiario: any[] = [empresaId];
    let funilFilterDiario = '';
    if (funilId) { paramsDiario.push(funilId); funilFilterDiario = `AND l.funil_id = $${paramsDiario.length}`; }
    let responsavelFilterDiario = '';
    if (responsavelId) { paramsDiario.push(responsavelId); responsavelFilterDiario = `AND l.responsavel_id = $${paramsDiario.length}`; }
    paramsDiario.push(diasParam);
    const diasIdx = `$${paramsDiario.length}`;

    const diarioResult = await query(
      `SELECT dia, estagio_id, estagio_nome, SUM(total)::int AS total
       FROM (
         -- Leads criados no estágio de entrada
         SELECT
           DATE(l.created_at) AS dia,
           l.estagio_id,
           e.nome AS estagio_nome,
           COUNT(DISTINCT l.id) AS total
         FROM leads l
         JOIN estagios_funil e ON l.estagio_id = e.id
         WHERE l.empresa_id = $1 AND e.is_entrada = true
           AND l.created_at >= NOW() - (${diasIdx} || ' days')::interval
           ${funilFilterDiario} ${responsavelFilterDiario}
         GROUP BY DATE(l.created_at), l.estagio_id, e.nome
         UNION ALL
         -- Movimentações para demais estágios (não entrada, não perdido)
         SELECT
           DATE(a.created_at) AS dia,
           (a.dados->>'estagio_novo_id')::int AS estagio_id,
           e.nome AS estagio_nome,
           COUNT(DISTINCT a.lead_id) AS total
         FROM atividades_lead a
         JOIN leads l ON a.lead_id = l.id
         JOIN estagios_funil e ON (a.dados->>'estagio_novo_id')::int = e.id
         WHERE l.empresa_id = $1 AND a.tipo = 'mudanca_estagio'
           AND e.is_entrada = false AND e.is_perdido = false
           AND a.created_at >= NOW() - (${diasIdx} || ' days')::interval
           ${funilFilterDiario} ${responsavelFilterDiario}
         GROUP BY DATE(a.created_at), (a.dados->>'estagio_novo_id')::int, e.nome
       ) sub
       GROUP BY dia, estagio_id, estagio_nome
       ORDER BY dia DESC, estagio_id ASC`,
      paramsDiario
    );

    // Agrupar diário por dia
    const diarioMap = new Map<string, Array<{ estagio_id: number; estagio_nome: string; total: number }>>();
    for (const row of diarioResult.rows) {
      const dia = row.dia instanceof Date ? row.dia.toISOString().split('T')[0] : String(row.dia);
      if (!diarioMap.has(dia)) diarioMap.set(dia, []);
      diarioMap.get(dia)!.push({
        estagio_id: parseInt(row.estagio_id),
        estagio_nome: row.estagio_nome,
        total: parseInt(row.total)
      });
    }

    const diario: FunilDiarioEntry[] = Array.from(diarioMap.entries()).map(([dia, por_estagio]) => ({
      dia,
      por_estagio
    }));

    return {
      acumulado,
      diario,
      boca_funil: bocaFunil,
      taxa_conversao_geral: taxaConversaoGeral
    };
  }
};
