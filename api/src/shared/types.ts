export interface Usuario {
  id: string;
  nome: string;
  email: string;
  funcao: 'ADMIN' | 'MENTOR';
  status: 'ATIVO' | 'INATIVO';
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
