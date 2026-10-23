import { useEffect, useState } from 'react'
import { MessageSquareQuote } from 'lucide-react'
import { useUpdateLead } from '@/hooks/useCRM'
import type { Lead } from '@/types/crm'

type Campo = 'negocio' | 'objetivo' | 'desafio' | 'duvida'

// Cada valor entra no meio de uma frase da mensagem automática ("seu objetivo de
// faturar 15 mil por mês"), por isso a dica de formato e o exemplo em cada campo.
const CAMPOS: Array<{ campo: Campo; rotulo: string; exemplo: string; dica: string; max: number }> = [
  { campo: 'negocio', rotulo: 'Negócio', exemplo: 'confeitaria', dica: 'Poucas palavras: o que ele faz', max: 120 },
  { campo: 'objetivo', rotulo: 'Objetivo', exemplo: 'faturar 15 mil por mês', dica: 'Comece com verbo no infinitivo', max: 160 },
  { campo: 'desafio', rotulo: 'Desafio', exemplo: 'organizar o caixa', dica: 'Comece com verbo no infinitivo', max: 160 },
  { campo: 'duvida', rotulo: 'Dúvida', exemplo: 'o valor', dica: 'O tema da dúvida real', max: 120 },
]

/**
 * "O que o lead contou": os campos que as mensagens automáticas do número oficial usam.
 * Campo vazio = a mensagem que depende dele não sai (o follow-up mostra qual falta).
 * Salva ao sair do campo, como a origem e o responsável logo acima.
 */
export default function PerfilDoLead({ lead }: { lead: Lead }) {
  const atualizar = useUpdateLead()
  const [valores, setValores] = useState<Record<Campo, string>>({ negocio: '', objetivo: '', desafio: '', duvida: '' })

  useEffect(() => {
    setValores({
      negocio: lead.negocio ?? '',
      objetivo: lead.objetivo ?? '',
      desafio: lead.desafio ?? '',
      duvida: lead.duvida ?? '',
    })
  }, [lead.id, lead.negocio, lead.objetivo, lead.desafio, lead.duvida])

  const salvar = (campo: Campo) => {
    const novo = valores[campo].trim()
    if (novo === (lead[campo] ?? '')) return
    atualizar.mutate({ id: lead.id, data: { [campo]: novo || null } })
  }

  return (
    <div className="border-t pt-4">
      <h3 className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
        <MessageSquareQuote size={16} className="text-gray-400" />
        O que o lead contou
      </h3>
      <p className="text-xs text-gray-500 mb-3">
        Com as palavras dele. As mensagens automáticas montam a frase com isso: "seu objetivo de faturar 15 mil por mês".
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CAMPOS.map(({ campo, rotulo, exemplo, dica, max }) => (
          <label key={campo} className="block">
            <span className="text-xs font-medium text-gray-600">{rotulo}</span>
            <input
              type="text"
              value={valores[campo]}
              maxLength={max}
              placeholder={`ex.: ${exemplo}`}
              title={dica}
              onChange={(e) => setValores((v) => ({ ...v, [campo]: e.target.value }))}
              onBlur={() => salvar(campo)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <span className="text-[11px] text-gray-400">{dica}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
