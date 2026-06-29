import { query } from '../../../config/database';
import { estagiosService } from '../estagios/estagios.service';
import { tarefasService } from '../tarefas/tarefas.service';
import { followupsService } from '../followups/followups.service';
import { funisService } from '../funis/funis.service';
import { receitasService } from '../../receitas/receitas.service';

function normalizePhone(tel: string | undefined | null): string | null {
  if (!tel) return null;
  const digits = tel.replace(/[^0-9]/g, '');
  if (!digits) return null;
  return normalizarTelefoneBR(digits) || digits;
}

// Normaliza números brasileiros para o formato padrão do WhatsApp (13 dígitos: 55+DDD+9 dígitos).
// Números com 12 dígitos (55+DDD+8 dígitos — formato antigo) recebem o 9º dígito após o DDD.
// Números com 10 dígitos (DDD+8 dígitos) também são corrigidos e recebem o prefixo 55.
function normalizarTelefoneBR(digits: string): string {
  if (digits.startsWith('55')) {
    const semPais = digits.slice(2);
    if (semPais.length === 10) return `55${semPais.slice(0, 2)}9${semPais.slice(2)}`;
    if (semPais.length === 11) return digits;
    return digits;
  }
  if (digits.length === 10) return `55${digits.slice(0, 2)}9${digits.slice(2)}`;
  if (digits.length === 11) return `55${digits}`;
  return digits;
}

export interface Lead {
  id: number;
  usuario_id: number;
  empresa_id: number;
  responsavel_id: number;
  funil_id: number;
  estagio_id: number;
  contato_whatsapp_id?: number;
  nome: string;
  telefone?: string;
  email?: string;
  empresa?: string;
  cargo?: string;
  titulo?: string;
  cpf_cnpj?: string;
  valor_potencial: number;
  moeda: string;
  data_entrada: Date;
  data_previsao_fechamento?: Date;
  data_ultimo_contato?: Date;
  temperatura: 'frio' | 'morno' | 'quente';
  probabilidade: number;
  motivo_perda?: string;
  origem: string;
  notas?: string;
  ordem_estagio: number;
  arquivado: boolean;
  cliente_id?: number;
  created_at: Date;
  updated_at: Date;
  // Campos adicionais da view
  responsavel_nome?: string;
  proxima_tarefa?: any;
  total_tarefas_pendentes?: number;
  total_anotacoes?: number;
  total_no_estagio?: number;
}

export interface CreateLeadDto {
  funil_id: number;
  estagio_id?: number;
  contato_whatsapp_id?: number;
  responsavel_id?: number;
  nome: string;
  telefone?: string;
  email?: string;
  empresa?: string;
  cargo?: string;
  titulo?: string;
  cpf_cnpj?: string;
  valor_potencial?: number;
  temperatura?: 'frio' | 'morno' | 'quente';
  probabilidade?: number;
  origem?: string;
  notas?: string;
  bypass_duplicata?: boolean;
  // Tarefa inicial (obrigatória se requireTarefa = true)
  tarefa_inicial?: {
    tipo: 'ligacao' | 'reuniao' | 'email' | 'follow_up' | 'proposta' | 'visita' | 'outros';
    titulo: string;
    descricao?: string;
    data_vencimento: Date;
  };
}

export interface UpdateLeadDto {
  responsavel_id?: number;
  nome?: string;
  telefone?: string;
  email?: string;
  empresa?: string;
  cargo?: string;
  titulo?: string;
  cpf_cnpj?: string;
  valor_potencial?: number;
  temperatura?: 'frio' | 'morno' | 'quente';
  probabilidade?: number;
  data_previsao_fechamento?: Date;
  notas?: string;
  arquivado?: boolean;
  origem?: string;
}

export interface MoveLeadDto {
  novo_estagio_id: number;
  nova_ordem?: number;
  numero_parcelas?: number;
  valor_venda?: number;
  criar_receita?: boolean;
  descricao?: string;
  data?: string;
  taxa_servico_percentual?: number;
  produto?: string;
  tipo_pagamento?: 'a_vista' | 'parcelado';
}

export interface FiltrosLead {
  search?: string;
  estagio_id?: number;
  responsavel_id?: number;
  temperatura?: string;
  origem?: string;
  arquivado?: boolean;
  com_tarefa_atrasada?: boolean;
  com_tarefa_hoje?: boolean;
  sem_tarefa?: boolean;
  aguardando_resposta?: boolean;
  com_mensagens_nao_lidas?: boolean;
  com_telefone?: boolean;
  sem_nome_real?: boolean;
}

