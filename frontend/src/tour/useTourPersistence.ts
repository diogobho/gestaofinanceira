import { useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Persistência de tours concluídos, por usuário, em localStorage.
 * Segue o padrão de chaves do projeto (ver useUserPhoto.ts e ThemeContext.tsx).
 *
 * Chave: `tour_done_<userId>` → JSON array com os ids de tour já vistos.
 */
const keyFor = (userId: string) => `tour_done_${userId}`

function lerConcluidos(userId: string): string[] {
  try {
    const raw = localStorage.getItem(keyFor(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function useTourPersistence() {
  const { user } = useAuth()
  const userId = user?.id

  const foiConcluido = useCallback(
    (tourId: string): boolean => {
      if (!userId) return false
      return lerConcluidos(userId).includes(tourId)
    },
    [userId],
  )

  const marcarConcluido = useCallback(
    (tourId: string): void => {
      if (!userId) return
      const atuais = lerConcluidos(userId)
      if (atuais.includes(tourId)) return
      try {
        localStorage.setItem(keyFor(userId), JSON.stringify([...atuais, tourId]))
      } catch {
        // localStorage cheio/indisponível — ignora silenciosamente
      }
    },
    [userId],
  )

  return { foiConcluido, marcarConcluido }
}
