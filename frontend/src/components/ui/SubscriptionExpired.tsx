import React from 'react'
import { LockKeyhole, Zap, Clock } from 'lucide-react'
import { Button } from './Button'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

interface SubscriptionExpiredProps {
  status: 'expirada' | 'cancelada' | 'suspensa' | 'aguardando_pagamento'
  motivo?: string
}

const statusMessages = {
  expirada: {
    title: 'Acesso bloqueado',
    subtitle: 'Sua assinatura expirou ou não foi renovada.',
    desc: 'Assine um plano para continuar usando a plataforma.',
    icon: LockKeyhole,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    showPlanos: true,
  },
  cancelada: {
    title: 'Assinatura cancelada',
    subtitle: 'Sua assinatura foi cancelada.',
    desc: 'Para retomar o acesso, assine um novo plano.',
    icon: LockKeyhole,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    showPlanos: true,
  },
  suspensa: {
    title: 'Pagamento pendente',
    subtitle: 'Sua assinatura foi suspensa.',
    desc: 'Regularize seu pagamento para retomar o acesso.',
    icon: LockKeyhole,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
    showPlanos: true,
  },
  aguardando_pagamento: {
    title: 'Aguardando confirmação',
    subtitle: 'Seu pagamento está sendo processado.',
    desc: 'Assim que o pagamento for confirmado, seu acesso será liberado automaticamente. Isso pode levar alguns minutos para PIX ou até 2 dias úteis para boleto.',
    icon: Clock,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    showPlanos: false,
  },
}

export const SubscriptionExpired: React.FC<SubscriptionExpiredProps> = ({ status, motivo }) => {
  const navigate = useNavigate()
  const { logout } = useAuth()

  const msg = statusMessages[status] || statusMessages.expirada
  const Icon = msg.icon

  return (
    <div className="fixed inset-0 z-[100] bg-white dark:bg-gray-900 flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-6">
        <div className={`w-20 h-20 rounded-full ${msg.iconBg} flex items-center justify-center mx-auto`}>
          <Icon className={`w-10 h-10 ${msg.iconColor}`} />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{msg.title}</h1>
          <p className="text-gray-600 dark:text-gray-400">{motivo || msg.subtitle}</p>
          <p className="text-sm text-gray-500 dark:text-gray-500">{msg.desc}</p>
        </div>

        <div className="space-y-3">
          {msg.showPlanos && (
            <Button
              onClick={() => navigate('/planos')}
              className="w-full flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4" />
              Ver planos e assinar
            </Button>
          )}
          {status === 'aguardando_pagamento' && (
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              className="w-full"
            >
              Verificar pagamento
            </Button>
          )}
          <button
            onClick={logout}
            className="w-full text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  )
}
