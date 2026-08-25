import Anthropic from '@anthropic-ai/sdk';
import { Tool } from '@anthropic-ai/sdk/resources/messages';
import axios from 'axios';
import { query } from '../../config/database';
import { contatosService } from '../crm/contatos/contatos.service';
import { leadsService } from '../crm/leads/leads.service';
import { tarefasService } from '../crm/tarefas/tarefas.service';
import { anotacoesService } from '../crm/anotacoes/anotacoes.service';
import { sessoesService } from '../sessoes/sessoes.service';
import { marcarOrigemErro } from '../../shared/erros';
import { leadFalouRecentemente, SILENCIO_APOS_LEAD_MIN } from '../crm/_shared/conversa';

// Lock para evitar processamento concorrente do mesmo lead

/**
 * Envia a resposta do agente em PARTES: blocos separados por linha em branco
 * viram mensagens separadas no WhatsApp, com pausa curta entre elas — mais
 * humano que um textão único (e casa com a instrução "uma ideia por mensagem").
 * Máximo de 3 mensagens por turno; o excedente é agrupado na última.
 * Lança em falha de envio (via enviarMensagemOuFalhar).
 */
async function enviarTextoEmPartes(
  usuarioId: number,
  empresaId: number,
  contatoId: number,
  texto: string,
  leadId: number,
  origem: 'agente_ia' | 'followup' = 'agente_ia'
): Promise<void> {
  const partes = texto.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const blocos = partes.length <= 3
    ? partes
    : [...partes.slice(0, 2), partes.slice(2).join('\n\n')];
  for (let i = 0; i < blocos.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 1500 + Math.floor(Math.random() * 2500)));
    await contatosService.enviarMensagemOuFalhar(usuarioId, empresaId, contatoId, blocos[i], leadId, origem);
  }
}

// Teto de espera por uma resposta do provedor de IA, igual nos dois fluxos (reativo e
// follow-up). O SDK da Anthropic assume 10 minutos quando não se diz nada.
const TIMEOUT_PROVEDOR_MS = 45_000;

/**
 * Falha que vale re-tentar: sobrecarga do provedor, rate limit, timeout, queda de rede.
 * Fica de fora tudo que re-tentar não resolve — 400 (inclusive "credit balance is too
 * low"), 401/403 de credencial — porque aí o retry só queima o job e polui o log.
 * Mesma classificação que o follow-up scheduler usa; aqui vale para o agente reativo.
 */
function ehErroTransitorio(err: any): boolean {
  const msg: string = err?.message || '';
  const statusDoTexto = Number(/status code (\d{3})/i.exec(msg)?.[1]) || undefined;
  const status = err?.status ?? err?.response?.status ?? statusDoTexto;
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 529) return true;
  return /overloaded|too many requests|timeout|etimedout|econnreset|econnrefused|socket hang up|eai_again/i.test(msg);
}

/**
 * Data (YYYY-MM-DD) + hora de PAREDE de São Paulo → instante que a coluna
 * `tarefas_lead.data_vencimento` guarda (naive em UTC, igual ao que o front grava com
 * `toISOString()` e ao que `getAgendaLead` lê de volta). SP é UTC-3 fixo — o Brasil não
 * tem horário de verão desde 2019.
 * Sem hora válida devolve a data crua: o service ancora ao meio-dia UTC (09h em SP) e
 * nunca cai em 00:00, que o job de lembrete trata como "hora não definida".
 */
function vencimentoDeSP(data: string, horario?: string): Date | string {
  const horaValida = typeof horario === 'string' && /^\d{1,2}:\d{2}$/.test(horario.trim());
  if (!horaValida) return data;
  const instante = new Date(`${data}T${horario!.trim().padStart(5, '0')}:00-03:00`);
  return isNaN(instante.getTime()) ? data : instante;
}

export interface AgenteIAConfig {
  id: number;
  empresa_id: number;
  ativo: boolean;
  provider: string;
  api_key: string | null;
  gemini_api_key: string | null;
  modelo: string;
  nome_agente: string;
  tom: string;
  area_negocio: string | null;
  system_prompt_extra: string | null;
  max_tokens: number;
  contexto_mensagens: number;
  usuarios_habilitados: number[];
  delay_segundos: number;
}

interface ToolContext {
  leadId: number;
  contatoId: number;
  usuarioId: number;
  empresaId: number;
  clienteId: number | null;
  lead: any;
  estagios: any[];
}

// ─── Definições das ferramentas ───────────────────────────────────────────────
// Usadas tanto pelo Claude (tool_use) quanto pelo Gemini (function calling)

const TOOL_DEFINITIONS: Tool[] = [
  // ── CRM ──────────────────────────────────────────────────────────────────
  {
    name: 'criar_tarefa',
    description: 'Cria uma tarefa/atividade vinculada ao lead atual no CRM: ligação, e-mail, follow-up, proposta, visita. Para REUNIÃO não use esta — use agendar_reuniao, que também liga os lembretes automáticos.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tipo: {
          type: 'string',
          enum: ['ligacao', 'email', 'follow_up', 'proposta', 'visita', 'outros'],
          description: 'Tipo da tarefa (reunião tem ferramenta própria: agendar_reuniao)'
        },
        titulo: { type: 'string', description: 'Título da tarefa' },
        descricao: { type: 'string', description: 'Descrição opcional da tarefa' },
        data_vencimento: { type: 'string', description: 'Data de vencimento no formato YYYY-MM-DD (horário de Brasília)' },
        horario: { type: 'string', description: 'Horário no formato HH:MM (horário de Brasília). Opcional — sem ele a tarefa fica marcada só para o dia.' },
        prioridade: {
          type: 'string',
          enum: ['baixa', 'normal', 'alta', 'urgente'],
          description: 'Prioridade da tarefa (padrão: normal)'
        }
      },
      required: ['tipo', 'titulo', 'data_vencimento']
    }
  },
  {
    name: 'listar_tarefas',
    description: 'Lista todas as tarefas do lead atual no CRM',
    input_schema: {
      type: 'object' as const,
      properties: {}
    }
  },
  {
    name: 'concluir_tarefa',
    description: 'Marca uma tarefa do lead como concluída',
    input_schema: {
      type: 'object' as const,
      properties: {
        tarefa_id: { type: 'number', description: 'ID da tarefa a concluir' }
      },
      required: ['tarefa_id']
    }
  },
  {
    name: 'mover_lead_estagio',
    description: 'Move o lead para outro estágio do funil de vendas. Consulte a lista de estágios disponíveis no contexto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        estagio_id: { type: 'number', description: 'ID do estágio de destino' }
      },
      required: ['estagio_id']
    }
  },
  {
    name: 'criar_anotacao',
    description: 'Cria uma anotação/nota sobre o lead no CRM',
    input_schema: {
      type: 'object' as const,
      properties: {
        conteudo: { type: 'string', description: 'Conteúdo da anotação' },
        tipo: {
          type: 'string',
          enum: ['nota', 'importante', 'lembrete'],
          description: 'Tipo da anotação (padrão: nota)'
        }
      },
      required: ['conteudo']
    }
  },
  {
    name: 'atualizar_lead',
    description: 'Atualiza informações do lead como temperatura, valor potencial, notas, email, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        temperatura: { type: 'string', enum: ['frio', 'morno', 'quente'] },
        valor_potencial: { type: 'number', description: 'Valor potencial do negócio em R$' },
        notas: { type: 'string', description: 'Notas internas sobre o lead' },
        email: { type: 'string' },
        empresa: { type: 'string', description: 'Empresa do lead' },
        cargo: { type: 'string', description: 'Cargo do lead' },
        probabilidade: { type: 'number', description: 'Probabilidade de fechamento de 0 a 100' }
      }
    }
  },
  {
    name: 'marcar_lead_perdido',
    description: 'Marca o lead como perdido, registrando o motivo da perda',
    input_schema: {
      type: 'object' as const,
      properties: {
        motivo: { type: 'string', description: 'Motivo da perda do lead' }
      },
      required: ['motivo']
    }
  },
  {
    name: 'buscar_atividades_lead',
    description: 'Busca o histórico de atividades do lead atual (movimentações, tarefas, anotações, mensagens)',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Número máximo de atividades a retornar (padrão: 20)' }
      }
    }
  },

  // ── Sessões ───────────────────────────────────────────────────────────────
  {
    name: 'agendar_reuniao',
    description: 'Marca a reunião do lead na agenda. Use assim que o lead confirmar dia e horário. Basta a data e o horário — o resto é preenchido pelo sistema. Os lembretes automáticos (véspera e 1h antes) passam a valer sozinhos. Se já houver reunião marcada para este lead, esta chamada REMARCA a existente em vez de criar outra.',
    input_schema: {
      type: 'object' as const,
      properties: {
        data: { type: 'string', description: 'Data da reunião no formato YYYY-MM-DD (horário de Brasília)' },
        horario: { type: 'string', description: 'Horário da reunião no formato HH:MM (horário de Brasília)' },
        titulo: { type: 'string', description: 'Opcional. Título da reunião (padrão: "Reunião")' },
        duracao_minutos: { type: 'number', description: 'Opcional. Duração em minutos (padrão: 60)' },
        modalidade: { type: 'string', enum: ['online', 'presencial'], description: 'Opcional. Padrão: online' },
        plataforma: { type: 'string', description: 'Opcional. Ex: Google Meet, Zoom' },
        link_sessao: { type: 'string', description: 'Opcional. Link da reunião online' },
        descricao: { type: 'string', description: 'Opcional. Pauta ou observação da reunião' }
      },
      required: ['data', 'horario']
    }
  },
  // ── Consulta e escrita no módulo financeiro: NÃO expostas aqui ────────────
  // Este agente conversa com o LEAD (terceiro não confiável) pelo WhatsApp. Ele tinha
  // `listar_clientes`, `buscar_cliente`, `listar_sessoes`, `listar_receitas`,
  // `listar_despesas`, `criar_receita` e `criar_despesa` — ou seja, a carteira de
  // clientes e o financeiro da empresa a um pedido bem construído de distância
  // (o prompt não é barreira de segurança). Removidas em 14/08/2026; nenhuma delas
  // chegou a ser usada em produção. O chat interno (o Duo) continua com o
  // conjunto financeiro completo em `chat-financeiro.service.ts`, que só o dono da
  // conta acessa — é lá que essas ferramentas fazem sentido.
];

