export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export const formatDate = (date: string | Date): string => {
  const d = new Date(date)
  return new Intl.DateTimeFormat('pt-BR').format(d)
}

export const formatDateTime = (date: string | Date): string => {
  const d = new Date(date)
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d)
}

export const formatPercentage = (value: number): string => {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}
