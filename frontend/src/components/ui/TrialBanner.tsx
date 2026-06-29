import React from 'react'
import { Zap, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Assinatura } from '@/api/assinaturas'

interface TrialBannerProps {
  assinatura: Assinatura
  onDismiss?: () => void
}

export const TrialBanner: React.FC<TrialBannerProps> = ({ assinatura, onDismiss }) => {
  const navigate = useNavigate()

  if (assinatura.status !== 'trial' || !assinatura.trial_expira_em) return null

  const expira = new Date(assinatura.trial_expira_em)
  const agora = new Date()
  const diffMs = expira.getTime() - agora.getTime()
  const diffHoras = Math.ceil(diffMs / (1000 * 60 * 60))
  const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  const isUrgente = diffDias <= 1

  return (
    <div className={`flex items-center justify-between px-4 py-2 text-sm font-medium ${
      isUrgente
        ? 'bg-red-500 text-white'
        : 'bg-amber-400 text-amber-900'
    }`}>
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 flex-shrink-0" />
        <span>
          {isUrgente
            ? `Seu trial expira em ${diffHoras < 24 ? `${diffHoras}h` : '1 dia'}!`
            : `Trial gratuito — expira em ${diffDias} dias (${expira.toLocaleDateString('pt-BR')})`}
          {' '}
          <button
            onClick={() => navigate('/planos')}
            className="underline font-bold hover:no-underline"
          >
            Assine agora
          </button>
        </span>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="ml-4 opacity-70 hover:opacity-100">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
