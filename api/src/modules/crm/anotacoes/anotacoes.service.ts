import { query } from '../../../config/database';

export interface Anotacao {
  id: number;
  lead_id: number;
  empresa_id: number;
  usuario_id: number;
  conteudo: string;
  tipo: 'nota' | 'importante' | 'lembrete';
  created_at: Date;
  updated_at: Date;
  usuario_nome?: string;
}

export interface CreateAnotacaoDto {
  lead_id: number;
  conteudo: string;
  tipo?: 'nota' | 'importante' | 'lembrete';
}

export interface UpdateAnotacaoDto {
  conteudo?: string;
  tipo?: 'nota' | 'importante' | 'lembrete';
}

export const anotacoesService = {
  async listByLead(leadId: number, empresaId: number): Promise<Anotacao[]> {
    const result = await query(
      `SELECT
        a.*,
        u.nome as usuario_nome
       FROM anotacoes_lead a
       LEFT JOIN usuarios u ON a.usuario_id = u.id
       WHERE a.lead_id = $1 AND a.empresa_id = $2
       ORDER BY a.created_at DESC`,
      [leadId, empresaId]
    );
    return result.rows;
  },

  async getById(id: number, empresaId: number): Promise<Anotacao | null> {
    const result = await query(
      `SELECT
        a.*,
        u.nome as usuario_nome
       FROM anotacoes_lead a
       LEFT JOIN usuarios u ON a.usuario_id = u.id
       WHERE a.id = $1 AND a.empresa_id = $2`,
      [id, empresaId]
    );
    return result.rows[0] || null;
  },

  async create(empresaId: number, usuarioId: number, data: CreateAnotacaoDto): Promise<Anotacao> {
    const result = await query(
      `INSERT INTO anotacoes_lead (lead_id, empresa_id, usuario_id, conteudo, tipo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        data.lead_id,
        empresaId,
        usuarioId,
        data.conteudo,
        data.tipo || 'nota'
      ]
    );

    // Registrar atividade
    await query(
      `INSERT INTO atividades_lead (lead_id, usuario_id, empresa_id, tipo, descricao, dados)
       VALUES ($1, $2, $3, 'nota', $4, $5)`,
      [
        data.lead_id,
        usuarioId,
        empresaId,
        'Anotação adicionada',
        JSON.stringify({ anotacao_id: result.rows[0].id, tipo: data.tipo || 'nota' })
      ]
    );

    return this.getById(result.rows[0].id, empresaId) as Promise<Anotacao>;
  },

  async update(id: number, empresaId: number, data: UpdateAnotacaoDto): Promise<Anotacao | null> {
    const anotacao = await this.getById(id, empresaId);
    if (!anotacao) return null;

    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.conteudo !== undefined) {
      fields.push(`conteudo = $${paramCount++}`);
      values.push(data.conteudo);
    }

    if (data.tipo !== undefined) {
      fields.push(`tipo = $${paramCount++}`);
      values.push(data.tipo);
    }

    if (fields.length === 0) return anotacao;

    values.push(id, empresaId);

    await query(
      `UPDATE anotacoes_lead SET ${fields.join(', ')}
       WHERE id = $${paramCount++} AND empresa_id = $${paramCount}`,
      values
    );

    return this.getById(id, empresaId);
  },

  async delete(id: number, empresaId: number): Promise<boolean> {
    const anotacao = await this.getById(id, empresaId);
    if (!anotacao) return false;

    await query(
      `DELETE FROM anotacoes_lead WHERE id = $1 AND empresa_id = $2`,
      [id, empresaId]
    );
    return true;
  },

  async countByLead(leadId: number, empresaId: number): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as count FROM anotacoes_lead
       WHERE lead_id = $1 AND empresa_id = $2`,
      [leadId, empresaId]
    );
    return parseInt(result.rows[0].count);
  }
};
