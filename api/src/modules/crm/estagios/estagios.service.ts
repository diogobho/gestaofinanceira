import { query } from '../../../config/database';
import { extrairPassosFollowup, calcularCadencia, nomearDias } from '../_shared/agendamento';
import { getJanelaEmpresa, conflitosDoConfig } from '../_shared/janela';

/** Um toque da cadência (mensagem agendada) dentro de um estágio. */
export interface PassoFollowupConfig {
  base?: 'entrada' | 'anterior'; // 'entrada' = da entrada no estágio | 'anterior' = do passo anterior
  tipo: 'manual' | 'agente_ia';
  mensagem?: string;
  instrucao_ia?: string;
  // Mídia opcional (só tipo 'manual'): a mensagem vira a legenda do anexo.
  media_url?: string | null;
  media_mimetype?: string | null;
  media_filename?: string | null;
  // Padrão único de agendamento
  modo?: 'dias' | 'data';        // 'dias' = após X unidade da base | 'data' = data fixa
  atraso_dias?: number | null;   // quantidade (X) do atraso
  atraso_unidade?: 'minuto' | 'hora' | 'dia'; // unidade do atraso (default 'dia')
  data_fixa?: string | null;     // 'YYYY-MM-DD'
  hora_envio?: string | null;    // 'HH:MM'
  dias_semana?: number[] | null; // 0=Dom..6=Sáb
  // Número oficial (Cloud API): modelo aprovado que sai NO LUGAR deste passo quando a
  // janela de 24h do lead está fechada — ver jobs/followup/despacho.ts.
  modelo_whatsapp?: { nome: string; idioma?: string; variaveis: string[]; cabecalho?: string | null } | null;
}

export interface EstagioFollowupConfig {
  ativo: boolean;
  // Cadência de vários toques. Config antiga (campos no topo) continua sendo lida
  // como um passo único pelo backend (extrairPassosFollowup).
  passos?: PassoFollowupConfig[];
  // --- Campos legados (shape antigo de passo único) ---
  tipo?: 'manual' | 'agente_ia';
  mensagem?: string;
  instrucao_ia?: string;
  media_url?: string | null;
  media_mimetype?: string | null;
  media_filename?: string | null;
  modo?: 'dias' | 'data';
  atraso_dias?: number | null;
  atraso_unidade?: 'minuto' | 'hora' | 'dia';
  data_fixa?: string | null;
  hora_envio?: string | null;
  dias_semana?: number[] | null;
}

export interface MarcoReuniaoLembrete {
  marco: string;               // id estável: lembrete_24h, lembrete_1h, noshow_d0…
  grupo?: string;              // 'lembrete' | 'noshow'
  offset_min: number;          // <0 antes da reunião, >=0 depois (no-show)
  tolerancia_min?: number;
  mensagem: string;
}

