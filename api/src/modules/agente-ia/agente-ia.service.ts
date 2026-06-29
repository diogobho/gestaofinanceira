import Anthropic from '@anthropic-ai/sdk';
import { Tool } from '@anthropic-ai/sdk/resources/messages';
import axios from 'axios';
import { query } from '../../config/database';
import { contatosService } from '../crm/contatos/contatos.service';
import { leadsService } from '../crm/leads/leads.service';
import { tarefasService } from '../crm/tarefas/tarefas.service';
import { anotacoesService } from '../crm/anotacoes/anotacoes.service';
import { sessoesService } from '../sessoes/sessoes.service';
import { clientesService } from '../clientes/clientes.service';
import { receitasService } from '../receitas/receitas.service';
import { despesasService } from '../despesas/despesas.service';

// Lock para evitar processamento concorrente do mesmo lead

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
    description: 'Cria uma tarefa/atividade vinculada ao lead atual no CRM. Use para agendar ligações, reuniões, follow-ups, propostas, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tipo: {
          type: 'string',
          enum: ['ligacao', 'reuniao', 'email', 'follow_up', 'proposta', 'visita', 'outros'],
          description: 'Tipo da tarefa'
        },
        titulo: { type: 'string', description: 'Título da tarefa' },
        descricao: { type: 'string', description: 'Descrição opcional da tarefa' },
        data_vencimento: { type: 'string', description: 'Data de vencimento no formato YYYY-MM-DD' },
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
    name: 'criar_sessao',
    description: 'Agenda uma sessão ou reunião no módulo financeiro do sistema. Use quando o lead confirmar uma reunião ou sessão de trabalho. NÃO precisa informar cliente_id — ele é resolvido automaticamente pelo sistema.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tipo_sessao: { type: 'string', description: 'Tipo da sessão (ex: reuniao, consultoria, coaching, apresentacao)' },
        titulo: { type: 'string', description: 'Título da sessão' },
        data: { type: 'string', description: 'Data da sessão no formato YYYY-MM-DD' },
        horario: { type: 'string', description: 'Horário da sessão no formato HH:MM' },
        duracao_minutos: { type: 'number', description: 'Duração da sessão em minutos' },
        modalidade: { type: 'string', enum: ['online', 'presencial'], description: 'Modalidade da sessão' },
        plataforma: { type: 'string', description: 'Plataforma online (ex: Google Meet, Zoom, Teams)' },
        link_sessao: { type: 'string', description: 'Link da reunião online' },
        descricao: { type: 'string', description: 'Descrição ou pauta da sessão' }
      },
      required: ['tipo_sessao', 'data', 'horario', 'duracao_minutos']
    }
  },
  {
    name: 'listar_sessoes',
    description: 'Lista as sessões agendadas no módulo financeiro',
    input_schema: {
      type: 'object' as const,
      properties: {
        data_ini: { type: 'string', description: 'Data inicial no formato YYYY-MM-DD' },
        data_fim: { type: 'string', description: 'Data final no formato YYYY-MM-DD' }
      }
    }
  },

  // ── Clientes ──────────────────────────────────────────────────────────────
  {
    name: 'listar_clientes',
    description: 'Lista os clientes cadastrados no módulo financeiro',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', description: 'Filtrar por status do cliente' }
      }
    }
  },
  {
    name: 'buscar_cliente',
    description: 'Busca um cliente específico pelo ID no módulo financeiro',
    input_schema: {
      type: 'object' as const,
      properties: {
        cliente_id: { type: 'number', description: 'ID do cliente' }
      },
      required: ['cliente_id']
    }
  },

  // ── Financeiro ────────────────────────────────────────────────────────────
  {
    name: 'criar_receita',
    description: 'Registra uma receita ou recebimento no módulo financeiro',
    input_schema: {
      type: 'object' as const,
      properties: {
        descricao: { type: 'string', description: 'Descrição da receita' },
        valor: { type: 'number', description: 'Valor em R$' },
        data: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
        fonte: { type: 'string', description: 'Fonte da receita (ex: venda, serviço, consultoria)' },
        tipo_pagamento: { type: 'string', enum: ['a_vista', 'parcelado'], description: 'Forma de pagamento' },
        status: { type: 'string', enum: ['pendente', 'pago'], description: 'Status do pagamento' },
        cliente_id: { type: 'number', description: 'ID do cliente vinculado (opcional)' },
        numero_parcelas: { type: 'number', description: 'Número de parcelas (se parcelado)' }
      },
      required: ['descricao', 'valor', 'data']
    }
  },
  {
    name: 'listar_receitas',
    description: 'Lista receitas registradas no módulo financeiro',
    input_schema: {
      type: 'object' as const,
      properties: {
        data_ini: { type: 'string', description: 'Data inicial no formato YYYY-MM-DD' },
        data_fim: { type: 'string', description: 'Data final no formato YYYY-MM-DD' },
        status: { type: 'string', enum: ['pendente', 'pago'] }
      }
    }
  },
  {
    name: 'criar_despesa',
    description: 'Registra uma despesa ou gasto no módulo financeiro',
    input_schema: {
      type: 'object' as const,
      properties: {
        descricao: { type: 'string', description: 'Descrição da despesa' },
        valor: { type: 'number', description: 'Valor em R$' },
        data: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
        categoria: { type: 'string', description: 'Categoria da despesa (ex: marketing, software, pessoal)' },
        tipo_pagamento: { type: 'string', enum: ['a_vista', 'parcelado'] },
        status: { type: 'string', enum: ['pendente', 'pago'] }
      },
      required: ['descricao', 'valor', 'data']
    }
  },
  {
    name: 'listar_despesas',
    description: 'Lista despesas registradas no módulo financeiro',
    input_schema: {
      type: 'object' as const,
      properties: {
        data_ini: { type: 'string', description: 'Data inicial no formato YYYY-MM-DD' },
        data_fim: { type: 'string', description: 'Data final no formato YYYY-MM-DD' },
        status: { type: 'string', enum: ['pendente', 'pago'] }
      }
    }
  },

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
        const tarefa = await tarefasService.create(ctx.empresaId, ctx.usuarioId, {
          lead_id: ctx.leadId,
          tipo: input.tipo,
          titulo: input.titulo,
          descricao: input.descricao,
          data_vencimento: new Date(input.data_vencimento),
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
          tipo: input.tipo || 'nota'
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

      // ── Sessões ───────────────────────────────────────────────────────────
      case 'criar_sessao': {
        // Resolver cliente_id: usa o vinculado ao lead, ou cria um novo
        let clienteId = ctx.clienteId;
        if (!clienteId) {
          // Tenta criar cliente a partir dos dados do lead
          const novoCliente = await clientesService.create({
            usuario_id: ctx.usuarioId,
            nome: ctx.lead.nome,
            telefone: ctx.lead.telefone || null,
            email: ctx.lead.email || null,
            status: 'ativo'
          });
          clienteId = novoCliente.id;
        }
        const sessao = await sessoesService.create({
          usuario_id: ctx.usuarioId,
          mentor_id: ctx.usuarioId,
          cliente_id: clienteId,
          tipo_sessao: input.tipo_sessao,
          titulo: input.titulo || input.tipo_sessao,
          data: input.data,
          horario: input.horario,
          duracao_minutos: input.duracao_minutos,
          modalidade: input.modalidade || 'online',
          plataforma: input.plataforma || null,
          link_sessao: input.link_sessao || null,
          descricao: input.descricao || null,
          notas_internas: `Criado pelo agente IA — lead ID ${ctx.leadId}`
        });
        return { sucesso: true, dados: { id: sessao.id, titulo: sessao.titulo, data: sessao.data, horario: sessao.horario, modalidade: sessao.modalidade } };
      }

      case 'listar_sessoes': {
        const filters: any = { usuario_id: ctx.usuarioId };
        if (input.data_ini) filters.data_ini = input.data_ini;
        if (input.data_fim) filters.data_fim = input.data_fim;
        const resultado = await sessoesService.list(filters, 1, 20);
        return { sucesso: true, dados: resultado.data || resultado };
      }

      // ── Clientes ──────────────────────────────────────────────────────────
      case 'listar_clientes': {
        const filters: any = { usuario_id: ctx.usuarioId };
        if (input.status) filters.status = input.status;
        const clientes = await clientesService.list(filters);
        return {
          sucesso: true,
          dados: (Array.isArray(clientes) ? clientes : (clientes as any).data || []).slice(0, 30).map((c: any) => ({
            id: c.id, nome: c.nome, email: c.email, telefone: c.telefone, status: c.status
          }))
        };
      }

      case 'buscar_cliente': {
        const cliente = await clientesService.getById(String(input.cliente_id), { usuario_id: ctx.usuarioId });
        if (!cliente) return { sucesso: false, dados: null, erro: 'Cliente não encontrado' };
        return { sucesso: true, dados: { id: cliente.id, nome: cliente.nome, email: cliente.email, telefone: cliente.telefone, status: cliente.status } };
      }

      // ── Financeiro ────────────────────────────────────────────────────────
      case 'criar_receita': {
        const receita = await receitasService.create({
          usuario_id: ctx.usuarioId,
          descricao: input.descricao,
          valor: input.valor,
          data: input.data,
          fonte: input.fonte || null,
          tipo_pagamento: input.tipo_pagamento || 'a_vista',
          status: input.status || 'pendente',
          cliente_id: input.cliente_id || null,
          numero_parcelas: input.numero_parcelas || null
        });
        return { sucesso: true, dados: { id: receita.id, descricao: receita.descricao, valor: receita.valor, status: receita.status } };
      }

      case 'listar_receitas': {
        const filters: any = { usuario_id: ctx.usuarioId };
        if (input.data_ini) filters.data_ini = input.data_ini;
        if (input.data_fim) filters.data_fim = input.data_fim;
        if (input.status) filters.status = input.status;
        const resultado = await receitasService.list(filters, 1, 20);
        return { sucesso: true, dados: resultado.data || resultado };
      }

      case 'criar_despesa': {
        const despesa = await despesasService.create({
          usuario_id: ctx.usuarioId,
          descricao: input.descricao,
          valor: input.valor,
          data: input.data,
          categoria: input.categoria || null,
          tipo_pagamento: input.tipo_pagamento || 'a_vista',
          status: input.status || 'pendente'
        });
        return { sucesso: true, dados: { id: despesa.id, descricao: despesa.descricao, valor: despesa.valor, status: despesa.status } };
      }

      case 'listar_despesas': {
        const filters: any = { usuario_id: ctx.usuarioId };
        if (input.data_ini) filters.data_ini = input.data_ini;
        if (input.data_fim) filters.data_fim = input.data_fim;
        if (input.status) filters.status = input.status;
        const resultado = await despesasService.list(filters, 1, 20);
        return { sucesso: true, dados: resultado.data || resultado };
      }

      default:
        return { sucesso: false, dados: null, erro: `Ferramenta desconhecida: ${nome}` };
    }
  } catch (err: any) {
    return { sucesso: false, dados: null, erro: err.message };
  }
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

  async toggleEstagio(estagioId: number, empresaId: number, ativo: boolean): Promise<void> {
    await query(
      `UPDATE estagios_funil SET agente_ia_ativo = $1
       WHERE id = $2 AND funil_id IN (SELECT id FROM funis WHERE empresa_id = $3)`,
      [ativo, estagioId, empresaId]
    );
    if (ativo) {
      await query(
        `UPDATE leads SET agente_ia_ativo = NULL
         WHERE estagio_id = $1 AND empresa_id = $2 AND agente_ia_ativo = false`,
        [estagioId, empresaId]
      );
    }
    await sincronizarAutomacaoEstagio(estagioId, empresaId, ativo);
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
  async getContextoHistorico(leadId: number, limit: number, upToDate?: Date): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    const params: any[] = [leadId];
    let dateFilter = '';
    if (upToDate) {
      params.push(upToDate);
      dateFilter = `AND created_at < $${params.length}`;
    }
    params.push(limit);
    const result = await query(
      `SELECT direcao, conteudo FROM historico_mensagens
       WHERE lead_id = $1 AND tipo = 'texto' AND conteudo IS NOT NULL AND conteudo != ''
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

  buildSystemPrompt(config: AgenteIAConfig, lead: any, estagio: any, estagiosDisponiveis: any[], anotacoes: any[] = [], tags: string[] = [], responsavelNome?: string): string {
    const tomMap: Record<string, string> = {
      formal: 'Use linguagem profissional e respeitosa. Trate pelo nome com "você".',
      casual: 'Seja descontraído, pode usar linguagem informal e gírias leves.',
      amigavel: 'Seja caloroso e próximo, crie conexão genuína sem exagerar na informalidade.'
    };
    const tomDescricao = tomMap[config.tom] || tomMap['amigavel'];
    const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const hoje = agora.toLocaleDateString('pt-BR');

    const estagiosStr = estagiosDisponiveis
      .map((e: any) => `  - ID ${e.id}: "${e.nome}"${e.is_ganho ? ' (GANHO)' : ''}${e.is_perdido ? ' (PERDIDO)' : ''}`)
      .join('\n');

    const anotacoesStr = anotacoes.length > 0
      ? anotacoes.map((a: any) => `  [${a.tipo || 'nota'}] ${a.conteudo}`).join('\n')
      : 'Nenhuma anotação registrada';

    // Usa o nome do responsável atual do lead; fallback para o nome configurado no agente
    const nomeIdentidade = responsavelNome || config.nome_agente;

    return `Você é ${nomeIdentidade}${config.area_negocio ? `, da ${config.area_negocio}` : ''}.
Hoje é ${hoje}.

COMO ESCREVER:
${tomDescricao}
Escreva como uma pessoa real escreveria no WhatsApp. Mensagens curtas. Sem formatação com asteriscos, listas ou emojis forçados. Sem parágrafos longos. Sem linguagem corporativa.
Nunca comece com: "Olá!", "Entendido!", "Perfeito!", "Claro!", "Com certeza!", "Ótima pergunta!" — essas respostas denunciam um bot.
Evite repetir o nome da pessoa toda hora.

SOBRE QUEM VOCÊ ESTÁ CONVERSANDO:
- Nome: ${lead.nome}
- Telefone: ${lead.telefone || 'não informado'}
- Email: ${lead.email || 'não informado'}
- Temperatura: ${lead.temperatura || 'não definida'}
- Estágio no funil: ${estagio?.nome || 'desconhecido'}
- Tags: ${tags.length > 0 ? tags.join(', ') : 'nenhuma'}
- Notas sobre o lead: ${lead.notas || 'nenhuma'}

ANOTAÇÕES DO LEAD (histórico registrado pelos vendedores):
${anotacoesStr}

ESTÁGIOS DO FUNIL — apenas para uso nas ferramentas, nunca mencione ao lead:
${estagiosStr}

${estagio?.instrucoes_agente_ia ? `INSTRUÇÕES ESPECÍFICAS PARA O ESTÁGIO "${estagio.nome}":\n${estagio.instrucoes_agente_ia}\n\n` : ''}${config.system_prompt_extra ? `INSTRUÇÕES GERAIS DO ASSISTENTE:\n${config.system_prompt_extra}\n\n` : ''}REGRAS QUE NUNCA PODEM SER QUEBRADAS:
1. JAMAIS mencione ao lead que criou tarefas, anotações, moveu estágios ou fez qualquer ação no sistema. Essas ações acontecem em silêncio, por baixo dos panos.
2. JAMAIS diga frases como: "Vou registrar isso", "Anotei aqui", "Criei uma tarefa para você", "Movi você para outra etapa", "Agendei no sistema".
3. Use as ferramentas discretamente. A conversa flui normalmente como se fosse entre duas pessoas.
4. Ao confirmar uma reunião, simplesmente confirme o horário de forma natural (ex: "Combinado, sexta às 10h então. Até lá!").
5. Ao agendar sessão, crie também uma tarefa do tipo "reuniao" — tudo sem mencionar ao lead.
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
      console.log(`[AgenteIA] Config inativa ou sem API key para empresa ${empresaId}`);
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
    const leadResult = await query(
      `SELECT l.*, ef.nome as estagio_nome, ef.is_ganho, ef.is_perdido, ef.instrucoes_agente_ia as estagio_instrucoes,
              u.nome as responsavel_nome
       FROM leads l
       LEFT JOIN estagios_funil ef ON ef.id = l.estagio_id
       LEFT JOIN usuarios u ON u.id = l.responsavel_id
       WHERE l.id = $1 AND l.empresa_id = $2`,
      [leadId, empresaId]
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
    const contexto = await this.getContextoHistorico(leadId, config.contexto_mensagens, effectiveTriggerAt);

    // 5.2. Anotações do lead
    const anotacoesResult = await query(
      `SELECT conteudo, tipo, created_at FROM anotacoes_lead
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

    // 6. Construir system prompt usando o nome do responsável atual do lead
    const systemPrompt = this.buildSystemPrompt(
      config,
      lead,
      { nome: lead.estagio_nome, is_ganho: lead.is_ganho, is_perdido: lead.is_perdido, instrucoes_agente_ia: lead.estagio_instrucoes },
      estagiosDisponiveis,
      anotacoes,
      tags,
      lead.responsavel_nome || undefined
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
    const msgsPendentes = await query(
      `SELECT conteudo FROM historico_mensagens
       WHERE lead_id = $1 AND direcao = 'entrada' AND tipo = 'texto'
         AND conteudo IS NOT NULL AND conteudo != ''
         AND created_at >= $2
       ORDER BY created_at ASC`,
      [leadId, effectiveTriggerAt]
    );
    const mensagemFinal = msgsPendentes.rows.length > 0
      ? msgsPendentes.rows.map((r: any) => r.conteudo).join('\n\n')
      : mensagemTexto;
    if (msgsPendentes.rows.length > 1) {
      console.log(`[AgenteIA] Lead #${leadId}: ${msgsPendentes.rows.length} mensagens agregadas em uma única resposta`);
    }

    // 9.5. Guard anti-duplicação: se houve mensagem saída (humano ou outro processo)
    // durante a janela do delay, abortar para evitar dupla resposta.
    const respHumanoCheck = await query(
      `SELECT id FROM historico_mensagens
       WHERE lead_id = $1 AND direcao = 'saida' AND created_at > $2 LIMIT 1`,
      [leadId, effectiveTriggerAt]
    );
    if (respHumanoCheck.rows.length > 0) {
      console.log(`[AgenteIA] Lead #${leadId}: já houve resposta saída durante o delay — agente abortado para evitar duplicação`);
      await this.logarAcao(leadId, empresaId, 'skip_humano_respondeu', { mensagem: mensagemFinal.substring(0, 200) }, true);
      return;
    }

    // 8. Processar mensagem com o provedor configurado
    let finalText = '';
    const deadline = Date.now() + 120_000; // deadline de 2 minutos para o loop agentic

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
        // Claude — agentic loop com tool_use nativo
        const anthropic = new Anthropic({ apiKey: config.api_key! });

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
      return;
    }

    // 10. Enviar resposta final ao lead via WhatsApp (mensagem fica em historico_mensagens
    // e o próximo turno lê de lá via getContextoHistorico — não precisa salvar em agente_ia_contexto).
    if (!finalText.trim()) {
      console.warn(`[AgenteIA] Lead #${leadId}: ${config.provider || 'IA'} não retornou texto final. Mensagem recebida: "${mensagemFinal.substring(0, 80)}".`);
    } else {
      await contatosService.enviarMensagem(usuarioId, empresaId, contatoId, finalText, leadId);
      await this.logarAcao(leadId, empresaId, 'responder', { mensagem: finalText }, true);
    }
  },

  // ─── Follow-up Agendado via Agente IA ────────────────────────────────────────

  buildSystemPromptFollowUp(
    config: AgenteIAConfig,
    lead: any,
    estagio: any,
    instrucaoExtra: string | null,
    anotacoes: any[],
    tags: string[],
    responsavelNome?: string
  ): string {
    const tomMap: Record<string, string> = {
      formal: 'Use linguagem profissional e respeitosa. Trate pelo nome com "você".',
      casual: 'Seja descontraído, pode usar linguagem informal e gírias leves.',
      amigavel: 'Seja caloroso e próximo, crie conexão genuína sem exagerar na informalidade.'
    };
    const tomDescricao = tomMap[config.tom] || tomMap['amigavel'];

    const anotacoesStr = anotacoes.length > 0
      ? anotacoes.map((a: any) => `  [${a.tipo || 'nota'}] ${a.conteudo}`).join('\n')
      : 'Nenhuma anotação registrada';

    const tagsStr = tags.length > 0 ? tags.join(', ') : 'nenhuma';
    const nomeIdentidade = responsavelNome || config.nome_agente;
    const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).toLocaleDateString('pt-BR');

    return `Você é ${nomeIdentidade}${config.area_negocio ? `, da ${config.area_negocio}` : ''}.
Hoje é ${hoje}.

COMO ESCREVER:
${tomDescricao}
Escreva como uma pessoa real escreveria no WhatsApp. Mensagens curtas. Sem formatação com asteriscos, listas ou emojis forçados. Sem parágrafos longos.
Nunca comece com: "Olá!", "Entendido!", "Perfeito!", "Claro!", "Com certeza!" — essas respostas denunciam um bot.

SOBRE QUEM VOCÊ ESTÁ ESCREVENDO:
- Nome: ${lead.nome}
- Empresa: ${lead.lead_empresa || lead.empresa || 'não informada'}
- Cargo: ${lead.cargo || 'não informado'}
- Telefone: ${lead.lead_telefone || lead.telefone || 'não informado'}
- Email: ${lead.lead_email || lead.email || 'não informado'}
- Temperatura: ${lead.lead_temperatura || lead.temperatura || 'não definida'}
- Estágio no funil: ${estagio?.nome || estagio?.estagio_nome || 'desconhecido'}
- Tags: ${tagsStr}
- Notas internas: ${lead.lead_notas || lead.notas || 'nenhuma'}

ANOTAÇÕES DO LEAD (histórico registrado pelos vendedores):
${anotacoesStr}

HISTÓRICO RECENTE DA CONVERSA está nas mensagens abaixo.

${instrucaoExtra ? `INSTRUÇÃO ESPECÍFICA PARA ESTE FOLLOW-UP:\n${instrucaoExtra}\n\n` : ''}${config.system_prompt_extra ? `INSTRUÇÕES GERAIS DO ASSISTENTE:\n${config.system_prompt_extra}\n\n` : ''}SUA TAREFA:
Escreva uma mensagem de follow-up natural para este lead, levando em conta TUDO que você sabe sobre ele — a conversa, as anotações e o contexto geral.
- Seja específico ao contexto, não genérico
- Mensagem curta, com propósito claro
- Jamais mencione CRM, tarefas, sistemas ou automação`;
  },

  async processarFollowUpIA(followup: any): Promise<'enviado' | 'adiado' | 'cancelado'> {
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
    if (!config || !config.ativo || !hasKey) {
      throw new Error(`Agente IA inativo ou sem API key para empresa ${empresaId}`);
    }

    // Guard anti-duplicação: se houve mensagem de saída nos últimos 60min, adiar sem falhar
    const msgRecente = await query(
      `SELECT id FROM historico_mensagens
       WHERE lead_id = $1 AND direcao = 'saida' AND created_at > NOW() - INTERVAL '60 minutes'
       LIMIT 1`,
      [leadId]
    );
    if (msgRecente.rows.length > 0) {
      console.log(`[AgenteIA] Follow-up #${followup.id}: mensagem enviada nos últimos 60min — adiado`);
      return 'adiado';
    }

    // Contexto real da conversa via historico_mensagens (inclui tudo antes da ativação do agente)
    const contexto = await this.getContextoHistorico(leadId, config.contexto_mensagens);

    // Buscar anotações do lead
    const anotacoesResult = await query(
      `SELECT conteudo, tipo, created_at FROM anotacoes_lead
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

    // Buscar nome do responsável atual do lead
    const responsavelResult = await query(
      `SELECT u.nome FROM leads l JOIN usuarios u ON u.id = l.responsavel_id WHERE l.id = $1`,
      [leadId]
    );
    const responsavelNome: string | undefined = responsavelResult.rows[0]?.nome || undefined;

    // Montar estagio info
    const estagio = {
      nome: followup.estagio_nome,
      instrucoes_agente_ia: followup.estagio_instrucoes,
    };

    const systemPrompt = this.buildSystemPromptFollowUp(
      config, followup, estagio, followup.instrucao_ia, anotacoes, tags, responsavelNome
    );

    let texto = '';

    if (config.provider === 'gemini' && config.gemini_api_key) {
      const contents = contexto.length > 0
        ? contexto.map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          }))
        : [{ role: 'user', parts: [{ text: '(sem histórico de conversa ainda)' }] }];
      const geminiResp = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${config.modelo || 'gemini-2.5-flash'}:generateContent?key=${config.gemini_api_key}`,
        {
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { maxOutputTokens: Math.min(config.max_tokens, 512), temperature: 0.75 },
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
      );
      texto = (geminiResp.data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    } else {
      const anthropic = new Anthropic({ apiKey: config.api_key! });
      const response = await anthropic.messages.create({
        model: config.modelo || 'claude-sonnet-4-6',
        max_tokens: Math.min(config.max_tokens, 512),
        system: systemPrompt,
        messages: contexto.length > 0 ? contexto : [{ role: 'user', content: '(sem histórico de conversa ainda)' }],
      });
      texto = response.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('')
        .trim();
    }

    if (!texto) throw new Error('IA não retornou nenhuma mensagem');

    // Enviar a mensagem — não salva em agente_ia_contexto pois o histórico já fica em
    // historico_mensagens e o próximo follow-up/reativo lê de lá via getContextoHistorico.
    await contatosService.enviarMensagem(
      usuarioId, empresaId, followup.contato_whatsapp_id, texto, leadId
    );
    await this.logarAcao(leadId, empresaId, 'followup_ia', { texto, followup_id: followup.id }, true);

    // Registrar anotação no lead para rastreabilidade no CRM
    try {
      await anotacoesService.create(empresaId, usuarioId, {
        lead_id: leadId,
        conteudo: `Follow-up automático enviado: "${texto.substring(0, 200)}${texto.length > 200 ? '...' : ''}"`,
        tipo: 'nota'
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
async function sincronizarAutomacaoEstagio(estagioId: number, empresaId: number, ativo: boolean): Promise<void> {
  const existente = await query(
    `SELECT id FROM automacoes
     WHERE estagio_id = $1 AND tipo_acao = 'ativar_agente_estagio' AND empresa_id = $2`,
    [estagioId, empresaId]
  );

  if (existente.rows[0]) {
    await query(
      `UPDATE automacoes SET ativa = $1 WHERE id = $2`,
      [ativo, existente.rows[0].id]
    );
    return;
  }

  if (!ativo) return;

  const ctx = await query(
    `SELECT ef.nome, ef.instrucoes_agente_ia, ef.estagio_apos_resposta_id, f.usuario_id
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
     ) VALUES ($1, $2, $3, $4, 'ativar_agente_estagio', $5, true, $6)`,
    [
      empresaId,
      ctx.rows[0].usuario_id,
      `Agente IA — ${ctx.rows[0].nome}`,
      'Agente IA ativo para leads neste estágio',
      estagioId,
      JSON.stringify({
        instrucoes: ctx.rows[0].instrucoes_agente_ia ?? '',
        estagio_apos_resposta_id: ctx.rows[0].estagio_apos_resposta_id
      })
    ]
  );
}

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
