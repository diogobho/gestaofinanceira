import { renderWhatsAppFormatting } from '@/components/ui'
import type { MensagemGrupo } from '@/api/grupos'

export const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const VARIAVEIS: Record<string, string> = {
  primeiro_nome: 'primeiro nome', nome: 'nome', nome_grupo: 'nome do grupo', mencoes: '@ quem entrou',
}

const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Formatação do WhatsApp sobre texto ESCAPADO — o texto é de quem digitou, e a tela é da empresa inteira.
 * `{{nome_grupo}}` sai do caminho ANTES da formatação: o `_` do nome da variável era lido como
 * itálico, e `*{{nome_grupo}}*` aparecia como "{{nomegrupo}}" inclinado.
 */
export const previaWhatsApp = (texto: string) => {
  const guardadas: string[] = []
  const semVariaveis = escapar(texto).replace(/\{\{\s*(\w+)\s*\}\}/g, (m) => { guardadas.push(m); return `\u0001${guardadas.length - 1}\u0001` })
  return renderWhatsAppFormatting(semVariaveis)
    // `{Oi|Olá}` sorteia por grupo no envio. Na prévia mostra a primeira opção, marcada,
    // com todas no title — as chaves cruas pareciam erro de digitação.
    .replace(/\{([^{}|]*(?:\|[^{}|]*)+)\}/g, (_m, dentro: string) => {
      const opcoes = dentro.split('|')
      // O texto já veio escapado (< > &), mas aspa não: dentro do atributo, ela fecharia o title.
      const titulo = opcoes.map(o => o.replace(/<[^>]*>/g, '').replace(/"/g, '&quot;')).join(' / ')
      return `<span class="rounded bg-amber-100 dark:bg-amber-900/40 px-1" title="Varia por grupo: ${titulo}">${opcoes[0]}</span>`
    })
    // `{{primeiro_nome}}` na lista: vira etiqueta legível em vez do código cru.
    .replace(/\u0001(\d+)\u0001/g, (_m, i: string) => {
      const original = guardadas[Number(i)]
      const v = original.replace(/[{}\s]/g, '')
      return VARIAVEIS[v]
        ? `<span class="rounded bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200 px-1 text-[0.9em]" title="${original}">${VARIAVEIS[v]}</span>`
        : original
    })
}

/** "5511912345678" → "+55 11 91234-5678"; o que não for celular BR sai com "+" e os dígitos. */
export function telefoneLegivel(numero?: string | null): string {
  const d = String(numero || '').replace(/\D/g, '')
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d)
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : d ? `+${d}` : ''
}

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
