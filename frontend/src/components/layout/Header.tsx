import React from 'react'
import { TourHelpButton } from '@/components/tour/TourHelpButton'

interface HeaderProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
  /** Se informado, mostra um botão "?" que abre o tutorial guiado desta página. */
  tourId?: string
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, action, tourId }) => {
  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="ml-10 md:ml-0 flex items-center gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
            {subtitle && <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 sm:ml-2">
          {tourId && <TourHelpButton tourId={tourId} />}
          {action}
        </div>
      </div>
    </div>
  )
}
