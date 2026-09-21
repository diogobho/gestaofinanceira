import { contaazulService, type Conexao } from './contaazul.service';

/**
 * Dashboard financeiro alimentado pelo Conta Azul.
 *
 * Busca os eventos financeiros (contas a pagar / a receber) e devolve uma lista
 * normalizada. Toda a filtragem fina (status, categoria, centro de custo,
 * fornecedor/cliente, faixa de valor) acontece no frontend em cima desta lista —
 * assim o usuário troca de filtro sem esperar rede.
 *
 * Desde a migration 066 a empresa pode ter VÁRIAS conexões (uma por produto).
 * Os lançamentos das duas vêm na mesma lista, cada um carimbado com
 * `conexao_id`/`conexao_nome` — é isso que permite ao dashboard mostrar o
 * consolidado por padrão e ainda filtrar produto por produto. O `id` do evento
 * é prefixado pela conexão porque nada garante que dois Conta Azul diferentes
 * não repitam um id.
 *
 * Se UMA conexão falha, o dashboard não morre: devolve o que as outras
 * responderam e reporta o erro em `conexoes[].erro`. Só levanta exceção quando
 * nenhuma respondeu — aí não há dado nenhum para mostrar.
 *
 * Particularidades da API v2 confirmadas em 14/08/2026:
 *  - `data_vencimento_de` e `data_vencimento_ate` são OBRIGATÓRIOS (400 sem eles).
 *  - Paginação é `pagina` (1-based) + `tamanho_pagina`; página além do fim
 *    devolve lista vazia — é isso que encerra o laço.
 *  - `status` vem em inglês com um `status_traduzido` ao lado:
 *    ACQUITTED/PENDING/OVERDUE/PARTIAL/LOST.
 *  - O bloco `totais` do próprio Conta Azul cobre o período inteiro pedido,
 *    ignorando qualquer filtro do frontend — guardamos só para conferência.
 */

const TAMANHO_PAGINA = 200;
const MAX_PAGINAS = 60; // trava de segurança: 12.000 lançamentos
const CACHE_TTL_MS = 5 * 60 * 1000;

export type TipoEvento = 'receber' | 'pagar';

export interface EventoFinanceiro {
  id: string;
  /** Conexão (produto) de onde o lançamento veio — base do filtro no frontend. */
  conexao_id: number;
  conexao_nome: string;
  tipo: TipoEvento;
  descricao: string;
  status: string;
  status_label: string;
  vencimento: string;
  competencia: string | null;
  total: number;
  pago: number;
  aberto: number;
  categoria: string;
  centro_custo: string;
  parte: string;
  parte_id: string | null;
  dias_atraso: number;
}

export interface TotaisContaAzul {
  pago: number;
  vencido: number;
  vence_hoje: number;
  pendente: number;
  aberto: number;
  todos: number;
}

export interface TotaisPorTipo {
  receber: TotaisContaAzul;
  pagar: TotaisContaAzul;
}

export interface ResumoConexao {
  id: number;
  nome: string;
  itens: number;
  totais_api: TotaisPorTipo;
  /** null = respondeu. Preenchido, o dashboard mostra aviso e segue com o resto. */
  erro: string | null;
}

export interface DadosDashboard {
  periodo: { de: string; ate: string };
  gerado_em: string;
  itens: EventoFinanceiro[];
  /** Soma de todas as conexões que responderam — mesmo formato de antes da 066. */
  totais_api: TotaisPorTipo;
  conexoes: ResumoConexao[];
}

interface EntradaCache {
  expira_em: number;
  dados: DadosDashboard;
}

const cache = new Map<string, EntradaCache>();

/** Só aceita YYYY-MM-DD — evita mandar lixo para a API do Conta Azul. */
export function dataValida(valor: unknown): valor is string {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

function numero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/** Hoje em São Paulo (UTC-3) como YYYY-MM-DD — o servidor roda em UTC. */
function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Diferença em dias entre duas datas YYYY-MM-DD, sem fuso no meio do caminho. */
function diasEntre(de: string, ate: string): number {
  const a = Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10));
  const b = Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

