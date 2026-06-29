import { query } from '../../../config/database';

export interface Tag {
  id: number;
  empresa_id: number;
  nome: string;
  cor: string;
  created_at: Date;
}

export interface CreateTagDto {
  nome: string;
  cor?: string;
}

export interface UpdateTagDto {
  nome?: string;
  cor?: string;
}

export const tagsService = {
  async list(empresaId: number): Promise<Tag[]> {
    const result = await query(
      `SELECT t.*,
        (SELECT COUNT(*) FROM lead_tags lt WHERE lt.tag_id = t.id) as total_leads
       FROM tags t
       WHERE t.empresa_id = $1
       ORDER BY t.nome ASC`,
      [empresaId]
    );
    return result.rows;
  },

  async getById(id: number, empresaId: number): Promise<Tag | null> {
    const result = await query(
      `SELECT * FROM tags WHERE id = $1 AND empresa_id = $2`,
      [id, empresaId]
    );
    return result.rows[0] || null;
  },

  async create(empresaId: number, data: CreateTagDto): Promise<Tag> {
    const result = await query(
      `INSERT INTO tags (empresa_id, nome, cor)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [empresaId, data.nome, data.cor || '#3B82F6']
    );
    return result.rows[0];
  },

  async update(id: number, empresaId: number, data: UpdateTagDto): Promise<Tag | null> {
    const tag = await this.getById(id, empresaId);
    if (!tag) return null;

    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.nome !== undefined) {
      fields.push(`nome = $${paramCount++}`);
      values.push(data.nome);
    }
    if (data.cor !== undefined) {
      fields.push(`cor = $${paramCount++}`);
      values.push(data.cor);
    }

    if (fields.length === 0) return tag;

    values.push(id, empresaId);

    const result = await query(
      `UPDATE tags SET ${fields.join(', ')}
       WHERE id = $${paramCount++} AND empresa_id = $${paramCount}
       RETURNING *`,
      values
    );

    return result.rows[0];
  },

  async delete(id: number, empresaId: number): Promise<boolean> {
    const tag = await this.getById(id, empresaId);
    if (!tag) return false;

    // Deletar associações primeiro (cascade já deveria cuidar disso, mas por segurança)
    await query(`DELETE FROM lead_tags WHERE tag_id = $1`, [id]);
    await query(`DELETE FROM tags WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);

    return true;
  }
};