// ─── Execução das ferramentas ─────────────────────────────────────────────────

async function executarFerramenta(
  nome: string,
  input: any,
  ctx: ToolContext
): Promise<{ sucesso: boolean; dados: any; erro?: string }> {
  try {
    switch (nome) {

      // ── CRM ──────────────────────────────────────────────────────────────
      case 'criar_tarefa': {
        // `tarefas_lead.data_vencimento` é naive gravado em UTC — é o que o front manda
        // (`toISOString()`) e o que `getAgendaLead` lê de volta (AT TIME ZONE 'UTC' →
        // 'America/Sao_Paulo'). O agente pensa e fala em horário de São Paulo, então a
        // hora dele é convertida para UTC aqui (SP = UTC-3 fixo; o Brasil não tem mais
        // horário de verão desde 2019). Antes gravava a parede de SP direto na coluna: a
        // reunião marcada para as 14h aparecia como 11h para o vendedor e para o próprio
        // agente no turno seguinte.
        // Sem horário → só a data (o service ancora ao meio-dia UTC = 09h em SP, mesma
        // convenção do resto do sistema). Nunca cai em 00:00, que o job de lembrete de
        // reunião trata como "hora não definida".
        const dataVencimento: any = vencimentoDeSP(input.data_vencimento, input.horario);
        const tarefa = await tarefasService.create(ctx.empresaId, ctx.usuarioId, {
          lead_id: ctx.leadId,
          tipo: input.tipo,
          titulo: input.titulo,
          descricao: input.descricao,
          data_vencimento: dataVencimento,
          prioridade: input.prioridade || 'normal'
        });
        return { sucesso: true, dados: { id: tarefa.id, titulo: tarefa.titulo, tipo: tarefa.tipo, data_vencimento: tarefa.data_vencimento } };
      }

      case 'listar_tarefas': {
        const tarefas = await tarefasService.listByLead(ctx.leadId, ctx.empresaId);
        return { sucesso: true, dados: tarefas.map(t => ({ id: t.id, titulo: t.titulo, tipo: t.tipo, status: t.status, data_vencimento: t.data_vencimento, prioridade: t.prioridade })) };
      }

      case 'concluir_tarefa': {
        const tarefa = await tarefasService.concluir(input.tarefa_id, ctx.empresaId, ctx.usuarioId);
        if (!tarefa) return { sucesso: false, dados: null, erro: 'Tarefa não encontrada' };
        return { sucesso: true, dados: { id: tarefa.id, titulo: tarefa.titulo, status: tarefa.status } };
      }

      case 'mover_lead_estagio': {
        const estagio = ctx.estagios.find(e => e.id === input.estagio_id);
        if (!estagio) return { sucesso: false, dados: null, erro: `Estágio ${input.estagio_id} não encontrado` };
        const resultado = await leadsService.mover(ctx.leadId, ctx.empresaId, ctx.usuarioId, {
          novo_estagio_id: input.estagio_id,
          nova_ordem: 0
        });
        return { sucesso: true, dados: { estagio_nome: estagio.nome, cliente_criado: resultado.clienteCriado } };
      }

      case 'criar_anotacao': {
        const anotacao = await anotacoesService.create(ctx.empresaId, ctx.usuarioId, {
          lead_id: ctx.leadId,
          conteudo: input.conteudo,
          tipo: input.tipo || 'nota',
          origem: 'agente'
        });
        return { sucesso: true, dados: { id: anotacao.id, conteudo: anotacao.conteudo, tipo: anotacao.tipo } };
      }

      case 'atualizar_lead': {
        const lead = await leadsService.update(ctx.leadId, ctx.empresaId, ctx.usuarioId, input);
        if (!lead) return { sucesso: false, dados: null, erro: 'Lead não encontrado' };
        return { sucesso: true, dados: { id: lead.id, nome: lead.nome, temperatura: lead.temperatura, valor_potencial: lead.valor_potencial } };
      }

      case 'marcar_lead_perdido': {
        const perdidoResult = await query(
          `SELECT id FROM estagios_funil WHERE funil_id = $1 AND is_perdido = true LIMIT 1`,
          [ctx.lead.funil_id]
        );
        if (!perdidoResult.rows[0]) return { sucesso: false, dados: null, erro: 'Estágio de perdido não configurado no funil' };
        if (input.motivo) {
          await query(`UPDATE leads SET motivo_perda = $1 WHERE id = $2 AND empresa_id = $3`, [input.motivo, ctx.leadId, ctx.empresaId]);
        }
        await leadsService.mover(ctx.leadId, ctx.empresaId, ctx.usuarioId, { novo_estagio_id: perdidoResult.rows[0].id, nova_ordem: 0 });
        return { sucesso: true, dados: { motivo: input.motivo } };
      }

      case 'buscar_atividades_lead': {
        const atividades = await leadsService.getAtividades(ctx.leadId, ctx.empresaId, input.limit || 20);
        return { sucesso: true, dados: atividades };
      }

      // ── Reunião ───────────────────────────────────────────────────────────
      case 'agendar_reuniao': {
        // Marcar reunião = criar a TAREFA tipo 'reuniao' no lead. É ela que o
        // reuniao-lembretes-scheduler lê para disparar véspera, 1h antes e resgate de
        // no-show — então é ela que não pode faltar.
        //
        // A sessão do módulo de agenda é um extra: `sessoes.cliente_id` é NOT NULL e
        // cadastrar cliente exige CPF/CNPJ, que um lead de WhatsApp não tem. A versão
        // antiga tentava criar o cliente e morria em "Campo cpf_cnpj é obrigatório" — as
        // duas chamadas que existiram em produção falharam assim e a reunião não foi
        // marcada. Agora a sessão só é criada quando o lead JÁ é cliente, e a falha dela
        // nunca derruba o agendamento.
        if (!input.data) return { sucesso: false, dados: null, erro: 'Informe a data no formato YYYY-MM-DD' };
        const vencimento = vencimentoDeSP(input.data, input.horario);
        if (typeof vencimento === 'string') {
          return { sucesso: false, dados: null, erro: 'Informe o horário da reunião no formato HH:MM (horário de Brasília)' };
        }
        const tituloReuniao: string = input.titulo || 'Reunião';
        const detalhes = [input.descricao, input.plataforma, input.link_sessao].filter(Boolean).join(' — ');

        // Remarcação: com uma reunião pendente no lead, atualiza em vez de criar outra —
        // duas tarefas significariam duas réguas de lembrete para a mesma pessoa.
        const reuniaoAtual = await query(
          `SELECT id FROM tarefas_lead
            WHERE lead_id = $1 AND empresa_id = $2 AND tipo = 'reuniao' AND status = 'pendente'
            ORDER BY data_vencimento DESC LIMIT 1`,
          [ctx.leadId, ctx.empresaId]
        );

        const remarcada = !!reuniaoAtual.rows[0];
        const tarefa = remarcada
          ? await tarefasService.update(reuniaoAtual.rows[0].id, ctx.empresaId, {
              titulo: tituloReuniao,
              data_vencimento: vencimento as any,
              ...(detalhes ? { descricao: detalhes } : {})
            })
          : await tarefasService.create(ctx.empresaId, ctx.usuarioId, {
              lead_id: ctx.leadId,
              tipo: 'reuniao',
              titulo: tituloReuniao,
              descricao: detalhes || undefined,
              data_vencimento: vencimento as any,
              prioridade: 'alta'
            });

        // Extra, e só se o lead já for cliente: espelha na agenda do módulo de sessões.
        let sessaoId: string | null = null;
        if (ctx.clienteId) {
          try {
            const sessao = await sessoesService.create({
              usuario_id: ctx.usuarioId,
              mentor_id: ctx.usuarioId,
              cliente_id: ctx.clienteId,
              tipo_sessao: 'reuniao',
              titulo: tituloReuniao,
              data: input.data,
              horario: input.horario,
              duracao_minutos: input.duracao_minutos || 60,
              modalidade: input.modalidade || 'online',
              plataforma: input.plataforma || null,
              link_sessao: input.link_sessao || null,
              descricao: input.descricao || null,
              notas_internas: `Agendado pelo agente IA — lead ID ${ctx.leadId}`
            });
            sessaoId = sessao.id;
          } catch (e: any) {
            console.warn(`[AgenteIA] Lead #${ctx.leadId}: reunião marcada, mas espelhar na agenda falhou:`, e.message);
          }
        }

        return {
          sucesso: true,
          dados: {
            tarefa_id: tarefa?.id,
            titulo: tituloReuniao,
            quando: `${input.data} ${String(input.horario).trim()} (horário de Brasília)`,
            remarcada,
            sessao_id: sessaoId
          }
        };
      }

      default:
        return { sucesso: false, dados: null, erro: `Ferramenta desconhecida: ${nome}` };
    }
  } catch (err: any) {
    return { sucesso: false, dados: null, erro: err.message };
  }
}

