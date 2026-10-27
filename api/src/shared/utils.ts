export const buildPaginationQuery = (page: number = 1, pageSize: number = 10) => {
  const limit = Math.min(Math.max(pageSize, 1), 100);
  const offset = (Math.max(page, 1) - 1) * limit;
  return { limit, offset };
};

export const buildPaginatedResponse = <T>(data: T[], total: number, page: number, pageSize: number) => {
  return { data, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
};

// Em cluster PM2 cada instância recebe NODE_APP_INSTANCE (0, 1, 2...). Jobs/crons devem
// rodar apenas na instância 0 para evitar processamento duplicado.
export const isMainInstance = !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0';

// Soma meses preservando o dia; se o mês destino não tem o dia, usa o último dia
// do mês (31/01 + 1 mês = 28/02, e não 03/03 como o setMonth "cru" faria).
export const addMonthsClamped = (base: Date, months: number): Date => {
  const d = new Date(base);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const ultimoDia = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimoDia));
  return d;
};

// Divide um valor total em N parcelas de 2 casas decimais SEM perder centavos:
// as primeiras parcelas absorvem o resto do arredondamento (100/3 → 33.34, 33.33, 33.33).
export const dividirEmParcelas = (total: number, n: number): number[] => {
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / n);
  const resto = centavos - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < resto ? 1 : 0)) / 100);
};

/**
 * Parcela única de um lançamento à vista.
 *
 * O dashboard, a tela de Parcelas e o chat financeiro leem TUDO de
 * `parcelas_receitas`/`parcelas_despesas`, com INNER JOIN. Um lançamento à
 * vista que não gera parcela simplesmente não existe para nenhum deles: foi o
 * que aconteceu com a Loja Mageense (39 lançamentos, dashboard zerado) e com 19
 * receitas da Panteras. Só a conta demo parecia certa, porque as parcelas dela
 * foram inseridas pelo seed — por isso a falha atravessou os prints do guia.
 *
 * "À vista" aqui é uma parcela de 1 de 1, vencendo na data do lançamento.
 * Manter o modelo uniforme é mais barato que ensinar cada consulta a somar duas
 * origens diferentes.
 *
 * O status é MAIÚSCULO na parcela e minúsculo no lançamento — as duas tabelas
 * nasceram assim; converter aqui evita espalhar a tradução.
 */
export const statusParcela = (statusLancamento?: string | null): 'PAGO' | 'PENDENTE' =>
  String(statusLancamento || '').toLowerCase() === 'pago' ? 'PAGO' : 'PENDENTE';

/** `data` do lançamento (Date ou 'YYYY-MM-DD') como 'YYYY-MM-DD', sem passar por fuso. */
export const dataVencimentoDe = (data: unknown): string => {
  if (data instanceof Date) return data.toISOString().slice(0, 10);
  const texto = String(data ?? '');
  return /^\d{4}-\d{2}-\d{2}/.test(texto) ? texto.slice(0, 10) : new Date(texto).toISOString().slice(0, 10);
};
