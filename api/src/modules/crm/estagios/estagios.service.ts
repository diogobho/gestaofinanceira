import { query } from '../../../config/database';
import { calcularAgendadoPara } from '../_shared/agendamento';

export interface EstagioFollowupConfig {
  ativo: boolean;
  tipo: 'manual' | 'agente_ia';
  mensagem?: string;
  instrucao_ia?: string;
  // Padrão único de agendamento
  modo?: 'dias' | 'data';        // 'dias' = após X dias da entrada | 'data' = data fixa
  atraso_dias?: number | null;
  data_fixa?: string | null;     // 'YYYY-MM-DD'
  hora_envio?: string | null;    // 'HH:MM'
  dias_semana?: number[] | null; // 0=Dom..6=Sáb
}

export interface EstagioFunil {
  id: number;
  funil_id: number;
  nome: string;
  descricao?: string;
  cor: string;
  icone?: string;
  ordem: number;
  is_entrada: boolean;
  is_ganho: boolean;
  is_perdido: boolean;
  estagio_apos_resposta_id?: number | null;
  estagio_apos_envio_id?: number | null;
  followup_config?: EstagioFollowupConfig | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateEstagioDto {
  nome: string;
  descricao?: string;
  cor?: string;
  icone?: string;
  is_entrada?: boolean;
  is_ganho?: boolean;
  is_perdido?: boolean;
}

export interface UpdateEstagioDto {
  nome?: string;
  descricao?: string;
  cor?: string;
  icone?: string;
  is_entrada?: boolean;
  is_ganho?: boolean;
  is_perdido?: boolean;
  estagio_apos_resposta_id?: number | null;
  estagio_apos_envio_id?: number | null;
  followup_config?: EstagioFollowupConfig | null;
}

export const estagiosService = {
  async listByFunil(funilId: number, empresaId: number): Promise<EstagioFunil[]> {
    const result = await query(
      `SELECT e.*,
        (SELECT COUNT(*) FROM leads l WHERE l.estagio_id = e.id AND l.arquivado = false) as total_leads,
        (SELECT COALESCE(SUM(l.valor_potencial), 0) FROM leads l WHERE l.estagio_id = e.id AND l.arquivado = false) as valor_total
       FROM estagios_funil e
       JOIN funis f ON e.funil_id = f.id
       WHERE e.funil_id = $1 AND f.empresa_id = $2
       ORDER BY e.ordem ASC`,
      [funilId, empresaId]
    );
    return result.rows;
  },

  async getById(id: number, empresaId: number): Promise<EstagioFunil | null> {
    const result = await query(
      `SELECT e.* FROM estagios_funil e
       JOIN funis f ON e.funil_id = f.id
       WHERE e.id = $1 AND f.empresa_id = $2`,
      [id, empresaId]
    );
    return result.rows[0] || null;
  },

  async getEntrada(funilId: number): Promise<EstagioFunil | null> {
    const result = await query(
      `SELECT * FROM estagios_funil WHERE funil_id = $1 AND is_entrada = true`,
      [funilId]
    );
    return result.rows[0] || null;
  },

  async create(funilId: number, empresaId: number, data: CreateEstagioDto): Promise<EstagioFunil> {
    // Verificar se o funil pertence à empresa
    const funilResult = await query(
      `SELECT id FROM funis WHERE id = $1 AND empresa_id = $2`,
      [funilId, empresaId]
    );

    if (!funilResult.rows[0]) {
      throw new Error('Funil não encontrado');
    }

    // Obter próxima ordem
    const ordemResult = await query(
      `SELECT COALESCE(MAX(ordem), 0) + 1 as proxima_ordem FROM estagios_funil WHERE funil_id = $1`,
      [funilId]
    );
    const ordem = ordemResult.rows[0].proxima_ordem;

    // Se for entrada, remover entrada dos outros
    if (data.is_entrada) {
      await query(
        `UPDATE estagios_funil SET is_entrada = false WHERE funil_id = $1`,
        [funilId]
      );
    }

    const result = await query(
      `INSERT INTO estagios_funil (funil_id, nome, descricao, cor, icone, ordem, is_entrada, is_ganho, is_perdido)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        funilId,
        data.nome,
        data.descricao || null,
        data.cor || '#6B7280',
        data.icone || null,
        ordem,
        data.is_entrada || false,
        data.is_ganho || false,
        data.is_perdido || false
      ]
    );

    return result.rows[0];
  },

  async update(id: number, empresaId: number, data: UpdateEstagioDto): Promise<EstagioFunil | null> {
    const estagio = await this.getById(id, empresaId);
    if (!estagio) return null;

    // Se for definir como entrada, remover entrada dos outros
    if (data.is_entrada) {
      await query(
        `UPDATE estagios_funil SET is_entrada = false WHERE funil_id = $1 AND id != $2`,
        [estagio.funil_id, id]
      );
    }

    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.nome !== undefined) {
      fields.push(`nome = $${paramCount++}`);
      values.push(data.nome);
    }
    if (data.descricao !== undefined) {
      fields.push(`descricao = $${paramCount++}`);
      values.push(data.descricao);
    }
    if (data.cor !== undefined) {
      fields.push(`cor = $${paramCount++}`);
      values.push(data.cor);
    }
    if (data.icone !== undefined) {
      fields.push(`icone = $${paramCount++}`);
      values.push(data.icone);
    }
    if (data.is_entrada !== undefined) {
      fields.push(`is_entrada = $${paramCount++}`);
      values.push(data.is_entrada);
    }
    if (data.is_ganho !== undefined) {
      fields.push(`is_ganho = $${paramCount++}`);
      values.push(data.is_ganho);
    }
    if (data.is_perdido !== undefined) {
      fields.push(`is_perdido = $${paramCount++}`);
      values.push(data.is_perdido);
    }
    if (data.estagio_apos_resposta_id !== undefined) {
      fields.push(`estagio_apos_resposta_id = $${paramCount++}`);
      values.push(data.estagio_apos_resposta_id || null);
    }
    if (data.estagio_apos_envio_id !== undefined) {
      fields.push(`estagio_apos_envio_id = $${paramCount++}`);
      values.push(data.estagio_apos_envio_id || null);
    }
    if (data.followup_config !== undefined) {
      fields.push(`followup_config = $${paramCount++}`);
      values.push(data.followup_config ? JSON.stringify(data.followup_config) : null);
    }

    if (fields.length === 0) return estagio;

    values.push(id);

    const result = await query(
      `UPDATE estagios_funil SET ${fields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    if (data.followup_config !== undefined) {
      await sincronizarAutomacaoFollowupEstagio(id, empresaId, data.followup_config ?? null);
    }

    return result.rows[0];
  },

  async reorder(funilId: number, empresaId: number, estagios: { id: number; ordem: number }[]): Promise<boolean> {
    // Verificar se o funil pertence à empresa
    const funilResult = await query(
      `SELECT id FROM funis WHERE id = $1 AND empresa_id = $2`,
      [funilId, empresaId]
    );

    if (!funilResult.rows[0]) {
      throw new Error('Funil não encontrado');
    }

    // Atualizar ordem de cada estágio
    for (const estagio of estagios) {
      await query(
        `UPDATE estagios_funil SET ordem = $1 WHERE id = $2 AND funil_id = $3`,
        [estagio.ordem, estagio.id, funilId]
      );
    }

    return true;
  },

  async delete(id: number, empresaId: number): Promise<boolean> {
    const estagio = await this.getById(id, empresaId);
    if (!estagio) return false;

    // Verificar se há leads no estágio
    const leadsResult = await query(
      `SELECT COUNT(*) as count FROM leads WHERE estagio_id = $1`,
      [id]
    );

    if (parseInt(leadsResult.rows[0].count) > 0) {
      throw new Error('Não é possível deletar estágio com leads. Mova os leads primeiro.');
    }

    await query(`DELETE FROM estagios_funil WHERE id = $1`, [id]);
    return true;
  }
};


async function sincronizarAutomacaoFollowupEstagio(
  estagioId: number,
  empresaId: number,
  followupConfig: any | null
): Promise<void> {
  const existente = await query(
    `SELECT id FROM automacoes
     WHERE estagio_id = $1 AND tipo_acao = 'followup' AND empresa_id = $2`,
    [estagioId, empresaId]
  );

  if (followupConfig === null || followupConfig === undefined) {
    if (existente.rows[0]) {
      await query(`DELETE FROM automacoes WHERE id = $1`, [existente.rows[0].id]);
    }
    return;
  }

  const ativa = followupConfig?.ativo !== false;
  const cfgJson = JSON.stringify(followupConfig);

  if (existente.rows[0]) {
    await query(
      `UPDATE automacoes SET ativa = $1, config = $2 WHERE id = $3`,
      [ativa, cfgJson, existente.rows[0].id]
    );
  } else {
    const ctx = await query(
      `SELECT ef.nome, f.usuario_id
       FROM estagios_funil ef
       JOIN funis f ON f.id = ef.funil_id
       WHERE ef.id = $1 AND f.empresa_id = $2`,
      [estagioId, empresaId]
    );
    if (!ctx.rows[0]) return;

    await query(
      `INSERT INTO automacoes (
         empresa_id, usuario_id, nome, descricao, tipo_acao,
         estagio_id, ativa, config
       ) VALUES ($1, $2, $3, $4, 'followup', $5, $6, $7)`,
      [
        empresaId,
        ctx.rows[0].usuario_id,
        `Follow-up — ${ctx.rows[0].nome}`,
        'Follow-up automático configurado para este estágio',
        estagioId,
        ativa,
        cfgJson
      ]
    );
  }

  // Criar follow-up retroativo para leads já no estágio sem follow-up de estágio pendente.
  // O instante é calculado uma vez (base = agora) pelo padrão único e aplicado a todos.
  if (ativa) {
    const agendadoPara = calcularAgendadoPara({
      modo: followupConfig.modo || 'dias',
      atrasoDias: followupConfig.atraso_dias,
      dataFixa: followupConfig.data_fixa,
      horaEnvio: followupConfig.hora_envio,
      diasSemana: followupConfig.dias_semana,
    });
    const ehManual = (followupConfig.tipo || 'agente_ia') === 'manual';
    await query(
      `INSERT INTO followups_agendados
         (lead_id, usuario_id, empresa_id, agendado_para, tipo, mensagem, instrucao_ia,
          media_url, media_mimetype, media_filename,
          origem, modo, atraso_dias, data_fixa, hora_envio, dias_semana)
       SELECT l.id, l.usuario_id, $1, $2, $3, $4, $5, $6, $7, $8, 'estagio', $9, $10, $11, $12, $13
       FROM leads l
       WHERE l.estagio_id = $14
         AND l.empresa_id = $1
         AND l.arquivado = false
         AND NOT EXISTS (
           SELECT 1 FROM followups_agendados fa
           WHERE fa.lead_id = l.id AND fa.origem = 'estagio' AND fa.status = 'pendente'
         )`,
      [
        empresaId,
        agendadoPara,
        followupConfig.tipo || 'agente_ia',
        ehManual ? (followupConfig.mensagem || null) : null,
        !ehManual ? (followupConfig.instrucao_ia || null) : null,
        ehManual ? (followupConfig.media_url || null) : null,
        ehManual ? (followupConfig.media_mimetype || null) : null,
        ehManual ? (followupConfig.media_filename || null) : null,
        followupConfig.modo || 'dias',
        followupConfig.atraso_dias ?? null,
        followupConfig.data_fixa || null,
        followupConfig.hora_envio || null,
        followupConfig.dias_semana?.length ? followupConfig.dias_semana : null,
        estagioId,
      ]
    );
  }
}
