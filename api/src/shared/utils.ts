export const buildPaginationQuery = (page: number = 1, pageSize: number = 10) => {
  const limit = Math.min(Math.max(pageSize, 1), 100);
  const offset = (Math.max(page, 1) - 1) * limit;
  return { limit, offset };
};

export const buildPaginatedResponse = <T>(data: T[], total: number, page: number, pageSize: number) => {
  return { data, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
};