const EM_ABERTO = new Set(['PENDING', 'OVERDUE', 'PARTIAL']);

function normalizar(
  bruto: any,
  tipo: TipoEvento,
  hoje: string,
  conexao: Conexao
): EventoFinanceiro {
  const vencimento = String(bruto?.data_vencimento ?? '').slice(0, 10);
  const status = String(bruto?.status ?? '');
  const aberto = numero(bruto?.nao_pago);

  // Atraso só faz sentido para o que ainda está em aberto: um título quitado com
  // atraso já foi resolvido e não é inadimplência.
  const vencido = EM_ABERTO.has(status) && aberto > 0 && vencimento && vencimento < hoje;

  const parte = tipo === 'receber' ? bruto?.cliente : bruto?.fornecedor;

  return {
    // Prefixo da conexão: id de evento só é único dentro de uma conta.
    id: `${conexao.id}:${String(bruto?.id ?? '')}`,
    conexao_id: conexao.id,
    conexao_nome: conexao.nome,
    tipo,
    descricao: String(bruto?.descricao ?? '').trim(),
    status,
    status_label: String(bruto?.status_traduzido ?? status),
    vencimento,
    competencia: bruto?.data_competencia ? String(bruto.data_competencia).slice(0, 10) : null,
    total: numero(bruto?.total),
    pago: numero(bruto?.pago),
    aberto,
    categoria: bruto?.categorias?.[0]?.nome ?? 'Sem categoria',
    centro_custo: bruto?.centros_de_custo?.[0]?.nome ?? 'Sem centro de custo',
    parte: parte?.nome ?? (tipo === 'receber' ? 'Sem cliente' : 'Sem fornecedor'),
    parte_id: parte?.id ?? null,
    dias_atraso: vencido ? diasEntre(vencimento, hoje) : 0,
  };
}

function totaisVazios(): TotaisContaAzul {
  return { pago: 0, vencido: 0, vence_hoje: 0, pendente: 0, aberto: 0, todos: 0 };
}

function lerTotais(bruto: any): TotaisContaAzul {
  const t = bruto?.totais ?? {};
  return {
    pago: numero(t?.pago?.valor),
    vencido: numero(t?.vencido?.valor),
    vence_hoje: numero(t?.vence_hoje?.valor),
    pendente: numero(t?.pendente?.valor),
    aberto: numero(t?.aberto?.valor),
    todos: numero(t?.todos),
  };
}

/** Puxa todas as páginas de um tipo de evento no período, para UMA conexão. */
async function buscarTipo(
  conexao: Conexao,
  tipo: TipoEvento,
  de: string,
  ate: string,
  hoje: string
): Promise<{ itens: EventoFinanceiro[]; totais: TotaisContaAzul }> {
  const itens: EventoFinanceiro[] = [];
  let totais = totaisVazios();

  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const q = new URLSearchParams({
      data_vencimento_de: de,
      data_vencimento_ate: ate,
      pagina: String(pagina),
      tamanho_pagina: String(TAMANHO_PAGINA),
    });
    const caminho = `/v1/financeiro/eventos-financeiros/contas-a-${tipo}/buscar?${q}`;

    const resp = await contaazulService.api(conexao.id, caminho);
    if (!resp.ok) {
      const corpo = await resp.text();
      throw new Error(
        `Conta Azul recusou contas-a-${tipo} da conexão "${conexao.nome}" ` +
          `(HTTP ${resp.status}): ${corpo.slice(0, 200)}`
      );
    }

    const dados: any = await resp.json();
    if (pagina === 1) totais = lerTotais(dados);

    const lote: any[] = Array.isArray(dados?.itens) ? dados.itens : [];
    if (lote.length === 0) break;

    for (const bruto of lote) itens.push(normalizar(bruto, tipo, hoje, conexao));
    if (lote.length < TAMANHO_PAGINA) break;
  }

  return { itens, totais };
}

function somarTotais(a: TotaisContaAzul, b: TotaisContaAzul): TotaisContaAzul {
  return {
    pago: a.pago + b.pago,
    vencido: a.vencido + b.vencido,
    vence_hoje: a.vence_hoje + b.vence_hoje,
    pendente: a.pendente + b.pendente,
    aberto: a.aberto + b.aberto,
    todos: a.todos + b.todos,
  };
}

