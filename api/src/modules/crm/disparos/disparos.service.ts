import axios from 'axios';
import { query } from '../../../config/database';
import { leadsService } from '../leads/leads.service';

// Normaliza números brasileiros para o formato padrão do WhatsApp (13 dígitos: 55+DDD+9 dígitos).
// Números com 12 dígitos (55+DDD+8 dígitos — formato antigo) recebem o 9º dígito após o DDD.
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

export interface DisparoLead {
  id: number;
  nome: string;
  telefone?: string;
  empresa?: string;
  origem?: string;
  contato_whatsapp_id?: number;
  whatsapp_id?: string; // @c.us ou @lid
  estagio_id?: number;
  estagio_nome?: string;
}

export interface IniciarDisparoDto {
  lead_ids?: number[];
  todos?: boolean;      // dispara para todos os leads com telefone no funil
  template: string;
  funil_id?: number;
  estagio_pos_disparo_id?: number; // após envio, mover lead para este estágio
  agendado_para?: string; // ISO datetime — se no futuro, agenda em vez de disparar agora
  // Filtros adicionais aplicados ao modo 'todos'
  estagio_id?: number;
  responsavel_id?: number;
  temperatura?: string;
  origem?: string;
}

function aplicarVariaveis(template: string, lead: DisparoLead): string {
  const primeiroNome = lead.nome?.split(' ')[0] || lead.nome;
  return template
    .replace(/\[Nome\]/gi, lead.nome || '')
    .replace(/\[PrimeiroNome\]/gi, primeiroNome || '')
    .replace(/\[Empresa\]/gi, lead.empresa || '')
    .replace(/\[Origem\]/gi, lead.origem || '')
    .replace(/\[Telefone\]/gi, lead.telefone || '');
}

// Anti-ban: intervalo aleatório 45–90s entre mensagens (diferente por lead)
const DELAY_MIN_MS = 45_000;
const DELAY_MAX_MS = 90_000;

// Limite diário de mensagens por conta WhatsApp (por usuário)
const LIMITE_DIARIO = 100;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sleepRandom(minMs: number, maxMs: number) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return sleep(ms);
}

async function _buscarLeadsPorConfig(
  empresaId: number,
  config: {
    todos?: boolean; funil_id?: number; lead_ids?: number[];
    estagio_id?: number; responsavel_id?: number; temperatura?: string; origem?: string;
  }
): Promise<DisparoLead[]> {
  if (config.todos && config.funil_id) {
    const params: any[] = [empresaId, config.funil_id];
    let extraWhere = '';

    if (config.estagio_id) {
      params.push(config.estagio_id);
      extraWhere += ` AND l.estagio_id = $${params.length}`;
    }
    if (config.responsavel_id) {
      params.push(config.responsavel_id);
      extraWhere += ` AND l.responsavel_id = $${params.length}`;
    }
    if (config.temperatura) {
      params.push(config.temperatura);
      extraWhere += ` AND l.temperatura = $${params.length}`;
    }
    if (config.origem) {
      params.push(config.origem);
      extraWhere += ` AND l.origem = $${params.length}`;
    }

    const r = await query(
      `SELECT
        l.id, l.nome, l.telefone, l.empresa, l.origem, l.contato_whatsapp_id,
        l.estagio_id, ef.nome AS estagio_nome,
        cw.whatsapp_id
       FROM leads l
       LEFT JOIN contatos_whatsapp cw ON l.contato_whatsapp_id = cw.id
       LEFT JOIN estagios_funil ef ON l.estagio_id = ef.id
       WHERE l.empresa_id = $1
         AND l.funil_id = $2
         AND l.arquivado = false
         AND (l.telefone IS NOT NULL AND l.telefone != '' OR cw.whatsapp_id IS NOT NULL)
         ${extraWhere}
       ORDER BY l.nome`,
      params
    );
    return r.rows;
  } else if (config.lead_ids?.length) {
    const r = await query(
      `SELECT
        l.id, l.nome, l.telefone, l.empresa, l.origem, l.contato_whatsapp_id,
        l.estagio_id, ef.nome AS estagio_nome,
        cw.whatsapp_id
       FROM leads l
       LEFT JOIN contatos_whatsapp cw ON l.contato_whatsapp_id = cw.id
       LEFT JOIN estagios_funil ef ON l.estagio_id = ef.id
       WHERE l.id = ANY($1::int[])
         AND l.empresa_id = $2
         AND l.arquivado = false
         AND (l.telefone IS NOT NULL AND l.telefone != '' OR cw.whatsapp_id IS NOT NULL)`,
      [config.lead_ids, empresaId]
    );
    return r.rows;
  }
  return [];
}

