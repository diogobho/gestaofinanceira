import { LayoutList, DollarSign, User, CheckCircle2, Clock, Calendar } from 'lucide-react'
import type { Lead, EstagioFunil } from '@/types/crm'
import type { OrdemCards } from '@/api/crm'
import { compararLeads } from '@/components/crm/OrdenarCards'

/**
 * Visão em LISTA (tabela) dos leads de um funil — compartilhada entre o funil de
 * Vendas (CRMKanban) e o de CX (CRMFunilCX). Recebe as colunas do kanban e achata
 * os leads numa tabela.
 */

function TemperaturaBadge({ value }: { value: 'frio' | 'morno' | 'quente' }) {
  const map = {
    frio:   { label: 'Frio',   cls: 'bg-blue-100 text-blue-700' },
    morno:  { label: 'Morno',  cls: 'bg-yellow-100 text-yellow-700' },
    quente: { label: 'Quente', cls: 'bg-red-100 text-red-700' },
  }
  const { label, cls } = map[value] ?? map.frio
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>
}

interface ListViewProps {
  colunas: (EstagioFunil & { leads: Lead[] })[]
  onCardClick: (lead: Lead) => void
  /** Texto do vazio (ex.: "Nenhum cliente no funil CX" / "Nenhum lead no funil"). */
  emptyLabel?: string
  /** Ordem escolhida no seletor. Fora da manual, a tabela segue a ordem geral em vez de
   *  ficar agrupada por estágio. */
  ordem?: OrdemCards
}

export default function CRMListView({ colunas, onCardClick, emptyLabel = 'Nenhum lead no funil', ordem = 'manual' }: ListViewProps) {
  const leads = colunas.flatMap(col =>
    col.leads.map(l => ({ ...l, estagio_nome: l.estagio_nome ?? col.nome, estagio_cor: l.estagio_cor ?? col.cor }))
  )
  const comparar = compararLeads(ordem)
  if (comparar) leads.sort(comparar)

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <LayoutList size={40} className="mb-2 opacity-40" />
        <p>{emptyLabel}</p>
      </div>
    )
  }

  return (
    <div className="overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            <th className="px-4 py-3">Lead</th>
            <th className="px-4 py-3">Estágio</th>
            <th className="px-4 py-3">Valor</th>
            <th className="px-4 py-3">Temperatura</th>
            <th className="px-4 py-3">Responsável</th>
            <th className="px-4 py-3">Próx. Tarefa</th>
            <th className="px-4 py-3">Entrada</th>
          </tr>
        </thead>
        <tbody>
          {leads.map(lead => (
            <tr
              key={lead.id}
              onClick={() => onCardClick(lead)}
              className="border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
            >
              {/* Lead */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: lead.estagio_cor ?? '#6366f1' }}
                  />
                  <div>
                    <p className="font-medium text-gray-800 dark:text-gray-100">{lead.nome}</p>
                    {lead.empresa && (
                      <p className="text-xs text-gray-400">{lead.empresa}</p>
                    )}
                  </div>
                  {lead.total_recebidas != null && (
                    <span className="ml-1 text-xs text-primary-600" title="Mensagens recebidas nesta conversa">
                      {lead.total_recebidas} {lead.total_recebidas === 1 ? 'recebida' : 'recebidas'}
                    </span>
                  )}
                  {(lead.mensagens_nao_lidas ?? 0) > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-green-500 text-white text-xs font-bold rounded-full">
                      {lead.mensagens_nao_lidas}
                    </span>
                  )}
                </div>
              </td>

              {/* Estágio */}
              <td className="px-4 py-3">
                <span
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: `${lead.estagio_cor ?? '#6366f1'}20`, color: lead.estagio_cor ?? '#6366f1' }}
                >
                  {lead.estagio_nome ?? '—'}
                </span>
              </td>

              {/* Valor */}
              <td className="px-4 py-3">
                {lead.valor_potencial != null ? (
                  <span className="font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <DollarSign size={12} />
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lead.valor_potencial)}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>

              {/* Temperatura */}
              <td className="px-4 py-3">
                <TemperaturaBadge value={lead.temperatura} />
              </td>

              {/* Responsável */}
              <td className="px-4 py-3">
                {lead.responsavel_nome ? (
                  <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
                    <User size={13} />
                    {lead.responsavel_nome}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>

              {/* Próx. Tarefa */}
              <td className="px-4 py-3">
                {lead.proxima_tarefa ? (
                  <div className="flex items-center gap-1 text-xs">
                    {lead.proxima_tarefa.status === 'concluida' ? (
                      <CheckCircle2 size={13} className="text-green-500" />
                    ) : (
                      <Clock size={13} className="text-amber-500" />
                    )}
                    <span className="text-gray-600 dark:text-gray-300 truncate max-w-[120px]">
                      {lead.proxima_tarefa.titulo}
                    </span>
                  </div>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>

              {/* Entrada */}
              <td className="px-4 py-3 text-gray-400 text-xs">
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
