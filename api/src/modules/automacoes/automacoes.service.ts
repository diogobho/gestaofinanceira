import { query } from '../../config/database';
import { automacoesGrupoService, LIMITE_AUTOMACOES_POR_GRUPO } from './automacoes-grupo.service';

export type TipoAcao =
  | 'envio_mensagem_grupo'
  | 'followup'
  | 'ativar_agente_estagio'
  | 'ativar_agente_lead'
  | 'disparo_lote';

export type ContextoTipo = 'grupo_whatsapp' | 'funil' | 'estagio' | 'lead';

export interface Automacao {
  id: number;
  empresa_id: number;
  usuario_id: number;
  nome: string;
  descricao: string | null;
  tipo_acao: TipoAcao;
  grupo_whatsapp_id: string | null;
  funil_id: number | null;
  estagio_id: number | null;
  lead_id: number | null;
  ativa: boolean;
  config: Record<string, unknown>;
  total_execucoes: number;
  ultima_execucao_at: Date | null;
  automacao_grupo_id: number | null;
  created_at: Date;
  updated_at: Date;
  funil_nome?: string | null;
  funil_tipo?: string | null;
  estagio_nome?: string | null;
  estagio_cor?: string | null;
  lead_nome?: string | null;
  contexto_tipo?: ContextoTipo;
}

export interface ListFilters {
  tipo_acao?: TipoAcao;
  contexto_tipo?: ContextoTipo;
  funil_id?: number;
  funil_tipo?: 'aquisicao' | 'cx';
  estagio_id?: number;
  lead_id?: number;
  grupo_whatsapp_id?: string;
  ativa?: boolean;
}

export interface CreateAutomacaoInput {
  nome: string;
  descricao?: string;
  tipo_acao: TipoAcao;
  grupo_whatsapp_id?: string | null;
  funil_id?: number | null;
  estagio_id?: number | null;
  lead_id?: number | null;
  ativa?: boolean;
  config?: Record<string, unknown>;
}

export interface UpdateAutomacaoInput {
  nome?: string;
  descricao?: string;
  ativa?: boolean;
  config?: Record<string, unknown>;
}

const TIPOS_VALIDOS: TipoAcao[] = [
  'envio_mensagem_grupo',
  'followup',
  'ativar_agente_estagio',
  'ativar_agente_lead',
  'disparo_lote'
];

function validarContextoUnico(input: CreateAutomacaoInput): void {
  const presentes = [
    input.grupo_whatsapp_id ? 1 : 0,
    input.funil_id          ? 1 : 0,
    input.estagio_id        ? 1 : 0,
    input.lead_id           ? 1 : 0
  ].reduce((a, b) => a + b, 0);

  if (presentes !== 1) {
    throw new Error('Defina exatamente um contexto: grupo_whatsapp_id, funil_id, estagio_id ou lead_id');
  }
}

function validarTipo(tipo: TipoAcao): void {
  if (!TIPOS_VALIDOS.includes(tipo)) {
    throw new Error(`tipo_acao inválido. Esperado: ${TIPOS_VALIDOS.join(', ')}`);
  }
}

