import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { PrivateRoute } from './PrivateRoute'
import { Layout } from '@/components/layout'
import { Login } from '@/pages/auth/Login'
import { Register } from '@/pages/auth/Register'
import { Dashboard } from '@/pages/Dashboard'
import { LandingPage } from '@/pages/landing/LandingPage'
import { ClientsList } from '@/pages/clientes/ClientsList'
import { RevenuesList } from '@/pages/receitas/RevenuesList'
import { ExpensesList } from '@/pages/despesas/ExpensesList'
import { ParcelasList } from '@/pages/parcelas/ParcelasList'
import { SessionsList } from '@/pages/sessoes/SessionsList'
import { UserManagement } from '@/pages/admin/UserManagement'
import { UserProfile } from '@/pages/perfil/UserProfile'
import { WhatsAppConfig } from '@/pages/whatsapp/WhatsAppConfig'
import { CRMDashboard, CRMComAbas } from '@/pages/crm'
import { AgenteFinanceiro } from '@/pages/agente/AgenteFinanceiro'
import Automacoes from '@/pages/automacoes/Automacoes'
import { EmailConfig } from '@/pages/configuracoes/EmailConfig'
import { Planos } from '@/pages/planos/Planos'
import { MinhaConta } from '@/pages/minha-conta/MinhaConta'

const AppRoutes: React.FC = () => {
  const { isAuthenticated } = useAuth()

  return (
    <Routes>
      <Route
        path="/"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />}
      />
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />}
      />
      <Route
        path="/register"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Register />}
      />

      <Route
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        {/* Rotas com verificação de permissão */}
        <Route
          path="/dashboard"
          element={
            <PrivateRoute requiredPermission="dashboard">
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/clientes"
          element={
            <PrivateRoute requiredPermission="clientes">
              <ClientsList />
            </PrivateRoute>
          }
        />
        <Route
          path="/receitas"
          element={
            <PrivateRoute requiredPermission="receitas">
              <RevenuesList />
            </PrivateRoute>
          }
        />
        <Route
          path="/despesas"
          element={
            <PrivateRoute requiredPermission="despesas">
              <ExpensesList />
            </PrivateRoute>
          }
        />
        <Route
          path="/parcelas"
          element={
            <PrivateRoute requiredPermission="parcelas">
              <ParcelasList />
            </PrivateRoute>
          }
        />
        <Route
          path="/sessoes"
          element={
            <PrivateRoute requiredPermission="sessoes">
              <SessionsList />
            </PrivateRoute>
          }
        />
        <Route
          path="/whatsapp"
          element={
            <PrivateRoute requiredPermission="whatsapp">
              <WhatsAppConfig />
            </PrivateRoute>
          }
        />
        <Route
          path="/automacoes"
          element={
            <PrivateRoute requiredPermission="whatsapp">
              <Automacoes />
            </PrivateRoute>
          }
        />
        <Route
          path="/crm"
          element={
            <PrivateRoute requiredPermission="crm">
              <CRMComAbas variante="aquisicao" />
            </PrivateRoute>
          }
        />
        <Route
          path="/crm/dashboard"
          element={
            <PrivateRoute requiredPermission="crm">
              <CRMDashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/crm-cx"
          element={
            <PrivateRoute requiredPermission="crm">
              <CRMComAbas variante="cx" />
            </PrivateRoute>
          }
        />

        <Route
          path="/agente-sexta-feira"
          element={
            <PrivateRoute requiredPermission="agente">
              <AgenteFinanceiro />
            </PrivateRoute>
          }
        />

        {/* Configurações de e-mail — apenas admin */}
        <Route
          path="/configuracoes/email"
          element={
            <PrivateRoute requiredRole={['super_admin', 'admin_empresa']}>
              <EmailConfig />
            </PrivateRoute>
          }
        />

        {/* Planos e assinatura - todos autenticados */}
        <Route path="/planos" element={<Planos />} />
        <Route path="/minha-conta" element={<MinhaConta />} />

        {/* Perfil - todos os usuários autenticados */}
        <Route path="/perfil" element={<UserProfile />} />

        {/* Rotas admin - apenas super_admin e master */}
        <Route
          path="/admin"
          element={
            <PrivateRoute requiredRole={['super_admin']}>
              <UserManagement />
            </PrivateRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to={isAuthenticated ? '/dashboard' : '/'} replace />} />
    </Routes>
  )
}

export default AppRoutes
