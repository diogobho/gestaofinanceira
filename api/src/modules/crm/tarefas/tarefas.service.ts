import { query } from '../../../config/database';

// Datas vindas do frontend como "YYYY-MM-DD" são armazenadas como meia-noite UTC,
// que em UTC-3 vira o dia anterior. Forçar meio-dia UTC evita esse cruzamento.
function normalizarData(data: Date | string): string {
  const str = typeof data === 'string' ? data : (data as Date).toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str + 'T12:00:00';
  return str;
}

export interface Tarefa {
  id: number;
  lead_id: number;
  empresa_id: number;
  responsavel_id: number;
  criado_por_id: number;
  tipo: 'ligacao' | 'reuniao' | 'email' | 'follow_up' | 'proposta' | 'visita' | 'outros';
  titulo: string;
  descricao?: string;
  data_vencimento: Date;
  data_conclusao?: Date;
  status: 'pendente' | 'em_andamento' | 'concluida' | 'cancelada';
  prioridade: 'baixa' | 'normal' | 'alta' | 'urgente';
  created_at: Date;
  updated_at: Date;
  responsavel_nome?: string;
  criado_por_nome?: string;
}

export interface CreateTarefaDto {
  lead_id: number;
  responsavel_id?: number;
  tipo: 'ligacao' | 'reuniao' | 'email' | 'follow_up' | 'proposta' | 'visita' | 'outros';
  titulo: string;
  descricao?: string;
  data_vencimento: Date;
  prioridade?: 'baixa' | 'normal' | 'alta' | 'urgente';
}

export interface UpdateTarefaDto {
  responsavel_id?: number;
  tipo?: 'ligacao' | 'reuniao' | 'email' | 'follow_up' | 'proposta' | 'visita' | 'outros';
  titulo?: string;
  descricao?: string;
  data_vencimento?: Date;
  status?: 'pendente' | 'em_andamento' | 'concluida' | 'cancelada';
  prioridade?: 'baixa' | 'normal' | 'alta' | 'urgente';
}

