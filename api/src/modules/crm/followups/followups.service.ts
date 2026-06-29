import { query } from '../../../config/database';

export const followupsService = {
  async criar(
    leadId: number,
    usuarioId: number,
    empresaId: number,
    agendadoPara: string,
    tipo: 'manual' | 'agente_ia',
    mensagem?: string,
    instrucaoIa?: string,
    origem: 'lead' | 'estagio' = 'lead',
    horaInicio?: string,
    horaFim?: string,
    diasSemana?: number[]
  ) {
    const result = await query(
      `INSERT INTO followups_agendados
         (lead_id, usuario_id, empresa_id, agendado_para, tipo, mensagem, instrucao_ia,
          origem, hora_inicio, hora_fim, dias_semana)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        leadId, usuarioId, empresaId, agendadoPara, tipo,
        mensagem || null, instrucaoIa || null, origem,
        horaInicio || null, horaFim || null,
        diasSemana?.length ? diasSemana : null,
      ]
    );
    return result.rows[0];
  },

  async listarPorLead(leadId: number, empresaId: number) {
    const result = await query(
      `SELECT f.*, u.nome as usuario_nome
       FROM followups_agendados f
       JOIN usuarios u ON u.id = f.usuario_id
       WHERE f.lead_id = $1 AND f.empresa_id = $2
       ORDER BY f.agendado_para ASC`,
      [leadId, empresaId]
    );
    return result.rows;
  },

  /** Lista todos os follow-ups da empresa com filtros opcionais */
  async listarTodos(
    empresaId: number,
    filtro?: 'hoje' | 'semana' | 'atrasados' | 'todos',
    status?: string,
    funilTipo?: 'aquisicao' | 'cx'
  ) {
    const statusFiltro = status || 'pendente';
    let dateFiltro = '';

    if (filtro === 'hoje') {
      dateFiltro = `AND DATE(f.agendado_para AT TIME ZONE 'America/Sao_Paulo')
                     = CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo'`;
    } else if (filtro === 'semana') {
      dateFiltro = `AND f.agendado_para AT TIME ZONE 'America/Sao_Paulo'
                     >= DATE_TRUNC('week', NOW() AT TIME ZONE 'America/Sao_Paulo')
                    AND f.agendado_para AT TIME ZONE 'America/Sao_Paulo'
                     <  DATE_TRUNC('week', NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '7 days'`;
    } else if (filtro === 'atrasados') {
      dateFiltro = `AND f.agendado_para < NOW() AND f.status = 'pendente'`;
    }

    const params: unknown[] = [empresaId, filtro === 'atrasados' ? 'pendente' : statusFiltro];
    const funilFiltro = funilTipo ? `AND fn.tipo = $3` : '';
    if (funilTipo) params.push(funilTipo);

    const result = await query(
      `SELECT f.*,
              l.nome  AS lead_nome,
              l.telefone AS lead_telefone,
              u.nome  AS usuario_nome,
              ef.nome AS estagio_nome,
              ef.cor  AS estagio_cor,
              fn.tipo AS funil_tipo
       FROM followups_agendados f
       JOIN leads l      ON l.id  = f.lead_id
       JOIN usuarios u   ON u.id  = f.usuario_id
       LEFT JOIN estagios_funil ef ON ef.id = l.estagio_id
       LEFT JOIN funis fn ON fn.id = l.funil_id
       WHERE f.empresa_id = $1
         AND ($2::text = 'todos' OR f.status = $2::text)
         ${dateFiltro}
         ${funilFiltro}
       ORDER BY f.agendado_para ASC
       LIMIT 200`,
      params
    );
    return result.rows;
  },

  async cancelar(id: number, empresaId: number) {
    const result = await query(
      `UPDATE followups_agendados SET status = 'cancelado', updated_at = NOW()
       WHERE id = $1 AND empresa_id = $2 AND status = 'pendente'
       RETURNING *`,
      [id, empresaId]
    );
    return result.rows[0];
  },

  /** Reagenda um follow-up falho ou cancelado */
  async reagendar(id: number, empresaId: number, agendadoPara: string) {
    const result = await query(
      `UPDATE followups_agendados
       SET agendado_para = $3, status = 'pendente', erro = NULL, updated_at = NOW()
       WHERE id = $1 AND empresa_id = $2 AND status IN ('falhou', 'cancelado')
       RETURNING *`,
      [id, empresaId, agendadoPara]
    );
    return result.rows[0];
  },

  /** Cancela todos os follow-ups pendentes de estágio para um lead */
  async cancelarEstagiosPorLead(leadId: number) {
    await query(
      `UPDATE followups_agendados SET status = 'cancelado', updated_at = NOW()
       WHERE lead_id = $1 AND origem = 'estagio' AND status = 'pendente'`,
      [leadId]
    );
  },

  async buscarPendentes() {
    const result = await query(
      `SELECT f.*, l.nome as lead_nome, l.telefone as lead_telefone,
              l.email as lead_email, l.notas as lead_notas,
              l.temperatura as lead_temperatura, l.empresa_id,
              l.contato_whatsapp_id, l.funil_id, l.estagio_id, l.cargo,
              l.empresa as lead_empresa,
              ef.nome as estagio_nome, ef.instrucoes_agente_ia as estagio_instrucoes
       FROM followups_agendados f
       JOIN leads l ON l.id = f.lead_id
       LEFT JOIN estagios_funil ef ON ef.id = l.estagio_id
       WHERE f.status = 'pendente'
         AND f.agendado_para <= NOW()
       ORDER BY f.agendado_para ASC`,
      []
    );
    return result.rows;
  },

  async marcarEnviado(id: number) {
    await query(
      `UPDATE followups_agendados
       SET status = 'enviado', enviado_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
  },

  async marcarFalhou(id: number, erro: string) {
    await query(
      `UPDATE followups_agendados
       SET status = 'falhou', erro = $2, updated_at = NOW()
       WHERE id = $1`,
      [id, erro]
    );
  },

  /** Métricas de follow-ups para o dashboard */
  async metricas(empresaId: number) {
    const result = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pendente')                                  AS total_pendentes,
         COUNT(*) FILTER (WHERE status = 'pendente' AND agendado_para < NOW())        AS total_atrasados,
         COUNT(*) FILTER (WHERE status = 'pendente'
                            AND DATE(agendado_para AT TIME ZONE 'America/Sao_Paulo')
                             = CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')         AS pendentes_hoje,
         COUNT(*) FILTER (WHERE status = 'enviado'
                            AND DATE(enviado_at AT TIME ZONE 'America/Sao_Paulo')
                             = CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')         AS enviados_hoje,
         COUNT(*) FILTER (WHERE status = 'falhou')                                    AS total_falhados
       FROM followups_agendados
       WHERE empresa_id = $1`,
      [empresaId]
    );
    return result.rows[0];
  },
};
