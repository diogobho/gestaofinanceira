import { query } from '../../../config/database';

export interface Origem {
  id: number;
  empresa_id: number;
  nome: string;
  cor: string | null;
  created_at: Date;
  total_leads?: number;
}

export interface CreateOrigemDto {
  nome: string;
  cor?: string;
}

export interface UpdateOrigemDto {
  nome?: string;
  cor?: string;
}

export const origensService = {
  async list(empresaId: number): Promise<Origem[]> {
    const result = await query(
      `SELECT o.*,
        (SELECT COUNT(*) FROM leads l
          WHERE l.empresa_id = o.empresa_id AND l.origem = o.nome) AS total_leads
       FROM crm_origens o
       WHERE o.empresa_id = $1
       ORDER BY o.nome ASC`,
      [empresaId]
    );
    return result.rows;
  },

  async getById(id: number, empresaId: number): Promise<Origem | null> {
    const result = await query(
      `SELECT * FROM crm_origens WHERE id = $1 AND empresa_id = $2`,
      [id, empresaId]
    );
    return result.rows[0] || null;
  },

  async create(empresaId: number, data: CreateOrigemDto): Promise<Origem> {
    const result = await query(
      `INSERT INTO crm_origens (empresa_id, nome, cor)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [empresaId, data.nome.trim(), data.cor || null]
    );
    return result.rows[0];
  },

  async update(id: number, empresaId: number, data: UpdateOrigemDto): Promise<Origem | null> {
    const origem = await this.getById(id, empresaId);
    if (!origem) return null;

    const novoNome = data.nome !== undefined ? data.nome.trim() : undefined;

    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (novoNome !== undefined) {
      fields.push(`nome = $${paramCount++}`);
      values.push(novoNome);
    }
    if (data.cor !== undefined) {
      fields.push(`cor = $${paramCount++}`);
      values.push(data.cor);
    }

    if (fields.length === 0) return origem;

    values.push(id, empresaId);

    const result = await query(
      `UPDATE crm_origens SET ${fields.join(', ')}
       WHERE id = $${paramCount++} AND empresa_id = $${paramCount}
       RETURNING *`,
      values
    );

    // Renomear em cascata: leads que usam o nome antigo passam a usar o novo.
    if (novoNome !== undefined && novoNome !== origem.nome) {
      await query(
        `UPDATE leads SET origem = $1 WHERE empresa_id = $2 AND origem = $3`,
        [novoNome, empresaId, origem.nome]
      );
    }

    return result.rows[0];
  },

  async delete(id: number, empresaId: number): Promise<boolean> {
    const origem = await this.getById(id, empresaId);
    if (!origem) return false;

    // Leads que usavam esta origem ficam sem origem.
    await query(
      `UPDATE leads SET origem = NULL WHERE empresa_id = $1 AND origem = $2`,
      [empresaId, origem.nome]
    );
    await query(`DELETE FROM crm_origens WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);

    return true;
  }
};
