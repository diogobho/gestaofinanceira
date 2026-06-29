import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Spinner } from '@/components/ui'

interface PrivateRouteProps {
  children: React.ReactNode
  requiredRole?: string[]
  requiredPermission?: string
}

export const PrivateRoute: React.FC<PrivateRouteProps> = ({
  children,
  requiredRole,
  requiredPermission
}) => {
  const { isAuthenticated, isLoading, user } = useAuth()

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
    const userTipoUsuario = user?.tipo_usuario

    // Admin (super_admin) e Master têm acesso às rotas admin
    const hasAdminAccess =
      userNivel === 'super_admin' ||
      userTipoUsuario === 'master' ||
      (userNivel && requiredRole.includes(userNivel))

    if (!hasAdminAccess) {
      return <Navigate to="/" replace />
    }
  }

  // Check permission for specific modules (for 'comum' users)
  if (requiredPermission) {
    // Admin e Master têm todas as permissões
    if (user?.nivel !== 'super_admin' && user?.tipo_usuario !== 'master') {
      const permissoes = user?.permissoes || {}
      const hasPermission = permissoes[requiredPermission as keyof typeof permissoes]
      if (hasPermission === false) {
        return <Navigate to="/" replace />
      }
    }
  }

  return <>{children}</>
}
