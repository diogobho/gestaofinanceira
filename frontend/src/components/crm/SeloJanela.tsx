import { Timer } from 'lucide-react'
import type { Lead } from '@/types/crm'

/**
 * Selo da janela de 24h do número oficial — só vem com a ordem "Janela de 24h aberta
 * primeiro" (`janela_resta_seg` da API). Aberta: quanto falta, em âmbar na última hora e
 * meia, quando ainda dá para responder com texto livre. Fechada: só modelo aprovado.
 */
export function SeloJanela({ lead, className = '' }: { lead: Lead; className?: string }) {
  if (lead.janela_resta_seg == null) return null
  const resta = Number(lead.janela_resta_seg) || 0
  if (resta <= 0) {
    return (
      <span className={`flex items-center gap-1 text-gray-400 ${className}`} title="Fora da janela de 24h: só modelo aprovado">
        <Timer size={11} className="shrink-0" /> Janela fechada
      </span>
    )
  }
  const h = Math.floor(resta / 3600)
  const m = Math.floor((resta % 3600) / 60)
  const urgente = resta < 90 * 60
  return (
    <span
      className={`flex items-center gap-1 font-medium ${urgente ? 'text-amber-600' : 'text-emerald-600'} ${className}`}
      title="Janela de 24h aberta: dá para responder com mensagem livre até ela fechar"
    >
      <Timer size={11} className="shrink-0" /> {h > 0 ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m} min`} para responder
    </span>
  )
}