/**
 * Anotações do lead formatadas para o prompt, com a ORIGEM explícita.
 *
 * O agente grava uma anotação a cada follow-up enviado ("Follow-up automático
 * enviado: ..."), e o prompt injeta as 20 últimas anotações do lead. Sem marcar a
 * origem, o agente relia as próprias mensagens como se fossem observações escritas
 * por um vendedor humano — eco que virava contexto falso a cada novo toque.
 * As anotações continuam no histórico (são rastreabilidade real); o que muda é que
 * agora ele sabe quem escreveu cada uma.
 */
const ROTULO_ORIGEM_ANOTACAO: Record<string, string> = {
  usuario: 'anotação de um vendedor',
  agente: 'anotação que VOCÊ mesmo registrou',
  sistema: 'evento automático do sistema — não é fala de vendedor',
};

function renderAnotacoes(anotacoes: any[]): string {
  if (!anotacoes || anotacoes.length === 0) return 'Nenhuma anotação registrada';
  return anotacoes
    .map((a: any) => {
      const origem = ROTULO_ORIGEM_ANOTACAO[a?.origem] ? a.origem : 'usuario';
      const tipo = a?.tipo && a.tipo !== 'nota' ? ` · ${a.tipo}` : '';
      return `  [${ROTULO_ORIGEM_ANOTACAO[origem]}${tipo}] ${a?.conteudo ?? ''}`;
    })
    .join('\n');
}

/** Como a hora de uma tarefa deve ser lida (a hora pode não ter sido preenchida). */
function quandoTarefa(t: any): string {
  return t?.hora_definida === false
    ? `${t.quando_data} (dia marcado; a HORA não foi preenchida no sistema)`
    : t?.quando;
}

function rotuloTarefa(t: any): string {
  return `  - ${t.tipo === 'reuniao' ? 'REUNIÃO' : t.tipo}: "${t.titulo}" — ${quandoTarefa(t)}` +
    `${t.atrasada ? ' (ATRASADA)' : ''}` +
    `${t.prioridade && t.prioridade !== 'normal' ? ` [${t.prioridade}]` : ''}` +
    `${t.descricao ? `\n      ${String(t.descricao).slice(0, 200)}` : ''}`;
}

/**
 * Blocos de agenda do lead (tarefas pendentes, encerradas, reunião marcada e próxima
 * mensagem automática) — os MESMOS para o agente reativo e para o de follow-up.
 * O follow-up escrevia sem nada disso: não sabia da reunião marcada e podia propor
 * um horário por cima dela ou repetir uma pergunta já respondida.
 */
function renderAgenda(agenda?: { pendentes: any[]; concluidas: any[]; proximoFollowup: any | null } | null): {
  tarefas: string; concluidas: string; avisoReuniao: string; avisoFollowup: string;
} {
  const pendentes = agenda?.pendentes ?? [];
  const concluidas = agenda?.concluidas ?? [];
  const reuniao = pendentes.find((t: any) => t.tipo === 'reuniao');

  const avisoReuniao = reuniao
    ? `\nATENÇÃO — ESTE LEAD TEM REUNIÃO MARCADA: ${quandoTarefa(reuniao)}${reuniao.atrasada ? ' (o horário JÁ PASSOU)' : ''}.
Se ele perguntar sobre data/hora da conversa, use exatamente o que está acima — nunca invente outro horário nem sugira remarcar sem ele pedir. Não crie outra tarefa de reunião: já existe uma.${reuniao.hora_definida === false ? `
A HORA não está registrada no sistema. Se o título/descrição da tarefa trouxer o horário combinado, use o de lá; se não trouxer, NÃO afirme uma hora — confirme com ele qual ficou combinado.` : ''}\n`
    : '';

  const avisoFollowup = agenda?.proximoFollowup
    ? `\nUSO INTERNO — já existe uma mensagem automática programada para sair em ${agenda.proximoFollowup.quando}. Não prometa ao lead um retorno em outra data que conflite com isso, e não mencione esse agendamento.\n`
    : '';

  return {
    tarefas: pendentes.length > 0 ? pendentes.map(rotuloTarefa).join('\n') : '  Nenhuma tarefa pendente',
    concluidas: concluidas.length > 0
      ? concluidas.map((t: any) => `  - ${t.tipo}: "${t.titulo}" — ${t.quando} (${t.status})`).join('\n')
      : '  Nenhuma',
    avisoReuniao,
    avisoFollowup,
  };
}

// ─── Serviço principal ────────────────────────────────────────────────────────

