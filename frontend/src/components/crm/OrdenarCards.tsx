import { ArrowUpDown } from 'lucide-react'
import type { OrdemCards } from '@/api/crm'

export const ORDENS_CARDS = ['manual', 'recentes', 'mensagem'] as const

const ROTULOS: Record<OrdemCards, string> = {
  manual: 'Ordem manual',
  recentes: 'Mais recentes primeiro',
  mensagem: 'Última mensagem primeiro',
}

interface OrdenarCardsProps {
  valor: OrdemCards
  onChange: (valor: OrdemCards) => void
}

/**
 * Ordem dos cards dentro de cada coluna (#59). Fica fora do painel de filtros de
 * propósito: "Limpar filtros" não deve desfazer a ordem escolhida. Nas ordens
 * automáticas, arrastar ainda troca o card de estágio, mas a posição na coluna segue a
 * ordenação — por isso o aviso no `title`.
 */
export default function OrdenarCards({ valor, onChange }: OrdenarCardsProps) {
  return (
    <label
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
        valor === 'manual'
          ? 'border-gray-200 bg-white text-gray-600'
          : 'border-primary-200 bg-primary-50 text-primary-700'
      }`}
      title={valor === 'manual'
        ? 'Ordem dos cards em cada coluna'
        : 'Arrastar ainda muda o card de estágio; a posição na coluna segue esta ordem'}
    >
      <ArrowUpDown size={16} className="shrink-0" />
      <span className="sr-only">Ordenar cards</span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value as OrdemCards)}
        className="cursor-pointer bg-transparent pr-1 text-sm focus:outline-none"
      >
        {ORDENS_CARDS.map((o) => (
          <option key={o} value={o}>{ROTULOS[o]}</option>
        ))}
      </select>
    </label>
  )
}
