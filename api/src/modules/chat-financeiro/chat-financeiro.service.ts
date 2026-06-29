import Anthropic from '@anthropic-ai/sdk';
import { Tool } from '@anthropic-ai/sdk/resources/messages';
import axios from 'axios';
import { query } from '../../config/database';
import { assinaturasService } from '../assinaturas/assinaturas.service';

// ─── Definições das ferramentas ──────────────────────────────────────────────

const TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'buscar_resumo_financeiro',
    description: 'Retorna totais de receitas e despesas (pagas e pendentes) para um período. Use para responder "qual meu saldo", "quanto ganhei/gastei", "como estão minhas finanças".',
    input_schema: {
      type: 'object' as const,
      properties: {
        mes: { type: 'number', description: 'Mês (1-12). Se omitido, usa o mês atual.' },
        ano: { type: 'number', description: 'Ano (ex: 2024). Se omitido, usa o ano atual.' },
        todos_os_meses: { type: 'boolean', description: 'Se true, ignora filtro de mês/ano e retorna resumo geral.' }
      }
    }
  },
  {
    name: 'listar_despesas',
    description: 'Lista despesas com filtros opcionais. Use para responder "quais minhas despesas", "o que gastei em X".',
    input_schema: {
      type: 'object' as const,
      properties: {
        categoria: { type: 'string', description: 'Filtrar por categoria (ex: Essencial, Saúde, Lazer)' },
        mes: { type: 'number', description: 'Mês (1-12)' },
        ano: { type: 'number', description: 'Ano' },
        status: { type: 'string', enum: ['pago', 'pendente'], description: 'Filtrar por status' },
        limite: { type: 'number', description: 'Máximo de registros (padrão: 20)' }
      }
    }
  },
  {
    name: 'listar_receitas',
    description: 'Lista receitas com filtros opcionais. Use para responder "quais minhas receitas", "quanto recebi".',
    input_schema: {
      type: 'object' as const,
      properties: {
        fonte: { type: 'string', description: 'Filtrar por fonte (ex: Pró-labore, Freelance)' },
        mes: { type: 'number', description: 'Mês (1-12)' },
        ano: { type: 'number', description: 'Ano' },
        status: { type: 'string', enum: ['pago', 'pendente'], description: 'Filtrar por status' },
        limite: { type: 'number', description: 'Máximo de registros (padrão: 20)' }
      }
    }
  },
  {
    name: 'adicionar_despesa',
    description: 'Cria uma nova despesa. Confirme os dados com o usuário antes de usar esta ferramenta.',
    input_schema: {
      type: 'object' as const,
      properties: {
        descricao: { type: 'string', description: 'Descrição da despesa (ex: Farmácia, Supermercado)' },
        valor: { type: 'number', description: 'Valor em R$' },
        data: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
        categoria: { type: 'string', description: 'Categoria (ex: Essencial, Saúde, Lazer, Investimentos)' }
      },
      required: ['descricao', 'valor', 'data', 'categoria']
    }
  },
  {
    name: 'adicionar_receita',
    description: 'Cria uma nova receita. Confirme os dados com o usuário antes de usar esta ferramenta.',
    input_schema: {
      type: 'object' as const,
      properties: {
        descricao: { type: 'string', description: 'Descrição da receita (ex: Salário março)' },
        valor: { type: 'number', description: 'Valor em R$' },
        data: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
        fonte: { type: 'string', description: 'Fonte da receita (ex: Pró-labore, Renda Extra, Freelance/Serviços)' }
      },
      required: ['descricao', 'valor', 'data', 'fonte']
    }
  },
  {
    name: 'listar_categorias_despesas',
    description: 'Retorna as categorias de despesas disponíveis para este usuário.',
    input_schema: {
      type: 'object' as const,
      properties: {}
    }
  },
  {
    name: 'listar_categorias_receitas',
    description: 'Retorna as fontes/categorias de receitas disponíveis para este usuário.',
    input_schema: {
      type: 'object' as const,
      properties: {}
    }
  },
  {
    name: 'despesas_por_categoria',
    description: 'Retorna despesas agrupadas por categoria para análise de gastos.',
    input_schema: {
      type: 'object' as const,
      properties: {
        mes: { type: 'number', description: 'Mês (1-12). Se omitido, usa mês atual.' },
        ano: { type: 'number', description: 'Ano. Se omitido, usa ano atual.' }
      }
    }
  },
  {
    name: 'evolucao_mensal',
    description: 'Retorna a evolução de receitas, despesas e saldo mês a mês.',
    input_schema: {
      type: 'object' as const,
      properties: {
        meses: { type: 'number', description: 'Quantos meses retornar (padrão: 12)' }
      }
    }
  },
  {
    name: 'parcelas_pendentes',
    description: 'Retorna parcelas a vencer nos próximos dias (despesas e receitas pendentes).',
    input_schema: {
      type: 'object' as const,
      properties: {
        dias: { type: 'number', description: 'Quantos dias à frente verificar (padrão: 30)' }
      }
    }
  },
];

