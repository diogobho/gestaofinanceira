import React, { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { TOUR_SIDEBAR_EVENT } from '@/contexts/TourContext'
import { useSwipeable } from 'react-swipeable'
import { Menu } from 'lucide-react'
// Símbolo quadrado (o logo.png original é 1920x1080 e ficaria minúsculo em h-7).
import iconeApp from '/icons/icon-192.png'
import { Sidebar } from './Sidebar'
import { SubscriptionExpired } from '@/components/ui/SubscriptionExpired'
import { useAssinatura } from '@/hooks/useAssinatura'
import { useAuth } from '@/contexts/AuthContext'
import DuoWidget from '@/components/DuoWidget'

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

  // Largura da faixa na borda esquerda que aceita o swipe de abrir a sidebar (padrão de drawer)
  const SWIPE_EDGE_PX = 40

  // Gestos de swipe (apenas em mobile)
  const swipeHandlers = useSwipeable({
    onSwipedRight: ({ initial }) => {
      // Só abre se o gesto começou na borda esquerda — senão qualquer scroll
      // horizontal (kanban, tabelas) abriria a sidebar sem querer.
      if (window.innerWidth < 768 && initial[0] <= SWIPE_EDGE_PX) {
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
        {/*
          Barra de topo do mobile. Ocupa espaço no fluxo, em vez de flutuar: o ☰ era
          `fixed top-4 left-4` e cobria o título de qualquer página que começasse no
          topo (só o CRM reservava recuo). Aqui nenhuma página precisa saber que ela
          existe. Fica fora da área de rolagem, então não sobe junto com o conteúdo.
        */}
        <header className="md:hidden flex items-center gap-3 shrink-0 border-b border-gray-200 bg-white px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] dark:border-gray-700 dark:bg-gray-800">
          <button
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Abrir menu"
            className="-ml-2 rounded-lg p-2 text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Menu size={24} />
          </button>
          <img src={iconeApp} alt="" className="h-7 w-7" />
          <span className="text-base font-bold text-brand-navy dark:text-white">DuoFuturo</span>
        </header>

        <div className={`flex-1 overflow-auto relative ${alturaCheia ? '' : 'pb-24'}`}>
          <Outlet />
        </div>
      </div>

      {/* Widget global do Duo — assistente de IA */}
      {!rotaLivre && location.pathname !== '/agente-duo' && (
        <DuoWidget />
      )}
    </div>
  )
}
