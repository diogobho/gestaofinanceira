import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { rotaInicial } from '@/utils/roles'
import { PrivateRoute } from './PrivateRoute'
import { Layout } from '@/components/layout'
import { Login } from '@/pages/auth/Login'
import { Register } from '@/pages/auth/Register'
import { EsqueciSenha, RedefinirSenha } from '@/pages/auth/RecuperarSenha'
import { DashboardComAbas } from '@/pages/dashboard/DashboardComAbas'
import { LandingPage } from '@/pages/landing/LandingPage'
import { ClientsList } from '@/pages/clientes/ClientsList'
import { RevenuesList } from '@/pages/receitas/RevenuesList'
import { ExpensesList } from '@/pages/despesas/ExpensesList'
import { ParcelasList } from '@/pages/parcelas/ParcelasList'
import { SessionsList } from '@/pages/sessoes/SessionsList'
import { UserManagement } from '@/pages/admin/UserManagement'
import { UserProfile } from '@/pages/perfil/UserProfile'
import { WhatsAppConfig } from '@/pages/whatsapp/WhatsAppConfig'
import { MetaCloudApi } from '@/pages/whatsapp/MetaCloudApi'
import { OnboardingPainel } from '@/pages/onboarding/OnboardingPainel'
import { CRMDashboardComAbas, CRMComAbas } from '@/pages/crm'
import { AgenteFinanceiro } from '@/pages/agente/AgenteFinanceiro'
import { Suporte } from '@/pages/suporte/Suporte'
import { EmailConfig } from '@/pages/configuracoes/EmailConfig'
import { Planos } from '@/pages/planos/Planos'
import { MinhaConta } from '@/pages/minha-conta/MinhaConta'
import { Grupos } from '@/pages/grupos/Grupos'

const AppRoutes: React.FC = () => {
  const { isAuthenticated, user } = useAuth()
  const casa = rotaInicial(user)

  return (
    <Routes>
      <Route
        path="/"
        element={isAuthenticated ? <Navigate to={casa} replace /> : <LandingPage />}
      />
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to={casa} replace /> : <Login />}
      />
      <Route
        path="/register"
        element={isAuthenticated ? <Navigate to={casa} replace /> : <Register />}
      />
      <Route
        path="/esqueci-senha"
        element={isAuthenticated ? <Navigate to={casa} replace /> : <EsqueciSenha />}
      />
      {/* Sem redirecionar quem está logado: o link do e-mail pode abrir num
          navegador com outra sessão aberta, e a troca é da conta do link. */}
      <Route path="/redefinir-senha" element={<RedefinirSenha />} />

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
              <DashboardComAbas />
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
            <PrivateRoute requiredPermission="whatsapp" requiredCapacidade="whatsapp_qr">
              <WhatsAppConfig />
            </PrivateRoute>
          }
        />
        <Route
          path="/grupos"
          element={
            <PrivateRoute requiredPermission="whatsapp" requiredCapacidade="grupos_whatsapp">
              <Grupos />
            </PrivateRoute>
          }
        />
        {/* API oficial da Meta. Quem barra de verdade e o backend (super_admin);
            a propria pagina mostra "acesso restrito" para nao piscar conteudo. */}
        <Route
          path="/whatsapp/meta"
          element={
            <PrivateRoute>
              <MetaCloudApi />
            </PrivateRoute>
          }
        />
        <Route
          path="/crm"
          element={
            <PrivateRoute requiredPermission="crm" requiredCapacidade="crm">
              <CRMComAbas variante="aquisicao" />
            </PrivateRoute>
          }
        />
        <Route
          path="/crm/dashboard"
          element={
            <PrivateRoute requiredPermission="crm" requiredCapacidade="crm">
              <CRMDashboardComAbas />
            </PrivateRoute>
          }
        />
        <Route
          path="/crm-cx"
          element={
            <PrivateRoute requiredPermission="crm" requiredCapacidade="crm">
              <CRMComAbas variante="cx" />
            </PrivateRoute>
          }
        />

        <Route
          path="/agente-duo"
          element={
            <PrivateRoute requiredPermission="agente">
              <AgenteFinanceiro />
            </PrivateRoute>
          }
        />

        {/* Suporte é de todo mundo: sem requiredPermission — quem usa o sistema
            precisa poder pedir ajuda, seja qual for o papel dele. */}
        <Route path="/suporte" element={<PrivateRoute><Suporte /></PrivateRoute>} />

        {/* O assistente se chamava "Sexta-feira" até 24/08/2026. O caminho antigo
            fica de pé porque está em link salvo, e o catch-all lá embaixo mandaria
            quem clicasse para o dashboard, sem explicação. */}
        <Route path="/agente-sexta-feira" element={<Navigate to="/agente-duo" replace />} />

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

        {/* Boas-vindas de conta nova: acompanhamento e modelos. Quem barra e o
            backend (super_admin); a pagina mostra "acesso restrito" para nao
            piscar conteudo de outras empresas. */}
        <Route
          path="/onboarding"
          element={
            <PrivateRoute requiredRole={['super_admin']}>
              <OnboardingPainel />
            </PrivateRoute>
          }
        />

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

      <Route path="*" element={<Navigate to={isAuthenticated ? casa : '/'} replace />} />
    </Routes>
  )
}

export default AppRoutes