export const tarefasService = {
  async listByLead(leadId: number, empresaId: number): Promise<Tarefa[]> {
    const result = await query(
      `SELECT
        t.*,
        ur.nome as responsavel_nome,
        uc.nome as criado_por_nome
       FROM tarefas_lead t
       LEFT JOIN usuarios ur ON t.responsavel_id = ur.id
       LEFT JOIN usuarios uc ON t.criado_por_id = uc.id
       WHERE t.lead_id = $1 AND t.empresa_id = $2
       ORDER BY t.data_vencimento ASC`,
      [leadId, empresaId]
    );
    return result.rows;
  },

  async listByEmpresa(empresaId: number, filtros?: {
    responsavel_id?: number;
    status?: string;
    data_inicio?: Date;
    data_fim?: Date;
    funil_tipo?: 'aquisicao' | 'cx';
  }): Promise<Tarefa[]> {
    let sql = `
      SELECT
        t.*,
        ur.nome as responsavel_nome,
        uc.nome as criado_por_nome,
        l.nome as lead_nome,
        fn.tipo as funil_tipo
       FROM tarefas_lead t
       LEFT JOIN usuarios ur ON t.responsavel_id = ur.id
       LEFT JOIN usuarios uc ON t.criado_por_id = uc.id
       LEFT JOIN leads l ON t.lead_id = l.id
       LEFT JOIN funis fn ON fn.id = l.funil_id
       WHERE t.empresa_id = $1
    `;
    const params: any[] = [empresaId];
    let paramCount = 2;

    if (filtros?.responsavel_id) {
      sql += ` AND t.responsavel_id = $${paramCount++}`;
      params.push(filtros.responsavel_id);
    }

    if (filtros?.status) {
      sql += ` AND t.status = $${paramCount++}`;
      params.push(filtros.status);
    }

    if (filtros?.data_inicio) {
      sql += ` AND t.data_vencimento >= $${paramCount++}`;
      params.push(filtros.data_inicio);
    }

    if (filtros?.data_fim) {
      sql += ` AND t.data_vencimento <= $${paramCount++}`;
      params.push(filtros.data_fim);
    }

    if (filtros?.funil_tipo) {
      sql += ` AND fn.tipo = $${paramCount++}`;
      params.push(filtros.funil_tipo);
    }

    sql += ` ORDER BY t.data_vencimento ASC`;

    const result = await query(sql, params);
    return result.rows;
  },

  async getById(id: number, empresaId: number): Promise<Tarefa | null> {
    const result = await query(
      `SELECT
        t.*,
        ur.nome as responsavel_nome,
        uc.nome as criado_por_nome
       FROM tarefas_lead t
       LEFT JOIN usuarios ur ON t.responsavel_id = ur.id
       LEFT JOIN usuarios uc ON t.criado_por_id = uc.id
       WHERE t.id = $1 AND t.empresa_id = $2`,
      [id, empresaId]
    );
    return result.rows[0] || null;
  },

  async create(empresaId: number, usuarioId: number, data: CreateTarefaDto): Promise<Tarefa> {
    const result = await query(
      `INSERT INTO tarefas_lead (
        lead_id, empresa_id, responsavel_id, criado_por_id,
        tipo, titulo, descricao, data_vencimento, prioridade
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        data.lead_id,
        empresaId,
        data.responsavel_id || usuarioId,
        usuarioId,
        data.tipo,
        data.titulo,
        data.descricao || null,
        normalizarData(data.data_vencimento),
        data.prioridade || 'normal'
      ]
    );

    // Registrar atividade
    await query(
      `INSERT INTO atividades_lead (lead_id, usuario_id, empresa_id, tipo, descricao, dados)
       VALUES ($1, $2, $3, 'tarefa', $4, $5)`,
      [
        data.lead_id,
        usuarioId,
        empresaId,
        `Tarefa "${data.titulo}" criada`,
        JSON.stringify({ tarefa_id: result.rows[0].id, tipo: data.tipo })
      ]
    );

    return this.getById(result.rows[0].id, empresaId) as Promise<Tarefa>;
  },

  async update(id: number, empresaId: number, data: UpdateTarefaDto): Promise<Tarefa | null> {
    const tarefa = await this.getById(id, empresaId);
    if (!tarefa) return null;

    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    const fieldMap: Record<string, string> = {
      responsavel_id: 'responsavel_id',
      tipo: 'tipo',
      titulo: 'titulo',
      descricao: 'descricao',
      data_vencimento: 'data_vencimento',
      status: 'status',
      prioridade: 'prioridade'
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if ((data as any)[key] !== undefined) {
        fields.push(`${column} = $${paramCount++}`);
        const val = key === 'data_vencimento'
          ? normalizarData((data as any)[key])
          : (data as any)[key];
        values.push(val);
      }
    }

    // Se status = concluida, setar data_conclusao
    if (data.status === 'concluida') {
      fields.push(`data_conclusao = CURRENT_TIMESTAMP`);
    }

    if (fields.length === 0) return tarefa;

    values.push(id, empresaId);

    await query(
      `UPDATE tarefas_lead SET ${fields.join(', ')}
       WHERE id = $${paramCount++} AND empresa_id = $${paramCount}`,
      values
    );

    return this.getById(id, empresaId);
  },

  async delete(id: number, empresaId: number): Promise<boolean> {
    const tarefa = await this.getById(id, empresaId);
    if (!tarefa) return false;

    await query(
      `DELETE FROM tarefas_lead WHERE id = $1 AND empresa_id = $2`,
      [id, empresaId]
    );
    return true;
  },

  async concluir(id: number, empresaId: number, usuarioId: number): Promise<Tarefa | null> {
    const tarefa = await this.update(id, empresaId, { status: 'concluida' });

    if (tarefa) {
      await query(
        `INSERT INTO atividades_lead (lead_id, usuario_id, empresa_id, tipo, descricao, dados)
         VALUES ($1, $2, $3, 'tarefa', $4, $5)`,
        [
          tarefa.lead_id,
          usuarioId,
          empresaId,
          `Tarefa "${tarefa.titulo}" concluída`,
          JSON.stringify({ tarefa_id: id })
        ]
      );
    }

    return tarefa;
  },

  // Verificar se lead tem tarefa pendente
  async leadTemTarefa(leadId: number, empresaId: number): Promise<boolean> {
    const result = await query(
      `SELECT COUNT(*) as count FROM tarefas_lead
       WHERE lead_id = $1 AND empresa_id = $2 AND status IN ('pendente', 'em_andamento')`,
      [leadId, empresaId]
    );
    return parseInt(result.rows[0].count) > 0;
  },

  // Obter próxima tarefa do lead
  async getProximaTarefa(leadId: number, empresaId: number): Promise<Tarefa | null> {
    const result = await query(
      `SELECT * FROM tarefas_lead
       WHERE lead_id = $1 AND empresa_id = $2 AND status IN ('pendente', 'em_andamento')
       ORDER BY data_vencimento ASC LIMIT 1`,
      [leadId, empresaId]
    );
    return result.rows[0] || null;
  },

  // Obter status visual da tarefa (para indicadores coloridos)
  getStatusVisual(tarefa: Tarefa): 'cinza' | 'verde' | 'amarelo' | 'vermelho' {
    if (tarefa.status === 'concluida' || tarefa.status === 'cancelada') {
      return 'cinza';
    }

    const agora = new Date();
    const vencimento = new Date(tarefa.data_vencimento);
    const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const dataVenc = new Date(vencimento.getFullYear(), vencimento.getMonth(), vencimento.getDate());

    if (dataVenc < hoje) {
      return 'vermelho'; // Atrasada
    } else if (dataVenc.getTime() === hoje.getTime()) {
      return 'verde'; // Hoje
    } else {
      return 'cinza'; // Futura
    }
  }
};