async function _processarEnviosWA(
  disparoId: number,
  empresaId: number,
  usuarioId: number,
  leads: DisparoLead[],
  grupos: DisparoLead[],
  porta: string | undefined,
  template: string,
  estagioPosDeparoId: number | undefined
): Promise<void> {
  let enviados = 0;
  let falhas = 0;
  const erros: Array<{ lead_id: number; nome: string; telefone: string; erro: string }> = [];

  for (let i = 0; i < leads.length; i++) {
    const statusCheck = await query(
      `SELECT status FROM disparos_crm WHERE id = $1`, [disparoId]
    );
    if (statusCheck.rows[0]?.status === 'cancelado') {
      console.log(`[Disparo] #${disparoId} cancelado após ${enviados} envios.`);
      break;
    }

    const lead = leads[i];
    try {
      if (!porta) throw new Error('WhatsApp não configurado para este usuário');

      const mensagem = aplicarVariaveis(template, lead);
      let destino = lead.whatsapp_id || lead.telefone!;
      if (!destino.includes('@')) {
        destino = normalizarTelefoneBR(destino.replace(/\D/g, ''));
      }

      const response = await axios.post(
        `http://localhost:${porta}/send`,
        { number: destino, message: mensagem },
        { timeout: 30000 }
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Erro na API WhatsApp');
      }

      if (lead.contato_whatsapp_id) {
        await query(
          `INSERT INTO historico_mensagens
            (lead_id, contato_whatsapp_id, usuario_id, empresa_id,
             whatsapp_message_id, direcao, tipo, conteudo, enviado_at)
           VALUES ($1, $2, $3, $4, $5, 'saida', 'texto', $6, NOW())`,
          [
            lead.id,
            lead.contato_whatsapp_id,
            usuarioId,
            empresaId,
            response.data.messageId || null,
            aplicarVariaveis(template, lead),
          ]
        );

        await query(
          `UPDATE leads SET data_ultimo_contato=NOW(), aguardando_resposta=true WHERE id=$1`,
          [lead.id]
        );
      }

      await query(
        `INSERT INTO disparo_leads (disparo_id, lead_id, empresa_id, estagio_id, estagio_nome, status, enviado_at)
         VALUES ($1, $2, $3, $4, $5, 'enviado', NOW())`,
        [disparoId, lead.id, empresaId, lead.estagio_id || null, lead.estagio_nome || null]
      );

      // Transferir propriedade do lead se o executor for diferente do dono atual
      await leadsService.transferirPropriedadeSeDiferente(
        lead.id,
        usuarioId,
        empresaId,
        'disparo_whatsapp'
      );

      if (estagioPosDeparoId && lead.estagio_id !== estagioPosDeparoId) {
        await query(
          `UPDATE leads SET estagio_id = $1, data_ultimo_contato = NOW() WHERE id = $2`,
          [estagioPosDeparoId, lead.id]
        );
        await query(
          `INSERT INTO atividades_lead (lead_id, usuario_id, empresa_id, tipo, descricao, dados)
           VALUES ($1, $2, $3, 'mudanca_estagio', $4, $5::jsonb)`,
          [
            lead.id, usuarioId, empresaId,
            `Movido automaticamente após disparo (de "${lead.estagio_nome || '?'}")`,
            JSON.stringify({
              automatico: true,
              trigger: 'pos_disparo',
              disparo_id: disparoId,
              estagio_anterior_id: lead.estagio_id,
              estagio_anterior_nome: lead.estagio_nome,
              novo_estagio_id: estagioPosDeparoId,
            }),
          ]
        );
      }

      enviados++;
    } catch (err: any) {
      falhas++;
      erros.push({
        lead_id: lead.id,
        nome: lead.nome,
        telefone: (lead.whatsapp_id || lead.telefone || '').replace(/@.*$/, ''),
        erro: err.message,
      });

      await query(
        `INSERT INTO disparo_leads (disparo_id, lead_id, empresa_id, estagio_id, estagio_nome, status, erro, enviado_at)
         VALUES ($1, $2, $3, $4, $5, 'falha', $6, NOW())`,
        [disparoId, lead.id, empresaId, lead.estagio_id || null, lead.estagio_nome || null, err.message]
      );
    }

    if (i % 5 === 4 || i === leads.length - 1) {
      await query(
        `UPDATE disparos_crm SET enviados=$1, falhas=$2, erros=$3::jsonb WHERE id=$4`,
        [enviados, falhas, JSON.stringify(erros), disparoId]
      );
    }

    if (i < leads.length - 1) {
      await sleepRandom(DELAY_MIN_MS, DELAY_MAX_MS);
    }
  }

  if (grupos.length > 0) {
    const avisoGrupos = grupos.map(g => ({
      lead_id: g.id,
      nome: g.nome,
      telefone: (g.whatsapp_id || g.telefone || '').replace(/@.*$/, ''),
      erro: `Grupo ignorado — disparos em massa não são enviados para grupos`,
    }));
    const errosAtuais = [...erros, ...avisoGrupos];
    await query(
      `UPDATE disparos_crm SET erros=$1::jsonb WHERE id=$2`,
      [JSON.stringify(errosAtuais), disparoId]
    );
  }

  await query(
    `UPDATE disparos_crm SET status='concluido', finished_at=NOW() WHERE id=$1`,
    [disparoId]
  );
}