export const leadsService = {
  // Verificar se telefone já existe — escopo por funil quando funilId for informado
  // (a regra de duplicidade é por funil: mesmo lead pode existir em funis diferentes,
  //  mas não duplicado dentro do mesmo funil)
  async telefoneExiste(telefone: string, empresaId: number, excludeLeadId?: number, funilId?: number): Promise<{ existe: boolean; lead_id?: number; lead_nome?: string }> {
    if (!telefone) return { existe: false };

    const digits = telefone.replace(/\D/g, '');
    if (!digits) return { existe: false };

    // Build variants: with and without Brazilian DDI prefix (55)
    const variants: string[] = [digits];
    if (digits.startsWith('55') && digits.length >= 12) {
      variants.push(digits.slice(2));
    } else if (digits.length >= 8) {
      variants.push('55' + digits);
    }

    let sql = `
      SELECT id, nome FROM leads
      WHERE empresa_id = $1
      AND REGEXP_REPLACE(telefone, '[^0-9]', '', 'g') = ANY($2::text[])
      AND arquivado = false
    `;
    const params: any[] = [empresaId, variants];

    if (funilId) {
      params.push(funilId);
      sql += ` AND funil_id = $${params.length}`;
    }

    if (excludeLeadId) {
      params.push(excludeLeadId);
      sql += ` AND id != $${params.length}`;
    }

    const result = await query(sql, params);

    if (result.rows[0]) {
      return {
        existe: true,
        lead_id: result.rows[0].id,
        lead_nome: result.rows[0].nome
      };
    }

    return { existe: false };
  },

  // Monta cláusula WHERE compartilhada entre listByFunil e listByEstagio
  _buildWhereClause(
    baseCondition: string,
    params: any[],
    filtros?: FiltrosLead
  ): { whereClause: string; paramCount: number } {
    let whereClause = baseCondition;
    let paramCount = params.length + 1;

    if (filtros?.arquivado !== undefined) {
      whereClause += ` AND l.arquivado = $${paramCount++}`;
      params.push(filtros.arquivado);
    } else {
      whereClause += ` AND l.arquivado = false`;
    }

    if (filtros?.estagio_id) {
      whereClause += ` AND l.estagio_id = $${paramCount++}`;
      params.push(filtros.estagio_id);
    }

    if (filtros?.responsavel_id) {
      whereClause += ` AND l.responsavel_id = $${paramCount++}`;
      params.push(filtros.responsavel_id);
    }

    if (filtros?.temperatura) {
      whereClause += ` AND l.temperatura = $${paramCount++}`;
      params.push(filtros.temperatura);
    }

    if (filtros?.aguardando_resposta !== undefined) {
      whereClause += ` AND l.aguardando_resposta = $${paramCount++}`;
      params.push(filtros.aguardando_resposta);
    }

    if (filtros?.com_mensagens_nao_lidas) {
      whereClause += ` AND l.mensagens_nao_lidas > 0`;
    }

    if (filtros?.com_telefone) {
      whereClause += ` AND l.telefone IS NOT NULL AND l.telefone <> ''`;
    }

    if (filtros?.sem_nome_real) {
      whereClause += ` AND l.nome !~ '[a-zA-ZÀ-ÿ]'`;
    }

    if (filtros?.origem) {
      whereClause += ` AND l.origem = $${paramCount++}`;
      params.push(filtros.origem);
    }

    if (filtros?.search) {
      const raw = filtros.search.trim();
      const searchTerm = `%${raw.toLowerCase()}%`;
      const searchDigits = raw.replace(/\D/g, '');

      let cond = `LOWER(l.nome) LIKE $${paramCount} OR COALESCE(l.telefone, '') LIKE $${paramCount} OR COALESCE(l.cpf_cnpj, '') LIKE $${paramCount} OR LOWER(COALESCE(l.empresa, '')) LIKE $${paramCount}`;
      params.push(searchTerm);
      paramCount++;

      // Busca por telefone: compara apenas dígitos e considera a normalização BR.
      // Ex.: "55 62 9221-4444" (12 dígitos) deve encontrar o lead salvo como "5562992214444"
      // (13 dígitos, com o 9º dígito inserido na normalização).
      if (searchDigits.length >= 4) {
        const telDigits = `REGEXP_REPLACE(COALESCE(l.telefone, ''), '[^0-9]', '', 'g')`;
        cond += ` OR ${telDigits} LIKE '%' || $${paramCount} || '%'`;
        params.push(searchDigits);
        paramCount++;

        const searchNorm = normalizePhone(searchDigits);
        if (searchNorm && searchNorm !== searchDigits) {
          cond += ` OR ${telDigits} LIKE '%' || $${paramCount} || '%'`;
          params.push(searchNorm);
          paramCount++;
        }
      }

      whereClause += ` AND (${cond})`;
    }

    // Filtros de tarefa (em SQL para compatibilidade com paginação)
    if (filtros?.com_tarefa_atrasada) {
      whereClause += ` AND EXISTS (
        SELECT 1 FROM tarefas_lead tf
        WHERE tf.lead_id = l.id AND tf.status IN ('pendente', 'em_andamento')
        AND tf.data_vencimento < NOW()
      )`;
    }

    if (filtros?.com_tarefa_hoje) {
      whereClause += ` AND EXISTS (
        SELECT 1 FROM tarefas_lead tf
        WHERE tf.lead_id = l.id AND tf.status IN ('pendente', 'em_andamento')
        AND tf.data_vencimento >= CURRENT_DATE
        AND tf.data_vencimento < CURRENT_DATE + INTERVAL '1 day'
      )`;
    }

    if (filtros?.sem_tarefa) {
      whereClause += ` AND NOT EXISTS (
        SELECT 1 FROM tarefas_lead tf
        WHERE tf.lead_id = l.id AND tf.status IN ('pendente', 'em_andamento')
      )`;
    }

    return { whereClause, paramCount };
  },

  _selectColumns(): string {
    return `
        l.*,
        e.nome as estagio_nome,
        e.cor as estagio_cor,
        e.ordem as estagio_ordem,
        e.is_entrada,
        e.is_ganho,
        e.is_perdido,
        e.agente_ia_ativo as estagio_agente_ia_ativo,
        cw.foto_url,
        cw.ultima_mensagem,
        cw.ultima_mensagem_at,
        cw.numero as whatsapp_numero,
        ur.nome as responsavel_nome,
        COALESCE(
          (SELECT json_agg(json_build_object('id', t.id, 'nome', t.nome, 'cor', t.cor))
           FROM lead_tags lt
           JOIN tags t ON lt.tag_id = t.id
           WHERE lt.lead_id = l.id), '[]'
        ) as tags,
        (SELECT json_build_object(
            'id', tf.id,
            'titulo', tf.titulo,
            'tipo', tf.tipo,
            'data_vencimento', tf.data_vencimento,
            'status', tf.status
        ) FROM tarefas_lead tf
        WHERE tf.lead_id = l.id AND tf.status IN ('pendente', 'em_andamento')
        ORDER BY tf.data_vencimento ASC LIMIT 1) AS proxima_tarefa,
        (SELECT COUNT(*) FROM tarefas_lead tf
        WHERE tf.lead_id = l.id AND tf.status IN ('pendente', 'em_andamento')) AS total_tarefas_pendentes,
        (SELECT COUNT(*) FROM anotacoes_lead a WHERE a.lead_id = l.id) AS total_anotacoes,
        COALESCE((
          SELECT COUNT(*) FROM disparo_leads dl
          WHERE dl.lead_id = l.id AND dl.empresa_id = l.empresa_id AND dl.status = 'enviado'
        ), 0)::int AS total_disparos,
        (SELECT dl.estagio_nome FROM disparo_leads dl
         WHERE dl.lead_id = l.id AND dl.empresa_id = l.empresa_id
         ORDER BY dl.enviado_at DESC LIMIT 1) AS ultimo_estagio_disparo,
        (SELECT COUNT(*) FROM followups_agendados fa
         WHERE fa.lead_id = l.id AND fa.status = 'pendente')::int AS followup_pendente_count,
        (SELECT fa.agendado_para FROM followups_agendados fa
         WHERE fa.lead_id = l.id AND fa.status = 'pendente'
         ORDER BY fa.agendado_para ASC LIMIT 1) AS proximo_followup_at`;
  },

  async listByFunil(funilId: number, empresaId: number, filtros?: FiltrosLead): Promise<Lead[]> {
    const params: any[] = [funilId, empresaId];
    const { whereClause } = this._buildWhereClause(
      'WHERE l.funil_id = $1 AND l.empresa_id = $2',
      params,
      filtros
    );

    const result = await query(
      `WITH base AS (
        SELECT
          ${this._selectColumns()},
          COUNT(*) OVER (PARTITION BY l.estagio_id) AS total_no_estagio,
          ROW_NUMBER() OVER (PARTITION BY l.estagio_id ORDER BY l.ordem_estagio ASC) AS rn
        FROM leads l
        JOIN estagios_funil e ON l.estagio_id = e.id
        LEFT JOIN contatos_whatsapp cw ON l.contato_whatsapp_id = cw.id
        LEFT JOIN usuarios ur ON l.responsavel_id = ur.id
        ${whereClause}
      )
      SELECT * FROM base WHERE rn <= 100
      ORDER BY estagio_ordem ASC, rn ASC`,
      params
    );

    return result.rows;
  },

  async listByEstagio(
    estagioId: number,
    empresaId: number,
    filtros: FiltrosLead,
    limit: number,
    offset: number
  ): Promise<Lead[]> {
    const params: any[] = [estagioId, empresaId];
    const { whereClause, paramCount } = this._buildWhereClause(
      'WHERE l.estagio_id = $1 AND l.empresa_id = $2',
      params,
      filtros
    );

    params.push(limit, offset);
    const limitParam = paramCount;
    const offsetParam = paramCount + 1;

    const result = await query(
      `SELECT
        ${this._selectColumns()}
      FROM leads l
      JOIN estagios_funil e ON l.estagio_id = e.id
      LEFT JOIN contatos_whatsapp cw ON l.contato_whatsapp_id = cw.id
      LEFT JOIN usuarios ur ON l.responsavel_id = ur.id
      ${whereClause}
      ORDER BY l.ordem_estagio ASC
      LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    );

    return result.rows;
  },

  async getOrigens(empresaId: number, funilId?: number): Promise<string[]> {
    let sql = `SELECT DISTINCT origem FROM leads WHERE empresa_id = $1 AND arquivado = false`;
    const params: any[] = [empresaId];
    if (funilId) {
      sql += ` AND funil_id = $2`;
      params.push(funilId);
    }
    sql += ` ORDER BY origem ASC`;
    const result = await query(sql, params);
    return result.rows.map((r: any) => r.origem).filter(Boolean);
  },

  async getById(id: number, empresaId: number): Promise<Lead | null> {
    const result = await query(
      `SELECT
        l.*,
        e.nome as estagio_nome,
        e.cor as estagio_cor,
        cw.foto_url,
        cw.ultima_mensagem,
        cw.ultima_mensagem_at,
        cw.numero as whatsapp_numero,
        ur.nome as responsavel_nome,
        COALESCE(
          (SELECT json_agg(json_build_object('id', t.id, 'nome', t.nome, 'cor', t.cor))
           FROM lead_tags lt
           JOIN tags t ON lt.tag_id = t.id
           WHERE lt.lead_id = l.id), '[]'
        ) as tags,
        (SELECT json_build_object(
            'id', tf.id,
            'titulo', tf.titulo,
            'tipo', tf.tipo,
            'data_vencimento', tf.data_vencimento,
            'status', tf.status
        ) FROM tarefas_lead tf
        WHERE tf.lead_id = l.id AND tf.status IN ('pendente', 'em_andamento')
        ORDER BY tf.data_vencimento ASC LIMIT 1) AS proxima_tarefa,
        (SELECT COUNT(*) FROM tarefas_lead tf
        WHERE tf.lead_id = l.id AND tf.status IN ('pendente', 'em_andamento')) AS total_tarefas_pendentes,
        (SELECT COUNT(*) FROM anotacoes_lead a WHERE a.lead_id = l.id) AS total_anotacoes
       FROM leads l
       JOIN estagios_funil e ON l.estagio_id = e.id
       LEFT JOIN contatos_whatsapp cw ON l.contato_whatsapp_id = cw.id
       LEFT JOIN usuarios ur ON l.responsavel_id = ur.id
       WHERE l.id = $1 AND l.empresa_id = $2`,
      [id, empresaId]
    );
    return result.rows[0] || null;
  },

  async create(empresaId: number, usuarioId: number, data: CreateLeadDto, requireTarefa = true): Promise<Lead> {
    // Normalize phone number to 55XXXXXXXXXXX format
    if (data.telefone) data.telefone = normalizePhone(data.telefone) ?? undefined;

    // Verificar duplicata de telefone — apenas dentro do mesmo funil
    if (data.telefone && !data.bypass_duplicata) {
      const duplicata = await this.telefoneExiste(data.telefone, empresaId, undefined, data.funil_id);
      if (duplicata.existe) {
        throw new Error(`Já existe um lead com este telefone neste funil: "${duplicata.lead_nome}" (ID: ${duplicata.lead_id})`);
      }
    }

    // Verificar se tem tarefa inicial (obrigatório por padrão)
    if (requireTarefa && !data.tarefa_inicial) {
      throw new Error('É obrigatório agendar uma tarefa ao criar um lead');
    }

    let estagioId: number;

    // Se não passou estágio, usar o de entrada do funil.
    // Fallback: se o funil não tem estágio de entrada marcado, usa o primeiro por ordem.
    if (data.estagio_id) {
      estagioId = data.estagio_id;
    } else {
      const estagioEntrada = await estagiosService.getEntrada(data.funil_id);
      if (estagioEntrada) {
        estagioId = estagioEntrada.id;
      } else {
        const primeiro = await query(
          `SELECT id FROM estagios_funil WHERE funil_id = $1 ORDER BY ordem ASC LIMIT 1`,
          [data.funil_id]
        );
        if (!primeiro.rows[0]) {
          throw new Error('Funil não possui estágios configurados');
        }
        estagioId = primeiro.rows[0].id;
      }
    }

    // Obter próxima ordem no estágio
    const ordemResult = await query(
      `SELECT COALESCE(MAX(ordem_estagio), 0) + 1 as proxima_ordem
       FROM leads WHERE estagio_id = $1`,
      [estagioId]
    );
    const ordem = ordemResult.rows[0].proxima_ordem;

    const result = await query(
      `INSERT INTO leads (
        usuario_id, empresa_id, responsavel_id, funil_id, estagio_id, contato_whatsapp_id,
        nome, telefone, email, empresa, cargo, titulo, cpf_cnpj,
        valor_potencial, temperatura, probabilidade, origem, notas, ordem_estagio
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *`,
      [
        usuarioId,
        empresaId,
        data.responsavel_id || usuarioId,
        data.funil_id,
        estagioId,
        data.contato_whatsapp_id || null,
        data.nome,
        data.telefone || null,
        data.email || null,
        data.empresa || null,
        data.cargo || null,
        data.titulo || null,
        data.cpf_cnpj || null,
        data.valor_potencial || 0,
        data.temperatura || 'morno',
        data.probabilidade || 50,
        data.origem || 'manual',
        data.notas || null,
        ordem
      ]
    );

    const lead = result.rows[0];

    // Registrar atividade de criação
    await this.registrarAtividade(lead.id, usuarioId, empresaId, 'criacao', 'Lead criado', {
      origem: data.origem || 'manual'
    });

    // Criar tarefa inicial se fornecida
    if (data.tarefa_inicial) {
      await tarefasService.create(empresaId, usuarioId, {
        lead_id: lead.id,
        responsavel_id: data.responsavel_id || usuarioId,
        tipo: data.tarefa_inicial.tipo,
        titulo: data.tarefa_inicial.titulo,
        descricao: data.tarefa_inicial.descricao,
        data_vencimento: data.tarefa_inicial.data_vencimento
      });
    }

    // Criar follow-up automático se o estágio tiver config ativa
    await this._criarFollowupEstagio(estagioId, lead.id, usuarioId, empresaId);

    return this.getById(lead.id, empresaId) as Promise<Lead>;
  },

  async _criarFollowupEstagio(estagioId: number, leadId: number, usuarioId: number, empresaId: number) {
    try {
      const estagioResult = await query(
        `SELECT followup_config FROM estagios_funil WHERE id = $1`,
        [estagioId]
      );
      const cfg = estagioResult.rows[0]?.followup_config;
      if (!cfg || !cfg.ativo) return;

      let agendadoPara: string;
      if (cfg.data && cfg.hora_inicio) {
        // Data específica configurada no estágio
        agendadoPara = new Date(`${cfg.data}T${cfg.hora_inicio}:00`).toISOString();
      } else if (cfg.data) {
        agendadoPara = new Date(`${cfg.data}T09:00:00`).toISOString();
      } else {
        // Agente ativa imediatamente ao lead entrar no estágio (janela hora_inicio/hora_fim controla quando dispara)
        agendadoPara = new Date().toISOString();
      }

      await followupsService.criar(
        leadId, usuarioId, empresaId, agendadoPara,
        cfg.tipo || 'agente_ia', cfg.mensagem, cfg.instrucao_ia, 'estagio',
        cfg.hora_inicio, cfg.hora_fim, cfg.dias_semana
      );
    } catch (err: any) {
      console.error(`[Leads] Erro ao criar follow-up de estágio para lead #${leadId}:`, err.message);
    }
  },

  async createFromWhatsApp(empresaId: number, usuarioId: number, contatoId: number, funilId: number): Promise<Lead> {
    // Buscar contato
    const contatoResult = await query(
      `SELECT * FROM contatos_whatsapp WHERE id = $1 AND empresa_id = $2`,
      [contatoId, empresaId]
    );

    if (!contatoResult.rows[0]) {
      throw new Error('Contato não encontrado');
    }

    const contato = contatoResult.rows[0];

    // Verificar se já existe lead para este contato NO MESMO FUNIL (duplicidade é por funil;
    // o mesmo contato pode existir em funis diferentes)
    const numerosVariantes = [contato.numero];
    if (contato.numero.startsWith('55') && contato.numero.length >= 12) {
      numerosVariantes.push(contato.numero.slice(2));
    } else if (contato.numero.length >= 8) {
      numerosVariantes.push('55' + contato.numero);
    }

    const leadExistente = await query(
      `SELECT l.id, l.nome FROM leads l
       LEFT JOIN contatos_whatsapp cw ON l.contato_whatsapp_id = cw.id
       WHERE l.empresa_id = $1
         AND l.funil_id = $4
         AND l.arquivado = false
         AND (
           l.contato_whatsapp_id = $2
           OR cw.numero = ANY($3::text[])
           OR REGEXP_REPLACE(COALESCE(l.telefone, ''), '[^0-9]', '', 'g') = ANY($3::text[])
         )
       LIMIT 1`,
      [empresaId, contatoId, numerosVariantes, funilId]
    );

    if (leadExistente.rows[0]) {
      throw new Error(`Já existe um lead para este contato neste funil: "${leadExistente.rows[0].nome}"`);
    }

    // Criar lead sem exigir tarefa (vem do WhatsApp)
    return this.create(empresaId, usuarioId, {
      funil_id: funilId,
      contato_whatsapp_id: contatoId,
      nome: contato.nome || contato.nome_push || contato.numero,
      telefone: contato.numero,
      origem: 'whatsapp'
    }, false); // requireTarefa = false para leads de WhatsApp
  },

  async update(id: number, empresaId: number, usuarioId: number, data: UpdateLeadDto): Promise<Lead | null> {
    const lead = await this.getById(id, empresaId);
    if (!lead) return null;

    // Normalize phone number to 55XXXXXXXXXXX format
    if (data.telefone) data.telefone = normalizePhone(data.telefone) ?? undefined;

    // Verificar duplicata de telefone se estiver alterando — apenas dentro do mesmo funil
    if (data.telefone && data.telefone !== lead.telefone) {
      const duplicata = await this.telefoneExiste(data.telefone, empresaId, id, lead.funil_id);
      if (duplicata.existe) {
        throw new Error(`Já existe um lead com este telefone neste funil: "${duplicata.lead_nome}" (ID: ${duplicata.lead_id})`);
      }
    }

    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    const fieldMap: Record<string, string> = {
      responsavel_id: 'responsavel_id',
      nome: 'nome',
      telefone: 'telefone',
      email: 'email',
      empresa: 'empresa',
      cargo: 'cargo',
      titulo: 'titulo',
      cpf_cnpj: 'cpf_cnpj',
      valor_potencial: 'valor_potencial',
      temperatura: 'temperatura',
      probabilidade: 'probabilidade',
      data_previsao_fechamento: 'data_previsao_fechamento',
      notas: 'notas',
      arquivado: 'arquivado',
      origem: 'origem'
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if ((data as any)[key] !== undefined) {
        fields.push(`${column} = $${paramCount++}`);
        values.push((data as any)[key]);
      }
    }

    if (fields.length === 0) return lead;

    values.push(id, empresaId);

    await query(
      `UPDATE leads SET ${fields.join(', ')}
       WHERE id = $${paramCount++} AND empresa_id = $${paramCount}`,
      values
    );

    // Registrar atividade
    await this.registrarAtividade(id, usuarioId, empresaId, 'atualizacao', 'Lead atualizado', {
      campos: Object.keys(data)
    });

    return this.getById(id, empresaId);
  },

  async mover(id: number, empresaId: number, usuarioId: number, data: MoveLeadDto): Promise<{ lead: Lead | null; clienteCriado: boolean }> {
    const lead = await this.getById(id, empresaId);
    if (!lead) return { lead: null, clienteCriado: false };

    const estagioAnteriorId = lead.estagio_id;
    const novaOrdem = data.nova_ordem ?? 0;

    // Verificar se o novo estágio existe e pertence ao mesmo funil
    const estagioResult = await query(
      `SELECT * FROM estagios_funil WHERE id = $1 AND funil_id = $2`,
      [data.novo_estagio_id, lead.funil_id]
    );

    if (!estagioResult.rows[0]) {
      throw new Error('Estágio não encontrado');
    }

    const novoEstagio = estagioResult.rows[0];

    // Atualizar lead
    await query(
      `UPDATE leads SET estagio_id = $1, ordem_estagio = $2, data_ultimo_contato = CURRENT_TIMESTAMP
       WHERE id = $3 AND empresa_id = $4`,
      [data.novo_estagio_id, novaOrdem, id, empresaId]
    );

    // Se moveu para estágio de ganho/perdido, registrar data
    if (novoEstagio.is_ganho || novoEstagio.is_perdido) {
      await query(
        `UPDATE leads SET data_ganho_perdido = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
      );
    }

    // Disparo de webhook para a app de Embaixadores quando o lead vira venda (is_ganho)
    if (novoEstagio.is_ganho && lead.origem === 'Embaixadores 5 Milhões') {
      this.dispararWebhookEmbaixadores(id).catch((err) => {
        console.error('[Embaixadores] Erro ao disparar webhook de conversão:', err);
      });
    }

    // Se moveu para estágio de ganho, criar cliente + receita + lead CX automaticamente
    // Funis do tipo 'cx' não executam conversão (evita loop e duplicações)
    const funilResult = await query(`SELECT tipo FROM funis WHERE id = $1`, [lead.funil_id]);
    const funilTipo = funilResult.rows[0]?.tipo;

    let clienteCriado = false;
    if (novoEstagio.is_ganho && funilTipo !== 'cx') {
      const { clienteId, clienteCriado: criado } = await this.criarClienteDeLeadSeNaoExistir(id, lead, empresaId, usuarioId);
      clienteCriado = criado;
      if (clienteId) {
        const deveCreiarReceita = data.criar_receita !== false && (data.valor_venda ?? lead.valor_potencial ?? 0) > 0;
        if (deveCreiarReceita) {
          await this.criarReceitaDeConversao(lead, clienteId, empresaId, usuarioId, {
            numero_parcelas: data.numero_parcelas,
            valor_venda: data.valor_venda,
            descricao: data.descricao,
            data: data.data,
            taxa_servico_percentual: data.taxa_servico_percentual,
            produto: data.produto,
            tipo_pagamento: data.tipo_pagamento
          });
        }
        await this.criarLeadNoCX(lead, empresaId, usuarioId);
      }
    }

    // Cancelar follow-ups automáticos do estágio anterior e criar para o novo
    if (estagioAnteriorId !== data.novo_estagio_id) {
      await followupsService.cancelarEstagiosPorLead(id);
      await this._criarFollowupEstagio(data.novo_estagio_id, id, usuarioId, empresaId);
    }

    // Registrar atividade
    const estagioAnteriorResult = await query(
      `SELECT nome FROM estagios_funil WHERE id = $1`,
      [estagioAnteriorId]
    );

    await this.registrarAtividade(id, usuarioId, empresaId, 'mudanca_estagio',
      `Movido de "${estagioAnteriorResult.rows[0]?.nome}" para "${novoEstagio.nome}"`, {
        estagio_anterior_id: estagioAnteriorId,
        estagio_anterior_nome: estagioAnteriorResult.rows[0]?.nome,
        estagio_novo_id: data.novo_estagio_id,
        estagio_novo_nome: novoEstagio.nome
      }
    );

    return { lead: await this.getById(id, empresaId), clienteCriado };
  },

  async transferirFunil(id: number, empresaId: number, usuarioId: number, novoFunilId: number): Promise<Lead | null> {
    const lead = await this.getById(id, empresaId);
    if (!lead) return null;

    if (lead.funil_id === novoFunilId) {
      throw new Error('Lead já está neste funil');
    }

    // Verificar se o novo funil existe e pertence à empresa
    const funilResult = await query(
      `SELECT id, nome FROM funis WHERE id = $1 AND empresa_id = $2 AND ativo = true`,
      [novoFunilId, empresaId]
    );
    if (!funilResult.rows[0]) throw new Error('Funil não encontrado');
    const novoFunil = funilResult.rows[0];

    // Buscar estágio de entrada do novo funil (is_entrada = true), ou o primeiro
    let estagioResult = await query(
      `SELECT id, nome FROM estagios_funil WHERE funil_id = $1 AND is_entrada = true ORDER BY ordem ASC LIMIT 1`,
      [novoFunilId]
    );
    if (!estagioResult.rows[0]) {
      estagioResult = await query(
        `SELECT id, nome FROM estagios_funil WHERE funil_id = $1 ORDER BY ordem ASC LIMIT 1`,
        [novoFunilId]
      );
    }
    if (!estagioResult.rows[0]) throw new Error('Funil destino não possui estágios');
    const novoEstagio = estagioResult.rows[0];

    // Calcular nova ordem no estágio de destino
    const ordemResult = await query(
      `SELECT COALESCE(MAX(ordem_estagio), 0) + 1 as nova_ordem FROM leads WHERE estagio_id = $1 AND arquivado = false`,
      [novoEstagio.id]
    );
    const novaOrdem = ordemResult.rows[0].nova_ordem;

    // Atualizar lead
    await query(
      `UPDATE leads SET funil_id = $1, estagio_id = $2, ordem_estagio = $3, data_ultimo_contato = CURRENT_TIMESTAMP WHERE id = $4 AND empresa_id = $5`,
      [novoFunilId, novoEstagio.id, novaOrdem, id, empresaId]
    );

    // Registrar atividade
    const funilAnteriorResult = await query(`SELECT nome FROM funis WHERE id = $1`, [lead.funil_id]);
    const estagioAnteriorResult = await query(`SELECT nome FROM estagios_funil WHERE id = $1`, [lead.estagio_id]);

    await this.registrarAtividade(id, usuarioId, empresaId, 'transferencia_funil',
      `Transferido do funil "${funilAnteriorResult.rows[0]?.nome}" para o funil "${novoFunil.nome}" (estágio "${novoEstagio.nome}")`, {
        funil_anterior_id: lead.funil_id,
        funil_anterior_nome: funilAnteriorResult.rows[0]?.nome,
        estagio_anterior_id: lead.estagio_id,
        estagio_anterior_nome: estagioAnteriorResult.rows[0]?.nome,
        funil_novo_id: novoFunilId,
        funil_novo_nome: novoFunil.nome,
        estagio_novo_id: novoEstagio.id,
        estagio_novo_nome: novoEstagio.nome
      }
    );

    return this.getById(id, empresaId);
  },

  async criarClienteDeLeadSeNaoExistir(leadId: number, lead: Lead, empresaId: number, usuarioId: number): Promise<{ clienteId: number; clienteCriado: boolean }> {
    // Verificar se já existe um cliente criado a partir deste lead
    const existing = await query(`SELECT id FROM clientes WHERE lead_id = $1`, [leadId]);
    if (existing.rows.length > 0) {
      return { clienteId: existing.rows[0].id, clienteCriado: false };
    }

    // Limpar e validar CPF/CNPJ se existir no lead
    const cleanCpf = (lead.cpf_cnpj || '').replace(/\D/g, '');
    const cpfValido = cleanCpf.length === 11 || cleanCpf.length === 14;

    // Se tem CPF válido, verificar se já existe cliente com mesmo documento
    if (cpfValido) {
      const byCpf = await query(
        `SELECT id FROM clientes WHERE cpf_cnpj = $1 AND empresa_id = $2`,
        [cleanCpf, empresaId]
      );
      if (byCpf.rows.length > 0) {
        // Vincular o lead ao cliente existente sem criar duplicata
        await query(
          `UPDATE clientes SET lead_id = $1 WHERE cpf_cnpj = $2 AND empresa_id = $3 AND lead_id IS NULL`,
          [leadId, cleanCpf, empresaId]
        );
        return { clienteId: byCpf.rows[0].id, clienteCriado: false };
      }
    }

    const codigo = `CLI-${Date.now()}`;
    const insertResult = await query(
      `INSERT INTO clientes (codigo, nome, email, telefone, cpf_cnpj, empresa_id, usuario_id, lead_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [
        codigo,
        lead.nome,
        lead.email || null,
        lead.telefone || null,
        cpfValido ? cleanCpf : null,
        empresaId,
        usuarioId,
        leadId
      ]
    );
    return { clienteId: insertResult.rows[0].id, clienteCriado: true };
  },

  async criarReceitaDeConversao(
    lead: Lead,
    clienteId: number,
    empresaId: number,
    usuarioId: number,
    opts: {
      numero_parcelas?: number;
      valor_venda?: number;
      descricao?: string;
      data?: string;
      taxa_servico_percentual?: number;
      produto?: string;
      tipo_pagamento?: 'a_vista' | 'parcelado';
    } = {}
  ): Promise<void> {
    // Idempotência: não duplica se já existe receita para esse lead
    const existing = await query(`SELECT id FROM receitas WHERE lead_origem_id = $1`, [lead.id]);
    if (existing.rows.length > 0) return;

    const valorTotal = opts.valor_venda ?? lead.valor_potencial ?? 0;
    const parcelasInformadas = opts.numero_parcelas ?? 1;
    const tipoPagamento = opts.tipo_pagamento
      ?? (parcelasInformadas >= 2 ? 'parcelado' : 'a_vista');
    const parcelas = tipoPagamento === 'parcelado'
      ? Math.max(2, parcelasInformadas)
      : 1;

    const hoje = new Date().toISOString().split('T')[0];
    const dataReceita = opts.data || hoje;

    const descricao = (opts.descricao && opts.descricao.trim())
      || `Conversão CRM - ${lead.nome}`;

    // Produto: respeita o que o usuário escolheu; senão usa nome do funil; senão "Outros"
    const funilResult = await query(`SELECT nome FROM funis WHERE id = $1`, [lead.funil_id]);
    const funilNome = funilResult.rows[0]?.nome;
    const produtoFinal = (opts.produto && opts.produto.trim()) || funilNome || 'Outros';

    // Garante categoria de receita existente (auto-cria se não existir)
    if (produtoFinal && produtoFinal !== 'Outros') {
      await query(
        `INSERT INTO categorias_receitas (nome, usuario_id, ativo, created_at, updated_at)
         SELECT $1::text, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         WHERE NOT EXISTS (
           SELECT 1 FROM categorias_receitas WHERE LOWER(nome) = LOWER($1::text) AND usuario_id = $2
         )`,
        [produtoFinal, usuarioId]
      );
    }

    const taxa = opts.taxa_servico_percentual && opts.taxa_servico_percentual > 0
      ? opts.taxa_servico_percentual
      : null;

    if (tipoPagamento === 'parcelado') {
      await receitasService.createComParcelas({
        descricao,
        valor: valorTotal,
        data: dataReceita,
        fonte: produtoFinal,
        tipo_pagamento: 'parcelado',
        parcelado: true,
        numero_parcelas: parcelas,
        usuario_id: usuarioId,
        cliente_id: clienteId,
        produto: produtoFinal,
        taxa_servico_percentual: taxa,
        lead_origem_id: lead.id,
      });
    } else {
      await receitasService.create({
        descricao,
        valor: valorTotal,
        data: dataReceita,
        fonte: produtoFinal,
        tipo_pagamento: 'a_vista',
        parcelado: false,
        numero_parcelas: null,
        status: 'pendente',
        usuario_id: usuarioId,
        cliente_id: clienteId,
        produto: produtoFinal,
        taxa_servico_percentual: taxa,
        lead_origem_id: lead.id,
      });
    }
  },

  async criarLeadNoCX(lead: Lead, empresaId: number, usuarioId: number): Promise<void> {
    // Verificar se já existe lead CX gerado por este lead de aquisição (via notas)
    const existing = await query(
      `SELECT l.id FROM leads l
       JOIN funis f ON l.funil_id = f.id
       WHERE l.empresa_id = $1 AND f.tipo = 'cx' AND l.notas LIKE $2`,
      [empresaId, `%[origem_lead_id:${lead.id}]%`]
    );
    if (existing.rows.length > 0) return;

    // Verificar também pelo cliente_id vinculado ao lead (evita duplicata quando cliente
    // já entrou no CX pela rota direta — criarLeadCXParaCliente)
    const clienteVinculado = await query(
      `SELECT id FROM clientes WHERE lead_id = $1 LIMIT 1`,
      [lead.id]
    );
    if (clienteVinculado.rows[0]) {
      const existingByCliente = await query(
        `SELECT l.id FROM leads l
         JOIN funis f ON l.funil_id = f.id
         WHERE l.cliente_id = $1 AND f.tipo = 'cx' AND l.empresa_id = $2`,
        [clienteVinculado.rows[0].id, empresaId]
      );
      if (existingByCliente.rows.length > 0) {
        // Atualizar a nota do CX lead existente para incluir referência de origem
        await query(
          `UPDATE leads SET notas = CONCAT('[origem_lead_id:${lead.id}] ', COALESCE(notas, ''))
           WHERE id = $1`,
          [existingByCliente.rows[0].id]
        );
        return;
      }
    }

    // Buscar ou criar funil CX padrão
    const funilCX = await funisService.getOrCreateDefaultCX(empresaId, usuarioId);

    // Buscar estágio de entrada do funil CX
    let estagioResult = await query(
      `SELECT id FROM estagios_funil WHERE funil_id = $1 AND is_entrada = true ORDER BY ordem ASC LIMIT 1`,
      [funilCX.id]
    );
    if (!estagioResult.rows[0]) {
      estagioResult = await query(
        `SELECT id FROM estagios_funil WHERE funil_id = $1 ORDER BY ordem ASC LIMIT 1`,
        [funilCX.id]
      );
    }
    if (!estagioResult.rows[0]) return;

    const estagioId = estagioResult.rows[0].id;

    // Calcular ordem no estágio de entrada
    const ordemResult = await query(
      `SELECT COALESCE(MAX(ordem_estagio), 0) + 1 as nova_ordem FROM leads WHERE estagio_id = $1 AND arquivado = false`,
      [estagioId]
    );
    const novaOrdem = ordemResult.rows[0].nova_ordem;

    // Buscar cliente vinculado a este lead (se houver)
    const clienteResult = await query(`SELECT id FROM clientes WHERE lead_id = $1 LIMIT 1`, [lead.id]);
    const clienteId = clienteResult.rows[0]?.id ?? null;

    // Criar lead no funil CX com referência ao lead de origem
    await query(
      `INSERT INTO leads (usuario_id, empresa_id, responsavel_id, funil_id, estagio_id, nome, telefone, email, empresa, cargo,
        valor_potencial, moeda, temperatura, probabilidade, origem, notas, ordem_estagio, arquivado, cliente_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, false, $18, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        usuarioId, empresaId, lead.responsavel_id ?? usuarioId, funilCX.id, estagioId,
        lead.nome, lead.telefone || null, lead.email || null, lead.empresa || null, lead.cargo || null,
        lead.valor_potencial ?? 0, lead.moeda ?? 'BRL', 'quente', 100, 'CRM',
        `[origem_lead_id:${lead.id}] ${lead.notas || ''}`.trim(),
        novaOrdem, clienteId
      ]
    );
  },

  async criarLeadCXParaCliente(clienteId: number, cliente: any, empresaId: number, usuarioId: number): Promise<void> {
    // Idempotente: verificar se já existe lead CX para este cliente
    const existing = await query(
      `SELECT l.id FROM leads l
       JOIN funis f ON l.funil_id = f.id
       WHERE l.cliente_id = $1 AND f.tipo = 'cx' AND l.empresa_id = $2`,
      [clienteId, empresaId]
    );
    if (existing.rows.length > 0) return;

    // Buscar ou criar funil CX padrão
    const funilCX = await funisService.getOrCreateDefaultCX(empresaId, usuarioId);

    // Buscar estágio "Ativo" (ou primeiro estágio disponível)
    let estagioResult = await query(
      `SELECT id FROM estagios_funil WHERE funil_id = $1 AND nome = 'Ativo' LIMIT 1`,
      [funilCX.id]
    );
    if (!estagioResult.rows[0]) {
      estagioResult = await query(
        `SELECT id FROM estagios_funil WHERE funil_id = $1 ORDER BY ordem ASC LIMIT 1`,
        [funilCX.id]
      );
    }
    if (!estagioResult.rows[0]) return;

    const estagioId = estagioResult.rows[0].id;
    const ordemResult = await query(
      `SELECT COALESCE(MAX(ordem_estagio), 0) + 1 as nova_ordem FROM leads WHERE estagio_id = $1 AND arquivado = false`,
      [estagioId]
    );
    const novaOrdem = ordemResult.rows[0].nova_ordem;

    await query(
      `INSERT INTO leads (usuario_id, empresa_id, responsavel_id, funil_id, estagio_id, nome, telefone, email,
        valor_potencial, moeda, temperatura, probabilidade, origem, notas, ordem_estagio, arquivado, cliente_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, false, $16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        usuarioId, empresaId, usuarioId, funilCX.id, estagioId,
        cliente.nome, cliente.telefone || null, cliente.email || null,
        cliente.valor_mensalidade ?? 0, 'BRL', 'morno', 70, 'cliente_direto',
        `[cliente_id:${clienteId}]`,
        novaOrdem, clienteId
      ]
    );
  },

  async delete(id: number, empresaId: number): Promise<boolean> {
    const lead = await this.getById(id, empresaId);
    if (!lead) return false;

    await query(`DELETE FROM leads WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
    return true;
  },

  async arquivar(id: number, empresaId: number, usuarioId: number): Promise<Lead | null> {
    const lead = await this.getById(id, empresaId);
    if (!lead) return null;

    await query(
      `UPDATE leads SET arquivado = true WHERE id = $1 AND empresa_id = $2`,
      [id, empresaId]
    );

    await this.registrarAtividade(id, usuarioId, empresaId, 'arquivado', 'Lead arquivado', {});

    return this.getById(id, empresaId);
  },

  async reativar(id: number, empresaId: number, usuarioId: number): Promise<Lead | null> {
    const lead = await this.getById(id, empresaId);
    if (!lead) return null;

    await query(
      `UPDATE leads SET arquivado = false WHERE id = $1 AND empresa_id = $2`,
      [id, empresaId]
    );

    await this.registrarAtividade(id, usuarioId, empresaId, 'reativado', 'Lead reativado', {});

    return this.getById(id, empresaId);
  },

  async registrarAtividade(leadId: number, usuarioId: number, empresaId: number, tipo: string, descricao: string, dados: any): Promise<void> {
    await query(
      `INSERT INTO atividades_lead (lead_id, usuario_id, empresa_id, tipo, descricao, dados)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [leadId, usuarioId, empresaId, tipo, descricao, JSON.stringify(dados)]
    );
  },

  // Notifica a app de Embaixadores quando lead com origem da campanha vira venda
  async dispararWebhookEmbaixadores(leadId: number): Promise<void> {
    const url = process.env.EMBAIXADORES_WEBHOOK_URL;
    const secret = process.env.EMBAIXADORES_WEBHOOK_SECRET;
    if (!url || !secret) return;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': secret,
      },
      body: JSON.stringify({ lead_id: leadId, evento: 'conversao' }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Webhook falhou: HTTP ${res.status} ${body}`);
    }
  },

  // Transfere a propriedade do lead para quem executou o disparo, se for diferente do dono atual
  async transferirPropriedadeSeDiferente(
    leadId: number,
    executorId: number,
    empresaId: number,
    origem: 'disparo_whatsapp' | 'disparo_email' | 'mensagem_individual' | 'email_individual'
  ): Promise<boolean> {
    const atual = await query(
      `SELECT usuario_id, responsavel_id FROM leads WHERE id = $1 AND empresa_id = $2`,
      [leadId, empresaId]
    );
    const lead = atual.rows[0];
    if (!lead) return false;

    const mesmoDono = lead.usuario_id === executorId && lead.responsavel_id === executorId;
    if (mesmoDono) return false;

    await query(
      `UPDATE leads SET usuario_id = $1, responsavel_id = $1, updated_at = NOW() WHERE id = $2`,
      [executorId, leadId]
    );

    const executorInfo = await query(`SELECT nome FROM usuarios WHERE id = $1`, [executorId]);
    const anteriorInfo = await query(`SELECT nome FROM usuarios WHERE id = $1`, [lead.usuario_id]);
    const executorNome = executorInfo.rows[0]?.nome || `#${executorId}`;
    const anteriorNome = anteriorInfo.rows[0]?.nome || `#${lead.usuario_id}`;

    await this.registrarAtividade(
      leadId,
      executorId,
      empresaId,
      'transferencia_automatica',
      `Lead transferido automaticamente de ${anteriorNome} para ${executorNome} após ${origem.replace('_', ' ')}`,
      {
        automatico: true,
        trigger: origem,
        usuario_anterior_id: lead.usuario_id,
        usuario_anterior_nome: anteriorNome,
        novo_usuario_id: executorId,
        novo_usuario_nome: executorNome
      }
    );

    console.log(`[Lead #${leadId}] Transferido de ${anteriorNome} (${lead.usuario_id}) para ${executorNome} (${executorId}) via ${origem}`);
    return true;
  },

  async getAtividades(leadId: number, empresaId: number, limit = 50): Promise<any[]> {
    const result = await query(
      `SELECT a.*, u.nome as usuario_nome
       FROM atividades_lead a
       JOIN usuarios u ON a.usuario_id = u.id
       WHERE a.lead_id = $1 AND a.empresa_id = $2
       ORDER BY a.created_at DESC
       LIMIT $3`,
      [leadId, empresaId, limit]
    );
    return result.rows;
  },

  // Tags
  async addTag(leadId: number, tagId: number, empresaId: number, usuarioId: number): Promise<void> {
    const lead = await this.getById(leadId, empresaId);
    if (!lead) throw new Error('Lead não encontrado');

    await query(
      `INSERT INTO lead_tags (lead_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [leadId, tagId]
    );

    const tagResult = await query(`SELECT nome FROM tags WHERE id = $1`, [tagId]);
    await this.registrarAtividade(leadId, usuarioId, empresaId, 'tag_adicionada',
      `Tag "${tagResult.rows[0]?.nome}" adicionada`, { tag_id: tagId });
  },

  async removeTag(leadId: number, tagId: number, empresaId: number, usuarioId: number): Promise<void> {
    const lead = await this.getById(leadId, empresaId);
    if (!lead) throw new Error('Lead não encontrado');

    await query(
      `DELETE FROM lead_tags WHERE lead_id = $1 AND tag_id = $2`,
      [leadId, tagId]
    );

    const tagResult = await query(`SELECT nome FROM tags WHERE id = $1`, [tagId]);
    await this.registrarAtividade(leadId, usuarioId, empresaId, 'tag_removida',
      `Tag "${tagResult.rows[0]?.nome}" removida`, { tag_id: tagId });
  },

  // Obter status visual da tarefa do lead
  getStatusTarefa(lead: Lead): 'cinza' | 'verde' | 'amarelo' | 'vermelho' {
    if (!lead.proxima_tarefa) {
      return 'amarelo'; // Sem atividade
    }

    const agora = new Date();
    const vencimento = new Date(lead.proxima_tarefa.data_vencimento);
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
