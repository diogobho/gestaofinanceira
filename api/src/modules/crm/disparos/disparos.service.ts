import axios from 'axios';
import { query } from '../../../config/database';
import { leadsService } from '../leads/leads.service';
import { contatosService } from '../contatos/contatos.service';
import { aplicarVariaveisLead } from '../_shared/agendamento';
import { comDDIParaEnvio } from '../_shared/telefone';
import { instancia, destinoCloud } from '../../whatsapp/canal/instancia';
import { ehPortaVirtual, contaPorPorta, ContaCloud, enviaPeloOficial, MSG_PRIMEIRO_CONTATO_SO_OFICIAL } from '../../whatsapp/canal/contas';
import { CATALOGO, temCapacidade } from '../../../shared/capacidades';
import { acharModelo, enviarModelo, ModeloCRM } from '../../whatsapp/canal/modelos';

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
  // Anti-ban: intervalo (segundos) entre um envio e o próximo. Aleatório entre min e max.
  intervalo_min_seg?: number;
  intervalo_max_seg?: number;
  // Filtros adicionais aplicados ao modo 'todos'
  estagio_id?: number;
  responsavel_id?: number;
  temperatura?: string;
  origem?: string;
  sem_tarefa?: boolean;
  com_tarefa_hoje?: boolean;
  com_tarefa_atrasada?: boolean;
  /**
   * Disparo pelo número oficial com MODELO aprovado (fora da janela de 24h é o único
   * jeito de chegar em lead frio). `variaveis`/`cabecalho` aceitam as variáveis do CRM
   * ([Nome], [PrimeiroNome]…), resolvidas lead a lead.
   */
  modelo_whatsapp?: ModeloDisparo;
}

export interface ModeloDisparo {
  nome: string;
  idioma?: string;
  variaveis: string[];
  cabecalho?: string | null;
}

// Usa o padrão único de substituição (todos os atributos do lead).
function aplicarVariaveis(template: string, lead: DisparoLead): string {
  return aplicarVariaveisLead(template, lead as Record<string, any>);
}

// Anti-ban: intervalo aleatório padrão 45–90s entre mensagens (configurável por disparo)
const DELAY_MIN_MS = 45_000;
const DELAY_MAX_MS = 90_000;

// Limites de segurança para o intervalo configurável (em segundos).
const INTERVALO_MIN_SEG = 10;
const INTERVALO_MAX_SEG = 600;

// Normaliza o par (min,max) em segundos vindo do usuário para milissegundos, com clamps.
function resolverIntervaloMs(minSeg?: number | null, maxSeg?: number | null): { minMs: number; maxMs: number } {
  if (minSeg == null && maxSeg == null) return { minMs: DELAY_MIN_MS, maxMs: DELAY_MAX_MS };
  let min = Math.round(Number(minSeg ?? maxSeg ?? 45));
  let max = Math.round(Number(maxSeg ?? minSeg ?? 90));
  if (!Number.isFinite(min)) min = 45;
  if (!Number.isFinite(max)) max = 90;
  min = Math.max(INTERVALO_MIN_SEG, Math.min(INTERVALO_MAX_SEG, min));
  max = Math.max(INTERVALO_MIN_SEG, Math.min(INTERVALO_MAX_SEG, max));
  if (max < min) max = min;
  return { minMs: min * 1000, maxMs: max * 1000 };
}

// Limite diário de mensagens por conta WhatsApp (por usuário)
const LIMITE_DIARIO = 100;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sleepRandom(minMs: number, maxMs: number) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return sleep(ms);
}

// Filtros de tarefa — espelham os do kanban (leads.service._buildWhereClause).
// Subqueries sem parâmetros; assumem que a tabela leads está aliasada como "l".
export interface FiltrosTarefa {
  sem_tarefa?: boolean;
  com_tarefa_hoje?: boolean;
  com_tarefa_atrasada?: boolean;
}