export const agenteIaService = {

  async getConfig(empresaId: number): Promise<AgenteIAConfig | null> {
    const [behaviorRes, credsRes] = await Promise.all([
      query(`SELECT * FROM agente_ia_config WHERE empresa_id = $1`, [empresaId]),
      query(`SELECT * FROM empresa_ia_credenciais WHERE empresa_id = $1`, [empresaId])
    ]);
    const behavior = behaviorRes.rows[0];
    if (!behavior) return null;
    return { ...behavior, ...(credsRes.rows[0] || {}) } as AgenteIAConfig;
  },

  /**
   * Quantos follow-ups de IA estão parados na fila esperando o agente voltar.
   * Enquanto o agente está desligado (ou sem API key), o scheduler devolve 'pausado'
   * e vai adiando esses registros — eles não se perdem, mas também não saem.
   *
   * Conta só os que já venceram ou vencem nas próximas 24h: os agendados para semanas
   * à frente esperariam de qualquer jeito, e incluí-los inflaria o aviso da interface.
   */
  async contarFollowupsPausados(empresaId: number): Promise<number> {
    const r = await query(
      `SELECT COUNT(*)::int AS total
         FROM followups_agendados
        WHERE empresa_id = $1 AND tipo = 'agente_ia' AND status = 'pendente'
          AND agendado_para <= NOW() + INTERVAL '24 hours'`,
      [empresaId]
    );
    return r.rows[0]?.total ?? 0;
  },

  async upsertConfig(empresaId: number, data: Partial<AgenteIAConfig>): Promise<AgenteIAConfig> {
    const CRED_FIELDS = ['provider', 'api_key', 'gemini_api_key', 'modelo'];
    const BEHAVIOR_FIELDS = [
      'ativo', 'nome_agente', 'tom', 'area_negocio', 'system_prompt_extra',
      'max_tokens', 'contexto_mensagens', 'usuarios_habilitados', 'delay_segundos'
    ];

    const credEntries = Object.entries(data).filter(([k, v]) => CRED_FIELDS.includes(k) && v !== undefined);
    const behaviorEntries = Object.entries(data).filter(([k, v]) => BEHAVIOR_FIELDS.includes(k) && v !== undefined);

    if (credEntries.length === 0 && behaviorEntries.length === 0) {
      throw new Error('Nenhum campo para atualizar');
    }

    if (credEntries.length > 0) {
      const fields = credEntries.map(([k]) => k);
      const values = credEntries.map(([, v]) => v);
      await query(
        `INSERT INTO empresa_ia_credenciais (empresa_id, ${fields.join(', ')}, updated_at)
         VALUES ($1, ${fields.map((_, i) => `$${i + 2}`).join(', ')}, CURRENT_TIMESTAMP)
         ON CONFLICT (empresa_id) DO UPDATE SET ${fields.map((f, i) => `${f} = $${i + 2}`).join(', ')}, updated_at = CURRENT_TIMESTAMP`,
        [empresaId, ...values]
      );
    }

    if (behaviorEntries.length > 0) {
      const fields = behaviorEntries.map(([k]) => k);
      const values = behaviorEntries.map(([, v]) => v);
      await query(
        `INSERT INTO agente_ia_config (empresa_id, ${fields.join(', ')}, updated_at)
         VALUES ($1, ${fields.map((_, i) => `$${i + 2}`).join(', ')}, CURRENT_TIMESTAMP)
         ON CONFLICT (empresa_id) DO UPDATE SET ${fields.map((f, i) => `${f} = $${i + 2}`).join(', ')}, updated_at = CURRENT_TIMESTAMP`,
        [empresaId, ...values]
      );
    }

    return await this.getConfig(empresaId) as AgenteIAConfig;
  },

  async toggleLead(leadId: number, empresaId: number, ativo: boolean | null): Promise<void> {
    await query(`UPDATE leads SET agente_ia_ativo = $1 WHERE id = $2 AND empresa_id = $3`, [ativo, leadId, empresaId]);
    await sincronizarAutomacaoLead(leadId, empresaId, ativo);
  },

  async getLeadStatus(leadId: number, empresaId: number): Promise<{ ativo: boolean; fonte: 'lead' | 'estagio' | 'inativo' }> {
    const result = await query(
      `SELECT l.agente_ia_ativo as lead_ativo, ef.agente_ia_ativo as estagio_ativo
       FROM leads l
       JOIN estagios_funil ef ON ef.id = l.estagio_id
       WHERE l.id = $1 AND l.empresa_id = $2`,
      [leadId, empresaId]
    );
    if (!result.rows[0]) return { ativo: false, fonte: 'inativo' };
    const { lead_ativo, estagio_ativo } = result.rows[0];
    if (lead_ativo === true) return { ativo: true, fonte: 'lead' };
    if (lead_ativo === false) return { ativo: false, fonte: 'lead' };
    if (estagio_ativo === true) return { ativo: true, fonte: 'estagio' };
    return { ativo: false, fonte: 'inativo' };
  },

  // Contexto real do histórico WhatsApp — fonte única para ambos os fluxos.
  // Se upToDate é passado, lê apenas mensagens anteriores (usado no reativo para
  // não duplicar a mensagem que disparou o job — a aggregation adiciona ela depois).
  // IMPORTANTE: a conversa pertence ao CONTATO, não ao lead. Um contato pode ter
  // leads em mais de um funil e o webhook grava a entrada em apenas um deles —
  // ler só por lead_id perdia metade da conversa (IA repetia perguntas). Por isso,
  // quando o contato é conhecido, lê por contato_whatsapp_id (OR lead_id cobre
  // mensagens antigas sem contato), excluindo mensagens de grupo.
  async getContextoHistorico(leadId: number, limit: number, upToDate?: Date, contatoId?: number | null): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    const params: any[] = [leadId];
    let matchFilter = 'lead_id = $1';
    if (contatoId) {
      params.push(contatoId);
      matchFilter = `(contato_whatsapp_id = $${params.length} OR lead_id = $1)`;
    }
    let dateFilter = '';
    if (upToDate) {
      params.push(upToDate);
      dateFilter = `AND created_at < $${params.length}`;
    }
    params.push(limit);
    const result = await query(
      `SELECT direcao, conteudo FROM historico_mensagens
       WHERE ${matchFilter} AND grupo_whatsapp_id IS NULL
         AND tipo = 'texto' AND conteudo IS NOT NULL AND conteudo != ''
         ${dateFilter}
       ORDER BY enviado_at DESC LIMIT $${params.length}`,
      params
    );
    return result.rows.reverse().map((r: any) => ({
      role: r.direcao === 'entrada' ? 'user' : 'assistant' as const,
      content: r.conteudo
    }));
  },

  async logarAcao(leadId: number, empresaId: number, acao: string, dados: any, sucesso: boolean, erro?: string): Promise<void> {
    await query(
      `INSERT INTO agente_ia_acoes_log (lead_id, empresa_id, acao, dados, sucesso, erro) VALUES ($1, $2, $3, $4, $5, $6)`,
      [leadId, empresaId, acao, JSON.stringify(dados), sucesso, erro || null]
    );
  },

  /**
   * Instrução do agente REATIVO configurada no estágio (`instrucoes_agente_ia`).
   *
   * É a única fonte de orientação do reativo. Antes ele emprestava a instrução do
   * passo atual da cadência, o que misturava dois assuntos diferentes: a cadência
   * descreve o que ENVIAR sozinho e quando; o reativo precisa saber como RESPONDER
   * quando o lead escreve. Estágio sem instrução → sem orientação de etapa (o
   * agente segue só o prompt base e as instruções gerais da empresa).
   */
  /**
   * Agenda do lead para o prompt do agente REATIVO: tarefas (pendentes e as
   * últimas concluídas) e o próximo follow-up automático já agendado.
   *
   * Sem isso o agente respondia no escuro — não sabia da reunião marcada e, ao ser
   * perguntado "que horas mesmo?", inventava ou criava tarefa duplicada.
   *
   * `tarefas_lead.data_vencimento` é `timestamp without time zone` gravado em UTC
   * (o front manda `toISOString()` e exibe no fuso do navegador). Convertemos para
   * São Paulo aqui para o agente ler a MESMA hora que o vendedor vê na tela.
   */
  async getAgendaLead(leadId: number, empresaId: number, excluirFollowupId?: number | null): Promise<{
    pendentes: any[]; concluidas: any[]; proximoFollowup: any | null;
  }> {
    const FMT = `to_char(data_vencimento AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')`;

    const [pend, conc, fup] = await Promise.all([
      query(
        // hora_definida: no formulário de tarefa a hora vem preenchida com "agora"
        // quando o vendedor escolhe só a data. Nesse caso o horário gravado não quer
        // dizer nada (a hora real costuma estar no título) e o agente não pode
        // anunciá-lo como se fosse combinado.
        `SELECT tipo, titulo, descricao, prioridade, ${FMT} AS quando,
                to_char(data_vencimento AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo',
                        'DD/MM/YYYY') AS quando_data,
                (data_vencimento < NOW()) AS atrasada,
                (ABS(EXTRACT(EPOCH FROM (data_vencimento::time - created_at::time))) > 120)
                  AS hora_definida
           FROM tarefas_lead
          WHERE lead_id = $1 AND empresa_id = $2 AND status = 'pendente'
          ORDER BY data_vencimento ASC LIMIT 10`,
        [leadId, empresaId]
      ),
      query(
        `SELECT tipo, titulo, status, ${FMT} AS quando
           FROM tarefas_lead
          WHERE lead_id = $1 AND empresa_id = $2 AND status <> 'pendente'
          ORDER BY COALESCE(data_conclusao, data_vencimento) DESC LIMIT 5`,
        [leadId, empresaId]
      ),
      query(
        // agendado_para é timestamptz (ao contrário de tarefas_lead): uma conversão só.
        // `excluirFollowupId` tira da lista o follow-up que está sendo gerado AGORA:
        // ele ainda está 'pendente' e apareceria para o próprio agente como "já existe
        // uma mensagem automática programada", contradizendo a mensagem que ele escreve.
        `SELECT to_char(agendado_para AT TIME ZONE 'America/Sao_Paulo',
                        'DD/MM/YYYY HH24:MI') AS quando
           FROM followups_agendados
          WHERE lead_id = $1 AND status = 'pendente'
            AND ($2::int IS NULL OR id <> $2)
          ORDER BY agendado_para ASC LIMIT 1`,
        [leadId, excluirFollowupId ?? null]
      ),
    ]);

    return {
      pendentes: pend.rows,
      concluidas: conc.rows,
      proximoFollowup: fup.rows[0] || null,
    };
  },

  async getInstrucaoReativaEstagio(estagioId: number): Promise<string | null> {
    if (!estagioId) return null;
    const est = await query(
      `SELECT instrucoes_agente_ia FROM estagios_funil WHERE id = $1`,
      [estagioId]
    );
    const instrucao = String(est.rows[0]?.instrucoes_agente_ia || '').trim();
    return instrucao || null;
  },

  buildSystemPrompt(config: AgenteIAConfig, lead: any, estagio: any, estagiosDisponiveis: any[], anotacoes: any[] = [], tags: string[] = [], responsavelNome?: string, instrucaoEstagio?: string | null, agenda?: { pendentes: any[]; concluidas: any[]; proximoFollowup: any | null } | null): string {
    const tomMap: Record<string, string> = {
      formal: 'Use linguagem profissional e respeitosa. Trate pelo nome com "você".',
      casual: 'Seja descontraído, pode usar linguagem informal e gírias leves.',
      amigavel: 'Seja caloroso e próximo, crie conexão genuína sem exagerar na informalidade.'
    };
    const tomDescricao = tomMap[config.tom] || tomMap['amigavel'];
    const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const hoje = agora.toLocaleDateString('pt-BR');
    const horaAgora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const periodoDia = agora.getHours() < 12 ? 'manhã' : agora.getHours() < 18 ? 'tarde' : 'noite';

    const estagiosStr = estagiosDisponiveis
      .map((e: any) => `  - ID ${e.id}: "${e.nome}"${e.is_ganho ? ' (GANHO)' : ''}${e.is_perdido ? ' (PERDIDO)' : ''}`)
      .join('\n');

    const anotacoesStr = renderAnotacoes(anotacoes);

    // Usa o nome do responsável atual do lead; fallback para o nome configurado no agente
    const nomeIdentidade = responsavelNome || config.nome_agente;

    // ── Agenda do lead: tarefas e próximo follow-up (mesmos blocos do follow-up) ──
    const blocos = renderAgenda(agenda);
    const tarefasStr = blocos.tarefas;
    const concluidasStr = blocos.concluidas;

    // Datas do relacionamento (o lead percebe quando o vendedor "esquece" o histórico)
    const dataBR = (v: any) => v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null;
    const leadDesde = dataBR(lead.created_at);
    const ultimaRespostaDele = lead.ultima_resposta_cliente_at
      ? new Date(lead.ultima_resposta_cliente_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : null;
    const valorStr = lead.valor_potencial != null && Number(lead.valor_potencial) > 0
      ? Number(lead.valor_potencial).toLocaleString('pt-BR', { style: 'currency', currency: lead.moeda || 'BRL' })
      : null;

    return `Você é ${nomeIdentidade}${config.area_negocio ? `, da ${config.area_negocio}` : ''}.
Hoje é ${hoje} e agora são ${horaAgora} (${periodoDia}) — horário de Brasília (São Paulo).

COMO ESCREVER:
${tomDescricao}
Escreva como uma pessoa real escreveria no WhatsApp. Mensagens curtas. Sem formatação com asteriscos, listas ou emojis forçados. Sem parágrafos longos. Sem linguagem corporativa.
Nunca comece com: "Olá!", "Entendido!", "Perfeito!", "Claro!", "Com certeza!", "Ótima pergunta!" — essas respostas denunciam um bot.
Evite repetir o nome da pessoa toda hora.
Se cumprimentar, use saudação coerente com o horário atual acima (bom dia até 12h, boa tarde entre 12h e 18h, boa noite após 18h). Nunca invente um período do dia diferente do horário informado.

SOBRE QUEM VOCÊ ESTÁ CONVERSANDO:
- Nome: ${lead.nome}
- Telefone: ${lead.telefone || 'não informado'}
- Email: ${lead.email || 'não informado'}${lead.empresa ? `\n- Empresa: ${lead.empresa}` : ''}${lead.cargo ? `\n- Cargo: ${lead.cargo}` : ''}
- Temperatura: ${lead.temperatura || 'não definida'}
- Estágio no funil: ${estagio?.nome || 'desconhecido'}
- Tags: ${tags.length > 0 ? tags.join(', ') : 'nenhuma'}${lead.origem ? `\n- Como chegou até nós: ${lead.origem}` : ''}${valorStr ? `\n- Valor potencial do negócio: ${valorStr}` : ''}${leadDesde ? `\n- É lead desde: ${leadDesde}` : ''}${ultimaRespostaDele ? `\n- Última vez que ELE respondeu: ${ultimaRespostaDele}` : ''}
- Notas sobre o lead: ${lead.notas || 'nenhuma'}

ANOTAÇÕES DO LEAD (cada linha diz quem a escreveu — vendedor, você, ou um evento automático):
${anotacoesStr}

AGENDA DESTE LEAD — tarefas pendentes (datas e horas em horário de Brasília):
${tarefasStr}

TAREFAS JÁ ENCERRADAS (contexto do que já foi feito):
${concluidasStr}
${blocos.avisoReuniao}${blocos.avisoFollowup}
${instrucaoEstagio ? `COMO RESPONDER NESTE ESTÁGIO (orientação definida para o estágio "${estagio?.nome || '?'}" — siga ao responder, sem copiá-la literalmente):\n${instrucaoEstagio}\n\n` : ''}ESTÁGIOS DO FUNIL — apenas para uso nas ferramentas, nunca mencione ao lead:
${estagiosStr}

${config.system_prompt_extra ? `INSTRUÇÕES GERAIS DO ASSISTENTE:\n${config.system_prompt_extra}\n\n` : ''}REGRAS QUE NUNCA PODEM SER QUEBRADAS:
1. JAMAIS mencione ao lead que criou tarefas, anotações, moveu estágios ou fez qualquer ação no sistema. Essas ações acontecem em silêncio, por baixo dos panos.
2. JAMAIS diga frases como: "Vou registrar isso", "Anotei aqui", "Criei uma tarefa para você", "Movi você para outra etapa", "Agendei no sistema".
3. Use as ferramentas discretamente. A conversa flui normalmente como se fosse entre duas pessoas.
4. Ao confirmar uma reunião, simplesmente confirme o horário de forma natural (ex: "Combinado, sexta às 10h então. Até lá!").
5. Quando o lead fechar dia e horário, chame agendar_reuniao com a data e a hora combinadas (horário de Brasília) — só isso. Ela já registra a reunião e liga os lembretes automáticos; não crie tarefa de reunião à parte nem prometa lembrar depois. Se o lead remarcar, chame agendar_reuniao de novo com o horário novo.
6. Nunca prometa preços, descontos ou condições não confirmadas.
7. Se não souber algo, diga que vai verificar — como qualquer pessoa faria.
8. SEMPRE responda ao lead com uma mensagem de texto, mesmo que curta. Nunca termine o processamento sem enviar uma resposta — mesmo que só vá criar uma anotação interna, ainda assim responda o lead na conversa.`;
  },

  async processarMensagemSeAtivo(
    contatoId: number,
    leadId: number,
    mensagemTexto: string,
    usuarioId: number,
    empresaId: number,
    triggerAt?: Date
  ): Promise<void> {
    // 1. Verificar se agente está ativo para este lead
    const status = await this.getLeadStatus(leadId, empresaId);
    if (!status.ativo) {
      console.log(`[AgenteIA] Lead #${leadId}: agente inativo (fonte: ${status.fonte}) — mensagem ignorada`);
      return;
    }

    // 2. Buscar configuração do agente
    const config = await this.getConfig(empresaId);
    const isGemini = config?.provider === 'gemini';
    const hasKey = isGemini ? !!config?.gemini_api_key : !!config?.api_key;
    if (!config || !config.ativo || !hasKey) {
      // Distingue os três casos: sem linha em agente_ia_config (empresa nunca configurada,
      // situação silenciosa que nenhuma tela mostra), desligada, ou ligada mas sem chave.
      const motivo = !config ? 'empresa sem configuração de agente (agente_ia_config)'
        : !config.ativo ? 'agente desligado na empresa'
        : `sem API key do provedor "${config.provider || 'claude'}"`;
      console.log(`[AgenteIA] Lead #${leadId}: mensagem ignorada — ${motivo} (empresa ${empresaId})`);
      return;
    }

    // 2.5. Guard anti-loop: verificar se o contato é o próprio número da instância WhatsApp.
    // Isso evita que o agente entre em loop ao tentar responder a si mesmo.
    {
      const contatoResult = await query(
        `SELECT cw.numero, u.whatsapp_porta
         FROM contatos_whatsapp cw
         JOIN usuarios u ON u.id = $3
         WHERE cw.id = $1 AND cw.empresa_id = $2`,
        [contatoId, empresaId, usuarioId]
      );
      if (contatoResult.rows.length > 0) {
        const { numero: contatoNumero, whatsapp_porta: porta } = contatoResult.rows[0];
        if (porta) {
          try {
            const infoResp = await axios.get(`http://localhost:${porta}/info`, { timeout: 3000 });
            const instanceNumero: string | undefined = infoResp.data?.info?.number || infoResp.data?.number;
            if (instanceNumero) {
              const norm = (n: string) => { const d = n.replace(/\D/g, ''); return d.startsWith('55') && d.length >= 12 ? d.slice(2) : d; };
              if (norm(contatoNumero) === norm(instanceNumero)) {
                console.warn(`[AgenteIA] Lead #${leadId} tem o mesmo número da instância WhatsApp (${instanceNumero}) — ignorando para evitar loop.`);
                return;
              }
            }
          } catch {
            // Falha ao checar instância: prosseguir normalmente (evitar bloquear operação)
          }
        }
      }
    }

    // 3. Buscar dados do lead e estágio (incluindo nome do responsável atual)
    // `remetente_nome` é o dono do NÚMERO que recebeu a mensagem — é ele quem vai
    // responder (enviarTextoEmPartes usa `usuarioId`) e, portanto, é com ele que o lead
    // pensa que está falando. É essa a identidade do agente. O responsável do lead vem
    // como segunda opção porque nem sempre é quem opera o número: lead da Jéssica que
    // escreve no WhatsApp da Débora era respondido pelo número da Débora assinando
    // "Jéssica".
    const leadResult = await query(
      `SELECT l.*, ef.nome as estagio_nome, ef.is_ganho, ef.is_perdido,
              u.nome as responsavel_nome, uenv.nome as remetente_nome
       FROM leads l
       LEFT JOIN estagios_funil ef ON ef.id = l.estagio_id
       LEFT JOIN usuarios u ON u.id = l.responsavel_id
       LEFT JOIN usuarios uenv ON uenv.id = $3
       WHERE l.id = $1 AND l.empresa_id = $2`,
      [leadId, empresaId, usuarioId]
    );
    const lead = leadResult.rows[0];
    if (!lead) return;

    // 4. Buscar estágios disponíveis no funil
    const estagiosResult = await query(
      `SELECT id, nome, is_ganho, is_perdido, ordem
       FROM estagios_funil WHERE funil_id = $1 ORDER BY ordem ASC`,
      [lead.funil_id]
    );
    const estagiosDisponiveis = estagiosResult.rows;

    // 5. triggerAt define o ponto de corte do contexto e a janela de agregação
    const effectiveTriggerAt = triggerAt ?? new Date(Date.now() - 1000);

    // 5.1. Contexto real da conversa WhatsApp (anterior ao triggerAt — aggregation adiciona o restante)
    const contexto = await this.getContextoHistorico(leadId, config.contexto_mensagens, effectiveTriggerAt, contatoId);

    // 5.2. Anotações do lead
    const anotacoesResult = await query(
      `SELECT conteudo, tipo, origem, created_at FROM anotacoes_lead
       WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [leadId]
    );
    const anotacoes = anotacoesResult.rows;

    // 5.3. Tags do lead
    const tagsResult = await query(
      `SELECT t.nome FROM tags t
       JOIN lead_tags lt ON lt.tag_id = t.id
       WHERE lt.lead_id = $1`,
      [leadId]
    );
    const tags = tagsResult.rows.map((r: any) => r.nome);

    // 6. Instrução do agente REATIVO configurada no estágio em que o lead está.
    const instrucaoEstagio = await this.getInstrucaoReativaEstagio(lead.estagio_id);

    // 6.1. Agenda do lead (tarefas + próximo follow-up) — o agente precisa saber da
    // reunião marcada e do que já está agendado antes de responder.
    const agenda = await this.getAgendaLead(leadId, empresaId);

    // Construir system prompt usando o nome do responsável atual do lead
    const systemPrompt = this.buildSystemPrompt(
      config,
      lead,
      { nome: lead.estagio_nome, is_ganho: lead.is_ganho, is_perdido: lead.is_perdido },
      estagiosDisponiveis,
      anotacoes,
      tags,
      lead.remetente_nome || lead.responsavel_nome || undefined,
      instrucaoEstagio,
      agenda
    );

    // 7. Resolver cliente vinculado ao lead (por telefone)
    let clienteId: number | null = null;
    if (lead.telefone) {
      const clienteResult = await query(
        `SELECT id FROM clientes WHERE usuario_id = $1 AND telefone = $2 LIMIT 1`,
        [usuarioId, lead.telefone]
      );
      clienteId = clienteResult.rows[0]?.id || null;
    }

    // 8. Contexto do lead para execução das ferramentas
    const toolCtx: ToolContext = {
      leadId,
      contatoId,
      usuarioId,
      empresaId,
      clienteId,
      lead,
      estagios: estagiosDisponiveis
    };

    // 9. Após o delay, coletar TODAS as mensagens que chegaram desde triggerAt e unificá-las
    // (por CONTATO: a entrada pode estar gravada no lead de outro funil do mesmo contato)
    const msgsPendentes = await query(
      `SELECT conteudo FROM historico_mensagens
       WHERE (contato_whatsapp_id = $3 OR lead_id = $1)
         AND grupo_whatsapp_id IS NULL
         AND direcao = 'entrada' AND tipo = 'texto'
         AND conteudo IS NOT NULL AND conteudo != ''
         AND created_at >= $2
       ORDER BY created_at ASC`,
      [leadId, effectiveTriggerAt, contatoId]
    );
    const mensagemFinal = msgsPendentes.rows.length > 0
      ? msgsPendentes.rows.map((r: any) => r.conteudo).join('\n\n')
      : mensagemTexto;
    if (msgsPendentes.rows.length > 1) {
      console.log(`[AgenteIA] Lead #${leadId}: ${msgsPendentes.rows.length} mensagens agregadas em uma única resposta`);
    }

    // 9.5. Guard anti-duplicação: se houve mensagem saída (humano ou outro processo)
    // durante a janela do delay, abortar para evitar dupla resposta.
    // `erro IS NULL`: só saída BEM-SUCEDIDA conta como "alguém já respondeu". A linha
    // de falha (o balão vermelho de um 422/500) é registro de tentativa, não de
    // resposta — e sem este filtro ela abortava o turno do agente, deixando o lead
    // sem resposta exatamente quando o envio anterior tinha falhado.
    const respHumanoCheck = await query(
      `SELECT id FROM historico_mensagens
       WHERE (contato_whatsapp_id = $3 OR lead_id = $1)
         AND grupo_whatsapp_id IS NULL
         AND direcao = 'saida' AND erro IS NULL AND created_at > $2 LIMIT 1`,
      [leadId, effectiveTriggerAt, contatoId]
    );
    if (respHumanoCheck.rows.length > 0) {
      console.log(`[AgenteIA] Lead #${leadId}: já houve resposta saída durante o delay — agente abortado para evitar duplicação`);
      await this.logarAcao(leadId, empresaId, 'skip_humano_respondeu', { mensagem: mensagemFinal.substring(0, 200) }, true);
      return;
    }

    // 8. Processar mensagem com o provedor configurado
    let finalText = '';
    const deadline = Date.now() + 120_000; // deadline de 2 minutos para o loop agentic
    // Marca se alguma ferramenta já rodou neste turno. Ferramenta tem efeito colateral
    // (cria tarefa, move estágio, marca perdido) e não é idempotente: se a API falhar
    // DEPOIS de uma delas, re-tentar o turno duplicaria a ação. Só re-tentamos falha
    // transitória que aconteceu antes de qualquer ferramenta.
    let ferramentaExecutada = false;

    try {
      if (config.provider === 'gemini' && config.gemini_api_key) {
        // Gemini — agentic loop com function calling
        const GEMINI_FUNCTION_DECLARATIONS = TOOL_DEFINITIONS.map((t: any) => ({
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        }));

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${config.modelo || 'gemini-2.5-flash'}:generateContent?key=${config.gemini_api_key}`;
        const contents: any[] = [
          ...contexto.map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          { role: 'user', parts: [{ text: mensagemFinal }] },
        ];

        const MAX_ITER = 10;
        for (let i = 0; i < MAX_ITER; i++) {
          if (Date.now() > deadline) {
            console.warn(`[AgenteIA] Deadline de 2min atingido no loop Gemini para lead #${leadId}`);
            break;
          }
          const geminiResp = await axios.post(
            geminiUrl,
            {
              contents,
              systemInstruction: { parts: [{ text: systemPrompt }] },
              tools: [{ functionDeclarations: GEMINI_FUNCTION_DECLARATIONS }],
              generationConfig: { maxOutputTokens: config.max_tokens, temperature: 0.7 },
            },
            { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
          );

          const candidate = geminiResp.data?.candidates?.[0];
          const parts: any[] = candidate?.content?.parts || [];
          contents.push({ role: 'model', parts });

          const funcCallPart = parts.find((p: any) => p.functionCall);
          if (funcCallPart) {
            const { name, args } = funcCallPart.functionCall;
            console.log(`[AgenteIA] Gemini executando ferramenta: ${name}`, args);
            ferramentaExecutada = true;
            const resultado = await executarFerramenta(name, args, toolCtx);
            await this.logarAcao(leadId, empresaId, name, args, resultado.sucesso, resultado.erro);
            contents.push({
              role: 'function',
              parts: [{ functionResponse: { name, response: { result: JSON.stringify(resultado.dados ?? resultado.erro ?? 'sem dados') } } }],
            });
            continue;
          }

          finalText = (parts.find((p: any) => p.text)?.text || '').trim();
          break;
        }
      } else {
        // Claude — agentic loop com tool_use nativo.
        // timeout explícito: o padrão do SDK é 10min, e uma chamada pendurada segurava um
        // dos 3 slots do worker sem o deadline de 2min (checado só ENTRE iterações) notar.
        const anthropic = new Anthropic({ apiKey: config.api_key!, timeout: TIMEOUT_PROVEDOR_MS, maxRetries: 1 });

        const messages: any[] = [
          ...contexto,
          { role: 'user', content: mensagemFinal }
        ];

        const MAX_ITERATIONS = 10;
        for (let i = 0; i < MAX_ITERATIONS; i++) {
          if (Date.now() > deadline) {
            console.warn(`[AgenteIA] Deadline de 2min atingido no loop Claude para lead #${leadId}`);
            break;
          }
          const response = await anthropic.messages.create({
            model: config.modelo || 'claude-sonnet-4-6',
            max_tokens: config.max_tokens,
            system: systemPrompt,
            tools: TOOL_DEFINITIONS,
            messages
          });

          if (response.stop_reason === 'end_turn') {
            finalText = response.content
              .filter((b: any) => b.type === 'text')
              .map((b: any) => b.text)
              .join('');
            break;
          }

          if (response.stop_reason === 'tool_use') {
            messages.push({ role: 'assistant', content: response.content });
            const toolResults: any[] = [];
            for (const block of response.content) {
              if (block.type === 'tool_use') {
                console.log(`[AgenteIA] Executando ferramenta: ${block.name}`, block.input);
                ferramentaExecutada = true;
                const resultado = await executarFerramenta(block.name, block.input, toolCtx);
                await this.logarAcao(leadId, empresaId, block.name, block.input, resultado.sucesso, resultado.erro);
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: JSON.stringify(resultado.dados ?? resultado.erro ?? 'sem dados')
                });
              }
            }
            messages.push({ role: 'user', content: toolResults });
            continue;
          }

          console.warn(`[AgenteIA] stop_reason inesperado: ${response.stop_reason}`);
          break;
        }
      }
    } catch (err: any) {
      console.error(`[AgenteIA] Erro no agentic loop:`, err.message);
      await this.logarAcao(leadId, empresaId, 'erro_api', { mensagem: mensagemFinal }, false, err.message);
      // Erro transitório (429, 5xx, timeout de rede) antes de qualquer ferramenta: relança
      // para a fila re-tentar com backoff. Antes o lead simplesmente ficava sem resposta —
      // só no histórico havia 34 casos de 429 e 8 de 503 sem nenhum retry.
      // Depois de uma ferramenta ter rodado, NÃO relança: repetir o turno recriaria tarefa,
      // moveria estágio de novo etc. Erro permanente (saldo, credencial, 400) também não
      // relança — re-tentar só queimaria o job e poluiria o log.
      if (!ferramentaExecutada && ehErroTransitorio(err)) throw err;
      return;
    }

    // 10. Enviar resposta final ao lead via WhatsApp (mensagem fica em historico_mensagens
    // e o próximo turno lê de lá via getContextoHistorico — não precisa salvar em agente_ia_contexto).
    if (!finalText.trim()) {
      console.warn(`[AgenteIA] Lead #${leadId}: ${config.provider || 'IA'} não retornou texto final. Mensagem recebida: "${mensagemFinal.substring(0, 80)}".`);
    } else {
      try {
        // Blocos separados por linha em branco saem como mensagens separadas.
        await enviarTextoEmPartes(usuarioId, empresaId, contatoId, finalText, leadId);
      } catch (err: any) {
        // Falha de envio NÃO relança: o primeiro bloco pode já ter saído, e re-tentar o job
        // mandaria a resposta inteira de novo (mensagem duplicada para o lead). Fica o
        // registro de falha no log de ações e no log do processo.
        console.error(`[AgenteIA] Lead #${leadId}: falha ao enviar a resposta pelo WhatsApp:`, err.message);
        await this.logarAcao(leadId, empresaId, 'responder', { mensagem: finalText }, false, err.message);
        return;
      }
      await this.logarAcao(leadId, empresaId, 'responder', { mensagem: finalText }, true);
    }
  },

  // ─── Follow-up Agendado via Agente IA ────────────────────────────────────────

  /**
   * Prompt do follow-up AGENDADO.
   *
   * Recebe o mesmo contexto que o agente reativo — instrução do estágio, agenda do lead
   * (reunião marcada inclusive), anotações com origem e os dados do lead —, além da
   * instrução do passo da cadência. Antes ele só via nome/telefone/estágio e a instrução
   * do passo: escrevia sem saber da reunião já marcada e podia propor outro horário por
   * cima dela, ou repetir pergunta que o lead já tinha respondido.
   */
  buildSystemPromptFollowUp(
    config: AgenteIAConfig,
    lead: any,
    estagio: any,
    instrucaoExtra: string | null,
    anotacoes: any[],
    tags: string[],
    responsavelNome?: string,
    instrucaoEstagio?: string | null,
    agenda?: { pendentes: any[]; concluidas: any[]; proximoFollowup: any | null } | null
  ): string {
    const tomMap: Record<string, string> = {
      formal: 'Use linguagem profissional e respeitosa. Trate pelo nome com "você".',
      casual: 'Seja descontraído, pode usar linguagem informal e gírias leves.',
      amigavel: 'Seja caloroso e próximo, crie conexão genuína sem exagerar na informalidade.'
    };
    const tomDescricao = tomMap[config.tom] || tomMap['amigavel'];

    const anotacoesStr = renderAnotacoes(anotacoes);
    const blocos = renderAgenda(agenda);

    const tagsStr = tags.length > 0 ? tags.join(', ') : 'nenhuma';

    // Datas do relacionamento — o lead percebe quando "esquecem" o histórico dele.
    const dataBR = (v: any) => v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null;
    const leadDesde = dataBR(lead.created_at);
    const ultimaRespostaDele = lead.ultima_resposta_cliente_at
      ? new Date(lead.ultima_resposta_cliente_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : null;
    const valorStr = lead.valor_potencial != null && Number(lead.valor_potencial) > 0
      ? Number(lead.valor_potencial).toLocaleString('pt-BR', { style: 'currency', currency: lead.moeda || 'BRL' })
      : null;
    const nomeIdentidade = responsavelNome || config.nome_agente;
    const agoraSP = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const hoje = agoraSP.toLocaleDateString('pt-BR');
    const horaAgora = agoraSP.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const periodoDia = agoraSP.getHours() < 12 ? 'manhã' : agoraSP.getHours() < 18 ? 'tarde' : 'noite';

    return `Você é ${nomeIdentidade}${config.area_negocio ? `, da ${config.area_negocio}` : ''}.
Hoje é ${hoje} e agora são ${horaAgora} (${periodoDia}) — horário de Brasília (São Paulo).

COMO ESCREVER:
${tomDescricao}
Escreva como uma pessoa real escreveria no WhatsApp. Mensagens curtas. Sem formatação com asteriscos, listas ou emojis forçados. Sem parágrafos longos.
Nunca comece com: "Olá!", "Entendido!", "Perfeito!", "Claro!", "Com certeza!" — essas respostas denunciam um bot.
Se cumprimentar, use saudação coerente com o horário atual acima (bom dia até 12h, boa tarde entre 12h e 18h, boa noite após 18h). Nunca invente um período do dia diferente do horário informado.
Não use aberturas carentes ou robóticas ("eu de novo", "haha", "passou um tempinho desde sua última mensagem") nem estique vogais do nome ("Fulanoooo"). Não repita perguntas que o lead já respondeu.
Se em algum momento o lead pediu para falar em outro horário ou dia (ex.: "me chama à noite", "quarta-feira"), respeite o combinado: não antecipe e não escreva como se o momento marcado já tivesse chegado.

SOBRE QUEM VOCÊ ESTÁ ESCREVENDO:
- Nome: ${lead.nome}
- Empresa: ${lead.lead_empresa || lead.empresa || 'não informada'}
- Cargo: ${lead.cargo || 'não informado'}
- Telefone: ${lead.lead_telefone || lead.telefone || 'não informado'}
- Email: ${lead.lead_email || lead.email || 'não informado'}
- Temperatura: ${lead.lead_temperatura || lead.temperatura || 'não definida'}
- Estágio no funil: ${estagio?.nome || estagio?.estagio_nome || 'desconhecido'}
- Tags: ${tagsStr}${lead.origem ? `\n- Como chegou até nós: ${lead.origem}` : ''}${valorStr ? `\n- Valor potencial do negócio: ${valorStr}` : ''}${leadDesde ? `\n- É lead desde: ${leadDesde}` : ''}${ultimaRespostaDele ? `\n- Última vez que ELE respondeu: ${ultimaRespostaDele}` : ''}
- Notas internas: ${lead.lead_notas || lead.notas || 'nenhuma'}

ANOTAÇÕES DO LEAD (cada linha diz quem a escreveu — vendedor, você, ou um evento automático):
${anotacoesStr}

AGENDA DESTE LEAD — tarefas pendentes (datas e horas em horário de Brasília):
${blocos.tarefas}

TAREFAS JÁ ENCERRADAS (contexto do que já foi feito):
${blocos.concluidas}
${blocos.avisoReuniao}${blocos.avisoFollowup}
HISTÓRICO RECENTE DA CONVERSA está nas mensagens abaixo.

${instrucaoEstagio ? `COMO AGIR NESTE ESTÁGIO (orientação definida para o estágio "${estagio?.nome || estagio?.estagio_nome || '?'}" — siga, sem copiá-la literalmente):\n${instrucaoEstagio}\n\n` : ''}${instrucaoExtra ? `INSTRUÇÃO ESPECÍFICA PARA ESTE FOLLOW-UP:\n${instrucaoExtra}\n\n` : ''}${config.system_prompt_extra ? `INSTRUÇÕES GERAIS DO ASSISTENTE:\n${config.system_prompt_extra}\n\n` : ''}SUA TAREFA:
Escreva uma mensagem de follow-up natural para este lead, levando em conta TUDO que você sabe sobre ele — a conversa, as anotações e o contexto geral.
- Seja específico ao contexto, não genérico
- Mensagem curta, com propósito claro
- Se há reunião marcada, trate-a como combinada: nunca proponha outro horário nem peça para remarcar por conta própria
- Jamais mencione CRM, tarefas, sistemas ou automação`;
  },

  async processarFollowUpIA(followup: any): Promise<'enviado' | 'adiado' | 'cancelado' | 'pausado' | 'config_ausente'> {
    const leadId = followup.lead_id;
    const usuarioId = followup.usuario_id;
    const empresaId = followup.empresa_id;

    // Follow-ups manuais (origem='lead'): só cancelar se há override EXPLÍCITO de false no lead.
    // Follow-ups de estágio (origem='estagio'): cancelar se agente não está ativo por nenhuma fonte.
    const leadStatus = await this.getLeadStatus(leadId, empresaId);
    const deveCancelar = followup.origem === 'estagio'
      ? !leadStatus.ativo
      : (leadStatus.fonte === 'lead' && !leadStatus.ativo);
    if (deveCancelar) {
      console.log(`[AgenteIA] Follow-up #${followup.id}: agente desabilitado para lead #${leadId} (${leadStatus.fonte}) — cancelado`);
      return 'cancelado';
    }

    const config = await this.getConfig(empresaId);
    const isGemini = config?.provider === 'gemini';
    const hasKey = isGemini ? !!config?.gemini_api_key : !!config?.api_key;
    // Duas situações diferentes, dois desfechos diferentes.
    //
    // SEM LINHA em agente_ia_config: a empresa nunca configurou agente nenhum. Não há
    // o que "voltar a ligar", então adiar é churn puro — a empresa 32 tinha 66
    // follow-ups nesse estado, um sendo adiado por minuto, todo dia, sem nada na tela.
    // Devolve 'config_ausente' e o motor transforma em falha explícita e reagendável.
    //
    // AGENTE DESLIGADO ou SEM KEY: estado transitório de verdade — alguém desligou e
    // pode religar hoje. Segue 'pausado' (adia, não queima tentativa). Antes disso
    // lançava erro e o follow-up virava 'falhou': desligar o agente pela interface
    // destruía silenciosamente a fila de IA inteira da empresa.
    if (!config) {
      console.error(`[AgenteIA] Follow-up #${followup.id}: empresa ${empresaId} sem agente_ia_config — falha explícita (config_ausente)`);
      return 'config_ausente';
    }
    if (!config.ativo || !hasKey) {
      const motivo = !config.ativo ? 'agente desligado na empresa'
        : `sem API key do provedor "${config.provider || 'claude'}"`;
      console.warn(`[AgenteIA] Follow-up #${followup.id}: pausado — ${motivo} (empresa ${empresaId})`);
      return 'pausado';
    }

    // Anti-atropelo: adia se o LEAD falou há pouco — mesma regra do ramo manual,
    // agora em `_shared/conversa.ts`.
    //
    // Até 25/08/2026 esta consulta olhava QUALQUER mensagem dos últimos 60min,
    // inclusive as NOSSAS. Isso era um segundo teto de ritmo — "um toque por hora" —
    // que ninguém configurou e que valia só para o ramo de IA: como a tela propõe o
    // passo seguinte da cadência em 10 MINUTOS (`passoNovo()`), todo passo curto de IA
    // era empurrado 15 min por vez até fechar 60 min do envio anterior. Quem governa o
    // ritmo é a cadência (horário do passo) + o espaçamento anti-ban por chip; nossa
    // própria mensagem não pode bloquear o passo que o administrador desenhou.
    if (await leadFalouRecentemente(leadId, followup.contato_whatsapp_id)) {
      console.log(`[AgenteIA] Follow-up #${followup.id}: o lead falou nos últimos ${SILENCIO_APOS_LEAD_MIN}min — adiado`);
      return 'adiado';
    }

    // Contexto real da conversa via historico_mensagens (inclui tudo antes da ativação do agente)
    const contexto = await this.getContextoHistorico(leadId, config.contexto_mensagens, undefined, followup.contato_whatsapp_id ?? null);

    // Buscar anotações do lead
    const anotacoesResult = await query(
      `SELECT conteudo, tipo, origem, created_at FROM anotacoes_lead
       WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [leadId]
    );
    const anotacoes = anotacoesResult.rows;

    // Buscar tags do lead
    const tagsResult = await query(
      `SELECT t.nome FROM tags t
       JOIN lead_tags lt ON lt.tag_id = t.id
       WHERE lt.lead_id = $1`,
      [leadId]
    );
    const tags = tagsResult.rows.map((r: any) => r.nome);

    // Lead COMPLETO. O registro que o scheduler carrega traz só um subconjunto
    // (`l.nome as lead_nome`, sem origem/valor/datas) — e o prompt lia `lead.nome`,
    // que nesse formato nem existe: saía "Nome: undefined" para todo follow-up de IA.
    // Quem envia é o responsável do lead; sem responsável, o usuário do follow-up.
    // A identidade do agente é o NOME DE QUEM ENVIA — assinar com outro nome faria o lead
    // receber uma mensagem de um número se apresentando como outra pessoa.
    const remetenteResult = await query(
      `SELECT l.*, COALESCE(l.responsavel_id, $2) AS remetente_id, u.nome AS remetente_nome
         FROM leads l
         LEFT JOIN usuarios u ON u.id = COALESCE(l.responsavel_id, $2)
        WHERE l.id = $1`,
      [leadId, usuarioId]
    );
    const leadRow = remetenteResult.rows[0];
    const responsavelNome: string | undefined = leadRow?.remetente_nome || undefined;
    const remetenteId: number = leadRow?.remetente_id || usuarioId;
    // O registro do follow-up entra primeiro para o lead fresco do banco prevalecer.
    const leadCompleto = { ...followup, ...(leadRow || {}) };

    // Orientação do ESTÁGIO em que o lead está (a mesma que o agente reativo usa) e
    // agenda do lead — reunião marcada, tarefas pendentes e o que já foi feito.
    // Sem os dois, o follow-up escrevia às cegas.
    const [instrucaoEstagio, agenda] = await Promise.all([
      this.getInstrucaoReativaEstagio(followup.estagio_id ?? leadRow?.estagio_id),
      this.getAgendaLead(leadId, empresaId, followup.id),
    ]);

    // Montar estagio info
    const estagio = {
      nome: followup.estagio_nome,
    };

    const systemPrompt = this.buildSystemPromptFollowUp(
      config, leadCompleto, estagio, followup.instrucao_ia, anotacoes, tags, responsavelNome,
      instrucaoEstagio, agenda
    );

    let texto = '';

    // A conversa enviada ao modelo precisa terminar com um turno do usuário. Num
    // follow-up a última mensagem costuma ser a nossa (saída = 'assistant'), pois o
    // follow-up dispara justamente quando o lead ficou em silêncio. Modelos recentes
    // não aceitam "prefill" de assistant, então anexamos um turno de usuário pedindo
    // a mensagem — vale para Claude e Gemini.
    const conversa: { role: 'user' | 'assistant'; content: string }[] =
      contexto.length > 0 ? [...contexto] : [];
    if (conversa.length === 0 || conversa[conversa.length - 1].role === 'assistant') {
      conversa.push({ role: 'user', content: '(Escreva agora a mensagem de follow-up para este lead.)' });
    }

    // Toda falha do PROVEDOR sai daqui carimbada com origem 'ia'. É o que permite ao
    // scheduler distinguir um 403 de credencial/saldo (pausa a empresa) de um 403 do
    // WhatsApp (chip bloqueado), que têm o mesmo código e destinos opostos.
    try {
      if (config.provider === 'gemini' && config.gemini_api_key) {
        const contents = conversa.map((m: any) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));
        const geminiResp = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${config.modelo || 'gemini-2.5-flash'}:generateContent?key=${config.gemini_api_key}`,
          {
            contents,
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { maxOutputTokens: Math.min(config.max_tokens, 512), temperature: 0.75 },
          },
          { headers: { 'Content-Type': 'application/json' }, timeout: TIMEOUT_PROVEDOR_MS }
        );
        texto = (geminiResp.data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      } else {
        // timeout explícito: o padrão do SDK é 10 MINUTOS. Uma chamada pendurada segurava
        // o ciclo inteiro do scheduler (que roda com trava de não-sobreposição) — ou seja,
        // um follow-up travava a fila de TODAS as empresas. Mesmo valor do agente reativo.
        const anthropic = new Anthropic({
          apiKey: config.api_key!, timeout: TIMEOUT_PROVEDOR_MS, maxRetries: 1,
        });
        const response = await anthropic.messages.create({
          model: config.modelo || 'claude-sonnet-4-6',
          max_tokens: Math.min(config.max_tokens, 512),
          system: systemPrompt,
          messages: conversa,
        });
        texto = response.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('')
          .trim();
      }
    } catch (err: any) {
      throw marcarOrigemErro(err, 'ia');
    }

    if (!texto) throw new Error('IA não retornou nenhuma mensagem');

    // Enviar a mensagem — não salva em agente_ia_contexto pois o histórico já fica em
    // historico_mensagens e o próximo follow-up/reativo lê de lá via getContextoHistorico.
    // Blocos separados por linha em branco saem como mensagens separadas.
    // Lança em falha de envio — senão o follow-up seria marcado como enviado com o WhatsApp falhando.
    await enviarTextoEmPartes(
      remetenteId, empresaId, followup.contato_whatsapp_id, texto, leadId, 'followup'
    );
    await this.logarAcao(leadId, empresaId, 'followup_ia', { texto, followup_id: followup.id }, true);

    // Registrar anotação no lead para rastreabilidade no CRM
    try {
      // origem 'sistema': fica no histórico (é rastreabilidade), mas o prompt a rotula
      // como evento automático — antes o agente relia as próprias mensagens como se
      // fossem observações escritas por um vendedor.
      await anotacoesService.create(empresaId, usuarioId, {
        lead_id: leadId,
        conteudo: `Follow-up automático enviado: "${texto.substring(0, 200)}${texto.length > 200 ? '...' : ''}"`,
        tipo: 'nota',
        origem: 'sistema'
      });
    } catch (e: any) {
      console.warn(`[AgenteIA] Follow-up #${followup.id}: erro ao criar anotação:`, e.message);
    }

    return 'enviado';
  },
};

