import React from 'react'
import { useAbaNaUrl } from '@/hooks/useEstadoNaUrl'
import { BarChart3, Plug } from 'lucide-react'
import { Tabs } from '@/components/ui'
import CRMDashboard from './CRMDashboard'
import { IntegracoesDashboard } from './integracoes/IntegracoesDashboard'

/**
 * /gestao/crm/dashboard — "Visão Geral" (o dashboard de sempre, intocado) +
 * "Integrações".
 *
 * A aba de integrações é aberta a **qualquer usuário com acesso ao CRM**: pedir
 * o número das próprias captações não depende de papel, e o backend já recorta
 * tudo pela empresa do token, então cada conta enxerga só o que é dela.
 */
export const CRMDashboardComAbas: React.FC = () => {
  const [aba, setAba] = useAbaNaUrl('aba', 'geral', ['geral', 'integracoes'] as const)

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-4 md:px-6 dark:border-gray-700 dark:bg-gray-900">
        <Tabs
          tabs={[
            { key: 'geral', label: 'Visão Geral', icon: <BarChart3 className="h-4 w-4" /> },
            { key: 'integracoes', label: 'Integrações', icon: <Plug className="h-4 w-4" /> },
          ]}
          active={aba}
          onChange={(k) => setAba(k as 'geral' | 'integracoes')}
        />
      </div>

      {/* O dashboard de sempre fica montado: trocar de aba não recarrega os gráficos. */}
      <div className={aba === 'geral' ? 'flex-1 overflow-y-auto' : 'hidden'}>
        <CRMDashboard />
      </div>

      {aba === 'integracoes' && (
        <div className="flex-1 overflow-y-auto bg-gray-50 p-4 md:p-6 dark:bg-gray-950">
          <IntegracoesDashboard />
        </div>
      )}
    </div>
  )
}

export default CRMDashboardComAbas
