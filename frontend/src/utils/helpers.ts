import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function getStatusColor(
  status: string
): 'success' | 'warning' | 'danger' | 'info' {
  const statusMap: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
    Ativo: 'success',
    Confirmado: 'success',
    Pago: 'success',
    Finalizada: 'success',
    Pendente: 'warning',
    Agendada: 'info',
    Pausado: 'warning',
    Cancelado: 'danger',
    Atrasado: 'danger',
    Inativo: 'danger',
  }
  return statusMap[status] || 'info'
}