export function _tarefaFiltroSQL(filtros?: FiltrosTarefa): string {
  let sql = '';
  if (filtros?.com_tarefa_atrasada) {
    sql += ` AND EXISTS (
      SELECT 1 FROM tarefas_lead tf
      WHERE tf.lead_id = l.id AND tf.status IN ('pendente', 'em_andamento')
      AND tf.data_vencimento < NOW()
    )`;
  }
  if (filtros?.com_tarefa_hoje) {
    sql += ` AND EXISTS (
      SELECT 1 FROM tarefas_lead tf
      WHERE tf.lead_id = l.id AND tf.status IN ('pendente', 'em_andamento')
      AND tf.data_vencimento >= CURRENT_DATE
      AND tf.data_vencimento < CURRENT_DATE + INTERVAL '1 day'
    )`;
  }
  if (filtros?.sem_tarefa) {
    sql += ` AND NOT EXISTS (
      SELECT 1 FROM tarefas_lead tf
      WHERE tf.lead_id = l.id AND tf.status IN ('pendente', 'em_andamento')
    )`;
  }
  return sql;
}

async function _buscarLeadsPorConfig(
  empresaId: number,
  config: {
    todos?: boolean; funil_id?: number; lead_ids?: number[];
    estagio_id?: number; responsavel_id?: number; temperatura?: string; origem?: string;
  } & FiltrosTarefa
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
    extraWhere += _tarefaFiltroSQL(config);

    const r = await query(
      `SELECT
        l.id, l.nome, l.telefone, l.empresa, l.origem, l.contato_whatsapp_id,
        l.estagio_id, ef.nome AS estagio_nome,
        cw.whatsapp_id,
        u.nome AS responsavel_nome
       FROM leads l
       LEFT JOIN contatos_whatsapp cw ON l.contato_whatsapp_id = cw.id
       LEFT JOIN usuarios u ON u.id = l.responsavel_id
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
        cw.whatsapp_id,
        u.nome AS responsavel_nome
       FROM leads l
       LEFT JOIN contatos_whatsapp cw ON l.contato_whatsapp_id = cw.id
       LEFT JOIN usuarios u ON u.id = l.responsavel_id
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
  estagioPosDeparoId: number | undefined,
  delayMinMs: number = DELAY_MIN_MS,
  delayMaxMs: number = DELAY_MAX_MS,
  modelo: ModeloDisparo | null = null
): Promise<void> {
  let enviados = 0;
  let falhas = 0;
  const erros: Array<{ lead_id: number; nome: string; telefone: string; erro: string }> = [];

  // Número oficial + modelo: resolve conta e modelo UMA vez. Se o modelo sumiu ou foi
  // pausado pela Meta entre o agendamento e a execução, cada lead falha com o motivo.
  let conta: ContaCloud | null = null;
  let modeloMeta: ModeloCRM | null = null;
  let erroModelo: string | null = null;
  if (modelo) {
    conta = ehPortaVirtual(porta) ? await contaPorPorta(Number(porta)) : null;
    if (!conta || !conta.ativo) {
      erroModelo = 'Disparo com modelo aprovado só sai pelo WhatsApp oficial — o número oficial desta empresa está desligado';
    } else {
      try {
        modeloMeta = await acharModelo(conta, modelo.nome, modelo.idioma);
      } catch (e: any) {
        erroModelo = e.message;
      }
    }
  }

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

      // O destino preferido é o whatsapp_id do contato: se ele não for o telefone
      // do card, a mensagem sairia para outra pessoa. Falha visível no relatório.
      if (lead.contato_whatsapp_id) {
        const bloqueio = await contatosService.bloqueioPorVinculo(lead.telefone, {
          id: lead.contato_whatsapp_id,
          numero: lead.whatsapp_id?.replace(/@.*$/, '') ?? null,
          whatsapp_id: lead.whatsapp_id,
        });
        if (bloqueio) throw new Error(bloqueio);
      }

      let mensagem = aplicarVariaveis(template, lead);
      let destino = lead.whatsapp_id || lead.telefone!;
      if (!destino.includes('@')) {
        destino = comDDIParaEnvio(destino.replace(/\D/g, ''));
      }

      let response: { data: any };
      if (modelo) {
        if (erroModelo || !conta || !modeloMeta) throw new Error(erroModelo || 'Modelo indisponível');
        const r = await enviarModelo(conta, destinoCloud(destino), modeloMeta, {
          corpo: modelo.variaveis.map((v) => aplicarVariaveis(v, lead)),
          cabecalho: modelo.cabecalho ? aplicarVariaveis(modelo.cabecalho, lead) : null,
        });
        mensagem = r.texto;
        response = { data: { success: true, messageId: r.messageId } };
      } else {
        response = await instancia(porta).post(`/send`,
          { number: destino, message: mensagem },
          { timeout: 30000 }
        );
      }

      if (!response.data.success) {
        throw new Error(response.data.error || 'Erro na API WhatsApp');
      }

      // Lead importado nunca conversou, então costuma vir sem contato vinculado.
      // Antes o histórico só era gravado quando o vínculo já existia — a mensagem
      // saía e sumia do card ("Nenhuma mensagem ainda"). Resolve/cria o contato
      // pelo telefone (mesmo helper do follow-up) e vincula, depois grava.
      let contatoId = lead.contato_whatsapp_id;
      if (!contatoId) {
        contatoId = (await contatosService.resolverContatoParaLead(
          lead.id, usuarioId, empresaId
        )) ?? undefined;
      }

      if (contatoId) {
        // Guarda o destino real confirmado pelo WhatsApp (ver _corrigirJidConfirmado).
        await contatosService._corrigirJidConfirmado(
          { id: contatoId, whatsapp_id: lead.whatsapp_id, is_grupo: false },
          response.data.jid
        );
      } else {
        // Telefone inválido para virar contato: grava mesmo assim (contato nulo),
        // para o envio não ficar invisível no relatório e no histórico do lead.
        console.warn(
          `[Disparo] #${disparoId} lead #${lead.id}: enviado sem contato vinculável (telefone "${lead.telefone}") — histórico gravado sem contato.`
        );
      }

      await query(
        `INSERT INTO historico_mensagens
          (lead_id, contato_whatsapp_id, usuario_id, empresa_id,
           whatsapp_message_id, direcao, tipo, conteudo, origem, enviado_at)
         VALUES ($1, $2, $3, $4, $5, 'saida', 'texto', $6, 'disparo', NOW())`,
        [
          lead.id,
          contatoId ?? null,
          usuarioId,
          empresaId,
          response.data.messageId || null,
          mensagem,
        ]
      );

      await query(
        `UPDATE leads SET data_ultimo_contato=NOW(), aguardando_resposta=true WHERE id=$1`,
        [lead.id]
      );

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

      // O estágio pós-disparo precisa entrar pelo moverPorAutomacao: além de mover o
      // lead, ele encerra a cadência do estágio anterior e INICIA a do destino,
      // contando a entrada a partir deste disparo. Com o UPDATE cru que havia aqui o
      // lead caía no estágio e nenhum follow-up era agendado — 94 leads da Panteras
      // foram para "Tentativa de Contato" entre 17 e 20/08/2026 sem cadência nenhuma,
      // e só tinham FUP os que alguém depois moveu à mão no Kanban.
      // A comparação de estágio saiu de propósito: lead.estagio_id é o retrato do
      // início do lote e o moverPorAutomacao re-lê o atual do banco (e devolve false
      // se já for o destino).
      // try/catch: a mensagem JÁ SAIU. Falha ao mover ou ao agendar a cadência não
      // pode virar 'falha' no relatório do disparo nem gerar uma segunda linha em
      // disparo_leads para um lead que já tem a linha 'enviado'.
      if (estagioPosDeparoId) {
        try {
          await leadsService.moverPorAutomacao(
            lead.id, empresaId, usuarioId, estagioPosDeparoId,
            `Movido automaticamente após disparo (de "${lead.estagio_nome || '?'}")`,
            {
              trigger: 'pos_disparo',
              disparo_id: disparoId,
              estagio_anterior_nome: lead.estagio_nome,
            }
          );
        } catch (movErr: any) {
          console.error(
            `[Disparo] #${disparoId} lead #${lead.id}: mensagem enviada, mas falhou ao mover ` +
            `para o estágio pós-disparo #${estagioPosDeparoId}: ${movErr.message}`
          );
        }
      }

      enviados++;
    } catch (err: any) {
      falhas++;
      // A API do WhatsApp responde 4xx com o motivo no corpo (ex.: número sem conta).
      const motivo = err.response?.data?.details || err.response?.data?.error || err.message;

      erros.push({
        lead_id: lead.id,
        nome: lead.nome,
        telefone: (lead.whatsapp_id || lead.telefone || '').replace(/@.*$/, ''),
        erro: motivo,
      });

      await query(
        `INSERT INTO disparo_leads (disparo_id, lead_id, empresa_id, estagio_id, estagio_nome, status, erro, enviado_at)
         VALUES ($1, $2, $3, $4, $5, 'falha', $6, NOW())`,
        [disparoId, lead.id, empresaId, lead.estagio_id || null, lead.estagio_nome || null, motivo]
      );
    }

    if (i % 5 === 4 || i === leads.length - 1) {
      await query(
        `UPDATE disparos_crm SET enviados=$1, falhas=$2, erros=$3::jsonb WHERE id=$4`,
        [enviados, falhas, JSON.stringify(erros), disparoId]
      );
    }

    if (i < leads.length - 1) {
      await sleepRandom(delayMinMs, delayMaxMs);
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
    filtros?: { estagio_id?: number; responsavel_id?: number; temperatura?: string; origem?: string } & FiltrosTarefa
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
    whereExtra += _tarefaFiltroSQL(filtros);

    const baseWhere = `WHERE l.empresa_id = $1 AND l.funil_id = $2 AND l.arquivado = false
      AND l.telefone IS NOT NULL AND l.telefone != ''${whereExtra}`;

    const [dataResult, countResult, agendadosResult] = await Promise.all([
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
      // Leads já selecionados em disparos AGENDADOS pendentes (mesma lógica do preview) —
      // marca na lista de seleção para o operador não repetir o contato.
      query(
        `SELECT jsonb_array_elements_text(configuracao_json->'lead_ids')::int AS lead_id
         FROM disparos_crm
         WHERE empresa_id = $1 AND status = 'agendado'
           AND jsonb_typeof(configuracao_json->'lead_ids') = 'array'`,
        [empresaId]
      ),
    ]);

    const jaAgendados = new Set<number>(agendadosResult.rows.map((r: any) => r.lead_id));
    const total = parseInt(countResult.rows[0].total);
    return {
      leads: dataResult.rows.map((l: any) => ({ ...l, ja_agendado: jaAgendados.has(l.id) })),
      total,
      paginas: Math.ceil(total / perPage) || 1,
    };
  },

  /**
   * Pré-visualização dos destinatários de um disparo (antes de confirmar).
   * Resolve a lista final (mesma lógica do envio) e marca quem já está em um
   * disparo AGENDADO pendente — ajuda a não repetir contatos ao programar disparos.
   */
  async preverDestinatarios(empresaId: number, dto: IniciarDisparoDto) {
    let leads = await _buscarLeadsPorConfig(empresaId, {
      todos: dto.todos,
      funil_id: dto.funil_id,
      lead_ids: dto.lead_ids,
      estagio_id: dto.estagio_id,
      responsavel_id: dto.responsavel_id,
      temperatura: dto.temperatura,
      origem: dto.origem,
      sem_tarefa: dto.sem_tarefa,
      com_tarefa_hoje: dto.com_tarefa_hoje,
      com_tarefa_atrasada: dto.com_tarefa_atrasada,
    });

    // Grupos não recebem disparo individual — sinalizados à parte.
    const grupos = leads.filter(l => l.whatsapp_id?.endsWith('@g.us'));
    leads = leads.filter(l => !l.whatsapp_id?.endsWith('@g.us'));

    // Leads já presentes em disparos AGENDADOS pendentes (por lead_ids na config).
    const agendadosRes = await query(
      `SELECT jsonb_array_elements_text(configuracao_json->'lead_ids')::int AS lead_id
       FROM disparos_crm
       WHERE empresa_id = $1 AND status = 'agendado'
         AND jsonb_typeof(configuracao_json->'lead_ids') = 'array'`,
      [empresaId]
    );
    const jaAgendados = new Set<number>(agendadosRes.rows.map((r: any) => r.lead_id));

    const destinatarios = leads.map(l => ({
      id: l.id,
      nome: l.nome,
      telefone: (l.whatsapp_id || l.telefone || '').replace(/@.*$/, ''),
      empresa: l.empresa || null,
      estagio_nome: l.estagio_nome || null,
      ja_agendado: jaAgendados.has(l.id),
    }));

    return {
      total: destinatarios.length,
      total_ja_agendados: destinatarios.filter(d => d.ja_agendado).length,
      total_grupos_ignorados: grupos.length,
      destinatarios,
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
      sem_tarefa: dto.sem_tarefa,
      com_tarefa_hoje: dto.com_tarefa_hoje,
      com_tarefa_atrasada: dto.com_tarefa_atrasada,
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

    const { minMs, maxMs } = resolverIntervaloMs(dto.intervalo_min_seg, dto.intervalo_max_seg);

    const configuracaoJson = {
      todos: dto.todos || false,
      funil_id: dto.funil_id || null,
      lead_ids: dto.todos ? null : (dto.lead_ids || null),
      // Intervalo anti-ban (ms) — persistido para o disparo agendado reaplicá-lo.
      intervalo_min_ms: minMs,
      intervalo_max_ms: maxMs,
      // Filtros do modo 'todos' — precisam persistir para o disparo agendado reaplicá-los.
      estagio_id: dto.estagio_id || null,
      responsavel_id: dto.responsavel_id || null,
      temperatura: dto.temperatura || null,
      origem: dto.origem || null,
      sem_tarefa: dto.sem_tarefa || false,
      com_tarefa_hoje: dto.com_tarefa_hoje || false,
      com_tarefa_atrasada: dto.com_tarefa_atrasada || false,
    };

    const status = agendado ? 'agendado' : 'processando';

    const portaRes = await query(`SELECT whatsapp_porta FROM usuarios WHERE id = $1`, [usuarioId]);
    const portaUsuario = portaRes.rows[0]?.whatsapp_porta;
    if (dto.modelo_whatsapp) {
      // Recusa na criação o que falharia em todos os leads na execução.
      const conta = ehPortaVirtual(portaUsuario) ? await contaPorPorta(Number(portaUsuario)) : null;
      if (!conta || !conta.ativo) {
        throw new Error('Modelo aprovado só existe no WhatsApp oficial — esta conta envia pelo WhatsApp conectado por QR Code');
      }
      const m = await acharModelo(conta, dto.modelo_whatsapp.nome, dto.modelo_whatsapp.idioma);
      if (dto.modelo_whatsapp.variaveis.length < m.variaveis.length) {
        throw new Error(`O modelo "${m.nome}" pede ${m.variaveis.length} variável(is) — preencha todas`);
      }
      dto.modelo_whatsapp.idioma = m.idioma;
    }

    const res = await query(
      `INSERT INTO disparos_crm
         (empresa_id, usuario_id, funil_id, template, total, status, estagio_pos_disparo_id, agendado_para, configuracao_json, modelo_whatsapp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
       RETURNING id`,
      [
        empresaId, usuarioId, dto.funil_id || null, dto.template, total,
        status, dto.estagio_pos_disparo_id || null,
        dto.agendado_para || null,
        JSON.stringify(configuracaoJson),
        dto.modelo_whatsapp ? JSON.stringify(dto.modelo_whatsapp) : null,
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
        dto.template, dto.estagio_pos_disparo_id, minMs, maxMs, dto.modelo_whatsapp ?? null
      );
    });

    return disparoId;
  },

  async executarAgendado(disparoId: number, empresaId: number, usuarioId: number): Promise<void> {
    const disparoResult = await query(
      `SELECT template, estagio_pos_disparo_id, configuracao_json, modelo_whatsapp
       FROM disparos_crm WHERE id = $1 AND empresa_id = $2 AND status = 'processando'`,
      [disparoId, empresaId]
    );

    const disparo = disparoResult.rows[0];
    if (!disparo) return;

    // Agendado antes de a regra existir (ou antes de o plano/canal mudar): confere
    // na hora de sair. O erro vira o motivo do disparo, no mesmo lugar da tela.
    if (!(await temCapacidade(empresaId, 'disparo_whatsapp'))) throw new Error(CATALOGO.disparo_whatsapp.motivo);
    if (!(await enviaPeloOficial(usuarioId))) throw new Error(MSG_PRIMEIRO_CONTATO_SO_OFICIAL);

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

    const delayMinMs = config.intervalo_min_ms ?? DELAY_MIN_MS;
    const delayMaxMs = config.intervalo_max_ms ?? DELAY_MAX_MS;

    await _processarEnviosWA(
      disparoId, empresaId, usuarioId, leads, grupos, porta,
      disparo.template, disparo.estagio_pos_disparo_id, delayMinMs, delayMaxMs,
      disparo.modelo_whatsapp ?? null
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
              d.agendado_para, d.tipo, d.configuracao_json, d.assunto,
              d.estagio_pos_disparo_id,
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

  /**
   * Edição de um disparo que ainda não saiu.
   *
   * Aceita tudo o que a tela de criação deixa escolher, menos os destinatários:
   * eles foram congelados em `disparo_leads` quando o disparo nasceu, e trocar a
   * lista aqui exigiria refazer aquele congelamento — quem quer outro público
   * cancela e cria de novo. Antes só dava para mexer em `template` e hora, o que
   * deixava o assunto de um disparo de e-mail sem edição nenhuma.
   */
  async editarAgendado(
    disparoId: number,
    empresaId: number,
    data: {
      template?: string;
      agendado_para?: string;
      assunto?: string;
      estagio_pos_disparo_id?: number | null;
      intervalo_min?: number;
      intervalo_max?: number;
    }
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
    if (data.assunto !== undefined) {
      fields.push(`assunto = $${i++}`);
      values.push(data.assunto);
    }
    if (data.estagio_pos_disparo_id !== undefined) {
      fields.push(`estagio_pos_disparo_id = $${i++}`);
      values.push(data.estagio_pos_disparo_id);
    }

    // O intervalo anti-ban vive dentro do JSON de configuração que o disparo
    // agendado reaplica na hora do envio: mesclar preserva os filtros do modo
    // 'todos', que estão no mesmo objeto e não podem ser perdidos aqui.
    if (data.intervalo_min !== undefined || data.intervalo_max !== undefined) {
      const patch: Record<string, number> = {};
      if (data.intervalo_min !== undefined) patch.intervalo_min = data.intervalo_min;
      if (data.intervalo_max !== undefined) patch.intervalo_max = data.intervalo_max;
      fields.push(`configuracao_json = COALESCE(configuracao_json, '{}'::jsonb) || $${i++}::jsonb`);
      values.push(JSON.stringify(patch));
    }

    if (fields.length === 0) throw new Error('Nenhum campo para atualizar');

    values.push(disparoId, empresaId);
    const res = await query(
      `UPDATE disparos_crm SET ${fields.join(', ')}
       WHERE id = $${i++} AND empresa_id = $${i} AND status = 'agendado'
       RETURNING id, template, assunto, agendado_para, status, tipo,
                 estagio_pos_disparo_id, configuracao_json`,
      values
    );
    return res.rows[0] || null;
  },
};
