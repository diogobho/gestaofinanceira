import React, { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { TOUR_SIDEBAR_EVENT } from '@/contexts/TourContext'
import { useSwipeable } from 'react-swipeable'
import { Menu } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { SubscriptionExpired } from '@/components/ui/SubscriptionExpired'
import { useAssinatura } from '@/hooks/useAssinatura'
import { useAuth } from '@/contexts/AuthContext'
import SextaFeiraWidget from '@/components/SextaFeiraWidget'

const ROTAS_LIVRES = ['/planos', '/minha-conta', '/perfil']

export const Layout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const { user } = useAuth()
  const { assinatura, isBloqueado } = useAssinatura()
  const location = useLocation()

  // O tour guiado abre/fecha a sidebar no mobile via evento (ver TourContext)
  useEffect(() => {
    const handler = (e: Event) => {
      const open = (e as CustomEvent<{ open: boolean }>).detail?.open
      setIsSidebarOpen(!!open)
    }
    window.addEventListener(TOUR_SIDEBAR_EVENT, handler)
    return () => window.removeEventListener(TOUR_SIDEBAR_EVENT, handler)
  }, [])

  // Gestos de swipe (apenas em mobile)
  const swipeHandlers = useSwipeable({
    onSwipedRight: () => {
      if (window.innerWidth < 768) {
        setIsSidebarOpen(true)
      }
    },
    onSwipedLeft: () => {
      if (window.innerWidth < 768 && isSidebarOpen) {
        setIsSidebarOpen(false)
      }
    },
    trackMouse: false,
    trackTouch: true,
  })

  // Páginas que ocupam a altura toda (kanban) não levam padding inferior do FAB,
  // para o quadro de leads usar todo o espaço vertical disponível.
  const ROTAS_ALTURA_CHEIA = ['/crm', '/crm-cx']
  const alturaCheia = ROTAS_ALTURA_CHEIA.includes(location.pathname)

  // Tela de bloqueio total (trial/plano expirado) — não para super_admin nem rotas livres
  const rotaLivre = ROTAS_LIVRES.some(r => location.pathname.startsWith(r))
  if (isBloqueado && user?.nivel !== 'super_admin' && assinatura && !rotaLivre) {
    return (
      <SubscriptionExpired
        status={assinatura.status as any}
        motivo={undefined}
      />
    )
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900" {...swipeHandlers}>
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="flex-1 md:ml-64 flex flex-col overflow-hidden">
        <div className={`flex-1 overflow-auto relative ${alturaCheia ? '' : 'pb-24'}`}>
          {/* Botão Hamburguer - apenas mobile */}
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="md:hidden fixed top-4 left-4 z-30 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Menu size={24} />
          </button>

          <Outlet />
        </div>
      </div>

      {/* Widget global Sexta-feira — agente IA consultora */}
      {!rotaLivre && location.pathname !== '/agente-sexta-feira' && (
        <SextaFeiraWidget />
      )}
    </div>
  )
}
