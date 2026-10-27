import { query } from '../../config/database';
import { escopoDono, type FiltroDono } from '../../shared/escopoFinanceiro';
import { isSuperAdmin } from '../../shared/roles';
import { temPermissao } from '../../shared/permissoes';
import { dataVencimentoDe } from '../../shared/utils';
import { despesasService } from '../despesas/despesas.service';
import { receitasService } from '../receitas/receitas.service';
import { parcelasService } from '../parcelas/parcelas.service';
import { categoriasService } from '../categorias/categorias.service';
import { assinaturasService } from '../assinaturas/assinaturas.service';
import { leadsService } from '../crm/leads/leads.service';
import { tarefasService } from '../crm/tarefas/tarefas.service';
import { anotacoesService } from '../crm/anotacoes/anotacoes.service';
import { temCapacidade, CATALOGO } from '../../shared/capacidades';
import { contatosService } from '../crm/contatos/contatos.service';
import { followupsService } from '../crm/followups/followups.service';
import { disparosService } from '../crm/disparos/disparos.service';
import { leadSaiu } from '../crm/optout/optout.service';
import { podeDispararEmMassa, MSG_PRIMEIRO_CONTATO_SO_OFICIAL } from '../whatsapp/canal/contas';
import { duoCreditos } from './creditos';

/**
 * Cardápio de ações do Duo (21/10/2026).
 *
 * A IA nunca escreve SQL nem escolhe de quem é o dado: ela só escolhe uma ação desta
 * lista, e cada ação roda com o `ContextoDuo` montado pelo servidor a partir do login.
 *
 *   - Quem é a pessoa e a empresa dela vêm do banco (id do JWT), nunca do que a IA diz.
 *   - Só aparecem para a IA as ações que a pessoa pode fazer nas telas (`pode`), e a
 *     checagem se repete na execução.
 *   - O escopo é o das telas (`escopoDono`): master/creator veem a empresa, comum só o
 *     que lançou. O super_admin, no chat, fica na própria empresa como creator — o
 *     agente não atravessa contas.
 *   - Gravar vem pelos services das telas, nunca por SQL próprio.
 *   - Não existe ação de excluir.
 *   - Ação que grava é proposta (`duo_acoes`, status pendente) e só roda com
 *     `confirmar_acao` numa mensagem SEGUINTE da pessoa (ver `confirmar`). Nada que
 *     apareça dentro de um resultado de ferramenta consegue confirmar sozinho.
 */

export interface ContextoDuo {
  usuarioId: number;
  empresaId: number;
  nome: string;
  nivel: string | null;
  tipo_usuario: string | null;
  permissoes: Record<string, boolean> | null;
  /** O plano da empresa inclui CRM (o super_admin passa, como no `exigirCapacidade`). */
  crm: boolean;
  /** Quando chegou a mensagem atual — proposta criada depois disso não pode ser confirmada nela. */
  inicio: Date;
}

/** Recarrega a pessoa do banco. Sem usuário ativo na empresa do token, não há contexto. */
export async function carregarContexto(usuarioId: number, empresaIdToken: number): Promise<ContextoDuo | null> {
  const r = await query(
    `SELECT id, nome, empresa_id, nivel, tipo_usuario, permissoes FROM usuarios WHERE id = $1 AND ativo`,
    [usuarioId]
  );
  const u = r.rows[0];
  if (!u || Number(u.empresa_id) !== Number(empresaIdToken)) return null;
  const crm = isSuperAdmin(u) || await temCapacidade(Number(u.empresa_id), 'crm').catch(() => true);
  return {
    usuarioId: Number(u.id),
    empresaId: Number(u.empresa_id),
    nome: u.nome || '',
    nivel: u.nivel,
    tipo_usuario: u.tipo_usuario,
    permissoes: u.permissoes || {},
    crm,
    inicio: new Date(),
  };
}

const filtro = (ctx: ContextoDuo): FiltroDono => ({
  usuario_id: ctx.usuarioId,
  empresa_id: ctx.empresaId,
  tipo_usuario: isSuperAdmin(ctx) ? 'creator' : ctx.tipo_usuario,
  nivel: undefined,
});

// ─── Validação da entrada (a IA pode mandar qualquer coisa) ──────────────────

class EntradaInvalida extends Error {}

const texto = (v: any, campo: string, obrigatorio = false): string | undefined => {
  if (v === undefined || v === null || v === '') {
    if (obrigatorio) throw new EntradaInvalida(`Falta ${campo}.`);
    return undefined;
  }
  const s = String(v).trim();
  if (!s && obrigatorio) throw new EntradaInvalida(`Falta ${campo}.`);
  return s.slice(0, 200) || undefined;
};

const valor = (v: any, obrigatorio = false): number | undefined => {
  if (v === undefined || v === null || v === '') {
    if (obrigatorio) throw new EntradaInvalida('Falta o valor.');
    return undefined;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 100_000_000) throw new EntradaInvalida('Valor inválido.');
  return Math.round(n * 100) / 100;
};

