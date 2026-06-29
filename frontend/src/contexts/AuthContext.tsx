import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { authApi } from '@/api'
import type { User, LoginRequest } from '@/types'

const INACTIVITY_MS = 120 * 60 * 1000        // 120 minutos
const WARNING_MS    = 119 * 60 * 1000        // aviso aos 119 minutos
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const

interface AuthContextData {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (credentials: LoginRequest) => Promise<void>
  logout: () => void
  updateUser: (updatedUser: Partial<User>) => void
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const warningTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logoutTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningToastRef  = useRef<string | null>(null)
  const logoutFnRef      = useRef<(() => void) | null>(null)

  useEffect(() => {
    const storedUser = localStorage.getItem('user')
    const token = localStorage.getItem('token')

    if (storedUser && token) {
      try {
        setUser(JSON.parse(storedUser))
      } catch {
        // localStorage corrompido → limpar sessão em vez de quebrar o app no load
        localStorage.removeItem('user')
        localStorage.removeItem('token')
      }
    }

    setIsLoading(false)
  }, [])

  const clearInactivityTimers = useCallback(() => {
    if (warningTimerRef.current)  clearTimeout(warningTimerRef.current)
    if (logoutTimerRef.current)   clearTimeout(logoutTimerRef.current)
    if (warningToastRef.current)  toast.dismiss(warningToastRef.current)
    warningTimerRef.current  = null
    logoutTimerRef.current   = null
    warningToastRef.current  = null
  }, [])

  const scheduleInactivityLogout = useCallback(() => {
    clearInactivityTimers()

    warningTimerRef.current = setTimeout(() => {
      warningToastRef.current = toast('Você será desconectado em 1 minuto por inatividade.', {
        icon: '⚠️',
        duration: 60_000,
      })
    }, WARNING_MS)

    logoutTimerRef.current = setTimeout(() => {
      if (warningToastRef.current) toast.dismiss(warningToastRef.current)
      logoutFnRef.current?.()
      toast.error('Sessão encerrada por inatividade.')
    }, INACTIVITY_MS)
  }, [clearInactivityTimers])

  // Reinicia os timers em qualquer interação do usuário (throttled via ref)
  useEffect(() => {
    if (!user) return

    scheduleInactivityLogout()

    let lastFired = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - lastFired < 5_000) return   // throttle: no máximo 1x a cada 5s
      lastFired = now
      scheduleInactivityLogout()
    }

    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true }))

    return () => {
      clearInactivityTimers()
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, onActivity))
    }
  }, [user, scheduleInactivityLogout, clearInactivityTimers])

  const login = async (credentials: LoginRequest) => {
    try {
      setIsLoading(true)
      const response = await authApi.login(credentials)

      localStorage.setItem('token', response.token)
      localStorage.setItem('user', JSON.stringify(response.user))

      setUser(response.user)
      toast.success(`Bem-vindo(a), ${response.user.nome}!`)
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao fazer login')
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const updateUser = (updatedUser: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev
      const merged = { ...prev, ...updatedUser }
      localStorage.setItem('user', JSON.stringify(merged))
      return merged
    })
  }

  const logout = useCallback(() => {
    clearInactivityTimers()
    try {
      authApi.logout()
    } catch {
      // silencia erros de rede no logout
    } finally {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      setUser(null)
    }
  }, [clearInactivityTimers])

  // Mantém logoutFnRef sempre atualizado (evita closure stale nos timers)
  useEffect(() => {
    logoutFnRef.current = logout
  }, [logout])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
