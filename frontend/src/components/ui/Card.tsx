import React from 'react'
import { cn } from '@/utils'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
  title?: string
  action?: React.ReactNode
}

export const Card: React.FC<CardProps> = ({ children, className, title, action, ...rest }) => {
  return (
    <div {...rest} className={cn('bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