const data = (v: any, campo: string, obrigatorio = false): string | undefined => {
  if (v === undefined || v === null || v === '') {
    if (obrigatorio) throw new EntradaInvalida(`Falta ${campo}.`);
    return undefined;
  }
  const s = String(v);
  const d = new Date(`${s}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw new EntradaInvalida(`${campo} precisa estar no formato AAAA-MM-DD.`);
  }
  return s;
};

const inteiro = (v: any, min: number, max: number, padrao: number): number => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : padrao;
};

/** Lançamentos e parcelas usam uuid. */
const uuid = (v: any, campo = 'id'): string => {
  const s = String(v ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)) throw new EntradaInvalida(`${campo} inválido.`);
  return s;
};

const id = (v: any, campo = 'id'): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new EntradaInvalida(`${campo} inválido.`);
  return n;
};

const statusLancamento = (v: any): 'pago' | 'pendente' | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  if (v === 'pago' || v === 'pendente') return v;
  throw new EntradaInvalida('Status precisa ser "pago" ou "pendente".');
};

/** Primeiro e último dia do mês, ou undefined se não veio mês nem ano. */
function periodo(input: any): { data_ini: string; data_fim: string } | undefined {
  if (!input.mes && !input.ano) return undefined;
  const hoje = new Date();
  const ano = inteiro(input.ano, 2000, 2100, hoje.getUTCFullYear());
  if (!input.mes) return { data_ini: `${ano}-01-01`, data_fim: `${ano}-12-31` };
  const mes = inteiro(input.mes, 1, 12, hoje.getUTCMonth() + 1);
  const fim = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
  return { data_ini: `${ano}-${String(mes).padStart(2, '0')}-01`, data_fim: fim };
}

const brl = (n: any) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (s: any) => dataVencimentoDe(s).split('-').reverse().join('/');

/**
 * Data e hora de tarefa, que a IA manda no horário de Brasília ("AAAA-MM-DD HH:MM").
 * Vira o instante em UTC, como a tela manda (`toISOString()` do navegador).
 * Só data = 09:00.
 */
const dataHora = (v: any, campo: string, obrigatorio = false): string | undefined => {
  if (v === undefined || v === null || v === '') {
    if (obrigatorio) throw new EntradaInvalida(`Falta ${campo}.`);
    return undefined;
  }
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(String(v).trim());
  const d = m && new Date(`${m[1]}T${m[2] ?? '09'}:${m[3] ?? '00'}:00-03:00`);
  if (!m || !d || isNaN(d.getTime())) throw new EntradaInvalida(`Data/hora inválida em ${campo}: use AAAA-MM-DD HH:MM.`);
  return d.toISOString();
};

const dataHoraBr = (v: any) => v
  ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : null;

const TIPOS_TAREFA = ['ligacao', 'reuniao', 'email', 'follow_up', 'proposta', 'visita', 'outros'] as const;
const PRIORIDADES = ['baixa', 'normal', 'alta', 'urgente'] as const;
const TEMPERATURAS = ['frio', 'morno', 'quente'] as const;

const umDe = <T extends string>(v: any, lista: readonly T[], campo: string): T | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  if ((lista as readonly string[]).includes(v)) return v;
  throw new EntradaInvalida(`${campo} precisa ser um de: ${lista.join(', ')}.`);
};

/** Lead da empresa da pessoa — o CRM é da empresa toda, como no quadro. */
async function leadDa(ctx: ContextoDuo, v: any) {
  const lead = await leadsService.getById(id(v, 'lead_id'), ctx.empresaId);
  if (!lead) throw new EntradaInvalida('Lead não encontrado.');
  return lead as any;
}

async function tarefaDa(ctx: ContextoDuo, v: any) {
  const t = await tarefasService.getById(id(v, 'tarefa_id'), ctx.empresaId);
  if (!t) throw new EntradaInvalida('Tarefa não encontrada.');
  return t as any;
}

/** Responsável tem que ser alguém ativo da mesma empresa. */
async function responsavelDa(ctx: ContextoDuo, v: any): Promise<{ id: number; nome: string } | undefined> {
  if (v === undefined || v === null || v === '') return undefined;
  const r = await query(
    `SELECT id, nome FROM usuarios WHERE id = $1 AND empresa_id = $2 AND ativo`,
    [id(v, 'responsavel_id'), ctx.empresaId]
  );
  if (!r.rows[0]) throw new EntradaInvalida('Responsável não encontrado na equipe.');
  return { id: Number(r.rows[0].id), nome: r.rows[0].nome };
}

const resumoLead = (l: any) => ({
  id: Number(l.id), nome: l.nome, telefone: l.telefone, email: l.email, empresa: l.empresa,
  funil_id: l.funil_id, etapa: l.estagio_nome, etapa_id: l.estagio_id,
  responsavel: l.responsavel_nome, temperatura: l.temperatura,
  valor_potencial: Number(l.valor_potencial) || 0, origem: l.origem, arquivado: !!l.arquivado,
  tags: (l.tags || []).map((t: any) => t.nome),
  proxima_tarefa: l.proxima_tarefa
    ? { ...l.proxima_tarefa, data_vencimento: dataHoraBr(l.proxima_tarefa.data_vencimento) }
    : null,
});

const resumoTarefa = (t: any) => ({
  id: Number(t.id), lead_id: Number(t.lead_id), lead: t.lead_nome, titulo: t.titulo, tipo: t.tipo,
  vencimento: dataHoraBr(t.data_vencimento), status: t.status, prioridade: t.prioridade,
  responsavel: t.responsavel_nome,
});

const podeCrm = (ctx: ContextoDuo) => ctx.crm && temPermissao(ctx, 'crm');

/** Disparo em massa: plano com a capacidade e remetente no canal que pode (regras das rotas de disparo). */
async function garantirDisparo(ctx: ContextoDuo) {
  if (!isSuperAdmin(ctx) && !(await temCapacidade(ctx.empresaId, 'disparo_whatsapp'))) {
    throw new EntradaInvalida(CATALOGO.disparo_whatsapp.motivo);
  }
  if (!(await podeDispararEmMassa(ctx.usuarioId))) throw new EntradaInvalida(MSG_PRIMEIRO_CONTATO_SO_OFICIAL);
}

// ─── Definição das ações ──────────────────────────────────────────────────────

interface Acao {
  nome: string;
  descricao: string;
  schema: Record<string, any>;
  /** A pessoa pode usar esta ação? Mesma regra das telas. */
  pode: (ctx: ContextoDuo) => boolean;
  /** Ação de leitura: devolve o resultado direto. */
  consultar?: (ctx: ContextoDuo, input: any) => Promise<any>;
  /** Ação que grava: valida, mostra o que vai fazer e guarda a entrada já normalizada. */
  preparar?: (ctx: ContextoDuo, input: any) => Promise<{ resumo: string; entrada: any; antes?: any }>;
  /** Roda a ação confirmada. Devolve o "depois" para o registro. */
  executar?: (ctx: ContextoDuo, entrada: any) => Promise<any>;
}

const objeto = (properties: Record<string, any>, required: string[] = []) => ({
  type: 'object', properties, required, additionalProperties: false,
});

const pode = (...modulos: string[]) => (ctx: ContextoDuo) => modulos.some(m => temPermissao(ctx, m));

const PROPS_PERIODO = {
  mes: { type: 'integer', description: 'Mês (1-12).' },
  ano: { type: 'integer', description: 'Ano com 4 dígitos.' },
};

const resumoDespesa = (d: any) => ({
  id: d.id, descricao: d.descricao, valor: Number(d.valor), data: dataVencimentoDe(d.data),
  categoria: d.categoria, status: d.status, tipo_pagamento: d.tipo_pagamento,
  numero_parcelas: d.numero_parcelas,
});

const resumoReceita = (r: any) => ({
  id: r.id, descricao: r.descricao, valor: Number(r.valor), data: dataVencimentoDe(r.data),
  fonte: r.fonte, status: r.status, tipo_pagamento: r.tipo_pagamento,
  numero_parcelas: r.numero_parcelas, cliente: r.cliente_nome || null,
});

const ACOES: Acao[] = [
  // ── Consultas ──────────────────────────────────────────────────────────────
  {
    nome: 'resumo_financeiro',
    descricao: 'Totais de receitas e despesas (pagas e pendentes) e saldo de um mês, de um ano ou de todo o período. Use para "qual meu saldo", "quanto entrou/saiu".',
    schema: objeto({
      ...PROPS_PERIODO,
      todos_os_meses: { type: 'boolean', description: 'true para somar todo o período, sem filtro de data.' },
    }),
    pode: ctx => temPermissao(ctx, 'dashboard') || (temPermissao(ctx, 'receitas') && temPermissao(ctx, 'despesas')),
    async consultar(ctx, input) {
      const per = input.todos_os_meses ? undefined : (periodo(input) || periodo({ mes: new Date().getUTCMonth() + 1 }));
      const soma = async (tabela: 'despesas' | 'receitas') => {
        const [p, l, fk] = tabela === 'despesas' ? ['parcelas_despesas', 'd', 'despesa_id'] : ['parcelas_receitas', 'r', 'receita_id'];
        const params: any[] = [];
        let where = '1=1' + escopoDono(filtro(ctx), params, `${l}.usuario_id`);
        if (per) {
          params.push(per.data_ini, per.data_fim);
          where += ` AND pc.data_vencimento BETWEEN $${params.length - 1} AND $${params.length}`;
        }
        const r = await query(
          `SELECT COALESCE(SUM(CASE WHEN pc.status = 'PAGO' THEN pc.valor END), 0) AS pago,
                  COALESCE(SUM(CASE WHEN pc.status IN ('PENDENTE','ATRASADO') THEN pc.valor END), 0) AS pendente
             FROM ${p} pc JOIN ${tabela} ${l} ON pc.${fk} = ${l}.id
            WHERE ${where}`,
          params
        );
        return { pago: Number(r.rows[0].pago), pendente: Number(r.rows[0].pendente) };
      };
      const d = await soma('despesas');
      const r = await soma('receitas');
      return {
        periodo: per ? `${dataBr(per.data_ini)} a ${dataBr(per.data_fim)}` : 'todo o período',
        receitas_recebidas: r.pago, receitas_pendentes: r.pendente,
        despesas_pagas: d.pago, despesas_pendentes: d.pendente,
        saldo_atual: r.pago - d.pago,
        saldo_projetado: (r.pago + r.pendente) - (d.pago + d.pendente),
      };
    },
  },
  {
    nome: 'listar_despesas',
    descricao: 'Lista despesas, com filtros. Use também para achar o id de uma despesa antes de editar.',
    schema: objeto({
      busca: { type: 'string', description: 'Trecho da descrição.' },
      categoria: { type: 'string' },
      status: { type: 'string', enum: ['pago', 'pendente'] },
      ...PROPS_PERIODO,
      limite: { type: 'integer', description: 'Máximo de itens (padrão 20, até 50).' },
    }),
    pode: pode('despesas'),
    async consultar(ctx, input) {
      const r = await despesasService.list({
        ...filtro(ctx), ...periodo(input),
        busca: texto(input.busca, 'busca'), categoria: texto(input.categoria, 'categoria'),
        status: statusLancamento(input.status),
      }, 1, inteiro(input.limite, 1, 50, 20));
      return { total: r.total, despesas: r.data.map(resumoDespesa) };
    },
  },
  {
    nome: 'listar_receitas',
    descricao: 'Lista receitas, com filtros. Use também para achar o id de uma receita antes de editar.',
    schema: objeto({
      busca: { type: 'string', description: 'Trecho da descrição.' },
      fonte: { type: 'string' },
      status: { type: 'string', enum: ['pago', 'pendente'] },
      ...PROPS_PERIODO,
      limite: { type: 'integer', description: 'Máximo de itens (padrão 20, até 50).' },
    }),
    pode: pode('receitas'),
    async consultar(ctx, input) {
      const r = await receitasService.list({
        ...filtro(ctx), ...periodo(input),
        busca: texto(input.busca, 'busca'), fonte: texto(input.fonte, 'fonte'),
        status: statusLancamento(input.status),
      }, 1, inteiro(input.limite, 1, 50, 20));
      return { total: r.total, receitas: r.data.map(resumoReceita) };
    },
  },
  {
    nome: 'listar_categorias',
    descricao: 'Categorias de despesa ou fontes de receita cadastradas pela pessoa.',
    schema: objeto({ tipo: { type: 'string', enum: ['despesa', 'receita'] } }, ['tipo']),
    pode: pode('despesas', 'receitas'),
    async consultar(ctx, input) {
      const lista = input.tipo === 'receita'
        ? await categoriasService.listCategoriasReceitas(ctx.usuarioId)
        : await categoriasService.listCategoriasDespesas(ctx.usuarioId);
      return { categorias: lista.filter((c: any) => c.ativo !== false).map((c: any) => c.nome) };
    },
  },
  {
    nome: 'despesas_por_categoria',
    descricao: 'Despesas de um mês agrupadas por categoria (total, pago e pendente).',
    schema: objeto(PROPS_PERIODO),
    pode: pode('despesas', 'dashboard'),
    async consultar(ctx, input) {
      const per = periodo(input) || periodo({ mes: new Date().getUTCMonth() + 1 })!;
      const params: any[] = [per.data_ini, per.data_fim];
      const escopo = escopoDono(filtro(ctx), params, 'd.usuario_id');
      const r = await query(
        `SELECT d.categoria, COUNT(*)::int AS qtd, SUM(pd.valor) AS total,
                SUM(CASE WHEN pd.status = 'PAGO' THEN pd.valor ELSE 0 END) AS pago,
                SUM(CASE WHEN pd.status IN ('PENDENTE','ATRASADO') THEN pd.valor ELSE 0 END) AS pendente
           FROM parcelas_despesas pd JOIN despesas d ON pd.despesa_id = d.id
          WHERE pd.data_vencimento BETWEEN $1 AND $2 ${escopo}
          GROUP BY d.categoria ORDER BY total DESC`,
        params
      );
      return {
        periodo: `${dataBr(per.data_ini)} a ${dataBr(per.data_fim)}`,
        categorias: r.rows.map((x: any) => ({ ...x, total: Number(x.total), pago: Number(x.pago), pendente: Number(x.pendente) })),
      };
    },
  },
  {
    nome: 'evolucao_mensal',
    descricao: 'Receitas, despesas e saldo mês a mês, dos últimos meses.',
    schema: objeto({ meses: { type: 'integer', description: 'Quantos meses (padrão 6, até 24).' } }),
    pode: pode('dashboard'),
    async consultar(ctx, input) {
      const params: any[] = [inteiro(input.meses, 1, 24, 6)];
      const escR = escopoDono(filtro(ctx), params, 'r.usuario_id');
      const escD = escopoDono(filtro(ctx), params, 'd.usuario_id');
      const r = await query(
        `WITH meses AS (
           SELECT TO_CHAR(DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' * gs, 'YYYY-MM') AS mes
             FROM generate_series(0, $1 - 1) gs
         ), rec AS (
           SELECT TO_CHAR(pr.data_vencimento, 'YYYY-MM') AS mes,
                  SUM(CASE WHEN pr.status = 'PAGO' THEN pr.valor ELSE 0 END) AS recebido, SUM(pr.valor) AS previsto
             FROM parcelas_receitas pr JOIN receitas r ON pr.receita_id = r.id
            WHERE 1=1 ${escR} GROUP BY 1
         ), desp AS (
           SELECT TO_CHAR(pd.data_vencimento, 'YYYY-MM') AS mes,
                  SUM(CASE WHEN pd.status = 'PAGO' THEN pd.valor ELSE 0 END) AS pago, SUM(pd.valor) AS previsto
             FROM parcelas_despesas pd JOIN despesas d ON pd.despesa_id = d.id
            WHERE 1=1 ${escD} GROUP BY 1
         )
         SELECT m.mes, COALESCE(rec.recebido, 0) AS receitas_recebidas, COALESCE(rec.previsto, 0) AS receitas_previstas,
                COALESCE(desp.pago, 0) AS despesas_pagas, COALESCE(desp.previsto, 0) AS despesas_previstas
           FROM meses m LEFT JOIN rec ON rec.mes = m.mes LEFT JOIN desp ON desp.mes = m.mes
          ORDER BY m.mes DESC`,
        params
      );
      return {
        evolucao: r.rows.map((x: any) => {
          const n = (k: string) => Number(x[k]);
          return {
            mes: x.mes, receitas_recebidas: n('receitas_recebidas'), receitas_previstas: n('receitas_previstas'),
            despesas_pagas: n('despesas_pagas'), despesas_previstas: n('despesas_previstas'),
            saldo: n('receitas_recebidas') - n('despesas_pagas'),
          };
        }),
      };
    },
  },
  {
    nome: 'parcelas_a_vencer',
    descricao: 'Parcelas pendentes ou atrasadas que vencem até X dias à frente (atrasadas entram também). Traz o id de cada parcela, usado para dar baixa.',
    schema: objeto({
      dias: { type: 'integer', description: 'Dias à frente (padrão 30, até 365).' },
      tipo: { type: 'string', enum: ['despesa', 'receita', 'ambos'] },
    }),
    pode: pode('parcelas', 'dashboard'),
    async consultar(ctx, input) {
      const dias = inteiro(input.dias, 1, 365, 30);
      const busca = async (tipo: 'despesa' | 'receita') => {
        const [p, t, l, fk] = tipo === 'despesa'
          ? ['parcelas_despesas', 'despesas', 'd', 'despesa_id'] : ['parcelas_receitas', 'receitas', 'r', 'receita_id'];
        const params: any[] = [dias];
        const escopo = escopoDono(filtro(ctx), params, `${l}.usuario_id`);
        const r = await query(
          `SELECT pc.id AS parcela_id, ${l}.descricao, pc.numero_parcela, pc.total_parcelas, pc.valor,
                  pc.data_vencimento, pc.status
             FROM ${p} pc JOIN ${t} ${l} ON pc.${fk} = ${l}.id
            WHERE pc.status IN ('PENDENTE','ATRASADO')
              AND pc.data_vencimento <= CURRENT_DATE + ($1::int * INTERVAL '1 day') ${escopo}
            ORDER BY pc.data_vencimento LIMIT 30`,
          params
        );
        return r.rows.map((x: any) => ({ ...x, valor: Number(x.valor), data_vencimento: dataVencimentoDe(x.data_vencimento) }));
      };
      const tipo = input.tipo || 'ambos';
      const despesas = tipo !== 'receita' ? await busca('despesa') : [];
      const receitas = tipo !== 'despesa' ? await busca('receita') : [];
      return {
        a_pagar: despesas, total_a_pagar: despesas.reduce((s: number, x: any) => s + x.valor, 0),
        a_receber: receitas, total_a_receber: receitas.reduce((s: number, x: any) => s + x.valor, 0),
      };
    },
  },

  // ── Ações que gravam (sempre com confirmação) ──────────────────────────────
  {
    nome: 'lancar_despesa',
    descricao: 'Propõe lançar uma despesa. Não grava: devolve o resumo para a pessoa confirmar.',
    schema: objeto({
      descricao: { type: 'string' },
      valor: { type: 'number', description: 'Valor total em R$.' },
      data: { type: 'string', description: 'AAAA-MM-DD. Em parcelado, vencimento da 1ª parcela.' },
      categoria: { type: 'string' },
      status: { type: 'string', enum: ['pago', 'pendente'], description: 'Padrão: pago se a data já passou, senão pendente.' },
      numero_parcelas: { type: 'integer', description: 'Mais de 1 = parcelado mês a mês.' },
    }, ['descricao', 'valor', 'data', 'categoria']),
    pode: pode('despesas'),
    async preparar(_ctx, input) {
      const e = {
        descricao: texto(input.descricao, 'a descrição', true)!,
        valor: valor(input.valor, true)!,
        data: data(input.data, 'a data', true)!,
        categoria: texto(input.categoria, 'a categoria', true)!,
        numero_parcelas: inteiro(input.numero_parcelas, 1, 120, 1),
        status: statusLancamento(input.status),
      };
      if (e.numero_parcelas > 1) e.status = 'pendente';
      e.status ??= e.data < new Date().toISOString().slice(0, 10) ? 'pago' : 'pendente';
      const parc = e.numero_parcelas > 1 ? ` em ${e.numero_parcelas} parcelas, a 1ª vencendo em ${dataBr(e.data)}` : `, data ${dataBr(e.data)}`;
      return { entrada: e, resumo: `Lançar a despesa "${e.descricao}", ${brl(e.valor)}${parc}, categoria ${e.categoria}, como ${e.status}.` };
    },
    async executar(ctx, e) {
      const d = await despesasService.create({
        ...e, usuario_id: ctx.usuarioId,
        tipo_pagamento: e.numero_parcelas > 1 ? 'parcelado' : 'a_vista',
        // À vista grava numero_parcelas NULL, como a tela (o banco recusa 1).
        numero_parcelas: e.numero_parcelas > 1 ? e.numero_parcelas : null,
      });
      return resumoDespesa(d);
    },
  },
  {
    nome: 'lancar_receita',
    descricao: 'Propõe lançar uma receita. Não grava: devolve o resumo para a pessoa confirmar.',
    schema: objeto({
      descricao: { type: 'string' },
      valor: { type: 'number', description: 'Valor total em R$.' },
      data: { type: 'string', description: 'AAAA-MM-DD. Em parcelado, vencimento da 1ª parcela.' },
      fonte: { type: 'string' },
      status: { type: 'string', enum: ['pago', 'pendente'], description: 'Padrão: pago (recebida) se a data já passou, senão pendente.' },
      numero_parcelas: { type: 'integer', description: 'Mais de 1 = parcelado mês a mês.' },
    }, ['descricao', 'valor', 'data', 'fonte']),
    pode: pode('receitas'),
    async preparar(_ctx, input) {
      const e = {
        descricao: texto(input.descricao, 'a descrição', true)!,
        valor: valor(input.valor, true)!,
        data: data(input.data, 'a data', true)!,
        fonte: texto(input.fonte, 'a fonte', true)!,
        numero_parcelas: inteiro(input.numero_parcelas, 1, 120, 1),
        status: statusLancamento(input.status),
      };
      if (e.numero_parcelas > 1) e.status = 'pendente';
      e.status ??= e.data < new Date().toISOString().slice(0, 10) ? 'pago' : 'pendente';
      const parc = e.numero_parcelas > 1 ? ` em ${e.numero_parcelas} parcelas, a 1ª vencendo em ${dataBr(e.data)}` : `, data ${dataBr(e.data)}`;
      return { entrada: e, resumo: `Lançar a receita "${e.descricao}", ${brl(e.valor)}${parc}, fonte ${e.fonte}, como ${e.status === 'pago' ? 'recebida' : 'pendente'}.` };
    },
    async executar(ctx, e) {
      const r = await receitasService.create({
        ...e, usuario_id: ctx.usuarioId,
        tipo_pagamento: e.numero_parcelas > 1 ? 'parcelado' : 'a_vista',
        // À vista grava numero_parcelas NULL, como a tela (o banco recusa 1).
        numero_parcelas: e.numero_parcelas > 1 ? e.numero_parcelas : null,
      });
      return resumoReceita(r);
    },
  },
  {
    nome: 'editar_despesa',
    descricao: 'Propõe alterar uma despesa existente (pelo id de listar_despesas). Mande só os campos que mudam.',
    schema: objeto({
      id: { type: 'string', description: 'uuid do lançamento.' },
      descricao: { type: 'string' },
      valor: { type: 'number' },
      data: { type: 'string', description: 'AAAA-MM-DD' },
      categoria: { type: 'string' },
      status: { type: 'string', enum: ['pago', 'pendente'] },
    }, ['id']),
    pode: pode('despesas'),
    async preparar(ctx, input) {
      const atual = await despesasService.getById(uuid(input.id), filtro(ctx));
      const mud: any = {
        descricao: texto(input.descricao, 'descrição'), valor: valor(input.valor),
        data: data(input.data, 'a data'), categoria: texto(input.categoria, 'categoria'),
        status: statusLancamento(input.status),
      };
      Object.keys(mud).forEach(k => mud[k] === undefined && delete mud[k]);
      if (!Object.keys(mud).length) throw new EntradaInvalida('Nenhum campo para alterar.');
      const antes = resumoDespesa(atual);
      const lista = Object.entries(mud).map(([k, v]) =>
        `${k} de ${k === 'valor' ? brl((antes as any)[k]) : k === 'data' ? dataBr((antes as any)[k]) : (antes as any)[k]} para ${k === 'valor' ? brl(v) : k === 'data' ? dataBr(v) : v}`);
      return { entrada: { id: atual.id, ...mud }, antes, resumo: `Alterar a despesa "${atual.descricao}": ${lista.join('; ')}.` };
    },
    async executar(ctx, e) {
      const { id: despesaId, ...mud } = e;
      // O update da tela regrava todos os campos: parte do registro atual.
      const atual = await despesasService.getById(String(despesaId), filtro(ctx));
      const d = await despesasService.update(String(despesaId), {
        ...atual, ...mud, data: mud.data ?? dataVencimentoDe(atual.data),
      }, filtro(ctx));
      return resumoDespesa(d);
    },
  },
  {
    nome: 'editar_receita',
    descricao: 'Propõe alterar uma receita existente (pelo id de listar_receitas). Mande só os campos que mudam.',
    schema: objeto({
      id: { type: 'string', description: 'uuid do lançamento.' },
      descricao: { type: 'string' },
      valor: { type: 'number' },
      data: { type: 'string', description: 'AAAA-MM-DD' },
      fonte: { type: 'string' },
      status: { type: 'string', enum: ['pago', 'pendente'] },
    }, ['id']),
    pode: pode('receitas'),
    async preparar(ctx, input) {
      const atual = await receitasService.getById(uuid(input.id), filtro(ctx));
      const mud: any = {
        descricao: texto(input.descricao, 'descrição'), valor: valor(input.valor),
        data: data(input.data, 'a data'), fonte: texto(input.fonte, 'fonte'),
        status: statusLancamento(input.status),
      };
      Object.keys(mud).forEach(k => mud[k] === undefined && delete mud[k]);
      if (!Object.keys(mud).length) throw new EntradaInvalida('Nenhum campo para alterar.');
      const antes = resumoReceita(atual);
      const lista = Object.entries(mud).map(([k, v]) =>
        `${k} de ${k === 'valor' ? brl((antes as any)[k]) : k === 'data' ? dataBr((antes as any)[k]) : (antes as any)[k]} para ${k === 'valor' ? brl(v) : k === 'data' ? dataBr(v) : v}`);
      return { entrada: { id: atual.id, ...mud }, antes, resumo: `Alterar a receita "${atual.descricao}": ${lista.join('; ')}.` };
    },
    async executar(ctx, e) {
      const { id: receitaId, ...mud } = e;
      const r = await receitasService.update(String(receitaId), mud, filtro(ctx));
      return resumoReceita(r);
    },
  },
  {
    nome: 'marcar_parcela_paga',
    descricao: 'Propõe dar baixa numa parcela (id de parcelas_a_vencer): despesa paga ou receita recebida.',
    schema: objeto({
      tipo: { type: 'string', enum: ['despesa', 'receita'] },
      parcela_id: { type: 'string', description: 'uuid da parcela.' },
      data_pagamento: { type: 'string', description: 'AAAA-MM-DD. Padrão: hoje.' },
    }, ['tipo', 'parcela_id']),
    pode: pode('parcelas'),
    async preparar(ctx, input) {
      const tipo = input.tipo === 'receita' ? 'receita' : 'despesa';
      const [p, t, l, fk] = tipo === 'despesa'
        ? ['parcelas_despesas', 'despesas', 'd', 'despesa_id'] : ['parcelas_receitas', 'receitas', 'r', 'receita_id'];
      const params: any[] = [uuid(input.parcela_id, 'parcela_id')];
      const escopo = escopoDono(filtro(ctx), params, `${l}.usuario_id`);
      const r = await query(
        `SELECT pc.id, pc.numero_parcela, pc.total_parcelas, pc.valor, pc.data_vencimento, pc.status, ${l}.descricao
           FROM ${p} pc JOIN ${t} ${l} ON pc.${fk} = ${l}.id
          WHERE pc.id = $1 ${escopo}`,
        params
      );
      const parc = r.rows[0];
      if (!parc) throw new EntradaInvalida('Parcela não encontrada.');
      if (parc.status === 'PAGO') throw new EntradaInvalida('Essa parcela já está paga.');
      const dataPagamento = data(input.data_pagamento, 'a data de pagamento') || new Date().toISOString().slice(0, 10);
      const antes = { ...parc, valor: Number(parc.valor), data_vencimento: dataVencimentoDe(parc.data_vencimento) };
      return {
        entrada: { tipo, parcela_id: parc.id, data_pagamento: dataPagamento },
        antes,
        resumo: `Marcar como ${tipo === 'despesa' ? 'paga' : 'recebida'} a parcela ${parc.numero_parcela}/${parc.total_parcelas} de "${parc.descricao}", ${brl(parc.valor)}, em ${dataBr(dataPagamento)}.`,
      };
    },
    async executar(ctx, e) {
      const dados = { status: 'PAGO', data_pagamento: e.data_pagamento };
      return e.tipo === 'receita'
        ? parcelasService.updateParcelaReceita(String(e.parcela_id), dados, filtro(ctx))
        : parcelasService.updateParcelaDespesa(String(e.parcela_id), dados, filtro(ctx));
    },
  },

  // ── CRM (22/10/2026) ───────────────────────────────────────────────────────
  // O CRM é da empresa toda (o quadro mostra todos os cards a qualquer um com o
  // módulo), então o escopo é `empresaId`. Nada aqui envia WhatsApp nem agenda
  // follow-up; mover de etapa roda as automações da etapa, como arrastar no quadro.
  {
    nome: 'listar_funis',
    descricao: 'Funis do CRM com as etapas (id, nome, se é ganho/perdido) e a equipe (id e nome, para escolher responsável). Use antes de criar ou mover lead.',
    schema: objeto({}),
    pode: podeCrm,
    async consultar(ctx) {
      const f = await query(
        `SELECT f.id, f.nome, f.tipo,
                COALESCE(json_agg(json_build_object('id', e.id, 'nome', e.nome, 'entrada', e.is_entrada,
                                                    'ganho', e.is_ganho, 'perdido', e.is_perdido) ORDER BY e.ordem)
                         FILTER (WHERE e.id IS NOT NULL), '[]') AS etapas
           FROM funis f LEFT JOIN estagios_funil e ON e.funil_id = f.id
          WHERE f.empresa_id = $1 AND f.ativo IS NOT FALSE
          GROUP BY f.id ORDER BY f.tipo, f.nome`,
        [ctx.empresaId]
      );
      const u = await query(`SELECT id, nome FROM usuarios WHERE empresa_id = $1 AND ativo ORDER BY nome`, [ctx.empresaId]);
      return { funis: f.rows, equipe: u.rows, voce: ctx.usuarioId };
    },
  },
  {
    nome: 'buscar_leads',
    descricao: 'Busca leads (cards) do CRM por nome, telefone, e-mail ou empresa, com filtros. Traz o id usado nas outras ações do CRM.',
    schema: objeto({
      busca: { type: 'string', description: 'Trecho do nome, telefone, e-mail ou empresa.' },
      funil_id: { type: 'integer' },
      etapa_id: { type: 'integer' },
      meus: { type: 'boolean', description: 'true = só os leads em que a pessoa é responsável.' },
      temperatura: { type: 'string', enum: [...TEMPERATURAS] },
      arquivados: { type: 'boolean', description: 'true = procurar entre os arquivados.' },
      limite: { type: 'integer', description: 'Máximo de itens (padrão 15, até 50).' },
    }),
    pode: podeCrm,
    async consultar(ctx, input) {
      const params: any[] = [ctx.empresaId, input.arquivados === true];
      let where = 'l.empresa_id = $1 AND COALESCE(l.arquivado, false) = $2';
      const busca = texto(input.busca, 'busca');
      if (busca) {
        params.push(`%${busca}%`);
        const digitos = busca.replace(/\D/g, '');
        let cond = `l.nome ILIKE $${params.length} OR l.email ILIKE $${params.length} OR l.empresa ILIKE $${params.length}`;
        if (digitos.length >= 4) {
          params.push(`%${digitos}%`);
          cond += ` OR l.telefone LIKE $${params.length}`;
        }
        where += ` AND (${cond})`;
      }
      if (input.funil_id) { params.push(id(input.funil_id, 'funil_id')); where += ` AND l.funil_id = $${params.length}`; }
      if (input.etapa_id) { params.push(id(input.etapa_id, 'etapa_id')); where += ` AND l.estagio_id = $${params.length}`; }
      if (input.meus) { params.push(ctx.usuarioId); where += ` AND l.responsavel_id = $${params.length}`; }
      const temp = umDe(input.temperatura, TEMPERATURAS, 'temperatura');
      if (temp) { params.push(temp); where += ` AND l.temperatura = $${params.length}`; }
      params.push(inteiro(input.limite, 1, 50, 15));
      const r = await query(
        `SELECT l.id, l.nome, l.telefone, l.email, l.empresa, l.temperatura, l.valor_potencial, l.origem,
                f.nome AS funil, e.nome AS etapa, ur.nome AS responsavel, COUNT(*) OVER () AS total
           FROM leads l
           JOIN estagios_funil e ON e.id = l.estagio_id
           JOIN funis f ON f.id = l.funil_id
           LEFT JOIN usuarios ur ON ur.id = l.responsavel_id
          WHERE ${where}
          ORDER BY l.updated_at DESC NULLS LAST, l.id DESC
          LIMIT $${params.length}`,
        params
      );
      return {
        total: Number(r.rows[0]?.total || 0),
        leads: r.rows.map(({ total, ...x }: any) => ({ ...x, valor_potencial: Number(x.valor_potencial) || 0 })),
      };
    },
  },
  {
    nome: 'ver_lead',
    descricao: 'Detalhes de um lead: dados, etapa, tags, tarefas abertas, follow-ups pendentes, últimas anotações e últimas atividades.',
    schema: objeto({ lead_id: { type: 'integer' } }, ['lead_id']),
    pode: podeCrm,
    async consultar(ctx, input) {
      const lead = await leadDa(ctx, input.lead_id);
      const tarefas = (await tarefasService.listByLead(lead.id, ctx.empresaId))
        .filter(t => t.status === 'pendente' || t.status === 'em_andamento');
      const notas = (await anotacoesService.listByLead(lead.id, ctx.empresaId)).slice(0, 5);
      const ativ = await leadsService.getAtividades(lead.id, ctx.empresaId, 5);
      const fups = (await followupsService.listarPorLead(lead.id, ctx.empresaId)).filter((f: any) => f.status === 'pendente');
      return {
        followups_pendentes: fups.map((f: any) => ({
          id: Number(f.id), quando: dataHoraBr(f.agendado_para), tipo: f.tipo,
          mensagem: f.mensagem ? String(f.mensagem).slice(0, 200) : null, instrucao_ia: f.instrucao_ia ? String(f.instrucao_ia).slice(0, 200) : null,
        })),
        lead: { ...resumoLead(lead), notas: lead.notas || null },
        tarefas_abertas: tarefas.map(resumoTarefa),
        ultimas_anotacoes: notas.map((a: any) => ({ conteudo: a.conteudo, por: a.usuario_nome, em: dataHoraBr(a.created_at) })),
        ultimas_atividades: ativ.map((a: any) => ({ descricao: a.descricao, em: dataHoraBr(a.created_at) })),
      };
    },
  },
  {
    nome: 'listar_tarefas',
    descricao: 'Tarefas abertas do CRM (ligações, reuniões, follow-ups...). Padrão: as da própria pessoa, atrasadas e de hoje.',
    schema: objeto({
      periodo: { type: 'string', enum: ['atrasadas', 'hoje', 'atrasadas_e_hoje', 'proximos_7_dias', 'todas'], description: 'Padrão: atrasadas_e_hoje.' },
      de_todos: { type: 'boolean', description: 'true = tarefas de toda a equipe, não só da pessoa.' },
      responsavel_id: { type: 'integer', description: 'Tarefas de alguém da equipe (id de listar_funis).' },
    }),
    pode: podeCrm,
    async consultar(ctx, input) {
      const params: any[] = [ctx.empresaId];
      let where = `t.empresa_id = $1 AND t.status IN ('pendente', 'em_andamento')`;
      const resp = input.responsavel_id ? id(input.responsavel_id, 'responsavel_id') : (input.de_todos ? null : ctx.usuarioId);
      if (resp) { params.push(resp); where += ` AND t.responsavel_id = $${params.length}`; }
      // "Hoje" é o dia em Brasília; data_vencimento é timestamp naive em UTC.
      const local = `(t.data_vencimento AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')`;
      const hoje = `(now() AT TIME ZONE 'America/Sao_Paulo')::date`;
      const filtros: Record<string, string> = {
        atrasadas: `${local} < now() AT TIME ZONE 'America/Sao_Paulo'`,
        hoje: `${local}::date = ${hoje}`,
        atrasadas_e_hoje: `${local}::date <= ${hoje}`,
        proximos_7_dias: `${local}::date <= ${hoje} + 7`,
        todas: 'true',
      };
      where += ` AND ${filtros[input.periodo] ?? filtros.atrasadas_e_hoje}`;
      const r = await query(
        `SELECT t.*, l.nome AS lead_nome, ur.nome AS responsavel_nome
           FROM tarefas_lead t
           JOIN leads l ON l.id = t.lead_id
           LEFT JOIN usuarios ur ON ur.id = t.responsavel_id
          WHERE ${where}
          ORDER BY t.data_vencimento LIMIT 40`,
        params
      );
      return { tarefas: r.rows.map(resumoTarefa) };
    },
  },
  {
    nome: 'criar_lead',
    descricao: 'Propõe criar um lead (card) num funil. Como na tela, todo lead nasce com uma primeira tarefa agendada.',
    schema: objeto({
      nome: { type: 'string' },
      funil_id: { type: 'integer' },
      etapa_id: { type: 'integer', description: 'Padrão: a etapa de entrada do funil.' },
      telefone: { type: 'string' },
      email: { type: 'string' },
      empresa: { type: 'string', description: 'Empresa do lead.' },
      origem: { type: 'string' },
      valor_potencial: { type: 'number' },
      temperatura: { type: 'string', enum: [...TEMPERATURAS] },
      responsavel_id: { type: 'integer', description: 'Padrão: a própria pessoa.' },
      notas: { type: 'string' },
      tarefa_titulo: { type: 'string', description: 'Padrão: "Primeiro contato".' },
      tarefa_tipo: { type: 'string', enum: [...TIPOS_TAREFA], description: 'Padrão: ligacao.' },
      tarefa_data_hora: { type: 'string', description: 'AAAA-MM-DD HH:MM, horário de Brasília.' },
    }, ['nome', 'funil_id', 'tarefa_data_hora']),
    pode: podeCrm,
    async preparar(ctx, input) {
      const f = await query(`SELECT id, nome FROM funis WHERE id = $1 AND empresa_id = $2`, [id(input.funil_id, 'funil_id'), ctx.empresaId]);
      if (!f.rows[0]) throw new EntradaInvalida('Funil não encontrado.');
      let etapa: any;
      if (input.etapa_id) {
        const e = await query(`SELECT id, nome FROM estagios_funil WHERE id = $1 AND funil_id = $2`, [id(input.etapa_id, 'etapa_id'), f.rows[0].id]);
        if (!e.rows[0]) throw new EntradaInvalida('Essa etapa não é deste funil.');
        etapa = e.rows[0];
      }
      const resp = await responsavelDa(ctx, input.responsavel_id);
      const e = {
        funil_id: Number(f.rows[0].id),
        estagio_id: etapa ? Number(etapa.id) : undefined,
        nome: texto(input.nome, 'o nome', true)!,
        telefone: texto(input.telefone, 'telefone'),
        email: texto(input.email, 'e-mail'),
        empresa: texto(input.empresa, 'empresa'),
        origem: texto(input.origem, 'origem') || 'manual',
        valor_potencial: valor(input.valor_potencial),
        temperatura: umDe(input.temperatura, TEMPERATURAS, 'temperatura'),
        responsavel_id: resp?.id,
        notas: input.notas ? String(input.notas).trim().slice(0, 2000) : undefined,
        tarefa_inicial: {
          titulo: texto(input.tarefa_titulo, 'título da tarefa') || 'Primeiro contato',
          tipo: umDe(input.tarefa_tipo, TIPOS_TAREFA, 'tipo da tarefa') || 'ligacao',
          data_vencimento: dataHora(input.tarefa_data_hora, 'a data da primeira tarefa', true)!,
        },
      };
      if (e.telefone) {
        const dup = await leadsService.telefoneExiste(e.telefone, ctx.empresaId, undefined, e.funil_id);
        if (dup.existe) throw new EntradaInvalida(`Já existe um lead com este telefone neste funil: "${dup.lead_nome}" (id ${dup.lead_id}).`);
      }
      const extras = [
        e.telefone && `telefone ${e.telefone}`, e.email && `e-mail ${e.email}`, e.empresa && `empresa ${e.empresa}`,
        e.valor_potencial && `valor ${brl(e.valor_potencial)}`, e.temperatura, resp && `responsável ${resp.nome}`,
      ].filter(Boolean);
      return {
        entrada: e,
        resumo: `Criar o lead "${e.nome}" no funil ${f.rows[0].nome}${etapa ? `, etapa ${etapa.nome}` : ''}`
          + `${extras.length ? ` (${extras.join(', ')})` : ''}, com a tarefa "${e.tarefa_inicial.titulo}" `
          + `(${e.tarefa_inicial.tipo}) em ${dataHoraBr(e.tarefa_inicial.data_vencimento)}.`,
      };
    },
    async executar(ctx, e) {
      const lead = await leadsService.create(ctx.empresaId, ctx.usuarioId, {
        ...e, tarefa_inicial: { ...e.tarefa_inicial, data_vencimento: new Date(e.tarefa_inicial.data_vencimento) },
      });
      return resumoLead(lead);
    },
  },
  {
    nome: 'editar_lead',
    descricao: 'Propõe alterar dados de um lead (id de buscar_leads). Mande só os campos que mudam. Para mudar de etapa use mover_lead.',
    schema: objeto({
      lead_id: { type: 'integer' },
      nome: { type: 'string' },
      telefone: { type: 'string' },
      email: { type: 'string' },
      empresa: { type: 'string' },
      origem: { type: 'string' },
      valor_potencial: { type: 'number' },
      temperatura: { type: 'string', enum: [...TEMPERATURAS] },
      responsavel_id: { type: 'integer' },
    }, ['lead_id']),
    pode: podeCrm,
    async preparar(ctx, input) {
      const lead = await leadDa(ctx, input.lead_id);
      const resp = await responsavelDa(ctx, input.responsavel_id);
      const mud: any = {
        nome: texto(input.nome, 'nome'), telefone: texto(input.telefone, 'telefone'),
        email: texto(input.email, 'e-mail'), empresa: texto(input.empresa, 'empresa'),
        origem: texto(input.origem, 'origem'), valor_potencial: valor(input.valor_potencial),
        temperatura: umDe(input.temperatura, TEMPERATURAS, 'temperatura'), responsavel_id: resp?.id,
      };
      // Fora o que não veio e o que já é igual ("responsável de Ana para Ana").
      Object.keys(mud).forEach(k => (mud[k] === undefined || String(mud[k]) === String(lead[k] ?? '')
        || (k === 'valor_potencial' && Number(mud[k]) === Number(lead[k]))) && delete mud[k]);
      if (!Object.keys(mud).length) throw new EntradaInvalida('Nada muda: o lead já está assim.');
      const antes = resumoLead(lead);
      const mostra = (k: string, v: any, ehAntes: boolean) =>
        k === 'valor_potencial' ? brl(v || 0)
        : k === 'responsavel_id' ? (ehAntes ? lead.responsavel_nome || 'ninguém' : resp!.nome)
        : (v || 'vazio');
      const lista = Object.entries(mud).map(([k, v]) =>
        `${k === 'responsavel_id' ? 'responsável' : k.replace('_', ' ')} de ${mostra(k, lead[k], true)} para ${mostra(k, v, false)}`);
      return { entrada: { lead_id: Number(lead.id), ...mud }, antes, resumo: `Alterar o lead "${lead.nome}": ${lista.join('; ')}.` };
    },
    async executar(ctx, e) {
      const { lead_id, ...mud } = e;
      const lead = await leadsService.update(Number(lead_id), ctx.empresaId, ctx.usuarioId, mud);
      if (!lead) throw new Error('Lead não encontrado.');
      return resumoLead(lead);
    },
  },
  {
    nome: 'mover_lead',
    descricao: 'Propõe mudar um lead de etapa dentro do mesmo funil (etapas em listar_funis). As automações da etapa nova rodam como ao arrastar no quadro.',
    schema: objeto({ lead_id: { type: 'integer' }, etapa_id: { type: 'integer' } }, ['lead_id', 'etapa_id']),
    pode: podeCrm,
    async preparar(ctx, input) {
      const lead = await leadDa(ctx, input.lead_id);
      const r = await query(
        `SELECT e.id, e.nome, e.is_ganho, e.is_perdido, e.followup_config, f.tipo AS funil_tipo
           FROM estagios_funil e JOIN funis f ON f.id = e.funil_id
          WHERE e.id = $1 AND e.funil_id = $2`,
        [id(input.etapa_id, 'etapa_id'), lead.funil_id]
      );
      const etapa = r.rows[0];
      if (!etapa) throw new EntradaInvalida('Essa etapa não é do funil deste lead.');
      if (Number(etapa.id) === Number(lead.estagio_id)) throw new EntradaInvalida(`O lead já está em ${etapa.nome}.`);
      const avisos: string[] = [];
      if (etapa.followup_config?.ativo) avisos.push('a etapa tem follow-up automático, que passa a valer para este lead');
      if (etapa.is_ganho && etapa.funil_tipo !== 'cx') {
        avisos.push('como é etapa de ganho, o lead vira cliente (e card no CX), mas a receita da venda não é lançada: lance pela tela ou peça para eu lançar');
      }
      return {
        entrada: { lead_id: Number(lead.id), estagio_id: Number(etapa.id) },
        antes: { etapa_id: lead.estagio_id, etapa: lead.estagio_nome },
        resumo: `Mover "${lead.nome}" de ${lead.estagio_nome} para ${etapa.nome}${avisos.length ? ` (${avisos.join('; ')})` : ''}.`,
      };
    },
    async executar(ctx, e) {
      const { lead } = await leadsService.mover(Number(e.lead_id), ctx.empresaId, ctx.usuarioId, {
        novo_estagio_id: Number(e.estagio_id), criar_receita: false,
      });
      if (!lead) throw new Error('Lead não encontrado.');
      return resumoLead(lead);
    },
  },
  {
    nome: 'anotar_lead',
    descricao: 'Propõe adicionar uma anotação no lead.',
    schema: objeto({
      lead_id: { type: 'integer' },
      conteudo: { type: 'string' },
      tipo: { type: 'string', enum: ['nota', 'importante', 'lembrete'], description: 'Padrão: nota.' },
    }, ['lead_id', 'conteudo']),
    pode: podeCrm,
    async preparar(ctx, input) {
      const lead = await leadDa(ctx, input.lead_id);
      const conteudo = String(input.conteudo ?? '').trim().slice(0, 4000);
      if (!conteudo) throw new EntradaInvalida('Falta o texto da anotação.');
      const tipo = umDe(input.tipo, ['nota', 'importante', 'lembrete'] as const, 'tipo') || 'nota';
      return {
        entrada: { lead_id: Number(lead.id), conteudo, tipo },
        resumo: `Anotar no lead "${lead.nome}"${tipo !== 'nota' ? ` (${tipo})` : ''}: "${conteudo.length > 160 ? conteudo.slice(0, 160) + '…' : conteudo}".`,
      };
    },
    async executar(ctx, e) {
      const a = await anotacoesService.create(ctx.empresaId, ctx.usuarioId, { lead_id: e.lead_id, conteudo: e.conteudo, tipo: e.tipo });
      return { anotacao_id: a.id, lead_id: e.lead_id };
    },
  },
  {
    nome: 'criar_tarefa',
    descricao: 'Propõe agendar uma tarefa num lead (ligação, reunião, e-mail, follow-up, proposta, visita ou outros). Reunião vai para a agenda do responsável se ela estiver conectada.',
    schema: objeto({
      lead_id: { type: 'integer' },
      titulo: { type: 'string' },
      tipo: { type: 'string', enum: [...TIPOS_TAREFA] },
      data_hora: { type: 'string', description: 'AAAA-MM-DD HH:MM, horário de Brasília.' },
      descricao: { type: 'string' },
      prioridade: { type: 'string', enum: [...PRIORIDADES], description: 'Padrão: normal.' },
      responsavel_id: { type: 'integer', description: 'Padrão: a própria pessoa.' },
    }, ['lead_id', 'titulo', 'tipo', 'data_hora']),
    pode: podeCrm,
    async preparar(ctx, input) {
      const lead = await leadDa(ctx, input.lead_id);
      const resp = await responsavelDa(ctx, input.responsavel_id);
      const e = {
        lead_id: Number(lead.id),
        titulo: texto(input.titulo, 'o título', true)!,
        tipo: umDe(input.tipo, TIPOS_TAREFA, 'tipo') || 'outros',
        data_vencimento: dataHora(input.data_hora, 'a data', true)!,
        descricao: input.descricao ? String(input.descricao).trim().slice(0, 2000) : undefined,
        prioridade: umDe(input.prioridade, PRIORIDADES, 'prioridade') || 'normal',
        responsavel_id: resp?.id,
      };
      return {
        entrada: e,
        resumo: `Agendar a tarefa "${e.titulo}" (${e.tipo}) no lead "${lead.nome}" para ${dataHoraBr(e.data_vencimento)}`
          + `${e.prioridade !== 'normal' ? `, prioridade ${e.prioridade}` : ''}${resp ? `, responsável ${resp.nome}` : ''}.`,
      };
    },
    async executar(ctx, e) {
      const t = await tarefasService.create(ctx.empresaId, ctx.usuarioId, { ...e, data_vencimento: new Date(e.data_vencimento) });
      return resumoTarefa(t);
    },
  },
  {
    nome: 'concluir_tarefa',
    descricao: 'Propõe marcar uma tarefa como concluída (id de listar_tarefas ou ver_lead).',
    schema: objeto({ tarefa_id: { type: 'integer' } }, ['tarefa_id']),
    pode: podeCrm,
    async preparar(ctx, input) {
      const t = await tarefaDa(ctx, input.tarefa_id);
      if (t.status === 'concluida' || t.status === 'cancelada') throw new EntradaInvalida(`Essa tarefa já está ${t.status}.`);
      const lead = await leadsService.getById(t.lead_id, ctx.empresaId);
      return {
        entrada: { tarefa_id: Number(t.id) },
        antes: resumoTarefa(t),
        resumo: `Concluir a tarefa "${t.titulo}" do lead "${lead?.nome ?? t.lead_id}" (vencimento ${dataHoraBr(t.data_vencimento)}).`,
      };
    },
    async executar(ctx, e) {
      const t = await tarefasService.concluir(Number(e.tarefa_id), ctx.empresaId, ctx.usuarioId);
      if (!t) throw new Error('Tarefa não encontrada.');
      return resumoTarefa(t);
    },
  },
  {
    nome: 'reagendar_tarefa',
    descricao: 'Propõe mudar a data/hora de uma tarefa aberta.',
    schema: objeto({
      tarefa_id: { type: 'integer' },
      data_hora: { type: 'string', description: 'AAAA-MM-DD HH:MM, horário de Brasília.' },
    }, ['tarefa_id', 'data_hora']),
    pode: podeCrm,
    async preparar(ctx, input) {
      const t = await tarefaDa(ctx, input.tarefa_id);
      if (t.status === 'concluida' || t.status === 'cancelada') throw new EntradaInvalida(`Essa tarefa já está ${t.status}.`);
      const nova = dataHora(input.data_hora, 'a nova data', true)!;
      return {
        entrada: { tarefa_id: Number(t.id), data_vencimento: nova },
        antes: resumoTarefa(t),
        resumo: `Reagendar a tarefa "${t.titulo}" de ${dataHoraBr(t.data_vencimento)} para ${dataHoraBr(nova)}.`,
      };
    },
    async executar(ctx, e) {
      const t = await tarefasService.update(Number(e.tarefa_id), ctx.empresaId, { data_vencimento: new Date(e.data_vencimento) });
      if (!t) throw new Error('Tarefa não encontrada.');
      return resumoTarefa(t);
    },
  },
  // ── CRM: conversas e WhatsApp (23/10/2026) ──────────────────────────────────
  // O Duo lê a conversa do card e escreve a mensagem; quem envia é o mesmo caminho
  // das telas (chat do card e disparo), com as mesmas travas de canal, opt-out e
  // limite diário. Disparo é sempre uma lista fechada de leads com um texto por lead.
  {
    nome: 'ler_conversas',
    descricao: 'Lê as últimas mensagens de WhatsApp de leads (por lista de ids ou por funil+etapa), com dados do card e a última anotação. Use para entender o contexto antes de escrever mensagens. Até 30 leads por chamada; use "pular" para paginar.',
    schema: objeto({
      lead_ids: { type: 'array', items: { type: 'integer' }, description: 'Leads específicos (até 30).' },
      funil_id: { type: 'integer' },
      etapa_id: { type: 'integer' },
      limite_leads: { type: 'integer', description: 'Por funil/etapa: quantos leads (padrão 20, até 30).' },
      pular: { type: 'integer', description: 'Por funil/etapa: quantos pular (paginação).' },
      mensagens_por_lead: { type: 'integer', description: 'Últimas mensagens de cada lead (padrão 10, até 20).' },
    }),
    pode: podeCrm,
    async consultar(ctx, input) {
      let ids: number[] = [];
      let total: number | undefined;
      if (Array.isArray(input.lead_ids) && input.lead_ids.length) {
        ids = [...new Set(input.lead_ids.slice(0, 30).map((v: any) => id(v, 'lead_id')))] as number[];
      } else if (input.funil_id) {
        const params: any[] = [ctx.empresaId, id(input.funil_id, 'funil_id')];
        let where = 'l.empresa_id = $1 AND l.funil_id = $2 AND NOT COALESCE(l.arquivado, false)';
        if (input.etapa_id) { params.push(id(input.etapa_id, 'etapa_id')); where += ` AND l.estagio_id = $${params.length}`; }
        params.push(inteiro(input.limite_leads, 1, 30, 20), inteiro(input.pular, 0, 100000, 0));
        const r = await query(
          `SELECT l.id, COUNT(*) OVER () AS total FROM leads l WHERE ${where}
            ORDER BY l.data_ultimo_contato DESC NULLS LAST, l.id DESC
            LIMIT $${params.length - 1} OFFSET $${params.length}`,
          params
        );
        ids = r.rows.map((x: any) => Number(x.id));
        total = Number(r.rows[0]?.total || 0);
      } else {
        throw new EntradaInvalida('Informe lead_ids ou funil_id (com etapa_id, se quiser).');
      }
      if (!ids.length) return { total: total ?? 0, leads: [] };

      const leads = await query(
        `SELECT l.id, l.nome, l.telefone, l.empresa, l.origem, l.temperatura, l.contato_whatsapp_id,
                e.nome AS etapa, f.nome AS funil, ur.nome AS responsavel,
                (SELECT a.conteudo FROM anotacoes_lead a WHERE a.lead_id = l.id ORDER BY a.created_at DESC LIMIT 1) AS ultima_anotacao
           FROM leads l
           JOIN estagios_funil e ON e.id = l.estagio_id
           JOIN funis f ON f.id = l.funil_id
           LEFT JOIN usuarios ur ON ur.id = l.responsavel_id
          WHERE l.id = ANY($1::int[]) AND l.empresa_id = $2`,
        [ids, ctx.empresaId]
      );
      const msgs = await query(
        `SELECT l.id AS lead_id, h.direcao, h.tipo, h.conteudo, h.erro, h.enviado_at
           FROM leads l
           CROSS JOIN LATERAL (
             SELECT h.direcao, h.tipo, h.conteudo, h.erro, h.enviado_at, h.id
               FROM historico_mensagens h
              WHERE h.empresa_id = l.empresa_id AND NOT h.copia_indevida AND h.grupo_whatsapp_id IS NULL
                AND (h.lead_id = l.id OR (l.contato_whatsapp_id IS NOT NULL AND h.contato_whatsapp_id = l.contato_whatsapp_id))
              ORDER BY h.enviado_at DESC NULLS LAST, h.id DESC
              LIMIT $3
           ) h
          WHERE l.id = ANY($1::int[]) AND l.empresa_id = $2`,
        [ids, ctx.empresaId, inteiro(input.mensagens_por_lead, 1, 20, 10)]
      );
      const porLead = new Map<number, any[]>();
      for (const m of msgs.rows) {
        const lista = porLead.get(Number(m.lead_id)) ?? [];
        lista.push(m);
        porLead.set(Number(m.lead_id), lista);
      }
      const ordem = new Map(ids.map((v, i) => [v, i]));
      const saida = [];
      for (const l of leads.rows.sort((a: any, b: any) => (ordem.get(Number(a.id)) ?? 0) - (ordem.get(Number(b.id)) ?? 0))) {
        const conversa = (porLead.get(Number(l.id)) ?? []).reverse();
        const ultimaDoLead = [...conversa].reverse().find(m => m.direcao === 'entrada');
        saida.push({
          lead_id: Number(l.id), nome: l.nome, primeiro_nome: String(l.nome || '').split(/\s+/)[0],
          empresa: l.empresa, funil: l.funil, etapa: l.etapa, responsavel: l.responsavel,
          origem: l.origem, temperatura: l.temperatura,
          tem_whatsapp: !!(l.telefone || l.contato_whatsapp_id),
          pediu_para_sair: await leadSaiu(Number(l.id)),
          ultima_mensagem_do_lead_em: ultimaDoLead ? dataHoraBr(ultimaDoLead.enviado_at) : null,
          ultima_anotacao: l.ultima_anotacao ? String(l.ultima_anotacao).slice(0, 300) : null,
          conversa: conversa.map(m => ({
            de: m.direcao === 'entrada' ? 'lead' : 'nos',
            texto: m.conteudo ? String(m.conteudo).slice(0, 500) : `[${m.tipo || 'mídia'}]`,
            em: dataHoraBr(m.enviado_at),
            ...(m.erro ? { falhou: true } : {}),
          })),
        });
      }
      return { ...(total !== undefined ? { total_na_etapa: total } : {}), leads: saida };
    },
  },
  {
    nome: 'enviar_whatsapp',
    descricao: 'Propõe enviar UMA mensagem de WhatsApp para um lead, como no chat do card (sai pelo WhatsApp do responsável do card). No número oficial, texto livre só chega se o lead escreveu nas últimas 24h.',
    schema: objeto({
      lead_id: { type: 'integer' },
      mensagem: { type: 'string' },
    }, ['lead_id', 'mensagem']),
    pode: podeCrm,
    async preparar(ctx, input) {
      const lead = await leadDa(ctx, input.lead_id);
      const mensagem = String(input.mensagem ?? '').trim().slice(0, 3000);
      if (!mensagem) throw new EntradaInvalida('Falta o texto da mensagem.');
      if (!lead.telefone && !lead.contato_whatsapp_id) throw new EntradaInvalida('Esse lead não tem telefone nem WhatsApp vinculado.');
      if (lead.arquivado) throw new EntradaInvalida('O lead está arquivado. Reative antes de mandar mensagem.');
      if (await leadSaiu(Number(lead.id))) throw new EntradaInvalida('Esse contato pediu para não receber mais mensagens.');
      return {
        entrada: { lead_id: Number(lead.id), mensagem },
        resumo: `Enviar pelo WhatsApp${lead.responsavel_nome ? ` de ${lead.responsavel_nome}` : ''} para "${lead.nome}": "${mensagem.length > 300 ? mensagem.slice(0, 300) + '…' : mensagem}".`,
      };
    },
    async executar(ctx, e) {
      const remetente = await contatosService.resolverRemetenteDoLead(e.lead_id, ctx.empresaId, ctx.usuarioId);
      const lead = await leadDa(ctx, e.lead_id);
      const contatoId = lead.contato_whatsapp_id
        ? Number(lead.contato_whatsapp_id)
        : await contatosService.resolverContatoParaLead(Number(lead.id), remetente, ctx.empresaId);
      if (!contatoId) throw new Error('Não consegui achar o WhatsApp desse lead pelo telefone do card.');
      const r = await contatosService.enviarMensagem(remetente, ctx.empresaId, contatoId, e.mensagem, Number(lead.id), 'manual');
      if (!r.success) throw new Error(r.error || 'Falha no envio.');
      await leadsService.registrarAtividade(Number(lead.id), ctx.usuarioId, ctx.empresaId, 'mensagem_enviada',
        `Mensagem enviada pelo Duo: "${e.mensagem.slice(0, 50)}${e.mensagem.length > 50 ? '...' : ''}"`,
        { mensagem: e.mensagem, messageId: r.messageId, via: 'duo' });
      return { enviado: true, lead_id: Number(lead.id) };
    },
  },
  {
    nome: 'disparar_whatsapp',
    descricao: 'Propõe um disparo em massa de WhatsApp com UMA MENSAGEM PRÓPRIA PARA CADA LEAD (escreva cada uma a partir de ler_conversas). Antes de propor, mostre à pessoa todas as mensagens, ou uma amostra e a regra usada se forem muitas. Sai pelo WhatsApp de quem pede, com o intervalo anti-bloqueio e o limite de 100 por dia; pode agendar e mover cada lead de etapa depois do envio. Todos os leads precisam ser do mesmo funil.',
    schema: objeto({
      mensagens: {
        type: 'array', description: 'Até 100 itens.',
        items: objeto({ lead_id: { type: 'integer' }, texto: { type: 'string' } }, ['lead_id', 'texto']),
      },
      etapa_depois_id: { type: 'integer', description: 'Etapa para onde cada lead vai depois de receber.' },
      agendar_para: { type: 'string', description: 'AAAA-MM-DD HH:MM (Brasília). Vazio = começa agora.' },
      intervalo_min_seg: { type: 'integer', description: 'Padrão 45.' },
      intervalo_max_seg: { type: 'integer', description: 'Padrão 90.' },
    }, ['mensagens']),
    pode: podeCrm,
    async preparar(ctx, input) {
      await garantirDisparo(ctx);
      const itens: any[] = Array.isArray(input.mensagens) ? input.mensagens : [];
      if (!itens.length) throw new EntradaInvalida('Falta a lista de mensagens.');
      if (itens.length > 100) throw new EntradaInvalida('No máximo 100 leads por disparo.');
      const mensagens: Record<string, string> = {};
      for (const it of itens) {
        const leadId = id(it?.lead_id, 'lead_id');
        const t = String(it?.texto ?? '').trim();
        if (!t) throw new EntradaInvalida(`Falta o texto do lead ${leadId}.`);
        if (t.length > 1500) throw new EntradaInvalida(`O texto do lead ${leadId} passou de 1500 caracteres.`);
        if (mensagens[leadId]) throw new EntradaInvalida(`O lead ${leadId} apareceu duas vezes.`);
        mensagens[leadId] = t;
      }
      const ids = Object.keys(mensagens).map(Number);
      const r = await query(
        `SELECT l.id, l.nome, l.funil_id, l.arquivado, f.nome AS funil,
                (l.telefone IS NOT NULL AND l.telefone <> '') OR cw.whatsapp_id IS NOT NULL AS tem_whatsapp
           FROM leads l JOIN funis f ON f.id = l.funil_id
           LEFT JOIN contatos_whatsapp cw ON cw.id = l.contato_whatsapp_id
          WHERE l.id = ANY($1::int[]) AND l.empresa_id = $2`,
        [ids, ctx.empresaId]
      );
      const achados = new Map(r.rows.map((l: any) => [Number(l.id), l]));
      const problemas: string[] = [];
      for (const leadId of ids) {
        const l: any = achados.get(leadId);
        if (!l) problemas.push(`${leadId}: não encontrado`);
        else if (l.arquivado) problemas.push(`${l.nome}: arquivado`);
        else if (!l.tem_whatsapp) problemas.push(`${l.nome}: sem telefone`);
        else if (await leadSaiu(leadId)) problemas.push(`${l.nome}: pediu para não receber mensagens`);
      }
      if (problemas.length) throw new EntradaInvalida(`Tire estes leads da lista: ${problemas.join('; ')}.`);
      const funis = new Set(r.rows.map((l: any) => Number(l.funil_id)));
      if (funis.size > 1) throw new EntradaInvalida('Os leads são de funis diferentes. Faça um disparo por funil.');
      const funilId = Number(r.rows[0].funil_id);

      let etapa: { id: number; nome: string } | undefined;
      if (input.etapa_depois_id) {
        const e = await query(`SELECT id, nome FROM estagios_funil WHERE id = $1 AND funil_id = $2`, [id(input.etapa_depois_id, 'etapa_depois_id'), funilId]);
        if (!e.rows[0]) throw new EntradaInvalida('A etapa de depois não é desse funil.');
        etapa = { id: Number(e.rows[0].id), nome: e.rows[0].nome };
      }
      const agendado = dataHora(input.agendar_para, 'agendar_para');
      if (agendado && new Date(agendado) <= new Date()) throw new EntradaInvalida('O horário do agendamento já passou.');
      if (!agendado) {
        const hoje = await query(
          `SELECT COALESCE(SUM(enviados), 0)::int AS n FROM disparos_crm
            WHERE usuario_id = $1 AND DATE(created_at) = CURRENT_DATE AND status != 'agendado'`,
          [ctx.usuarioId]
        );
        const resta = Math.max(0, 100 - Number(hoje.rows[0].n));
        if (ids.length > resta) {
          throw new EntradaInvalida(`Hoje ainda cabem ${resta} envios (limite de 100 por dia para proteger o número). Diminua a lista ou agende para amanhã.`);
        }
      }
      const min = inteiro(input.intervalo_min_seg, 10, 600, 45);
      const max = Math.max(min, inteiro(input.intervalo_max_seg, 10, 600, 90));
      const minutos = Math.ceil(((ids.length - 1) * (min + max)) / 2 / 60);
      const amostra = ids.slice(0, 3).map(i => {
        const t = mensagens[i];
        return `${(achados.get(i) as any).nome}: "${t.length > 140 ? t.slice(0, 140) + '…' : t}"`;
      });
      return {
        entrada: {
          funil_id: funilId, mensagens, estagio_pos_disparo_id: etapa?.id, agendado_para: agendado,
          intervalo_min_seg: min, intervalo_max_seg: max,
        },
        resumo: `Disparar ${ids.length} mensagem(ns) personalizada(s) pelo seu WhatsApp para leads do funil "${r.rows[0].funil}", `
          + `${agendado ? `começando em ${dataHoraBr(agendado)}` : 'começando agora'}, uma a cada ${min}–${max}s`
          + `${ids.length > 1 ? ` (cerca de ${minutos} min no total)` : ''}`
          + `${etapa ? `; depois de receber, cada lead vai para "${etapa.nome}"` : ''}. Exemplos: ${amostra.join(' | ')}.`,
      };
    },
    async executar(ctx, e) {
      await garantirDisparo(ctx);
      const disparoId = await disparosService.iniciar(ctx.empresaId, ctx.usuarioId, {
        lead_ids: Object.keys(e.mensagens).map(Number),
        template: 'Mensagem personalizada pelo Duo (uma para cada lead)',
        funil_id: e.funil_id,
        estagio_pos_disparo_id: e.estagio_pos_disparo_id,
        agendado_para: e.agendado_para,
        intervalo_min_seg: e.intervalo_min_seg,
        intervalo_max_seg: e.intervalo_max_seg,
        mensagens_por_lead: e.mensagens,
      });
      return { disparo_id: disparoId, total: Object.keys(e.mensagens).length, acompanhar: 'ver_disparos, ou a tela de Disparos do CRM' };
    },
  },
  {
    nome: 'ver_disparos',
    descricao: 'Disparos de WhatsApp da empresa: os últimos e os agendados, ou o andamento e os erros de um disparo (disparo_id).',
    schema: objeto({ disparo_id: { type: 'integer' } }),
    pode: podeCrm,
    async consultar(ctx, input) {
      if (input.disparo_id) {
        const d = await disparosService.getStatus(id(input.disparo_id, 'disparo_id'), ctx.empresaId);
        if (!d) throw new EntradaInvalida('Disparo não encontrado.');
        return {
          id: d.id, status: d.status, total: d.total, enviados: d.enviados, falhas: d.falhas,
          criado_em: dataHoraBr(d.created_at), agendado_para: dataHoraBr(d.agendado_para), terminou_em: dataHoraBr(d.finished_at),
          erros: (d.erros || []).slice(0, 20),
        };
      }
      const [ultimos, agendados] = await Promise.all([
        disparosService.listar(ctx.empresaId, 10),
        disparosService.listarAgendados(ctx.empresaId),
      ]);
      const curto = (d: any) => ({
        id: d.id, status: d.status, total: d.total, enviados: d.enviados, falhas: d.falhas,
        mensagem: String(d.template || '').slice(0, 80), criado_em: dataHoraBr(d.created_at), agendado_para: dataHoraBr(d.agendado_para),
      });
      return { ultimos: ultimos.map(curto), agendados: agendados.map((d: any) => ({ ...curto(d), funil: d.funil_nome, criado_por: d.criado_por })) };
    },
  },
  {
    nome: 'agendar_followup',
    descricao: 'Propõe agendar um follow-up de WhatsApp num lead para uma data e hora: com o texto pronto (mensagem) ou com uma instrução para a IA do agente escrever na hora (instrucao_ia).',
    schema: objeto({
      lead_id: { type: 'integer' },
      data_hora: { type: 'string', description: 'AAAA-MM-DD HH:MM, horário de Brasília.' },
      mensagem: { type: 'string', description: 'Texto que vai sair.' },
      instrucao_ia: { type: 'string', description: 'No lugar da mensagem: o que a IA deve escrever, lendo a conversa na hora do envio.' },
    }, ['lead_id', 'data_hora']),
    pode: podeCrm,
    async preparar(ctx, input) {
      const lead = await leadDa(ctx, input.lead_id);
      if (lead.arquivado) throw new EntradaInvalida('O lead está arquivado. Reative antes de agendar.');
      const quando = dataHora(input.data_hora, 'a data', true)!;
      if (new Date(quando) <= new Date()) throw new EntradaInvalida('Esse horário já passou.');
      const mensagem = input.mensagem ? String(input.mensagem).trim().slice(0, 3000) : '';
      const instrucao = input.instrucao_ia ? String(input.instrucao_ia).trim().slice(0, 2000) : '';
      if (!mensagem && !instrucao) throw new EntradaInvalida('Informe a mensagem ou a instrução para a IA.');
      const tipo = mensagem ? 'manual' : 'agente_ia';
      return {
        entrada: { lead_id: Number(lead.id), agendado_para: quando, tipo, mensagem: mensagem || undefined, instrucao_ia: instrucao || undefined },
        resumo: `Agendar follow-up para "${lead.nome}" em ${dataHoraBr(quando)}: `
          + (mensagem ? `"${mensagem.length > 200 ? mensagem.slice(0, 200) + '…' : mensagem}"` : `a IA escreve na hora seguindo "${instrucao.slice(0, 200)}"`) + '.',
      };
    },
    async executar(ctx, e) {
      const f = await followupsService.criar({
        leadId: e.lead_id, usuarioId: ctx.usuarioId, empresaId: ctx.empresaId, tipo: e.tipo,
        mensagem: e.mensagem, instrucaoIa: e.instrucao_ia, origem: 'lead', agendadoPara: e.agendado_para,
      });
      return { followup_id: f.id, agendado_para: dataHoraBr(f.agendado_para) };
    },
  },
  {
    nome: 'cancelar_followup',
    descricao: 'Propõe cancelar um follow-up pendente (id que aparece em ver_lead).',
    schema: objeto({ followup_id: { type: 'integer' } }, ['followup_id']),
    pode: podeCrm,
    async preparar(ctx, input) {
      const r = await query(
        `SELECT f.id, f.status, f.agendado_para, f.mensagem, l.nome FROM followups_agendados f JOIN leads l ON l.id = f.lead_id
          WHERE f.id = $1 AND f.empresa_id = $2`,
        [id(input.followup_id, 'followup_id'), ctx.empresaId]
      );
      const f = r.rows[0];
      if (!f) throw new EntradaInvalida('Follow-up não encontrado.');
      if (f.status !== 'pendente') throw new EntradaInvalida(`Esse follow-up já está ${f.status}.`);
      return {
        entrada: { followup_id: Number(f.id) },
        resumo: `Cancelar o follow-up de "${f.nome}" marcado para ${dataHoraBr(f.agendado_para)}.`,
      };
    },
    async executar(ctx, e) {
      const f = await followupsService.cancelar(Number(e.followup_id), ctx.empresaId, 'Cancelado pelo Duo');
      if (!f) throw new Error('Follow-up não encontrado ou já saiu.');
      return { followup_id: Number(e.followup_id), cancelado: true };
    },
  },

  // ── CRM: organização do quadro ──────────────────────────────────────────────
  {
    nome: 'resumo_funil',
    descricao: 'Visão de um funil: quantos leads e quanto em valor há em cada etapa, quantos estão sem tarefa, com tarefa atrasada ou esperando resposta, e entradas e ganhos nos últimos 7 e 30 dias.',
    schema: objeto({ funil_id: { type: 'integer' } }, ['funil_id']),
    pode: podeCrm,
    async consultar(ctx, input) {
      const funilId = id(input.funil_id, 'funil_id');
      const f = await query(`SELECT id, nome FROM funis WHERE id = $1 AND empresa_id = $2`, [funilId, ctx.empresaId]);
      if (!f.rows[0]) throw new EntradaInvalida('Funil não encontrado.');
      const etapas = await query(
        `SELECT e.id, e.nome, e.is_ganho AS ganho, e.is_perdido AS perdido,
                COUNT(l.id)::int AS leads,
                COALESCE(SUM(l.valor_potencial), 0) AS valor,
                COUNT(l.id) FILTER (WHERE NOT EXISTS (SELECT 1 FROM tarefas_lead t WHERE t.lead_id = l.id AND t.status IN ('pendente','em_andamento')))::int AS sem_tarefa,
                COUNT(l.id) FILTER (WHERE EXISTS (SELECT 1 FROM tarefas_lead t WHERE t.lead_id = l.id AND t.status IN ('pendente','em_andamento') AND t.data_vencimento < now() AT TIME ZONE 'UTC'))::int AS tarefa_atrasada,
                COUNT(l.id) FILTER (WHERE l.aguardando_resposta)::int AS esperando_resposta
           FROM estagios_funil e
           LEFT JOIN leads l ON l.estagio_id = e.id AND l.empresa_id = $2 AND NOT COALESCE(l.arquivado, false)
          WHERE e.funil_id = $1
          GROUP BY e.id ORDER BY e.ordem`,
        [funilId, ctx.empresaId]
      );
      const mov = await query(
        `SELECT COUNT(*) FILTER (WHERE l.created_at > now() - INTERVAL '7 days')::int AS entradas_7d,
                COUNT(*) FILTER (WHERE l.created_at > now() - INTERVAL '30 days')::int AS entradas_30d
           FROM leads l WHERE l.funil_id = $1 AND l.empresa_id = $2`,
        [funilId, ctx.empresaId]
      );
      return {
        funil: f.rows[0].nome,
        etapas: etapas.rows.map((e: any) => ({ ...e, valor: Number(e.valor) || 0 })),
        ...mov.rows[0],
      };
    },
  },
  {
    nome: 'listar_tags',
    descricao: 'Tags (etiquetas) da empresa, com id, para usar em etiquetar_lead.',
    schema: objeto({}),
    pode: podeCrm,
    async consultar(ctx) {
      const r = await query(
        `SELECT t.id, t.nome, COUNT(lt.lead_id)::int AS leads FROM tags t LEFT JOIN lead_tags lt ON lt.tag_id = t.id
          WHERE t.empresa_id = $1 GROUP BY t.id ORDER BY t.nome`,
        [ctx.empresaId]
      );
      return { tags: r.rows };
    },
  },
  {
    nome: 'etiquetar_lead',
    descricao: 'Propõe colocar ou tirar uma tag de um ou mais leads (até 50).',
    schema: objeto({
      lead_ids: { type: 'array', items: { type: 'integer' } },
      tag_id: { type: 'integer' },
      acao: { type: 'string', enum: ['adicionar', 'remover'] },
    }, ['lead_ids', 'tag_id', 'acao']),
    pode: podeCrm,
    async preparar(ctx, input) {
      const acao = umDe(input.acao, ['adicionar', 'remover'] as const, 'acao')!;
      const t = await query(`SELECT id, nome FROM tags WHERE id = $1 AND empresa_id = $2`, [id(input.tag_id, 'tag_id'), ctx.empresaId]);
      if (!t.rows[0]) throw new EntradaInvalida('Tag não encontrada.');
      const ids = [...new Set((Array.isArray(input.lead_ids) ? input.lead_ids : []).slice(0, 50).map((v: any) => id(v, 'lead_id')))] as number[];
      if (!ids.length) throw new EntradaInvalida('Falta a lista de leads.');
      const l = await query(`SELECT id, nome FROM leads WHERE id = ANY($1::int[]) AND empresa_id = $2`, [ids, ctx.empresaId]);
      if (l.rows.length !== ids.length) throw new EntradaInvalida('Algum desses leads não foi encontrado.');
      const nomes = l.rows.map((x: any) => x.nome);
      return {
        entrada: { lead_ids: ids, tag_id: Number(t.rows[0].id), acao },
        resumo: `${acao === 'adicionar' ? 'Colocar' : 'Tirar'} a tag "${t.rows[0].nome}" ${acao === 'adicionar' ? 'em' : 'de'} ${ids.length} lead(s): ${nomes.slice(0, 8).join(', ')}${nomes.length > 8 ? '…' : ''}.`,
      };
    },
    async executar(ctx, e) {
      for (const leadId of e.lead_ids) {
        if (e.acao === 'adicionar') await leadsService.addTag(leadId, e.tag_id, ctx.empresaId, ctx.usuarioId);
        else await leadsService.removeTag(leadId, e.tag_id, ctx.empresaId, ctx.usuarioId);
      }
      return { leads: e.lead_ids.length, tag_id: e.tag_id, acao: e.acao };
    },
  },
  {
    nome: 'arquivar_lead',
    descricao: 'Propõe arquivar um lead (sai do quadro e para a cadência; dá para reativar) ou reativar um arquivado. Não exclui.',
    schema: objeto({ lead_id: { type: 'integer' }, acao: { type: 'string', enum: ['arquivar', 'reativar'] } }, ['lead_id', 'acao']),
    pode: podeCrm,
    async preparar(ctx, input) {
      const lead = await leadDa(ctx, input.lead_id);
      const acao = umDe(input.acao, ['arquivar', 'reativar'] as const, 'acao')!;
      if (acao === 'arquivar' && lead.arquivado) throw new EntradaInvalida('O lead já está arquivado.');
      if (acao === 'reativar' && !lead.arquivado) throw new EntradaInvalida('O lead não está arquivado.');
      return {
        entrada: { lead_id: Number(lead.id), acao },
        resumo: acao === 'arquivar'
          ? `Arquivar o lead "${lead.nome}" (sai do quadro e os follow-ups da etapa são cancelados).`
          : `Reativar o lead "${lead.nome}" (volta para o quadro em ${lead.estagio_nome}).`,
      };
    },
    async executar(ctx, e) {
      const lead = e.acao === 'arquivar'
        ? await leadsService.arquivar(e.lead_id, ctx.empresaId, ctx.usuarioId)
        : await leadsService.reativar(e.lead_id, ctx.empresaId, ctx.usuarioId);
      if (!lead) throw new Error('Lead não encontrado.');
      return resumoLead(lead);
    },
  },
  {
    nome: 'transferir_funil',
    descricao: 'Propõe passar um lead para outro funil (entra na etapa de entrada do funil novo).',
    schema: objeto({ lead_id: { type: 'integer' }, funil_id: { type: 'integer' } }, ['lead_id', 'funil_id']),
    pode: podeCrm,
    async preparar(ctx, input) {
      const lead = await leadDa(ctx, input.lead_id);
      const f = await query(`SELECT id, nome FROM funis WHERE id = $1 AND empresa_id = $2 AND ativo IS NOT FALSE`, [id(input.funil_id, 'funil_id'), ctx.empresaId]);
      if (!f.rows[0]) throw new EntradaInvalida('Funil não encontrado.');
      if (Number(f.rows[0].id) === Number(lead.funil_id)) throw new EntradaInvalida('O lead já está nesse funil.');
      return {
        entrada: { lead_id: Number(lead.id), funil_id: Number(f.rows[0].id) },
        resumo: `Passar o lead "${lead.nome}" para o funil "${f.rows[0].nome}" (entra na etapa de entrada).`,
      };
    },
    async executar(ctx, e) {
      const lead = await leadsService.transferirFunil(e.lead_id, ctx.empresaId, ctx.usuarioId, e.funil_id);
      if (!lead) throw new Error('Lead não encontrado.');
      return resumoLead(lead);
    },
  },

  // ── Clientes e créditos ─────────────────────────────────────────────────────
  {
    nome: 'listar_clientes',
    descricao: 'Clientes cadastrados (nome, contato, mensalidade, vencimento e situação do pagamento), com busca por nome, e-mail ou telefone.',
    schema: objeto({
      busca: { type: 'string' },
      situacao: { type: 'string', enum: ['em_dia', 'pendente'], description: 'Situação do pagamento.' },
      limite: { type: 'integer', description: 'Padrão 20, até 50.' },
    }),
    pode: pode('clientes'),
    async consultar(ctx, input) {
      const params: any[] = [ctx.empresaId];
      let where = 'c.empresa_id = $1' + escopoDono(filtro(ctx), params, 'c.usuario_id');
      const busca = texto(input.busca, 'busca');
      if (busca) {
        params.push(`%${busca}%`);
        where += ` AND (c.nome ILIKE $${params.length} OR c.email ILIKE $${params.length} OR c.telefone ILIKE $${params.length})`;
      }
      const situacao = umDe(input.situacao, ['em_dia', 'pendente'] as const, 'situacao');
      if (situacao) { params.push(situacao); where += ` AND c.status_pagamento = $${params.length}`; }
      params.push(inteiro(input.limite, 1, 50, 20));
      const r = await query(
        `SELECT c.id, c.nome, c.email, c.telefone, c.servico, c.valor_mensalidade, c.dia_vencimento, c.status_pagamento,
                COUNT(*) OVER () AS total
           FROM clientes c WHERE ${where} ORDER BY c.nome LIMIT $${params.length}`,
        params
      );
      return {
        total: Number(r.rows[0]?.total || 0),
        clientes: r.rows.map(({ total, ...c }: any) => ({ ...c, valor_mensalidade: Number(c.valor_mensalidade) || 0 })),
      };
    },
  },
  {
    nome: 'saldo_duo',
    descricao: 'Saldo de créditos do Duo da empresa (usados pelo chat do Duo dentro do sistema) e onde recarregar.',
    schema: objeto({}),
    pode: () => true,
    async consultar(ctx) {
      return { saldo: brl(await duoCreditos.saldo(ctx.empresaId)), recarregar_em: 'https://duofuturo.tech/gestao/creditos-duo' };
    },
  },
  {
    nome: 'gerenciar_assinatura_empresa',
    descricao: 'Só super_admin: propõe suspender, cancelar ou ativar indefinidamente a assinatura de uma empresa.',
    schema: objeto({
      empresa_id: { type: 'integer' },
      acao: { type: 'string', enum: ['suspender', 'cancelar', 'ativar'] },
      motivo: { type: 'string' },
    }, ['empresa_id', 'acao']),
    pode: ctx => isSuperAdmin(ctx),
    async preparar(_ctx, input) {
      const empresaId = id(input.empresa_id, 'empresa_id');
      if (!['suspender', 'cancelar', 'ativar'].includes(input.acao)) throw new EntradaInvalida('Ação inválida.');
      const r = await query(`SELECT nome FROM empresas WHERE id = $1`, [empresaId]);
      if (!r.rows[0]) throw new EntradaInvalida('Empresa não encontrada.');
      const verbo = { suspender: 'Suspender', cancelar: 'Cancelar', ativar: 'Ativar indefinidamente' }[input.acao as string];
      return {
        entrada: { empresa_id: empresaId, acao: input.acao, motivo: texto(input.motivo, 'motivo') },
        resumo: `${verbo} a assinatura da empresa ${empresaId} (${r.rows[0].nome}).`,
      };
    },
    async executar(_ctx, e) {
      const motivo = e.motivo || 'Pelo super_admin via Duo';
      if (e.acao === 'suspender') await assinaturasService.suspender(e.empresa_id, motivo);
      else if (e.acao === 'cancelar') await assinaturasService.cancelar(e.empresa_id, motivo);
      else await assinaturasService.ativarIndefinidamente(e.empresa_id);
      return { empresa_id: e.empresa_id, acao: e.acao };
    },
  },
];

// ─── Confirmação ──────────────────────────────────────────────────────────────

const VALIDADE_MIN = 30;

const CONTROLE = [
  {
    name: 'confirmar_acao',
    description: 'Executa uma ação proposta antes, DEPOIS que a pessoa disse claramente que sim numa nova mensagem. Use o número da lista de ações aguardando confirmação.',
    input_schema: objeto({ acao_id: { type: 'integer' } }, ['acao_id']),
  },
  {
    name: 'cancelar_acao',
    description: 'Descarta uma ação proposta quando a pessoa disse que não ou mudou de ideia.',
    input_schema: objeto({ acao_id: { type: 'integer' } }, ['acao_id']),
  },
];

async function confirmar(ctx: ContextoDuo, acaoId: number) {
  // Claim atômico: só uma instância executa, e só proposta feita ANTES desta mensagem
  // (a pessoa leu o resumo e respondeu). Proposta da mesma rodada não passa.
  const r = await query(
    `UPDATE duo_acoes SET status = 'executada', executada_at = now()
      WHERE id = $1 AND usuario_id = $2 AND empresa_id = $3 AND status = 'pendente'
        AND created_at < $4 AND created_at > now() - ($5::int * INTERVAL '1 minute')
      RETURNING *`,
    [acaoId, ctx.usuarioId, ctx.empresaId, ctx.inicio, VALIDADE_MIN]
  );
  const reg = r.rows[0];
  if (!reg) {
    const v = await query(
      `SELECT status, created_at FROM duo_acoes WHERE id = $1 AND usuario_id = $2 AND empresa_id = $3`,
      [acaoId, ctx.usuarioId, ctx.empresaId]
    );
    const x = v.rows[0];
    if (!x) return { erro: 'Ação não encontrada.' };
    if (x.status !== 'pendente') return { erro: `Essa ação já está ${x.status}.` };
    if (new Date(x.created_at) >= ctx.inicio) {
      return { erro: 'A pessoa ainda não viu esta proposta. Mostre o resumo e espere ela responder antes de confirmar.' };
    }
    await query(`UPDATE duo_acoes SET status = 'expirada' WHERE id = $1 AND status = 'pendente'`, [acaoId]);
    return { erro: `A proposta passou de ${VALIDADE_MIN} minutos e expirou. Proponha de novo.` };
  }
  const acao = ACOES.find(a => a.nome === reg.acao);
  try {
    if (!acao?.executar || !acao.pode(ctx)) throw new Error('Você não tem mais acesso a esta ação.');
    const depois = await acao.executar(ctx, reg.entrada);
    await query(`UPDATE duo_acoes SET depois = $2 WHERE id = $1`, [acaoId, JSON.stringify(depois ?? null)]);
    return { sucesso: true, feito: reg.resumo, resultado: depois };
  } catch (err: any) {
    await query(`UPDATE duo_acoes SET status = 'erro', erro = $2 WHERE id = $1`, [acaoId, String(err?.message || err)]);
    return { erro: `Não foi possível executar: ${err?.message || err}` };
  }
}

// ─── Interface com o loop do chat ─────────────────────────────────────────────

/** Ferramentas no formato da API do Claude, só as que esta pessoa pode usar. */
export function ferramentasDe(ctx: ContextoDuo) {
  const proprias = ACOES.filter(a => a.pode(ctx)).map(a => ({
    name: a.nome, description: a.descricao, input_schema: a.schema,
  }));
  return ACOES.some(a => a.preparar && a.pode(ctx)) ? [...proprias, ...CONTROLE] : proprias;
}

/** Propostas desta pessoa ainda abertas — entram no prompt para a IA saber o que confirmar. */
export async function pendentesDe(ctx: ContextoDuo): Promise<{ id: number; resumo: string }[]> {
  const r = await query(
    `SELECT id, resumo FROM duo_acoes
      WHERE usuario_id = $1 AND empresa_id = $2 AND status = 'pendente'
        AND created_at > now() - ($3::int * INTERVAL '1 minute')
      ORDER BY id`,
    [ctx.usuarioId, ctx.empresaId, VALIDADE_MIN]
  );
  return r.rows;
}

export async function executarAcao(ctx: ContextoDuo, nome: string, input: any): Promise<any> {
  input = input && typeof input === 'object' ? input : {};
  try {
    if (nome === 'confirmar_acao') return await confirmar(ctx, id(input.acao_id, 'acao_id'));
    if (nome === 'cancelar_acao') {
      const r = await query(
        `UPDATE duo_acoes SET status = 'cancelada' WHERE id = $1 AND usuario_id = $2 AND empresa_id = $3 AND status = 'pendente' RETURNING id`,
        [id(input.acao_id, 'acao_id'), ctx.usuarioId, ctx.empresaId]
      );
      return r.rowCount ? { sucesso: true } : { erro: 'Nenhuma proposta aberta com esse número.' };
    }

    const acao = ACOES.find(a => a.nome === nome);
    if (!acao) return { erro: `Ação desconhecida: ${nome}` };
    if (!acao.pode(ctx)) return { erro: 'A pessoa não tem acesso a este módulo.' };

    if (acao.consultar) return await acao.consultar(ctx, input);

    const prop = await acao.preparar!(ctx, input);
    const r = await query(
      `INSERT INTO duo_acoes (empresa_id, usuario_id, acao, entrada, resumo, antes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [ctx.empresaId, ctx.usuarioId, nome, JSON.stringify(prop.entrada), prop.resumo, prop.antes ? JSON.stringify(prop.antes) : null]
    );
    return {
      aguardando_confirmacao: true,
      acao_id: r.rows[0].id,
      resumo: prop.resumo,
      instrucao: 'Nada foi gravado ainda. Mostre este resumo à pessoa e pergunte se pode fazer. Só chame confirmar_acao depois que ela responder que sim.',
    };
  } catch (err: any) {
    if (err instanceof EntradaInvalida) return { erro: err.message };
    // "não encontrada" dos services = fora do escopo da pessoa, ou não existe.
    if (/não encontrad/i.test(err?.message || '')) return { erro: 'Registro não encontrado entre os que esta pessoa pode ver.' };
    console.error(`[Duo] ação ${nome} falhou:`, err);
    return { erro: 'Erro ao executar a ação.' };
  }
}
