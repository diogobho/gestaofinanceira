import React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card } from './Card'

interface MetricCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  /** cor do ícone (text-*) */
  iconColor?: string
  /** cor de fundo do círculo do ícone (bg-*) */
  iconBg?: string
  /** cor do número principal (text-*) */
  valueColor?: string
  /** linha secundária abaixo do valor */
  subtitle?: React.ReactNode
  trend?: {
    value: number
    isPositive: boolean
  }
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  icon: Icon,
  iconColor = 'text-primary-600 dark:text-primary-300',
  iconBg = 'bg-primary-50 dark:bg-primary-900/30',
  valueColor = 'text-gray-900 dark:text-gray-100',
  subtitle,
  trend,
}) => {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">{title}</p>
          <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
          )}
          {trend && (
            <p
              className={`text-sm mt-2 ${
                trend.isPositive ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        <div className={`shrink-0 p-3 rounded-full ${iconBg} ${iconColor}`}>
          <Icon size={22} />
        </div>
      </div>
    </Card>
  )
}