// Ferramentas exclusivas do super_admin — incluídas condicionalmente
const TOOL_ADMIN: Tool[] = [
  {
    name: 'gerenciar_assinatura_empresa',
    description: 'Suspende, cancela ou ativa indefinidamente a assinatura de uma empresa. Use apenas quando o super_admin solicitar explicitamente. Sempre confirme a ação com o usuário antes de executar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        empresa_id: { type: 'number', description: 'ID da empresa a ser gerenciada' },
        acao: { type: 'string', enum: ['suspender', 'cancelar', 'ativar'], description: 'Ação a executar: suspender, cancelar ou ativar indefinidamente' },
        motivo: { type: 'string', description: 'Motivo da ação (opcional)' }
      },
      required: ['empresa_id', 'acao']
    }
  }
];

// ─── Execução das ferramentas ─────────────────────────────────────────────────

async function executarFerramenta(nome: string, input: any, usuarioId: number, nivel?: string): Promise<any> {
  try {
    const hoje = new Date();
    const mesAtual = hoje.getMonth() + 1;
    const anoAtual = hoje.getFullYear();

    switch (nome) {

      case 'buscar_resumo_financeiro': {
        let whereClause = 'WHERE d.usuario_id = $1';
        const params: any[] = [usuarioId];

        if (!input.todos_os_meses) {
          const mes = input.mes || mesAtual;
          const ano = input.ano || anoAtual;
          const dataIni = `${ano}-${String(mes).padStart(2, '0')}-01`;
          const dataFim = new Date(ano, mes, 0).toISOString().split('T')[0];
          whereClause += ` AND pd.data_vencimento BETWEEN '${dataIni}' AND '${dataFim}'`;
        }

        const despResult = await query(
          `SELECT
            COALESCE(SUM(CASE WHEN pd.status = 'PAGO' THEN pd.valor ELSE 0 END), 0) as despesas_pagas,
            COALESCE(SUM(CASE WHEN pd.status IN ('PENDENTE','ATRASADO') THEN pd.valor ELSE 0 END), 0) as despesas_pendentes,
            COUNT(DISTINCT d.id) as total_despesas
           FROM parcelas_despesas pd
           JOIN despesas d ON pd.despesa_id = d.id
           ${whereClause}`,
          params
        );

        let whereRec = 'WHERE r.usuario_id = $1';
        const paramsRec: any[] = [usuarioId];
        if (!input.todos_os_meses) {
          const mes = input.mes || mesAtual;
          const ano = input.ano || anoAtual;
          const dataIni = `${ano}-${String(mes).padStart(2, '0')}-01`;
          const dataFim = new Date(ano, mes, 0).toISOString().split('T')[0];
          whereRec += ` AND pr.data_vencimento BETWEEN '${dataIni}' AND '${dataFim}'`;
        }

        const recResult = await query(
          `SELECT
            COALESCE(SUM(CASE WHEN pr.status = 'PAGO' THEN pr.valor ELSE 0 END), 0) as receitas_pagas,
            COALESCE(SUM(CASE WHEN pr.status IN ('PENDENTE','ATRASADO') THEN pr.valor ELSE 0 END), 0) as receitas_pendentes
           FROM parcelas_receitas pr
           JOIN receitas r ON pr.receita_id = r.id
           ${whereRec}`,
          paramsRec
        );

        const d = despResult.rows[0];
        const r = recResult.rows[0];
        const desp_pagas = parseFloat(d.despesas_pagas);
        const desp_pend = parseFloat(d.despesas_pendentes);
        const rec_pagas = parseFloat(r.receitas_pagas);
        const rec_pend = parseFloat(r.receitas_pendentes);

        return {
          periodo: input.todos_os_meses ? 'todos os meses' : `${input.mes || mesAtual}/${input.ano || anoAtual}`,
          receitas_recebidas: rec_pagas,
          receitas_pendentes: rec_pend,
          receitas_total: rec_pagas + rec_pend,
          despesas_pagas: desp_pagas,
          despesas_pendentes: desp_pend,
          despesas_total: desp_pagas + desp_pend,
          saldo_atual: rec_pagas - desp_pagas,
          saldo_projetado: (rec_pagas + rec_pend) - (desp_pagas + desp_pend)
        };
      }

      case 'listar_despesas': {
        const params: any[] = [usuarioId];
        let where = 'WHERE d.usuario_id = $1';

        if (input.categoria) {
          params.push(input.categoria);
          where += ` AND d.categoria = $${params.length}`;
        }
        if (input.status) {
          params.push(input.status);
          where += ` AND d.status = $${params.length}`;
        }
        if (input.mes && input.ano) {
          const ano = parseInt(input.ano, 10) || anoAtual;
          const mes = parseInt(input.mes, 10) || mesAtual;
          const dataIni = `${ano}-${String(mes).padStart(2, '0')}-01`;
          const dataFim = new Date(ano, mes, 0).toISOString().split('T')[0];
          params.push(dataIni, dataFim);
          where += ` AND d.data BETWEEN $${params.length - 1} AND $${params.length}`;
        } else if (input.ano) {
          params.push(parseInt(input.ano, 10) || anoAtual);
          where += ` AND EXTRACT(YEAR FROM d.data) = $${params.length}`;
        } else if (input.mes) {
          params.push(parseInt(input.mes, 10) || mesAtual, anoAtual);
          where += ` AND EXTRACT(MONTH FROM d.data) = $${params.length - 1} AND EXTRACT(YEAR FROM d.data) = $${params.length}`;
        }

        const limite = Math.min(parseInt(input.limite, 10) || 20, 100);
        params.push(limite);
        const result = await query(
          `SELECT d.id, d.descricao, d.valor, d.data, d.categoria, d.status
           FROM despesas d
           ${where}
           ORDER BY d.data DESC
           LIMIT $${params.length}`,
          params
        );
        return { total: result.rowCount, despesas: result.rows };
      }

      case 'listar_receitas': {
        const params: any[] = [usuarioId];
        let where = 'WHERE r.usuario_id = $1';

        if (input.fonte) {
          params.push(input.fonte);
          where += ` AND r.fonte = $${params.length}`;
        }
        if (input.status) {
          params.push(input.status);
          where += ` AND r.status = $${params.length}`;
        }
        if (input.mes && input.ano) {
          const ano = parseInt(input.ano, 10) || anoAtual;
          const mes = parseInt(input.mes, 10) || mesAtual;
          const dataIni = `${ano}-${String(mes).padStart(2, '0')}-01`;
          const dataFim = new Date(ano, mes, 0).toISOString().split('T')[0];
          params.push(dataIni, dataFim);
          where += ` AND r.data BETWEEN $${params.length - 1} AND $${params.length}`;
        } else if (input.ano) {
          params.push(parseInt(input.ano, 10) || anoAtual);
          where += ` AND EXTRACT(YEAR FROM r.data) = $${params.length}`;
        } else if (input.mes) {
          params.push(parseInt(input.mes, 10) || mesAtual, anoAtual);
          where += ` AND EXTRACT(MONTH FROM r.data) = $${params.length - 1} AND EXTRACT(YEAR FROM r.data) = $${params.length}`;
        }

        const limite = Math.min(parseInt(input.limite, 10) || 20, 100);
        params.push(limite);
        const result = await query(
          `SELECT r.id, r.descricao, r.valor, r.data, r.fonte, r.status
           FROM receitas r
           ${where}
           ORDER BY r.data DESC
           LIMIT $${params.length}`,
          params
        );
        return { total: result.rowCount, receitas: result.rows };
      }

      case 'adicionar_despesa': {
        const result = await query(
          `INSERT INTO despesas
            (descricao, valor, data, categoria, usuario_id, pago, parcelado,
             numero_parcelas, parcela_atual, recorrente, tipo_pagamento, status)
           VALUES ($1, $2, $3, $4, $5,
             CASE WHEN $3::date < CURRENT_DATE THEN true ELSE false END,
             false, NULL, NULL, false, 'a_vista',
             CASE WHEN $3::date < CURRENT_DATE THEN 'pago' ELSE 'pendente' END)
           RETURNING id, descricao, valor, data, categoria, status`,
          [input.descricao, input.valor, input.data, input.categoria, usuarioId]
        );
        const despesa = result.rows[0];

        await query(
          `INSERT INTO parcelas_despesas
            (despesa_id, numero_parcela, total_parcelas, valor, data_vencimento, data_pagamento, status)
           VALUES ($1, 1, 1, $2, $3,
             CASE WHEN $3::date < CURRENT_DATE THEN $3 ELSE NULL END,
             CASE WHEN $3::date < CURRENT_DATE THEN 'PAGO' ELSE 'PENDENTE' END)`,
          [despesa.id, input.valor, input.data]
        );

        return { sucesso: true, despesa };
      }

      case 'adicionar_receita': {
        const result = await query(
          `INSERT INTO receitas
            (descricao, valor, data, fonte, usuario_id, recebido, parcelado,
             numero_parcelas, parcela_atual, tipo_pagamento, status)
           VALUES ($1, $2, $3, $4, $5,
             CASE WHEN $3::date < CURRENT_DATE THEN true ELSE false END,
             false, NULL, NULL, 'a_vista',
             CASE WHEN $3::date < CURRENT_DATE THEN 'pago' ELSE 'pendente' END)
           RETURNING id, descricao, valor, data, fonte, status`,
          [input.descricao, input.valor, input.data, input.fonte, usuarioId]
        );
        const receita = result.rows[0];

        await query(
          `INSERT INTO parcelas_receitas
            (receita_id, numero_parcela, total_parcelas, valor, data_vencimento, data_pagamento, status)
           VALUES ($1, 1, 1, $2, $3,
             CASE WHEN $3::date < CURRENT_DATE THEN $3 ELSE NULL END,
             CASE WHEN $3::date < CURRENT_DATE THEN 'PAGO' ELSE 'PENDENTE' END)`,
          [receita.id, input.valor, input.data]
        );

        return { sucesso: true, receita };
      }

      case 'listar_categorias_despesas': {
        const result = await query(
          `SELECT DISTINCT categoria FROM despesas WHERE usuario_id = $1 AND categoria IS NOT NULL ORDER BY categoria`,
          [usuarioId]
        );
        const padrao = ['Essencial', 'Essencial Anual', 'Saúde', 'Lazer', 'Investimentos', 'Desenvolvimento Pessoal', 'Viagens e Aniversário', 'Livre'];
        const existentes = result.rows.map((r: any) => r.categoria);
        return { categorias: [...new Set([...padrao, ...existentes])].sort() };
      }

      case 'listar_categorias_receitas': {
        const result = await query(
          `SELECT DISTINCT fonte FROM receitas WHERE usuario_id = $1 AND fonte IS NOT NULL ORDER BY fonte`,
          [usuarioId]
        );
        return { fontes: result.rows.map((r: any) => r.fonte) };
      }

      case 'despesas_por_categoria': {
        const mes = input.mes || mesAtual;
        const ano = input.ano || anoAtual;
        const dataIni = `${ano}-${String(mes).padStart(2, '0')}-01`;
        const dataFim = new Date(ano, mes, 0).toISOString().split('T')[0];

        const result = await query(
          `SELECT d.categoria,
            COUNT(*) as qtd,
            SUM(pd.valor) as total,
            SUM(CASE WHEN pd.status = 'PAGO' THEN pd.valor ELSE 0 END) as pago,
            SUM(CASE WHEN pd.status IN ('PENDENTE','ATRASADO') THEN pd.valor ELSE 0 END) as pendente
           FROM parcelas_despesas pd
           JOIN despesas d ON pd.despesa_id = d.id
           WHERE d.usuario_id = $1
             AND pd.data_vencimento BETWEEN $2 AND $3
           GROUP BY d.categoria
           ORDER BY total DESC`,
          [usuarioId, dataIni, dataFim]
        );
        return { mes: `${mes}/${ano}`, categorias: result.rows };
      }

      case 'evolucao_mensal': {
        const meses = input.meses || 12;
        const result = await query(
          `WITH meses AS (
            SELECT
              TO_CHAR(DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month' * gs), 'YYYY-MM') as mes,
              TO_CHAR(DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month' * gs), 'Mon/YYYY') as mes_label,
              DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month' * gs) as mes_ini,
              DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month' * gs) + INTERVAL '1 month' - INTERVAL '1 day' as mes_fim
            FROM generate_series(0, $2 - 1) gs
          ),
          rec AS (
            SELECT TO_CHAR(DATE_TRUNC('month', pr.data_vencimento), 'YYYY-MM') as mes,
              SUM(CASE WHEN pr.status = 'PAGO' THEN pr.valor ELSE 0 END) as recebido,
              SUM(pr.valor) as total_receita
            FROM parcelas_receitas pr
            JOIN receitas r ON pr.receita_id = r.id
            WHERE r.usuario_id = $1
            GROUP BY 1
          ),
          desp AS (
            SELECT TO_CHAR(DATE_TRUNC('month', pd.data_vencimento), 'YYYY-MM') as mes,
              SUM(CASE WHEN pd.status = 'PAGO' THEN pd.valor ELSE 0 END) as pago,
              SUM(pd.valor) as total_despesa
            FROM parcelas_despesas pd
            JOIN despesas d ON pd.despesa_id = d.id
            WHERE d.usuario_id = $1
            GROUP BY 1
          )
          SELECT m.mes_label as mes,
            COALESCE(r.recebido, 0) as receitas_recebidas,
            COALESCE(r.total_receita, 0) as receitas_total,
            COALESCE(d.pago, 0) as despesas_pagas,
            COALESCE(d.total_despesa, 0) as despesas_total,
            COALESCE(r.recebido, 0) - COALESCE(d.pago, 0) as saldo
          FROM meses m
          LEFT JOIN rec r ON m.mes = r.mes
          LEFT JOIN desp d ON m.mes = d.mes
          ORDER BY m.mes DESC`,
          [usuarioId, meses]
        );
        return { evolucao: result.rows };
      }

      case 'parcelas_pendentes': {
        const dias = Math.max(1, Math.min(parseInt(input.dias, 10) || 30, 365));

        const despResult = await query(
          `SELECT pd.id, d.descricao, pd.valor, pd.data_vencimento, pd.status, 'despesa' as tipo
           FROM parcelas_despesas pd
           JOIN despesas d ON pd.despesa_id = d.id
           WHERE d.usuario_id = $1
             AND pd.status IN ('PENDENTE', 'ATRASADO')
             AND pd.data_vencimento <= CURRENT_DATE + ($2::int * INTERVAL '1 day')
           ORDER BY pd.data_vencimento ASC
           LIMIT 20`,
          [usuarioId, dias]
        );

        const recResult = await query(
          `SELECT pr.id, r.descricao, pr.valor, pr.data_vencimento, pr.status, 'receita' as tipo
           FROM parcelas_receitas pr
           JOIN receitas r ON pr.receita_id = r.id
           WHERE r.usuario_id = $1
             AND pr.status IN ('PENDENTE', 'ATRASADO')
             AND pr.data_vencimento <= CURRENT_DATE + ($2::int * INTERVAL '1 day')
           ORDER BY pr.data_vencimento ASC
           LIMIT 20`,
          [usuarioId, dias]
        );

        return {
          despesas_pendentes: despResult.rows,
          receitas_pendentes: recResult.rows,
          total_a_pagar: despResult.rows.reduce((s: number, r: any) => s + parseFloat(r.valor), 0),
          total_a_receber: recResult.rows.reduce((s: number, r: any) => s + parseFloat(r.valor), 0)
        };
      }

      case 'gerenciar_assinatura_empresa': {
        if (nivel !== 'super_admin') {
          return { erro: 'Acesso negado. Apenas o super_admin pode gerenciar assinaturas de empresas.' };
        }
        const { empresa_id, acao, motivo } = input;
        if (!empresa_id || !acao) {
          return { erro: 'empresa_id e acao são obrigatórios' };
        }
        if (acao === 'suspender') {
          await assinaturasService.suspender(empresa_id, motivo || 'Suspenso pelo administrador via agente IA');
          return { sucesso: true, mensagem: `Empresa ${empresa_id} suspensa com sucesso` };
        } else if (acao === 'cancelar') {
          await assinaturasService.cancelar(empresa_id, motivo || 'Cancelado pelo administrador via agente IA');
          return { sucesso: true, mensagem: `Empresa ${empresa_id} cancelada com sucesso` };
        } else if (acao === 'ativar') {
          await assinaturasService.ativarIndefinidamente(empresa_id);
          return { sucesso: true, mensagem: `Empresa ${empresa_id} ativada indefinidamente com sucesso` };
        } else {
          return { erro: `Ação desconhecida: ${acao}` };
        }
      }

      default:
        return { erro: `Ferramenta desconhecida: ${nome}` };
    }
  } catch (err: any) {
    return { erro: err.message };
  }
}

