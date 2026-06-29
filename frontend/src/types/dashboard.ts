export interface DashboardData {
  receita_total: number
  despesa_total: number
  lucro_liquido: number
  ticket_medio: number
  clientes_ativos: number
  sessoes_mes: number
  roi?: number

  evolucao_financeira: Array<{
    mes: string
    receita: number
    despesa: number
    lucro: number
  }>

  top_servicos?: Array<{
    tipo: string
    quantidade: number
    valor_total: number
  }>
}
