import React from 'react'
import { Card } from './Card'

interface MobileCardProps {
  children: React.ReactNode
  className?: string
}

export const MobileCard: React.FC<MobileCardProps> = ({ children, className = '' }) => {
  return (
    <Card className={`p-4 ${className}`}>
      {children}
    </Card>
  )
}

interface MobileCardRowProps {
  label: string
  value: React.ReactNode
  className?: string
}

export const MobileCardRow: React.FC<MobileCardRowProps> = ({ label, value, className = '' }) => {
  return (
    <div className={`flex justify-between items-start py-2 border-b border-gray-100 dark:border-gray-700 last:border-0 ${className}`}>
      <span className="text-sm font-medium text-gray-600 dark:text-gray-300 mr-2">{label}:</span>
      <span className="text-sm text-gray-900 dark:text-white text-right flex-1">{value}</span>
    </div>
  )
}

interface MobileCardHeaderProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  badge?: React.ReactNode
}

export const MobileCardHeader: React.FC<MobileCardHeaderProps> = ({ title, subtitle, badge }) => {
  return (
    <div className="flex justify-between items-start mb-3 pb-3 border-b border-gray-200 dark:border-gray-700">
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-900 dark:text-white truncate">{title}</div>
        {subtitle && <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</div>}
      </div>
      {badge && <div className="ml-2 flex-shrink-0">{badge}</div>}
    </div>
  )
}

interface MobileCardActionsProps {
  children: React.ReactNode
}

export const MobileCardActions: React.FC<MobileCardActionsProps> = ({ children }) => {
  return (
    <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
      {children}
    </div>
  )
}
