import { renderWhatsAppFormatting } from '@/components/ui'
import type { MensagemGrupo } from '@/api/grupos'

export const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Formatação do WhatsApp sobre texto ESCAPADO — o texto é de quem digitou, e a tela é da empresa inteira. */
export const previaWhatsApp = (texto: string) => renderWhatsAppFormatting(escapar(texto))

/** ISO → valor de `<input type="datetime-local">` no fuso do navegador. */
export function paraInputLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

/** "Toda seg e qua às 09:00", "Em 02/10 às 14:00", "Agora". */
export function descreverQuando(m: MensagemGrupo): string {
  if (m.modo === 'recorrente' && m.recorrencia) {
    const d = m.recorrencia.dias
    const nomes = d.length === 7 ? 'todo dia' : d.length === 5 && [1, 2, 3, 4, 5].every(x => d.includes(x)) ? 'de segunda a sexta'
      : `toda ${d.map(i => DIAS_CURTOS[i].toLowerCase()).join(', ')}`
    return `Repete ${nomes} às ${m.recorrencia.hora}`
  }
  if (m.modo === 'agendada') return `Agendada para ${dataHora(m.agendado_para)}`
  return 'Envio avulso'
}
