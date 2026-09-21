import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Spinner } from '@/components/ui'
import { isAdminEmpresa } from '@/utils/roles'
import { useCapacidades } from '@/hooks/useCapacidades'
import type { Capacidade } from '@/utils/capacidades'

interface PrivateRouteProps {
  children: React.ReactNode
  requiredRole?: string[]
  requiredPermission?: string
  /** Capacidade do PLANO (o que a empresa contratou) — ver utils/capacidades.ts. */
  requiredCapacidade?: Capacidade
}

export const PrivateRoute: React.FC<PrivateRouteProps> = ({
  children,
  requiredRole,
  requiredPermission,
  requiredCapacidade
}) => {
  const { isAuthenticated, isLoading, user } = useAuth()
  const { pode, carregou } = useCapacidades()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Check role/nivel if requiredRole is specified
  if (requiredRole && requiredRole.length > 0) {
    const userNivel = user?.nivel

    // Admin (super_admin), Master e Creator têm acesso às rotas admin
    const hasAdminAccess =
      isAdminEmpresa(user) ||
      (userNivel && requiredRole.includes(userNivel))

    if (!hasAdminAccess) {
      return <Navigate to="/" replace />
    }
  }

  // Plano: o módulo inteiro só existe se a empresa contratou. Vem ANTES da
  // permissão porque é a camada de fora — o master tem todas as permissões e
  // mesmo assim não entra num módulo que a empresa não assinou.
  //
  // Enquanto o plano não chegou, `pode()` devolve true e a tela monta: redirecionar
  // durante o carregamento tiraria da página quem só demorou a responder, e o
  // backend nega de qualquer forma. `carregou` fica aqui para deixar isso explícito.
  if (requiredCapacidade && carregou && !pode(requiredCapacidade)) {
    return <Navigate to="/planos" replace />
  }

  // Check permission for specific modules (for 'comum' users)
  if (requiredPermission) {
    // Admin, Master e Creator têm todas as permissões
    if (!isAdminEmpresa(user)) {
      const permissoes = user?.permissoes || {}
      const hasPermission = permissoes[requiredPermission as keyof typeof permissoes]
      if (hasPermission === false) {
        return <Navigate to="/" replace />
      }
    }
  }

  return <>{children}</>
}
