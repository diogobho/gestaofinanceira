import { query } from '../../../config/database';

export interface Funil {
  id: number;
  usuario_id: number;
  empresa_id: number;
  nome: string;
  descricao?: string;
  ativo: boolean;
  padrao: boolean;
  tipo: 'aquisicao' | 'cx';
  padrao_cx: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateFunilDto {
  nome: string;
  descricao?: string;
  padrao?: boolean;
  tipo?: 'aquisicao' | 'cx';
  padrao_cx?: boolean;
}

export interface UpdateFunilDto {
  nome?: string;
  descricao?: string;
  ativo?: boolean;
  padrao?: boolean;
  tipo?: 'aquisicao' | 'cx';
  padrao_cx?: boolean;
}

export const funisService = {
  async list(empresaId: number, tipo?: 'aquisicao' | 'cx'): Promise<Funil[]> {
    const params: any[] = [empresaId];
    let tipoFilter = '';
    if (tipo) {
      params.push(tipo);
      tipoFilter = ` AND f.tipo = $${params.length}`;
    }
    const result = await query(
      `SELECT f.*,
        (SELECT COUNT(*) FROM leads l WHERE l.funil_id = f.id AND l.arquivado = false) as total_leads,
        (SELECT COUNT(*) FROM estagios_funil e WHERE e.funil_id = f.id) as total_estagios
       FROM funis f
       WHERE f.empresa_id = $1 AND f.ativo = true${tipoFilter}
       ORDER BY f.padrao DESC, f.padrao_cx DESC, f.nome ASC`,
      params
    );
    return result.rows;
  },

  async getById(id: number, empresaId: number): Promise<Funil | null> {
    const result = await query(
      `SELECT * FROM funis WHERE id = $1 AND empresa_id = $2`,
      [id, empresaId]
    );
    return result.rows[0] || null;
  },

  async getOrCreateDefault(empresaId: number, usuarioId: number): Promise<Funil> {
    // Tentar buscar funil padrão existente
    let result = await query(
      `SELECT * FROM funis WHERE empresa_id = $1 AND padrao = true AND tipo = 'aquisicao'`,
      [empresaId]
    );

    if (result.rows[0]) {
      return result.rows[0];
    }

    // Criar funil padrão usando a função do banco
    const funilResult = await query(
      `SELECT criar_funil_padrao_empresa($1, $2) as funil_id`,
      [empresaId, usuarioId]
    );

    const funilId = funilResult.rows[0].funil_id;

    result = await query(
      `SELECT * FROM funis WHERE id = $1`,
      [funilId]
    );

    return result.rows[0];
  },

  async getOrCreateDefaultCX(empresaId: number, usuarioId: number): Promise<Funil> {
    // Tentar buscar funil CX padrão existente
    let result = await query(
      `SELECT * FROM funis WHERE empresa_id = $1 AND tipo = 'cx' AND padrao_cx = true`,
      [empresaId]
    );

    if (result.rows[0]) {
      return result.rows[0];
    }

    // Verificar se existe qualquer funil CX
    result = await query(
      `SELECT * FROM funis WHERE empresa_id = $1 AND tipo = 'cx' ORDER BY created_at ASC LIMIT 1`,
      [empresaId]
    );

    if (result.rows[0]) {
      return result.rows[0];
    }

    // Criar funil CX padrão com estágios básicos de pós-venda
    const funilResult = await query(
      `INSERT INTO funis (usuario_id, empresa_id, nome, descricao, padrao, tipo, padrao_cx)
       VALUES ($1, $2, 'Funil CX', 'Gestão pós-venda e sucesso do cliente', false, 'cx', true)
       RETURNING *`,
      [usuarioId, empresaId]
    );

    const funil = funilResult.rows[0];

    // Criar estágios padrão do funil CX
    const estagiosCX = [
      { nome: 'Onboarding', cor: '#6366f1', is_entrada: true },
      { nome: 'Ativo',      cor: '#10b981', is_entrada: false },
      { nome: 'Renovação',  cor: '#f59e0b', is_entrada: false },
      { nome: 'Encerrado',  cor: '#6b7280', is_entrada: false },
    ];

    for (let i = 0; i < estagiosCX.length; i++) {
      const e = estagiosCX[i];
      await query(
        `INSERT INTO estagios_funil (funil_id, nome, cor, ordem, is_entrada, is_ganho, is_perdido)
         VALUES ($1, $2, $3, $4, $5, false, false)`,
        [funil.id, e.nome, e.cor, i + 1, e.is_entrada]
      );
    }

    return funil;
  },

  async create(empresaId: number, usuarioId: number, data: CreateFunilDto): Promise<Funil> {
    const tipo = data.tipo || 'aquisicao';

    // Se for padrão de aquisição, remover padrão dos outros do mesmo tipo
    if (data.padrao && tipo === 'aquisicao') {
      await query(
        `UPDATE funis SET padrao = false WHERE empresa_id = $1 AND tipo = 'aquisicao'`,
        [empresaId]
      );
    }

    // Se for padrão CX, remover padrao_cx dos outros
    if (data.padrao_cx) {
      await query(
        `UPDATE funis SET padrao_cx = false WHERE empresa_id = $1 AND tipo = 'cx'`,
        [empresaId]
      );
    }

    const result = await query(
      `INSERT INTO funis (usuario_id, empresa_id, nome, descricao, padrao, tipo, padrao_cx)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [usuarioId, empresaId, data.nome, data.descricao || null, data.padrao || false, tipo, data.padrao_cx || false]
    );

    return result.rows[0];
  },

  async update(id: number, empresaId: number, data: UpdateFunilDto): Promise<Funil | null> {
    const funil = await this.getById(id, empresaId);
    if (!funil) return null;

    // Se for definir como padrão, remover padrão dos outros
    if (data.padrao) {
      await query(
        `UPDATE funis SET padrao = false WHERE empresa_id = $1 AND id != $2`,
        [empresaId, id]
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
    if (data.ativo !== undefined) {
      fields.push(`ativo = $${paramCount++}`);
      values.push(data.ativo);
    }
    if (data.padrao !== undefined) {
      fields.push(`padrao = $${paramCount++}`);
      values.push(data.padrao);
    }

    if (data.tipo !== undefined) {
      fields.push(`tipo = $${paramCount++}`);
      values.push(data.tipo);
    }
    if (data.padrao_cx !== undefined) {
      fields.push(`padrao_cx = $${paramCount++}`);
      values.push(data.padrao_cx);
    }

    if (fields.length === 0) return funil;

    // Se for definir como padrao_cx, remover de outros funis CX
    if (data.padrao_cx) {
      await query(
        `UPDATE funis SET padrao_cx = false WHERE empresa_id = $1 AND tipo = 'cx' AND id != $2`,
        [empresaId, id]
      );
    }

    values.push(id, empresaId);

    const result = await query(
      `UPDATE funis SET ${fields.join(', ')}
       WHERE id = $${paramCount++} AND empresa_id = $${paramCount}
       RETURNING *`,
      values
    );

    return result.rows[0];
  },

  async delete(id: number, empresaId: number): Promise<boolean> {
    const funil = await this.getById(id, empresaId);
    if (!funil) return false;

    // Não permitir deletar funil padrão
    if (funil.padrao) {
      throw new Error('Não é possível deletar o funil padrão');
    }

    // Verificar se há leads
    const leadsResult = await query(
      `SELECT COUNT(*) as count FROM leads WHERE funil_id = $1`,
      [id]
    );

    if (parseInt(leadsResult.rows[0].count) > 0) {
      throw new Error('Não é possível deletar funil com leads. Mova ou delete os leads primeiro.');
    }

    await query(`DELETE FROM funis WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
    return true;
  },

  async getStats(funilId: number, empresaId: number): Promise<any> {
    const result = await query(
      `SELECT
        COUNT(*) as total_leads,
        COUNT(*) FILTER (WHERE l.arquivado = false) as leads_ativos,
        COALESCE(SUM(l.valor_potencial) FILTER (WHERE l.arquivado = false), 0) as valor_total,
        COUNT(*) FILTER (WHERE e.is_ganho = true AND l.arquivado = false) as leads_ganhos,
        COUNT(*) FILTER (WHERE e.is_perdido = true AND l.arquivado = false) as leads_perdidos,
        COALESCE(SUM(l.valor_potencial) FILTER (WHERE e.is_ganho = true), 0) as valor_ganho
       FROM leads l
       JOIN estagios_funil e ON l.estagio_id = e.id
       WHERE l.funil_id = $1 AND l.empresa_id = $2`,
      [funilId, empresaId]
    );

    return result.rows[0];
  }
};