/** Uma conexão inteira: contas a receber + a pagar do período. */
async function buscarConexao(
  conexao: Conexao,
  de: string,
  ate: string,
  hoje: string
): Promise<{ itens: EventoFinanceiro[]; resumo: ResumoConexao }> {
  const [receber, pagar] = await Promise.all([
    buscarTipo(conexao, 'receber', de, ate, hoje),
    buscarTipo(conexao, 'pagar', de, ate, hoje),
  ]);
  const itens = [...receber.itens, ...pagar.itens];
  return {
    itens,
    resumo: {
      id: conexao.id,
      nome: conexao.nome,
      itens: itens.length,
      totais_api: { receber: receber.totais, pagar: pagar.totais },
      erro: null,
    },
  };
}

/**
 * Dados do período, com cache curto por empresa+conexões+período.
 *
 * As conexões entram na chave do cache de propósito: ativar ou desativar uma
 * conta muda o consolidado, e sem isso o dashboard continuaria servindo a soma
 * antiga por até 5 minutos.
 */
async function obterDados(
  empresaId: number,
  de: string,
  ate: string,
  forcar = false
): Promise<DadosDashboard> {
  const conexoes = await contaazulService.listarConexoesAutorizadas(empresaId);
  if (conexoes.length === 0) {
    throw new Error(
      'Nenhuma conta do Conta Azul autorizada para esta empresa — autorize em /api/gestao/contaazul/authorize'
    );
  }

  const chave = `${empresaId}:${conexoes.map((c) => c.id).join('-')}:${de}:${ate}`;
  const agora = Date.now();

  if (!forcar) {
    const guardado = cache.get(chave);
    if (guardado && guardado.expira_em > agora) return guardado.dados;
  }

  const hoje = hojeSP();

  // Paralelo entre conexões, e `allSettled` porque uma conta com token revogado
  // não pode zerar o dashboard da outra.
  const resultados = await Promise.allSettled(
    conexoes.map((c) => buscarConexao(c, de, ate, hoje))
  );

  const itens: EventoFinanceiro[] = [];
  const resumos: ResumoConexao[] = [];
  let totalReceber = totaisVazios();
  let totalPagar = totaisVazios();
  let responderam = 0;

  resultados.forEach((r, i) => {
    const conexao = conexoes[i];
    if (r.status === 'fulfilled') {
      responderam++;
      itens.push(...r.value.itens);
      resumos.push(r.value.resumo);
      totalReceber = somarTotais(totalReceber, r.value.resumo.totais_api.receber);
      totalPagar = somarTotais(totalPagar, r.value.resumo.totais_api.pagar);
    } else {
      const erro = String(r.reason?.message ?? r.reason);
      console.error(`[ContaAzul/dashboard] conexão ${conexao.id} "${conexao.nome}" falhou: ${erro}`);
      resumos.push({
        id: conexao.id,
        nome: conexao.nome,
        itens: 0,
        totais_api: { receber: totaisVazios(), pagar: totaisVazios() },
        erro,
      });
    }
  });

  // Nenhuma respondeu: não existe "consolidado parcial" que faça sentido aqui.
  if (responderam === 0) {
    throw new Error(resumos.map((r) => `${r.nome}: ${r.erro}`).join(' | '));
  }

  const dados: DadosDashboard = {
    periodo: { de, ate },
    gerado_em: new Date().toISOString(),
    itens,
    totais_api: { receber: totalReceber, pagar: totalPagar },
    conexoes: resumos,
  };

  cache.set(chave, { expira_em: agora + CACHE_TTL_MS, dados });
  return dados;
}

/** Descarta o cache da empresa (usado pelo botão "Atualizar"). */
function limparCache(empresaId?: number): void {
  if (empresaId === undefined) return cache.clear();
  for (const chave of cache.keys()) {
    if (chave.startsWith(`${empresaId}:`)) cache.delete(chave);
  }
}

export const contaazulDashboardService = {
  obterDados,
  limparCache,
  hojeSP,
};
