import { useState, useEffect } from 'react'
import { assinaturasApi, Assinatura } from '@/api/assinaturas'
import { useAuth } from '@/contexts/AuthContext'

export function useAssinatura() {
  const { user, isAuthenticated } = useAuth()
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null)
  // Começa carregando para quem TEM assinatura a buscar: o Layout espera a resposta
  // antes de montar as páginas, senão quem está com o trial vencido vê o Dashboard
  // piscar e dispara uma rodada de chamadas recusadas antes de ir à Minha Conta.
  const [loading, setLoading] = useState(
    () => isAuthenticated && !!user?.empresa_id && user?.nivel !== 'super_admin'
  )

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

  // Trial vencido não é "ativo": até 25/09/2026 bastava o status ser `trial`, sem
  // olhar a data, e o teste grátis nunca acabava. Quem decide é a API (`bloqueio`).
  const bloqueio = assinatura?.bloqueio ?? (assinatura?.trial_encerrado ? 'trial_encerrado' : null)
  const isAtiva = !assinatura || (!bloqueio && (assinatura.status === 'ativa' || assinatura.status === 'trial'))
  const isBloqueado = assinatura !== null
    && ['expirada', 'cancelada', 'suspensa', 'aguardando_pagamento'].includes(assinatura.status)

  return { assinatura, loading, isAtiva, isBloqueado, bloqueio }
}
