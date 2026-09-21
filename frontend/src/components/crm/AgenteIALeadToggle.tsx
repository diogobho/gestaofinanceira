import { Bot } from 'lucide-react'
import { useAgenteIALeadStatus, useAgenteIAToggleLead } from '@/hooks/useCRM'

interface Props {
  leadId: number
}

export default function AgenteIALeadToggle({ leadId }: Props) {
  const { data: status, isLoading } = useAgenteIALeadStatus(leadId)
  const toggleLead = useAgenteIAToggleLead()

  if (isLoading) return null

  const ativo = status?.ativo ?? false

  const handleToggle = () => {
    toggleLead.mutate({ leadId, ativo: !ativo })
  }

  const titulo = ativo
    ? 'IA ativa — clique para desativar neste lead'
    : 'IA inativa — clique para ativar neste lead'

  return (
    <button
      onClick={handleToggle}
      disabled={toggleLead.isPending}
      title={titulo}
      role="switch"
      aria-checked={ativo}
      className={`flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full text-xs font-semibold transition-all disabled:opacity-50 border ${
        ativo
          ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/50'
          : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200'
      }`}
    >
      <Bot size={14} className={ativo ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'} />
      <span>{ativo ? 'IA ativa' : 'IA inativa'}</span>
      {/* Mini switch: deixa claro que o chip é um liga/desliga, não só um rótulo */}
      <span
        className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${
          ativo ? 'bg-emerald-500 dark:bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full shadow transition-transform bg-white dark:bg-white ${
            ativo ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  )
}
