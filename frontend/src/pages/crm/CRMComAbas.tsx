import { useState } from 'react'
import { LayoutGrid, CalendarClock } from 'lucide-react'
import { Tabs } from '@/components/ui'
import { DisparosAgendadosSection } from '@/components/crm/DisparosAgendadosSection'
import { AgendamentosSection } from '@/components/crm/AgendamentosSection'
import CRMKanban from './CRMKanban'
import CRMFunilCX from './CRMFunilCX'

interface CRMComAbasProps {
  variante: 'aquisicao' | 'cx'
}

const TITULOS = {
  aquisicao: { funil: 'Funil de Vendas' },
  cx:        { funil: 'Funil CX' }
}

export default function CRMComAbas({ variante }: CRMComAbasProps) {
  const [aba, setAba] = useState<'funil' | 'agenda'>('funil')
  const t = TITULOS[variante]

  return (
    <div className="flex h-full flex-col">
      {/* pl-14 no mobile: recuo para o botão ☰ fixo (top-4 left-4) não cobrir a 1ª aba */}
      <div className="border-b border-gray-200 bg-white pl-14 pr-6 md:px-6 dark:border-gray-700 dark:bg-gray-900">
        <Tabs
          tabs={[
            { key: 'funil',  label: t.funil,        icon: <LayoutGrid className="h-4 w-4" /> },
            { key: 'agenda', label: 'Agendamentos', icon: <CalendarClock className="h-4 w-4" /> }
          ]}
          active={aba}
          onChange={(k) => setAba(k as 'funil' | 'agenda')}
        />
      </div>

      <div className={aba === 'funil' ? 'flex-1 overflow-hidden' : 'hidden'}>
        {variante === 'aquisicao' ? <CRMKanban /> : <CRMFunilCX />}
      </div>

      {aba === 'agenda' && (
        <div className="flex-1 overflow-y-auto bg-gray-50 p-6 dark:bg-gray-950">
          <DisparosAgendadosSection funilTipo={variante} />
          <AgendamentosSection funilTipo={variante} />
        </div>
      )}
    </div>
  )
}
