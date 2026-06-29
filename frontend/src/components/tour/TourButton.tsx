import React from 'react'
import { HelpCircle } from 'lucide-react'
import { useTour } from '@/contexts/TourContext'

interface TourButtonProps {
  /** Tour a iniciar ao clicar. Padrão: tour de boas-vindas. */
  tourId?: string
  /** Callback extra ao clicar (ex.: fechar a sidebar no mobile). */
  onClick?: () => void
  className?: string
}

/**
 * Botão "Tutorial" — reinicia um tour guiado sob demanda.
 * Mesmo visual dos botões do rodapé da Sidebar.
 */
export const TourButton: React.FC<TourButtonProps> = ({
  tourId = 'welcome',
  onClick,
  className,
}) => {
  const { iniciarTour } = useTour()

  return (
    <button
      data-tour="sidebar-tutorial"
      onClick={() => {
        onClick?.()
        iniciarTour(tourId)
      }}
      className={
        className ??
        'flex items-center w-full px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'
      }
    >
      <HelpCircle className="w-5 h-5 mr-3 text-emerald-500" />
      Tutorial
    </button>
  )
}
