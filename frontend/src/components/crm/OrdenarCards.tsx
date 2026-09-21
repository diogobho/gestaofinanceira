import { ArrowUpDown } from 'lucide-react'
import type { OrdemCards } from '@/api/crm'
import type { Lead } from '@/types/crm'

export const ORDENS_CARDS = [
  'manual', 'recentes', 'antigos', 'mensagem', 'mais_recebidas',
  'nome_az', 'nome_za', 'valor', 'temperatura',
] as const

const ROTULOS: Record<OrdemCards, string> = {
  manual: 'Ordem manual',
  recentes: 'Entrada: mais recentes',
  antigos: 'Entrada: mais antigos',
  mensagem: 'Última mensagem primeiro',
  mais_recebidas: 'Mais mensagens recebidas',
  nome_az: 'Nome (A–Z)',
  nome_za: 'Nome (Z–A)',
  valor: 'Maior valor primeiro',
  temperatura: 'Mais quentes primeiro',
}

const GRUPOS: { rotulo: string; ordens: OrdemCards[] }[] = [
  { rotulo: 'Posição', ordens: ['manual'] },
  { rotulo: 'Conversa', ordens: ['mensagem', 'mais_recebidas'] },
  { rotulo: 'Entrada no funil', ordens: ['recentes', 'antigos'] },
  { rotulo: 'Nome', ordens: ['nome_az', 'nome_za'] },
  { rotulo: 'Negócio', ordens: ['valor', 'temperatura'] },
]

// Mesma regra do banco (collation pt-BR): acento não joga o nome para o fim da lista.
const colacao = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })
const PESO_TEMPERATURA: Record<string, number> = { quente: 0, morno: 1, frio: 2 }
const tempo = (d?: string | null) => (d ? new Date(d).getTime() : -Infinity)

/**
 * Comparador do lado do cliente, espelho do ORDER BY da API (`leads.service.ts`). Serve
 * à visão em LISTA, que junta as colunas: a API ordena DENTRO de cada estágio, e numa
 * tabela "A–Z" o esperado é a ordem geral. `null` na ordem manual: a lista fica agrupada
 * por estágio, como sempre foi.
 */
export function compararLeads(ordem: OrdemCards): ((a: Lead, b: Lead) => number) | null {
  const desempate = (a: Lead, b: Lead) => b.id - a.id
  switch (ordem) {
    case 'recentes': return (a, b) => tempo(b.created_at) - tempo(a.created_at) || desempate(a, b)
    case 'antigos': return (a, b) => tempo(a.created_at) - tempo(b.created_at) || a.id - b.id
    case 'mensagem': return (a, b) => tempo(b.ultima_mensagem_at) - tempo(a.ultima_mensagem_at) || desempate(a, b)
    case 'mais_recebidas': return (a, b) => (b.total_recebidas ?? 0) - (a.total_recebidas ?? 0)
      || tempo(b.ultima_mensagem_at) - tempo(a.ultima_mensagem_at) || desempate(a, b)
    case 'nome_az': return (a, b) => colacao.compare(a.nome ?? '', b.nome ?? '') || a.id - b.id
    case 'nome_za': return (a, b) => colacao.compare(b.nome ?? '', a.nome ?? '') || desempate(a, b)
    // valor_potencial é numeric no Postgres e chega como STRING ("0.00")
    case 'valor': return (a, b) => (Number(b.valor_potencial) || 0) - (Number(a.valor_potencial) || 0) || desempate(a, b)
    case 'temperatura': return (a, b) => (PESO_TEMPERATURA[a.temperatura] ?? 3) - (PESO_TEMPERATURA[b.temperatura] ?? 3)
      || tempo(b.ultima_mensagem_at) - tempo(a.ultima_mensagem_at) || desempate(a, b)
    default: return null
  }
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
        {GRUPOS.map((g) => (
          <optgroup key={g.rotulo} label={g.rotulo}>
            {g.ordens.map((o) => (
              <option key={o} value={o}>{ROTULOS[o]}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}
