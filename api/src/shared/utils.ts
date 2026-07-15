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
