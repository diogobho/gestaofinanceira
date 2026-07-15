export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export const formatDate = (date: string | Date): string => {
  // Datas "puras" (colunas DATE) chegam como 'YYYY-MM-DD' ou ISO à meia-noite UTC;
  // formatar no fuso local (UTC-3) mostraria o dia ANTERIOR — nesses casos, usa a data literal.
  if (typeof date === 'string') {
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})(T00:00:00(\.000)?Z)?$/)
    if (m) return `${m[3]}/${m[2]}/${m[1]}`
  }
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

// Data LOCAL em 'YYYY-MM-DD' para <input type="date">. Não usar toISOString():
// à noite no Brasil (UTC-3) o ISO/UTC já é o dia seguinte.
export const toInputDate = (date: Date = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

export const formatPercentage = (value: number): string => {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}
