import { ListChecks, Plus, Trash2 } from 'lucide-react'
import type { TarefaDoEstagio } from '@/types/crm'

/**
 * Tarefas criadas sozinhas quando o card entra no estágio (108, 13/10/2026). Vão para o dono
 * do card; as pendentes são canceladas quando ele sai da etapa. Sem tipo "reunião": esse
 * liga os lembretes e o no-show, e só nasce quando a reunião é marcada de verdade.
 */
const TIPOS: { v: NonNullable<TarefaDoEstagio['tipo']>; r: string }[] = [
  { v: 'follow_up', r: 'Follow-up' },
  { v: 'ligacao', r: 'Ligação' },
  { v: 'proposta', r: 'Proposta' },
  { v: 'email', r: 'E-mail' },
  { v: 'visita', r: 'Visita' },
  { v: 'outros', r: 'Outros' },
]
const PRIORIDADES: { v: NonNullable<TarefaDoEstagio['prioridade']>; r: string }[] = [
  { v: 'baixa', r: 'Baixa' },
  { v: 'normal', r: 'Normal' },
  { v: 'alta', r: 'Alta' },
  { v: 'urgente', r: 'Urgente' },
]

const nova = (): TarefaDoEstagio => ({
  titulo: '', descricao: '', tipo: 'follow_up', prioridade: 'normal', prazo: 1, unidade: 'dia', hora: '09:00',
})

interface Props {
  value: TarefaDoEstagio[]
  onChange: (v: TarefaDoEstagio[]) => void
}

export default function TarefasEntradaConfig({ value, onChange }: Props) {
  const set = (i: number, patch: Partial<TarefaDoEstagio>) =>
    onChange(value.map((t, j) => (j === i ? { ...t, ...patch } : t)))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ListChecks size={16} className="text-emerald-600" />
        <span className="text-sm font-medium text-gray-700">Tarefas ao entrar nesta etapa</span>
      </div>
      <p className="text-[11px] text-gray-400">
        Criadas para o responsável do card assim que ele chega aqui. As que ainda estiverem pendentes
        são canceladas quando o card sai da etapa. Vencimento que cair no sábado ou domingo passa para segunda.
      </p>

      {value.map((t, i) => (
        <div key={i} className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <input
              value={t.titulo}
              onChange={e => set(i, { titulo: e.target.value })}
              placeholder="O que fazer (ex.: Convidar para a reunião)"
              aria-label={`Título da tarefa ${i + 1}`}
              className="flex-1 min-w-0 px-2 py-1.5 border rounded text-sm focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              aria-label={`Remover tarefa ${i + 1}`}
              className="p-1.5 text-gray-400 hover:text-red-600"
            >
              <Trash2 size={15} />
            </button>
          </div>
          <textarea
            value={t.descricao ?? ''}
            rows={2}
            onChange={e => set(i, { descricao: e.target.value })}
            placeholder="Como fazer (opcional)"
            aria-label={`Descrição da tarefa ${i + 1}`}
            className="w-full px-2 py-1.5 border rounded text-sm resize-y focus:ring-1 focus:ring-emerald-500"
          />
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
            <span>Vence em</span>
            <input
              type="number" min={0} value={t.prazo ?? 0}
              onChange={e => set(i, { prazo: Math.max(0, Number(e.target.value) || 0) })}
              aria-label="Prazo"
              className="w-16 px-2 py-1 border rounded focus:ring-1 focus:ring-emerald-500"
            />
            <select
              value={t.unidade ?? 'dia'}
              onChange={e => set(i, { unidade: e.target.value as 'hora' | 'dia' })}
              aria-label="Unidade do prazo"
              className="px-2 py-1 border rounded focus:ring-1 focus:ring-emerald-500"
            >
              <option value="hora">hora(s)</option>
              <option value="dia">dia(s)</option>
            </select>
            {t.unidade !== 'hora' && (
              <>
                <span>às</span>
                <input
                  type="time" value={t.hora ?? '09:00'}
                  onChange={e => set(i, { hora: e.target.value })}
                  aria-label="Horário"
                  className="px-2 py-1 border rounded focus:ring-1 focus:ring-emerald-500"
                />
              </>
            )}
            <select
              value={t.tipo ?? 'follow_up'}
              onChange={e => set(i, { tipo: e.target.value as TarefaDoEstagio['tipo'] })}
              aria-label="Tipo"
              className="px-2 py-1 border rounded focus:ring-1 focus:ring-emerald-500"
            >
              {TIPOS.map(o => <option key={o.v} value={o.v}>{o.r}</option>)}
            </select>
            <select
              value={t.prioridade ?? 'normal'}
              onChange={e => set(i, { prioridade: e.target.value as TarefaDoEstagio['prioridade'] })}
              aria-label="Prioridade"
              className="px-2 py-1 border rounded focus:ring-1 focus:ring-emerald-500"
            >
              {PRIORIDADES.map(o => <option key={o.v} value={o.v}>Prioridade {o.r.toLowerCase()}</option>)}
            </select>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...value, nova()])}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
      >
        <Plus size={14} /> Adicionar tarefa
      </button>
    </div>
  )
}