// ============================================================================
// Sincronização com tabela unificada `automacoes`
// Idempotente: cria automação se não existir, atualiza se existir
// ============================================================================
async function sincronizarAutomacaoLead(leadId: number, empresaId: number, ativo: boolean | null): Promise<void> {
  // ativo = null significa "voltar a herdar do estágio" → remover override
  if (ativo === null) {
    await query(
      `DELETE FROM automacoes
       WHERE lead_id = $1 AND tipo_acao = 'ativar_agente_lead' AND empresa_id = $2`,
      [leadId, empresaId]
    );
    return;
  }

  const existente = await query(
    `SELECT id FROM automacoes
     WHERE lead_id = $1 AND tipo_acao = 'ativar_agente_lead' AND empresa_id = $2`,
    [leadId, empresaId]
  );

  if (existente.rows[0]) {
    await query(
      `UPDATE automacoes SET ativa = $1 WHERE id = $2`,
      [ativo, existente.rows[0].id]
    );
    return;
  }

  const ctx = await query(
    `SELECT nome, usuario_id FROM leads WHERE id = $1 AND empresa_id = $2`,
    [leadId, empresaId]
  );
  if (!ctx.rows[0]) return;

  await query(
    `INSERT INTO automacoes (
       empresa_id, usuario_id, nome, descricao, tipo_acao,
       lead_id, ativa, config
     ) VALUES ($1, $2, $3, $4, 'ativar_agente_lead', $5, $6, $7)`,
    [
      empresaId,
      ctx.rows[0].usuario_id,
      `Agente IA — Lead ${ctx.rows[0].nome}`,
      'Override individual do agente IA para este lead',
      leadId,
      ativo,
      JSON.stringify({ override_estagio: true })
    ]
  );
}
