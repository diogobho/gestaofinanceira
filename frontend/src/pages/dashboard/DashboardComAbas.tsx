import React from 'react'
import { useAbaNaUrl } from '@/hooks/useEstadoNaUrl'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, Landmark } from 'lucide-react'
import { Tabs } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { contaazulApi } from '@/api/contaazul'
import { Dashboard } from '@/pages/Dashboard'
import { ContaAzulDashboard } from './contaazul/ContaAzulDashboard'
import { isAdminEmpresa, isSuperAdmin } from '@/utils/roles'

/**
 * /gestao/dashboard — "Visão Geral" (o dashboard de sempre) + "Conta Azul".
 *
 * A aba do Conta Azul é restrita: master da Panteras ou super_admin. O palpite
 * abaixo só evita piscar a aba enquanto a resposta não chega; quem manda é o
 * backend, que devolve 403 em /contaazul/dashboard/* para todo o resto.
 */

const EMPRESA_CONTAAZUL = 5 // Panteras

export const DashboardComAbas: React.FC = () => {
  const { user } = useAuth()
  const [aba, setAba] = useAbaNaUrl('aba', 'geral', ['geral', 'contaazul'] as const)

  const podeVerPeloPerfil =
    isSuperAdmin(user) ||
    (Number(user?.empresa_id ?? user?.empresa?.id) === EMPRESA_CONTAAZUL &&
      isAdminEmpresa(user))

  const { data: acesso } = useQuery({
    queryKey: ['contaazul-acesso'],
    queryFn: () => contaazulApi.acesso(),
    enabled: podeVerPeloPerfil,
    retry: false,
    staleTime: 30 * 60 * 1000,
  })

  const mostrarAba = podeVerPeloPerfil && acesso?.liberado === true

  // Sem a aba não há o que separar: entrega o dashboard de sempre, sem casca extra.
  if (!mostrarAba) return <Dashboard />

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-4 md:px-6 dark:border-gray-700 dark:bg-gray-900">
        <Tabs
          tabs={[
            { key: 'geral', label: 'Visão Geral', icon: <BarChart3 className="h-4 w-4" /> },
            { key: 'contaazul', label: 'Conta Azul', icon: <Landmark className="h-4 w-4" /> },
          ]}
          active={aba}
          onChange={(k) => setAba(k as 'geral' | 'contaazul')}
        />
      </div>

      {/* O dashboard antigo fica montado: alternar de aba não recarrega os gráficos. */}
      <div className={aba === 'geral' ? 'flex-1 overflow-y-auto' : 'hidden'}>
        <Dashboard />
      </div>

      {aba === 'contaazul' && (
        <div className="flex-1 overflow-y-auto bg-gray-50 p-4 md:p-6 dark:bg-gray-950">
          <ContaAzulDashboard />
        </div>
      )}
    </div>
  )
}