export const automacoesService = {
  async list(empresaId: number, filtros: ListFilters = {}): Promise<Automacao[]> {
    const conds: string[] = ['empresa_id = $1'];
    const params: unknown[] = [empresaId];
    let idx = 2;

    if (filtros.tipo_acao) {
      conds.push(`tipo_acao = $${idx++}`);
      params.push(filtros.tipo_acao);
    }
    if (filtros.contexto_tipo) {
      conds.push(`contexto_tipo = $${idx++}`);
      params.push(filtros.contexto_tipo);
    }
    if (filtros.funil_id !== undefined) {
      conds.push(`(funil_id = $${idx} OR estagio_id IN (SELECT id FROM estagios_funil WHERE funil_id = $${idx}) OR lead_id IN (SELECT id FROM leads WHERE funil_id = $${idx}))`);
      params.push(filtros.funil_id);
      idx++;
    }
    if (filtros.funil_tipo) {
      conds.push(`funil_tipo = $${idx++}`);
      params.push(filtros.funil_tipo);
    }
    if (filtros.estagio_id !== undefined) {
      conds.push(`estagio_id = $${idx++}`);
      params.push(filtros.estagio_id);
    }
    if (filtros.lead_id !== undefined) {
      conds.push(`lead_id = $${idx++}`);
      params.push(filtros.lead_id);
    }
    if (filtros.grupo_whatsapp_id !== undefined) {
      conds.push(`grupo_whatsapp_id = $${idx++}`);
      params.push(filtros.grupo_whatsapp_id);
    }
    if (filtros.ativa !== undefined) {
      conds.push(`ativa = $${idx++}`);
      params.push(filtros.ativa);
    }

    const result = await query(
      `SELECT * FROM vw_automacoes_dashboard
       WHERE ${conds.join(' AND ')}
       ORDER BY ativa DESC, created_at DESC`,
      params
    );
    return result.rows;
  },

  async getById(id: number, empresaId: number): Promise<Automacao | null> {
    const result = await query(
      `SELECT * FROM vw_automacoes_dashboard WHERE id = $1 AND empresa_id = $2`,
      [id, empresaId]
    );
    return result.rows[0] || null;
  },

  async create(usuarioId: number, empresaId: number, input: CreateAutomacaoInput): Promise<Automacao> {
    validarTipo(input.tipo_acao);
    validarContextoUnico(input);

    // Para envio_mensagem_grupo, sincroniza com tabela legacy automacoes_grupo
    let automacaoGrupoId: number | null = null;
    if (input.tipo_acao === 'envio_mensagem_grupo' && input.grupo_whatsapp_id) {
      const cfg = (input.config || {}) as Record<string, any>;
      if (!cfg.mensagem) {
        throw new Error('config.mensagem é obrigatório para envio_mensagem_grupo');
      }
      const legacy = await automacoesGrupoService.create(usuarioId, empresaId, {
        nome: input.nome,
        grupo_whatsapp_id: input.grupo_whatsapp_id,
        grupo_nome: cfg.grupo_nome,
        mensagem: cfg.mensagem,
        ativa: input.ativa,
        delay_segundos: cfg.delay_segundos,
        enviar_para: cfg.enviar_para
      });
      automacaoGrupoId = legacy.id;
    }

    const result = await query(
      `INSERT INTO automacoes (
        empresa_id, usuario_id, nome, descricao, tipo_acao,
        grupo_whatsapp_id, funil_id, estagio_id, lead_id,
        ativa, config, automacao_grupo_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id`,
      [
        empresaId,
        usuarioId,
        input.nome,
        input.descricao ?? null,
        input.tipo_acao,
        input.grupo_whatsapp_id ?? null,
        input.funil_id ?? null,
        input.estagio_id ?? null,
        input.lead_id ?? null,
        input.ativa !== false,
        JSON.stringify(input.config ?? {}),
        automacaoGrupoId
      ]
    );

    // Aplicar efeito colateral nos toggles (espelhar para tabelas existentes)
    await aplicarEfeitoToggle(input, empresaId);

    const created = await this.getById(result.rows[0].id, empresaId);
    if (!created) throw new Error('Falha ao recuperar automação criada');
    return created;
  },

  async update(id: number, empresaId: number, input: UpdateAutomacaoInput): Promise<Automacao | null> {
    const atual = await this.getById(id, empresaId);
    if (!atual) return null;

    const campos: string[] = [];
    const valores: unknown[] = [];
    let idx = 1;

    if (input.nome !== undefined) {
      campos.push(`nome = $${idx++}`);
      valores.push(input.nome);
    }
    if (input.descricao !== undefined) {
      campos.push(`descricao = $${idx++}`);
      valores.push(input.descricao);
    }
    if (input.ativa !== undefined) {
      campos.push(`ativa = $${idx++}`);
      valores.push(input.ativa);
    }
    if (input.config !== undefined) {
      campos.push(`config = $${idx++}`);
      valores.push(JSON.stringify({ ...(atual.config || {}), ...input.config }));
    }

    if (campos.length === 0) return atual;

    valores.push(id, empresaId);
    await query(
      `UPDATE automacoes SET ${campos.join(', ')}
       WHERE id = $${idx++} AND empresa_id = $${idx}`,
      valores
    );

    // Sync legacy automacoes_grupo
    if (atual.tipo_acao === 'envio_mensagem_grupo' && atual.automacao_grupo_id) {
      const cfg = { ...(atual.config || {}), ...(input.config || {}) } as Record<string, any>;
      await automacoesGrupoService.update(atual.automacao_grupo_id, empresaId, {
        nome: input.nome,
        mensagem: cfg.mensagem,
        ativa: input.ativa,
        delay_segundos: cfg.delay_segundos,
        enviar_para: cfg.enviar_para
      });
    }

    // Sincronizar toggles para os módulos existentes
    if (input.ativa !== undefined) {
      await sincronizarToggle(atual, input.ativa);
    }

    return await this.getById(id, empresaId);
  },

  async delete(id: number, empresaId: number): Promise<boolean> {
    const atual = await this.getById(id, empresaId);
    if (!atual) return false;

    if (atual.tipo_acao === 'envio_mensagem_grupo' && atual.automacao_grupo_id) {
      await automacoesGrupoService.delete(atual.automacao_grupo_id, empresaId);
    }

    // Reverte efeitos: desativa flags se removerem automação de toggle
    if (atual.tipo_acao === 'ativar_agente_estagio' && atual.estagio_id) {
      await query(
        `UPDATE estagios_funil SET agente_ia_ativo = false WHERE id = $1`,
        [atual.estagio_id]
      );
    }
    if (atual.tipo_acao === 'ativar_agente_lead' && atual.lead_id) {
      await query(
        `UPDATE leads SET agente_ia_ativo = NULL WHERE id = $1 AND empresa_id = $2`,
        [atual.lead_id, empresaId]
      );
    }
    if (atual.tipo_acao === 'followup' && atual.estagio_id) {
      await query(
        `UPDATE estagios_funil SET followup_config = NULL WHERE id = $1`,
        [atual.estagio_id]
      );
    }

    const result = await query(
      `DELETE FROM automacoes WHERE id = $1 AND empresa_id = $2`,
      [id, empresaId]
    );
    return (result.rowCount || 0) > 0;
  },

  async toggle(id: number, empresaId: number): Promise<Automacao | null> {
    const atual = await this.getById(id, empresaId);
    if (!atual) return null;
    return await this.update(id, empresaId, { ativa: !atual.ativa });
  },

  async getEstatisticas(empresaId: number) {
    const result = await query(
      `SELECT
         tipo_acao,
         contexto_tipo,
         COUNT(*) FILTER (WHERE ativa = true) AS ativas,
         COUNT(*) FILTER (WHERE ativa = false) AS pausadas,
         COUNT(*) AS total
       FROM vw_automacoes_dashboard
       WHERE empresa_id = $1
       GROUP BY tipo_acao, contexto_tipo`,
      [empresaId]
    );
    return result.rows;
  },

  async listExecucoes(automacaoId: number, empresaId: number, limit = 50) {
    const result = await query(
      `SELECT id, lead_id, alvo_externo, status, erro, dados, executada_at
       FROM automacoes_execucoes
       WHERE automacao_id = $1 AND empresa_id = $2
       ORDER BY executada_at DESC
       LIMIT $3`,
      [automacaoId, empresaId, limit]
    );
    return result.rows;
  },

  async registrarExecucao(input: {
    automacao_id: number;
    empresa_id: number;
    lead_id?: number | null;
    alvo_externo?: string | null;
    status?: 'sucesso' | 'falhou' | 'pendente' | 'cancelado';
    erro?: string | null;
    dados?: Record<string, unknown> | null;
  }): Promise<void> {
    await query(
      `INSERT INTO automacoes_execucoes
         (automacao_id, empresa_id, lead_id, alvo_externo, status, erro, dados)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.automacao_id,
        input.empresa_id,
        input.lead_id ?? null,
        input.alvo_externo ?? null,
        input.status ?? 'sucesso',
        input.erro ?? null,
        input.dados ? JSON.stringify(input.dados) : null
      ]
    );

    if ((input.status ?? 'sucesso') === 'sucesso') {
      await query(
        `UPDATE automacoes
           SET total_execucoes = total_execucoes + 1,
               ultima_execucao_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [input.automacao_id]
      );
    }
  }
};

