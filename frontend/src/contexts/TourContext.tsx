import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import '@/tour/tour.css'
import { useAuth } from '@/contexts/AuthContext'
import { useTourPersistence } from '@/tour/useTourPersistence'
import { tours, tourPorId } from '@/tour/steps'
import type { Tour, TourStep } from '@/tour/types'

interface TourContextData {
  /** Inicia um tour pelo id. Ignora se o tour não existir. */
  iniciarTour: (tourId: string) => void
  /** Lista de tours disponíveis para o usuário (nome + id), para um menu. */
  toursDisponiveis: { id: string; nome: string }[]
}

const TourContext = createContext<TourContextData>({} as TourContextData)

/** Evento usado para abrir/fechar a Sidebar a partir do tour (mobile). */
export const TOUR_SIDEBAR_EVENT = 'tour:sidebar'
const setSidebar = (open: boolean) => {
  window.dispatchEvent(new CustomEvent(TOUR_SIDEBAR_EVENT, { detail: { open } }))
}

const isMobile = () => window.innerWidth < 768

/** Aguarda um elemento aparecer no DOM (até `timeout` ms). */
function aguardarElemento(selector: string, timeout = 1500): Promise<Element | null> {
  return new Promise(resolve => {
    const existente = document.querySelector(selector)
    if (existente) return resolve(existente)

    const inicio = Date.now()
    const tick = () => {
      const el = document.querySelector(selector)
      if (el) return resolve(el)
      if (Date.now() - inicio > timeout) return resolve(null)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

export const TourProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth()
  const { foiConcluido, marcarConcluido } = useTourPersistence()
  const navigate = useNavigate()
  const location = useLocation()

  const driverRef = useRef<Driver | null>(null)
  const tourAtualRef = useRef<Tour | null>(null)
  const autoTentado = useRef(false)

  // Rota atual via ref — evita closures defasados durante navegação multipágina
  const rotaAtualRef = useRef(location.pathname)
  rotaAtualRef.current = location.pathname

  const isAdminOrMaster = useMemo(
    () => user?.nivel === 'super_admin' || user?.tipo_usuario === 'master',
    [user],
  )

  /** Aplica o mesmo RBAC da Sidebar: filtra passos por permissão e papel. */
  const filtrarPassos = useCallback(
    (passos: TourStep[]): TourStep[] => {
      const permissoes = user?.permissoes || {}
      return passos.filter(p => {
        if (p.papeis && p.papeis.length > 0) {
          if (!isAdminOrMaster && !(user?.nivel && p.papeis.includes(user.nivel))) return false
        }
        if (p.permissao && !isAdminOrMaster) {
          if (permissoes[p.permissao] === false) return false
        }
        return true
      })
    },
    [user, isAdminOrMaster],
  )

  /** Prepara a tela para um passo: navega de rota e/ou abre a sidebar. */
  const prepararPasso = useCallback(
    async (passo: TourStep): Promise<void> => {
      if (passo.rota && passo.rota !== rotaAtualRef.current) {
        navigate(passo.rota)
      }
      if (isMobile()) setSidebar(!!passo.requerSidebar)
      if (passo.element) await aguardarElemento(passo.element)
    },
    [navigate],
  )

  const encerrar = useCallback(() => {
    const tour = tourAtualRef.current
    if (tour) marcarConcluido(tour.id)
    if (isMobile()) setSidebar(false)
    tourAtualRef.current = null
    driverRef.current = null
  }, [marcarConcluido])

  const iniciarTour = useCallback(
    (tourId: string) => {
      const tour = tourPorId(tourId)
      if (!tour) return

      const passos = filtrarPassos(tour.passos)
      if (passos.length === 0) return

      // Encerra qualquer tour em andamento
      driverRef.current?.destroy()

      tourAtualRef.current = tour

      const moverPara = async (indice: number) => {
        const passo = passos[indice]
        if (!passo) return
        await prepararPasso(passo)
        driverRef.current?.moveTo(indice)
      }

      const d = driver({
        showProgress: passos.length > 1,
        allowClose: true,
        overlayOpacity: 0.6,
        stagePadding: 6,
        stageRadius: 8,
        popoverClass: 'duofuturo-tour',
        nextBtnText: 'Próximo →',
        prevBtnText: '← Anterior',
        doneBtnText: 'Concluir ✓',
        progressText: '{{current}} de {{total}}',
        steps: passos.map(p => ({
          element: p.element,
          popover: {
            title: p.titulo,
            description: p.descricao,
            side: p.lado ?? 'bottom',
            align: p.alinhamento ?? 'start',
          },
        })),
        onNextClick: (_el, _step, { state }) => {
          const proximo = (state.activeIndex ?? 0) + 1
          if (proximo >= passos.length) {
            d.destroy()
            return
          }
          void moverPara(proximo)
        },
        onPrevClick: (_el, _step, { state }) => {
          const anterior = (state.activeIndex ?? 0) - 1
          if (anterior < 0) return
          void moverPara(anterior)
        },
        onDestroyed: () => {
          encerrar()
        },
      })

      driverRef.current = d

      // Prepara o primeiro passo (sidebar/rota) antes de exibir
      void (async () => {
        await prepararPasso(passos[0])
        d.drive()
      })()
    },
    [filtrarPassos, prepararPasso, encerrar],
  )

  // Auto-disparo do tour de boas-vindas no 1º acesso
  useEffect(() => {
    if (!isAuthenticated || !user?.id || autoTentado.current) return
    autoTentado.current = true

    const auto = tours.find(t => t.autoIniciar)
    if (!auto || foiConcluido(auto.id)) return
    if (filtrarPassos(auto.passos).length === 0) return

    // Pequeno atraso para o Layout/Sidebar montarem
    const timer = setTimeout(() => iniciarTour(auto.id), 800)
    return () => clearTimeout(timer)
  }, [isAuthenticated, user?.id, foiConcluido, filtrarPassos, iniciarTour])

  // Auto-disparo do tour específico da página na 1ª visita.
  // Só roda após o tour de boas-vindas concluído e quando nenhum tour está ativo.
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return
    if (driverRef.current) return // tour em andamento

    const welcome = tours.find(t => t.autoIniciar)
    if (welcome && !foiConcluido(welcome.id)) return // não competir com o boas-vindas

    const pageTour = tours.find(t => t.iniciarNaRota === location.pathname)
    if (!pageTour || foiConcluido(pageTour.id)) return
    if (filtrarPassos(pageTour.passos).length === 0) return

    const timer = setTimeout(() => iniciarTour(pageTour.id), 700)
    return () => clearTimeout(timer)
  }, [location.pathname, isAuthenticated, user?.id, foiConcluido, filtrarPassos, iniciarTour])

  // Limpa o driver ao desmontar
  useEffect(() => {
    return () => {
      driverRef.current?.destroy()
    }
  }, [])

  const toursDisponiveis = useMemo(
    () =>
      tours
        .filter(t => filtrarPassos(t.passos).length > 0)
        .map(t => ({ id: t.id, nome: t.nome })),
    [filtrarPassos],
  )

  return (
    <TourContext.Provider value={{ iniciarTour, toursDisponiveis }}>
      {children}
    </TourContext.Provider>
  )
}

export const useTour = () => {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used within a TourProvider')
  return ctx
}