export interface EstagioReuniaoLembretes {
  ativo: boolean;
  marcos: MarcoReuniaoLembrete[];
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
  auto_criar_lead?: boolean;
  auto_criar_lead_usuarios?: number[] | null;
  agente_ia_ativo?: boolean;
  instrucoes_agente_ia?: string | null;
  reuniao_lembretes?: EstagioReuniaoLembretes | null;
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
  auto_criar_lead?: boolean;
  auto_criar_lead_usuarios?: number[] | null;
  agente_ia_ativo?: boolean;
  instrucoes_agente_ia?: string | null;
  reuniao_lembretes?: EstagioReuniaoLembretes | null;
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
      // Conflito de dias é recusado AQUI, no momento em que o usuário salva a cadência.
      // Um passo restrito a um dia que a janela da empresa não permite nunca poderia
      // ser enviado; antes o sistema trocava silenciosamente pelos dias da janela e
      // mandava a mensagem num dia que ninguém autorizou.
      if (data.followup_config && (data.followup_config as any).ativo) {
        const janela = await getJanelaEmpresa(empresaId);
        const conflitos = conflitosDoConfig(data.followup_config, janela);
        if (conflitos.length > 0) {
          const lista = conflitos.map((c) => `passo ${c.passo} (${c.dias_passo})`).join('; ');
          const err: any = new Error(
            `Conflito de configuração: ${lista} não tem nenhum dia em comum com a janela de ` +
            `envio da empresa (${nomearDias(janela.dias)}). Ajuste os dias do passo ou a ` +
            `janela de envio em Agendamentos → Horário de envio.`
          );
          err.status = 400;
          err.codigo = 'conflito_janela';
          err.conflitos = conflitos;
          throw err;
        }
      }
      fields.push(`followup_config = $${paramCount++}`);
      values.push(data.followup_config ? JSON.stringify(data.followup_config) : null);
    }
    if (data.auto_criar_lead !== undefined) {
      fields.push(`auto_criar_lead = $${paramCount++}`);
      values.push(!!data.auto_criar_lead);
    }
    if (data.auto_criar_lead_usuarios !== undefined) {
      fields.push(`auto_criar_lead_usuarios = $${paramCount++}`);
      // Array vazio → NULL (= todos os números da empresa)
      const arr = data.auto_criar_lead_usuarios;
      values.push(arr && arr.length ? arr : null);
    }
    if (data.agente_ia_ativo !== undefined) {
      fields.push(`agente_ia_ativo = $${paramCount++}`);
      values.push(!!data.agente_ia_ativo);
    }
    if (data.instrucoes_agente_ia !== undefined) {
      // Texto vazio → NULL: o prompt trata ausência de instrução como "sem orientação".
      fields.push(`instrucoes_agente_ia = $${paramCount++}`);
      const txt = String(data.instrucoes_agente_ia ?? '').trim();
      values.push(txt || null);
    }
    if (data.reuniao_lembretes !== undefined) {
      fields.push(`reuniao_lembretes = $${paramCount++}`);
      values.push(data.reuniao_lembretes ? JSON.stringify(data.reuniao_lembretes) : null);
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

  // Criar a cadência retroativa para leads já no estágio sem follow-up de estágio pendente.
  // Os instantes são calculados uma vez (base = agora) e aplicados a todos os leads elegíveis.
  if (ativa) {
    const passos = extrairPassosFollowup(followupConfig);
    if (passos.length === 0) return;

    // Leads elegíveis capturados ANTES de inserir, para que todos os passos apliquem
    // ao mesmo conjunto (o guard NOT EXISTS deixaria de valer após o 1º insert).
    // O 2º NOT EXISTS evita re-disparar para quem já recebeu a cadência deste estágio:
    // exclui leads com follow-up de estágio ENVIADO desde que entraram no estágio atual
    // (última mudança de estágio/funil registrada; fallback = criação do lead).
    const elegiveis = await query(
      `SELECT l.id, l.usuario_id
       FROM leads l
       WHERE l.estagio_id = $1
         AND l.empresa_id = $2
         AND l.arquivado = false
         AND NOT EXISTS (
           SELECT 1 FROM followups_agendados fa
           WHERE fa.lead_id = l.id AND fa.origem = 'estagio' AND fa.status = 'pendente'
         )
         AND NOT EXISTS (
           SELECT 1 FROM followups_agendados fa2
           WHERE fa2.lead_id = l.id AND fa2.origem = 'estagio' AND fa2.status = 'enviado'
             AND COALESCE(fa2.enviado_at, fa2.updated_at) >= COALESCE(
               (SELECT MAX(a.created_at) FROM atividades_lead a
                WHERE a.lead_id = l.id
                  AND a.tipo IN ('mudanca_estagio', 'transferencia_funil', 'transferencia_automatica')),
               l.created_at
             )
         )`,
      [estagioId, empresaId]
    );
    if (elegiveis.rows.length === 0) return;
    const leadIds = elegiveis.rows.map((r: any) => r.id);

    const cadencia = calcularCadencia(
      passos.map((p: any) => ({
        modo: p.modo || 'dias',
        atrasoDias: p.atraso_dias,
        atrasoUnidade: p.atraso_unidade,
        dataFixa: p.data_fixa,
        horaEnvio: p.hora_envio,
        diasSemana: p.dias_semana,
        base: p.base,
      }))
    );

    for (let i = 0; i < passos.length; i++) {
      const p = passos[i];
      const ehManual = (p.tipo || 'agente_ia') === 'manual';
      await query(
        `INSERT INTO followups_agendados
           (lead_id, usuario_id, empresa_id, agendado_para, tipo, mensagem, instrucao_ia,
            media_url, media_mimetype, media_filename,
            origem, modo, atraso_dias, atraso_unidade, data_fixa, hora_envio, dias_semana,
            passo_ordem, mover_apos_envio)
         SELECT l.id, l.usuario_id, $1, $2, $3, $4, $5, $6, $7, $8, 'estagio', $9, $10, $11, $12, $13, $14, $15, $16
         FROM leads l
         WHERE l.id = ANY($17::int[])`,
        [
          empresaId,
          cadencia[i].agendadoPara,
          p.tipo || 'agente_ia',
          ehManual ? (p.mensagem || null) : null,
          !ehManual ? (p.instrucao_ia || null) : null,
          ehManual ? (p.media_url || null) : null,
          ehManual ? (p.media_mimetype || null) : null,
          ehManual ? (p.media_filename || null) : null,
          p.modo || 'dias',
          p.atraso_dias ?? null,
          p.atraso_unidade || 'dia',
          p.data_fixa || null,
          p.hora_envio || null,
          p.dias_semana?.length ? p.dias_semana : null,
          i,
          i === passos.length - 1,
          leadIds,
        ]
      );
    }
  } else {
    // Pausado (ativo:false, mas com passos preservados): cancela os follow-ups de
    // estágio ainda pendentes deste estágio, para nada disparar enquanto pausado.
    // Ao reativar, a cadência é recriada retroativamente (bloco acima).
    await query(
      `UPDATE followups_agendados SET status = 'cancelado', updated_at = NOW()
       WHERE origem = 'estagio' AND status = 'pendente'
         AND lead_id IN (SELECT id FROM leads WHERE estagio_id = $1 AND empresa_id = $2)`,
      [estagioId, empresaId]
    );
  }
}