// ─── Service principal ────────────────────────────────────────────────────────

export const chatFinanceiroService = {

  async getConfig(empresaId?: number) {
    // Comportamento: empresa-específica ou fallback global
    let behavior: any = null;
    if (empresaId) {
      const r = await query(`SELECT * FROM chat_financeiro_config WHERE empresa_id = $1 LIMIT 1`, [empresaId]);
      behavior = r.rows[0] || null;
    }
    if (!behavior) {
      const r = await query(`SELECT * FROM chat_financeiro_config WHERE empresa_id IS NULL LIMIT 1`);
      behavior = r.rows[0] || null;
    }

    // Credenciais: lidas da fonte centralizada
    let creds: any = null;
    if (empresaId) {
      const r = await query(`SELECT * FROM empresa_ia_credenciais WHERE empresa_id = $1 LIMIT 1`, [empresaId]);
      creds = r.rows[0] || null;
    }

    if (!behavior && !creds) return null;

    const baseBehavior = behavior || { ativo: true, max_tokens: 2048, contexto_mensagens: 20 };
    return { ...baseBehavior, ...(creds || {}) };
  },

  async upsertConfig(empresaId: number | null, data: {
    ativo?: boolean;
    max_tokens?: number;
    contexto_mensagens?: number;
  }) {
    const existing = await query(
      empresaId
        ? `SELECT id FROM chat_financeiro_config WHERE empresa_id = $1 LIMIT 1`
        : `SELECT id FROM chat_financeiro_config WHERE empresa_id IS NULL LIMIT 1`,
      empresaId ? [empresaId] : []
    );

    if (existing.rows[0]) {
      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;

      if (data.ativo !== undefined) { fields.push(`ativo = $${i++}`); values.push(data.ativo); }
      if (data.max_tokens !== undefined) { fields.push(`max_tokens = $${i++}`); values.push(data.max_tokens); }
      if (data.contexto_mensagens !== undefined) { fields.push(`contexto_mensagens = $${i++}`); values.push(data.contexto_mensagens); }

      if (fields.length === 0) return existing.rows[0];

      fields.push(`updated_at = NOW()`);
      values.push(existing.rows[0].id);

      const result = await query(
        `UPDATE chat_financeiro_config SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
        values
      );
      return result.rows[0];
    } else {
      const result = await query(
        `INSERT INTO chat_financeiro_config (empresa_id, ativo, max_tokens, contexto_mensagens)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [empresaId, data.ativo ?? true, data.max_tokens || 2048, data.contexto_mensagens || 20]
      );
      return result.rows[0];
    }
  },

  async getHistorico(usuarioId: number, limite: number = 20) {
    const result = await query(
      `SELECT id, role, conteudo, created_at
       FROM chat_financeiro_historico
       WHERE usuario_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [usuarioId, limite]
    );
    return result.rows.reverse();
  },

  async salvarMensagem(usuarioId: number, role: 'user' | 'assistant', conteudo: string) {
    await query(
      `INSERT INTO chat_financeiro_historico (usuario_id, role, conteudo) VALUES ($1, $2, $3)`,
      [usuarioId, role, conteudo]
    );
  },

  async limparHistorico(usuarioId: number) {
    await query(`DELETE FROM chat_financeiro_historico WHERE usuario_id = $1`, [usuarioId]);
  },

  async processar(
    usuarioId: number,
    empresaId: number,
    usuarioNome: string,
    mensagem: string,
    nivel?: string
  ): Promise<string> {
    const config = await this.getConfig(empresaId);

    if (!config || !config.ativo) {
      return 'O assistente financeiro não está ativo no momento. Entre em contato com o administrador.';
    }

    const isGemini = config.provider === 'gemini';
    const hasKey = isGemini ? !!config.gemini_api_key : !!config.api_key;
    if (!hasKey) {
      return 'O assistente não está configurado ainda. O administrador precisa inserir a chave de API nas configurações.';
    }

    const empresaResult = await query('SELECT nome FROM empresas WHERE id = $1', [empresaId]);
    const empresaNome = empresaResult.rows[0]?.nome || 'Família';

    const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const hojeISO = new Date().toISOString().split('T')[0];

    const adminCapabilities = nivel === 'super_admin'
      ? '\n- Gerenciar assinaturas de empresas (suspender, cancelar, ativar) — apenas quando explicitamente solicitado'
      : '';

    const systemPrompt = `Você é a Sexta-feira, consultora IA da ${empresaNome}.
Você está conversando com ${usuarioNome}.
Hoje é ${hoje} (${hojeISO}).

Suas capacidades:
- Consultoria do sistema: explicar como usar CRM, Dashboard, Automações de grupo WhatsApp, Agente IA, Configurações SMTP, Parcelas, Receitas, Despesas
- Suporte operacional à equipe (vendas, atendimento, gestão) com base no negócio da empresa
- Criar scripts de abordagem personalizados para vendas e prospecção
- Consultar e explicar receitas, despesas, saldo e parcelas
- Adicionar novas despesas e receitas quando solicitado
- Analisar padrões de gasto, comparar meses, identificar gastos excessivos
- Fazer projeções de saldo com base nas parcelas pendentes
- Responder perguntas financeiras de forma clara e educada${adminCapabilities}

Diretrizes:
- Quando o usuário perguntar "como faço X no sistema?", responda com passos claros e objetivos
- Ao gerar scripts de abordagem, use o tom e contexto do negócio; peça dados do lead quando útil
- Use valores sempre em R$ com 2 casas decimais
- Formate tabelas e listas em markdown quando útil
- Antes de criar uma despesa ou receita, confirme os dados com o usuário (descricao, valor, data, categoria/fonte)
- Se o usuário confirmar a criação, use a ferramenta sem pedir nova confirmação
- Antes de suspender ou cancelar uma empresa, peça confirmação explícita com o ID da empresa
- Seja objetiva, direta e use linguagem amigável — você é parceira da equipe
- Quando não houver dados para um período, informe claramente`;

    const historico = await this.getHistorico(usuarioId, config.contexto_mensagens || 20);
    const messages: any[] = [
      ...historico.map((h: any) => ({ role: h.role, content: h.conteudo })),
      { role: 'user', content: mensagem }
    ];

    console.log(`[ChatFinanceiro] #${usuarioId} → ${empresaNome} | ${config.provider || 'claude'}/${config.modelo || 'padrão'}`);

    let finalText = '';
    const MAX_ITERATIONS = 10;
    const deadline = Date.now() + 120_000;
    const toolsAtivos = nivel === 'super_admin'
      ? [...TOOL_DEFINITIONS, ...TOOL_ADMIN]
      : TOOL_DEFINITIONS;

    if (isGemini) {
      // ── Gemini — agentic loop com function calling ──────────────────────────
      const GEMINI_FUNCTION_DECLARATIONS = toolsAtivos.map((t: any) => ({
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      }));

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${config.modelo || 'gemini-2.5-flash'}:generateContent?key=${config.gemini_api_key}`;
      const contents: any[] = [
        ...historico.map((h: any) => ({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.conteudo }],
        })),
        { role: 'user', parts: [{ text: mensagem }] },
      ];

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        if (Date.now() > deadline) {
          console.warn(`[ChatFinanceiro] Deadline de 2min atingido (Gemini) para usuário #${usuarioId}`);
          break;
        }
        const geminiResp = await axios.post(
          geminiUrl,
          {
            contents,
            systemInstruction: { parts: [{ text: systemPrompt }] },
            tools: [{ functionDeclarations: GEMINI_FUNCTION_DECLARATIONS }],
            generationConfig: { maxOutputTokens: config.max_tokens || 2048, temperature: 0.7 },
          },
          { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
        );

        const candidate = geminiResp.data?.candidates?.[0];
        const parts: any[] = candidate?.content?.parts || [];
        contents.push({ role: 'model', parts });

        const funcCallPart = parts.find((p: any) => p.functionCall);
        if (funcCallPart) {
          const { name, args } = funcCallPart.functionCall;
          console.log(`[ChatFinanceiro] Gemini tool: ${name}`, args);
          const resultado = await executarFerramenta(name, args, usuarioId, nivel);
          contents.push({
            role: 'function',
            parts: [{ functionResponse: { name, response: { result: JSON.stringify(resultado) } } }],
          });
          continue;
        }

        finalText = (parts.find((p: any) => p.text)?.text || '').trim();
        break;
      }
    } else {
      // ── Claude — agentic loop com tool_use nativo ────────────────────────────
      const anthropic = new Anthropic({ apiKey: config.api_key });

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        if (Date.now() > deadline) {
          console.warn(`[ChatFinanceiro] Deadline de 2min atingido (Claude) para usuário #${usuarioId}`);
          break;
        }
        const response = await anthropic.messages.create({
          model: config.modelo || 'claude-sonnet-4-6',
          max_tokens: config.max_tokens || 2048,
          system: systemPrompt,
          tools: toolsAtivos,
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
              console.log(`[ChatFinanceiro] Tool: ${block.name}`, block.input);
              const resultado = await executarFerramenta(block.name, block.input, usuarioId, nivel);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(resultado)
              });
            }
          }
          messages.push({ role: 'user', content: toolResults });
          continue;
        }

        break;
      }
    }

    if (!finalText.trim()) {
      finalText = 'Desculpe, não consegui processar sua solicitação. Tente novamente.';
    }

    console.log(`[ChatFinanceiro] Resposta gerada: ${finalText.length} chars para usuário #${usuarioId}`);

    await this.salvarMensagem(usuarioId, 'user', mensagem);
    await this.salvarMensagem(usuarioId, 'assistant', finalText);

    return finalText;
  }
};