export const disparosService = {
  async listarLeads(
    empresaId: number,
    funilId: number,
    search?: string,
    page = 1,
    perPage = 50,
    filtros?: { estagio_id?: number; responsavel_id?: number; temperatura?: string; origem?: string }
  ): Promise<{ leads: any[]; total: number; paginas: number }> {
    const offset = (page - 1) * perPage;
    const params: any[] = [empresaId, funilId];
    let whereExtra = '';

    if (search && search.trim()) {
      params.push(`%${search.toLowerCase().trim()}%`);
      whereExtra += ` AND LOWER(l.nome) LIKE $${params.length}`;
    }
    if (filtros?.estagio_id) {
      params.push(filtros.estagio_id);
      whereExtra += ` AND l.estagio_id = $${params.length}`;
    }
    if (filtros?.responsavel_id) {
      params.push(filtros.responsavel_id);
      whereExtra += ` AND l.responsavel_id = $${params.length}`;
    }
    if (filtros?.temperatura) {
      params.push(filtros.temperatura);
      whereExtra += ` AND l.temperatura = $${params.length}`;
    }
    if (filtros?.origem) {
      params.push(filtros.origem);
      whereExtra += ` AND l.origem = $${params.length}`;
    }

    const baseWhere = `WHERE l.empresa_id = $1 AND l.funil_id = $2 AND l.arquivado = false
      AND l.telefone IS NOT NULL AND l.telefone != ''${whereExtra}`;

    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT
           l.id, l.nome, l.telefone, l.empresa,
           COALESCE((
             SELECT COUNT(*) FROM disparo_leads dl
             WHERE dl.lead_id = l.id AND dl.empresa_id = l.empresa_id AND dl.status = 'enviado'
           ), 0)::int AS total_disparos,
           (SELECT dl.estagio_nome FROM disparo_leads dl
            WHERE dl.lead_id = l.id AND dl.empresa_id = l.empresa_id
            ORDER BY dl.enviado_at DESC LIMIT 1) AS ultimo_estagio_disparo
         FROM leads l ${baseWhere} ORDER BY l.nome LIMIT ${perPage} OFFSET ${offset}`,
        params
      ),
      query(`SELECT COUNT(*) as total FROM leads l ${baseWhere}`, params),
    ]);

    const total = parseInt(countResult.rows[0].total);
    return {
      leads: dataResult.rows,
      total,
      paginas: Math.ceil(total / perPage) || 1,
    };
  },

  async iniciar(
    empresaId: number,
    usuarioId: number,
    dto: IniciarDisparoDto
  ): Promise<number> {
    let leads = await _buscarLeadsPorConfig(empresaId, {
      todos: dto.todos,
      funil_id: dto.funil_id,
      lead_ids: dto.lead_ids,
      estagio_id: dto.estagio_id,
      responsavel_id: dto.responsavel_id,
      temperatura: dto.temperatura,
      origem: dto.origem,
    });

    // Filtrar grupos (@g.us) — disparo individual apenas
    const grupos = leads.filter(l => l.whatsapp_id?.endsWith('@g.us'));
    leads = leads.filter(l => !l.whatsapp_id?.endsWith('@g.us'));

    // Verificar agendamento
    const agendado = dto.agendado_para && new Date(dto.agendado_para) > new Date();

    if (!agendado) {
      // Verificar limite diário antes de iniciar
      const hojeResult = await query(
        `SELECT COALESCE(SUM(enviados), 0)::int AS total_hoje
         FROM disparos_crm
         WHERE usuario_id = $1 AND DATE(created_at) = CURRENT_DATE AND status != 'agendado'`,
        [usuarioId]
      );
      const totalHoje = hojeResult.rows[0]?.total_hoje ?? 0;
      const disponivelHoje = Math.max(0, LIMITE_DIARIO - totalHoje);

      if (disponivelHoje === 0) {
        throw new Error(
          `Limite diário atingido (${LIMITE_DIARIO} msgs/dia). Tente novamente amanhã para proteger sua conta WhatsApp.`
        );
      }

      if (leads.length > disponivelHoje) {
        leads = leads.slice(0, disponivelHoje);
      }
    }

    const total = leads.length;

    const configuracaoJson = {
      todos: dto.todos || false,
      funil_id: dto.funil_id || null,
      lead_ids: dto.todos ? null : (dto.lead_ids || null),
    };

    const status = agendado ? 'agendado' : 'processando';

    const res = await query(
      `INSERT INTO disparos_crm
         (empresa_id, usuario_id, funil_id, template, total, status, estagio_pos_disparo_id, agendado_para, configuracao_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING id`,
      [
        empresaId, usuarioId, dto.funil_id || null, dto.template, total,
        status, dto.estagio_pos_disparo_id || null,
        dto.agendado_para || null,
        JSON.stringify(configuracaoJson),
      ]
    );
    const disparoId: number = res.rows[0].id;

    if (agendado) {
      return disparoId;
    }

    if (total === 0) {
      await query(
        `UPDATE disparos_crm SET status='concluido', finished_at=NOW() WHERE id=$1`,
        [disparoId]
      );
      return disparoId;
    }

    const configResult = await query(
      `SELECT whatsapp_porta FROM usuarios WHERE id = $1`,
      [usuarioId]
    );
    const porta = configResult.rows[0]?.whatsapp_porta;

    setImmediate(async () => {
      await _processarEnviosWA(
        disparoId, empresaId, usuarioId, leads, grupos, porta,
        dto.template, dto.estagio_pos_disparo_id
      );
    });

    return disparoId;
  },

  async executarAgendado(disparoId: number, empresaId: number, usuarioId: number): Promise<void> {
    const disparoResult = await query(
      `SELECT template, estagio_pos_disparo_id, configuracao_json
       FROM disparos_crm WHERE id = $1 AND empresa_id = $2 AND status = 'processando'`,
      [disparoId, empresaId]
    );

    const disparo = disparoResult.rows[0];
    if (!disparo) return;

    const config = disparo.configuracao_json || {};
    let leads = await _buscarLeadsPorConfig(empresaId, config);

    const grupos = leads.filter((l: DisparoLead) => l.whatsapp_id?.endsWith('@g.us'));
    leads = leads.filter((l: DisparoLead) => !l.whatsapp_id?.endsWith('@g.us'));

    const total = leads.length;
    await query(
      `UPDATE disparos_crm SET total = $1 WHERE id = $2`,
      [total, disparoId]
    );

    if (total === 0) {
      await query(
        `UPDATE disparos_crm SET status='concluido', finished_at=NOW() WHERE id=$1`,
        [disparoId]
      );
      return;
    }

    const configResult = await query(
      `SELECT whatsapp_porta FROM usuarios WHERE id = $1`,
      [usuarioId]
    );
    const porta = configResult.rows[0]?.whatsapp_porta;

    await _processarEnviosWA(
      disparoId, empresaId, usuarioId, leads, grupos, porta,
      disparo.template, disparo.estagio_pos_disparo_id
    );
  },

  async getStatus(disparoId: number, empresaId: number) {
    const res = await query(
      `SELECT id, total, enviados, falhas, status, erros, created_at, finished_at, agendado_para
       FROM disparos_crm WHERE id=$1 AND empresa_id=$2`,
      [disparoId, empresaId]
    );
    return res.rows[0] || null;
  },

  async listar(empresaId: number, limit = 10) {
    const res = await query(
      `SELECT id, total, enviados, falhas, status, template, created_at, finished_at, agendado_para
       FROM disparos_crm WHERE empresa_id=$1
       ORDER BY created_at DESC LIMIT $2`,
      [empresaId, limit]
    );
    return res.rows;
  },

  async listarAgendados(empresaId: number, funilTipo?: 'aquisicao' | 'cx') {
    const params: unknown[] = [empresaId];
    const extraWhere = funilTipo
      ? ` AND (f.tipo = $2 OR (d.funil_id IS NULL AND $2::text IS NULL))`
      : '';
    if (funilTipo) params.push(funilTipo);

    const res = await query(
      `SELECT d.id, d.total, d.enviados, d.falhas, d.status, d.template,
              d.agendado_para, d.tipo, d.configuracao_json,
              d.created_at, u.nome as criado_por,
              d.funil_id, f.tipo as funil_tipo, f.nome as funil_nome
       FROM disparos_crm d
       JOIN usuarios u ON u.id = d.usuario_id
       LEFT JOIN funis f ON f.id = d.funil_id
       WHERE d.empresa_id = $1 AND d.status = 'agendado'
       ${extraWhere}
       ORDER BY d.agendado_para ASC`,
      params
    );
    return res.rows;
  },

  async cancelarAgendado(disparoId: number, empresaId: number) {
    const res = await query(
      `UPDATE disparos_crm SET status = 'cancelado'
       WHERE id = $1 AND empresa_id = $2 AND status = 'agendado'
       RETURNING id, status`,
      [disparoId, empresaId]
    );
    return res.rows[0] || null;
  },

  async editarAgendado(
    disparoId: number,
    empresaId: number,
    data: { template?: string; agendado_para?: string }
  ) {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;

    if (data.template !== undefined) {
      fields.push(`template = $${i++}`);
      values.push(data.template);
    }
    if (data.agendado_para !== undefined) {
      fields.push(`agendado_para = $${i++}`);
      values.push(data.agendado_para);
    }
    if (fields.length === 0) throw new Error('Nenhum campo para atualizar');

    values.push(disparoId, empresaId);
    const res = await query(
      `UPDATE disparos_crm SET ${fields.join(', ')}
       WHERE id = $${i++} AND empresa_id = $${i} AND status = 'agendado'
       RETURNING id, template, agendado_para, status`,
      values
    );
    return res.rows[0] || null;
  },
};
