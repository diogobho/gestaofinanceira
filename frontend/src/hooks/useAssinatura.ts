import { useState, useEffect } from 'react'
import { assinaturasApi, Assinatura } from '@/api/assinaturas'
import { useAuth } from '@/contexts/AuthContext'

export function useAssinatura() {
  const { user, isAuthenticated } = useAuth()
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isAuthenticated || !user?.empresa_id || user?.nivel === 'super_admin') {
      setLoading(false)
      return
    }

    setLoading(true)
    assinaturasApi.getMinhaAssinatura()
      .then(setAssinatura)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isAuthenticated, user?.empresa_id])

  const isAtiva = !assinatura || assinatura.status === 'ativa' || assinatura.status === 'trial'
  const isBloqueado = assinatura !== null
    && ['expirada', 'cancelada', 'suspensa', 'aguardando_pagamento'].includes(assinatura.status)

  return { assinatura, loading, isAtiva, isBloqueado }
}