async function aplicarEfeitoToggle(input: CreateAutomacaoInput, empresaId: number): Promise<void> {
  const ativa = input.ativa !== false;

  if (input.tipo_acao === 'ativar_agente_estagio' && input.estagio_id) {
    await query(
      `UPDATE estagios_funil
       SET agente_ia_ativo = $1,
           instrucoes_agente_ia = COALESCE($2, instrucoes_agente_ia)
       WHERE id = $3`,
      [ativa, (input.config as any)?.instrucoes ?? null, input.estagio_id]
    );
  }
  if (input.tipo_acao === 'ativar_agente_lead' && input.lead_id) {
    await query(
      `UPDATE leads SET agente_ia_ativo = $1 WHERE id = $2 AND empresa_id = $3`,
      [ativa, input.lead_id, empresaId]
    );
  }
  if (input.tipo_acao === 'followup' && input.estagio_id) {
    await query(
      `UPDATE estagios_funil SET followup_config = $1 WHERE id = $2`,
      [JSON.stringify({ ...(input.config || {}), ativo: ativa }), input.estagio_id]
    );
  }
}

async function sincronizarToggle(atual: Automacao, ativa: boolean): Promise<void> {
  if (atual.tipo_acao === 'ativar_agente_estagio' && atual.estagio_id) {
    await query(
      `UPDATE estagios_funil SET agente_ia_ativo = $1 WHERE id = $2`,
      [ativa, atual.estagio_id]
    );
  }
  if (atual.tipo_acao === 'ativar_agente_lead' && atual.lead_id) {
    await query(
      `UPDATE leads SET agente_ia_ativo = $1 WHERE id = $2 AND empresa_id = $3`,
      [ativa, atual.lead_id, atual.empresa_id]
    );
  }
  if (atual.tipo_acao === 'followup' && atual.estagio_id) {
    await query(
      `UPDATE estagios_funil
         SET followup_config = jsonb_set(COALESCE(followup_config, '{}'::jsonb), '{ativo}', to_jsonb($1::boolean))
       WHERE id = $2`,
      [ativa, atual.estagio_id]
    );
  }
}

export { LIMITE_AUTOMACOES_POR_GRUPO };
