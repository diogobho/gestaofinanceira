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
  const fonte = status?.fonte
  const temOverride = fonte === 'lead'

  const handleToggle = () => {
    if (temOverride) {
      // Tem override individual → remover e voltar a herdar do estágio
      toggleLead.mutate({ leadId, ativo: null })
    } else if (ativo) {
      // Ativo via estágio → desativar explicitamente para este lead
      toggleLead.mutate({ leadId, ativo: false })
    } else {
      // Inativo sem override → ativar explicitamente para este lead
      toggleLead.mutate({ leadId, ativo: true })
    }
  }

  const titulo = temOverride
    ? 'Configuração individual — clique para restaurar padrão do estágio'
    : ativo
      ? 'IA ativa pelo estágio — clique para desativar neste lead'
      : 'IA inativa — clique para ativar neste lead'

  return (
    <button
      onClick={handleToggle}
      disabled={toggleLead.isPending}
      title={titulo}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50 ${
        ativo
          ? 'bg-primary-100 text-primary-700 hover:bg-primary-200 border border-primary-300'
          : temOverride
            ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-300'
            : 'bg-gray-100 text-gray-500 hover:bg-gray-200 border border-gray-200'
      }`}
    >
      <Bot size={13} className={
        ativo ? 'text-primary-600' : temOverride ? 'text-amber-500' : 'text-gray-400'
      } />
      {ativo ? (
        <span>
          IA ativa
          {fonte === 'estagio' && <span className="ml-1 opacity-60">(estágio)</span>}
          {fonte === 'lead' && <span className="ml-1 opacity-60">(individual)</span>}
        </span>
      ) : temOverride ? (
        <span>IA desativada <span className="opacity-60">(individual)</span></span>
      ) : (
        <span>IA inativa</span>
      )}
      {ativo && (
        <span className="relative flex h-2 w-2 ml-0.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500" />
        </span>
      )}
    </button>
  )
}
