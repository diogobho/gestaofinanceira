import React from 'react'
import { HelpCircle } from 'lucide-react'
import { useTour } from '@/contexts/TourContext'

interface TourHelpButtonProps {
  /** Id do tour da página a iniciar. */
  tourId: string
  className?: string
  /** Texto opcional ao lado do ícone (some no mobile). */
  label?: string
}

/**
 * Botão compacto "?" para abrir o tutorial guiado da página atual.
 * Usado no Header padrão e em páginas com cabeçalho próprio.
 */
export const TourHelpButton: React.FC<TourHelpButtonProps> = ({ tourId, className, label = 'Tutorial' }) => {
  const { iniciarTour } = useTour()
  return (
    <button
      type="button"
      onClick={() => iniciarTour(tourId)}
      title="Ver tutorial desta página"
      aria-label="Ver tutorial desta página"
      className={
        className ??
        'shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-primary-700 dark:text-primary-200 bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors'
      }
    >
      <HelpCircle className="w-4 h-4 text-emerald-500" />
      {label && <span className="hidden sm:inline">{label}</span>}
    </button>
  )
}
