import { useState } from 'react'
import { LayoutGrid, Zap } from 'lucide-react'
import { Tabs } from '@/components/ui'
import { AutomacoesPanel } from '@/components/automacoes/AutomacoesPanel'
import { DisparosAgendadosSection } from '@/components/crm/DisparosAgendadosSection'
import { AgendamentosSection } from '@/components/crm/AgendamentosSection'
import CRMKanban from './CRMKanban'
import CRMFunilCX from './CRMFunilCX'

interface CRMComAbasProps {
  variante: 'aquisicao' | 'cx'
}

const TITULOS = {
  aquisicao: { funil: 'Funil de Vendas', subtitulo: 'Automações nos funis de aquisição' },
  cx:        { funil: 'Funil CX',        subtitulo: 'Automações nos funis de pós-venda / CX' }
}

export default function CRMComAbas({ variante }: CRMComAbasProps) {
  const [aba, setAba] = useState<'funil' | 'automacoes'>('funil')
  const t = TITULOS[variante]

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-6 dark:border-gray-700 dark:bg-gray-900">
        <Tabs
          tabs={[
            { key: 'funil',      label: t.funil,     icon: <LayoutGrid className="h-4 w-4" /> },
            { key: 'automacoes', label: 'Automações', icon: <Zap className="h-4 w-4" /> }
          ]}
          active={aba}
          onChange={(k) => setAba(k as 'funil' | 'automacoes')}
        />
      </div>

      <div className={aba === 'funil' ? 'flex-1 overflow-hidden' : 'hidden'}>
        {variante === 'aquisicao' ? <CRMKanban /> : <CRMFunilCX />}
      </div>

      {aba === 'automacoes' && (
        <div className="flex-1 overflow-y-auto bg-gray-50 p-6 dark:bg-gray-950">
          <DisparosAgendadosSection funilTipo={variante} />
          <AgendamentosSection funilTipo={variante} />
          <AutomacoesPanel
            filtros={{ funil_tipo: variante }}
            titulo={t.subtitulo}
            emptyMessage={`Nenhuma automação configurada nos ${variante === 'aquisicao' ? 'funis de aquisição' : 'funis de CX'} ainda. Ative o agente IA num estágio, configure follow-ups ou crie automações por lead para vê-las aqui.`}
          />
        </div>
      )}
    </div>
  )
}
