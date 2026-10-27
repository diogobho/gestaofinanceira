import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AtSign, Loader2, X } from 'lucide-react'
import { gruposApi, type MencaoGrupo, type ParticipanteGrupo } from '@/api/grupos'

/**
 * Marcar pessoas com @ na mensagem de grupo (30/09/2026). Digitar "@" no texto (ou
 * clicar em "Marcar pessoa") abre a lista de quem está nos grupos escolhidos; a pessoa
 * entra no texto como "@Nome" e a API troca pelo "@número" grupo a grupo na hora do
 * envio (`api/src/modules/grupos/mencoes.ts`).
 */

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Participante que o WhatsApp esconde (`@lid` sem telefone) não tem número para mostrar. */
const oculto = (p: ParticipanteGrupo) => p.id.endsWith('@lid') && p.numero === p.id.split('@')[0]
export const rotuloDe = (p: ParticipanteGrupo) => p.nome || (oculto(p) ? 'Participante' : `+${p.numero}`)

/** "@" + o que vem depois dele até o cursor, se o cursor está escrevendo uma menção. */
export function consultaNoCursor(texto: string, cursor: number): { inicio: number; termo: string } | null {
  const m = /(^|\s)@([^\s@]{0,30})$/.exec(texto.slice(0, cursor))
  return m ? { inicio: cursor - m[2].length - 1, termo: m[2] } : null
}

/** Rótulo único na mensagem: duas "Ana" viram "Ana" e "Ana (8888)". */
export function rotuloUnico(p: ParticipanteGrupo, mencoes: MencaoGrupo[]): string {
  const base = rotuloDe(p)
  const outro = mencoes.find(m => m.rotulo === base && m.id !== p.id)
  return outro ? `${base} (${p.numero.slice(-4)})` : base
}

/**
 * Todo o comportamento do @ num textarea: detectar a menção no cursor, navegar na lista
 * pelo teclado, inserir "@Nome", tirar a marcação. Usado na mensagem para grupos e na
 * boas-vindas — criar e editar são o mesmo caminho (as menções salvas entram em `iniciais`).
 */
export function useMencoes(
  texto: string, setTexto: (t: string | ((t: string) => string)) => void,
  textoRef: React.RefObject<HTMLTextAreaElement | null>, iniciais?: MencaoGrupo[] | null,
) {
  const [mencoes, setMencoes] = useState<MencaoGrupo[]>(iniciais || [])
  const [consulta, setConsulta] = useState<{ inicio: number; termo: string } | null>(null)
  const [destacado, setDestacado] = useState(0)
  const filtradosRef = useRef<ParticipanteGrupo[]>([])
  const aoFiltrar = useCallback((l: ParticipanteGrupo[]) => {
    filtradosRef.current = l
    setDestacado(d => Math.min(d, Math.max(0, l.length - 1)))
  }, [])

  const lerCursor = (el: HTMLTextAreaElement) => {
    const c = consultaNoCursor(el.value, el.selectionStart ?? el.value.length)
    setConsulta(c)
    if (!c) setDestacado(0)
  }

  const escolher = (p: ParticipanteGrupo) => {
    const el = textoRef.current
    if (!el || !consulta) return
    const rotulo = rotuloUnico(p, mencoes)
    const cursor = el.selectionStart ?? texto.length
    setTexto(`${texto.slice(0, consulta.inicio)}@${rotulo} ${texto.slice(cursor)}`)
    setMencoes(ms => ms.some(m => m.id === p.id) ? ms : [...ms, { id: p.id, numero: p.numero, rotulo }])
    setConsulta(null)
    const pos = consulta.inicio + rotulo.length + 2
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos) })
  }

  /** Botão "Marcar pessoa": põe um "@" no cursor e abre a lista. */
  const iniciar = () => {
    const el = textoRef.current
    if (!el) return
    const cursor = el.selectionStart ?? texto.length
    const antes = texto.slice(0, cursor)
    const insere = antes && !/\s$/.test(antes) ? ' @' : '@'
    setTexto(antes + insere + texto.slice(cursor))
    const pos = cursor + insere.length
    setConsulta({ inicio: pos - 1, termo: '' })
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos) })
  }

  const tirar = (m: MencaoGrupo) => {
    setMencoes(ms => ms.filter(x => x.id !== m.id))
    setTexto(t => t.split(`@${m.rotulo}`).join(m.rotulo))
  }

  const tecla = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!consulta) return
    const lista = filtradosRef.current
    if (e.key === 'Escape') { e.preventDefault(); setConsulta(null); return }
    if (!lista.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setDestacado(d => (d + 1) % lista.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setDestacado(d => (d - 1 + lista.length) % lista.length) }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); escolher(lista[destacado] || lista[0]) }
  }

  /** Só as que continuam no texto — apagar "@Ana" à mão desfaz a marcação. */
  const ativas = mencoes.filter(m => texto.includes(`@${m.rotulo}`))

  /** Props prontas para o textarea. */
  const textarea = {
    onKeyDown: tecla,
    onClick: (e: React.MouseEvent<HTMLTextAreaElement>) => lerCursor(e.currentTarget),
    onBlur: () => setTimeout(() => setConsulta(null), 150),
    'aria-autocomplete': 'list' as const,
    'aria-expanded': !!consulta,
  }

  return { ativas, consulta, destacado, setDestacado, aoFiltrar, lerCursor, escolher, iniciar, tirar, textarea }
}

const escaparHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** Na prévia, "@Ana" aparece azul como no WhatsApp. O HTML já vem escapado da prévia. */
export const destacarMencoes = (html: string, mencoes: MencaoGrupo[]) =>
  [...mencoes].sort((a, b) => b.rotulo.length - a.rotulo.length).reduce((h, m) => {
    const alvo = `@${escaparHtml(m.rotulo)}`
    return h.split(alvo).join(`<span class="text-sky-700 dark:text-sky-300 font-medium">${alvo}</span>`)
  }, html)

export const ListaMencao: React.FC<{
  aberta: boolean
  termo: string
  grupos: string[]
  campanhaId: number | null
  destacado: number
  onDestacar: (i: number) => void
  onEscolher: (p: ParticipanteGrupo) => void
  /** Devolve a lista filtrada para o teclado do textarea navegar nela. */
  onFiltrados: (lista: ParticipanteGrupo[]) => void
}> = ({ aberta, termo, grupos, campanhaId, destacado, onDestacar, onEscolher, onFiltrados }) => {
  const semGrupo = !campanhaId && grupos.length === 0
  const chave = campanhaId ? `c${campanhaId}` : [...grupos].sort().join(',')
  const { data, isLoading, isError } = useQuery({
    queryKey: ['grupos', 'participantes', chave],
    queryFn: () => gruposApi.participantes(grupos, campanhaId),
    enabled: aberta && !semGrupo,
    staleTime: 5 * 60_000,
  })

  const filtrados = useMemo(() => {
    const t = semAcento(termo)
    const todos = data?.participantes || []
    return (t ? todos.filter(p => semAcento(`${p.nome || ''} ${p.numero}`).includes(t)) : todos).slice(0, 8)
  }, [data, termo])

  useEffect(() => { onFiltrados(filtrados) }, [filtrados, onFiltrados])

  if (!aberta) return null
  return (
    <div role="listbox" aria-label="Pessoas do grupo"
      className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg">
      {semGrupo ? (
        <p className="p-3 text-sm text-gray-500 dark:text-gray-400">Escolha os grupos primeiro — a lista mostra quem está neles.</p>
      ) : isLoading ? (
        <p className="p-3 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Buscando quem está nos grupos…</p>
      ) : isError ? (
        <p className="p-3 text-sm text-red-600 dark:text-red-400">Não foi possível ler os participantes. Confira se o WhatsApp está conectado.</p>
      ) : filtrados.length === 0 ? (
        <p className="p-3 text-sm text-gray-500 dark:text-gray-400">{termo ? `Ninguém com "${termo}" nos grupos escolhidos.` : 'Nenhum participante encontrado.'}</p>
      ) : (
        <ul>
          {filtrados.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === destacado}>
              <button type="button"
                onMouseDown={e => { e.preventDefault(); onEscolher(p) }}
                onMouseEnter={() => onDestacar(i)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${i === destacado ? 'bg-primary-50 dark:bg-primary-900/40' : ''}`}>
                <AtSign className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-gray-900 dark:text-gray-100">{rotuloDe(p)}</span>
                  <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                    {p.nome && !oculto(p) ? `+${p.numero} · ` : ''}{p.grupos.length > 1 ? `${p.grupos.length} grupos` : p.grupos[0]}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {data && (data.omitidos > 0 || data.falhas.length > 0) && (
        <p className="border-t border-gray-100 dark:border-gray-700 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {data.omitidos > 0 && `A lista mostra os primeiros 20 grupos (${data.omitidos} ficaram de fora). `}
          {data.falhas.length > 0 && `Não deu para ler: ${data.falhas.join('; ')}`}
        </p>
      )}
    </div>
  )
}

/** As pessoas marcadas, com o × que tira a marcação (o nome fica no texto, sem @). */
export const MarcadasMencao: React.FC<{ mencoes: MencaoGrupo[]; onTirar: (m: MencaoGrupo) => void }> = ({ mencoes, onTirar }) =>
  mencoes.length === 0 ? null : (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-gray-500 dark:text-gray-400">Marcadas:</span>
      {mencoes.map(m => (
        <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-sky-100 dark:bg-sky-900/40 px-2 py-0.5 text-sky-800 dark:text-sky-200">
          @{m.rotulo}
          <button type="button" onClick={() => onTirar(m)} aria-label={`Tirar a marcação de ${m.rotulo}`}><X className="w-3 h-3" /></button>
        </span>
      ))}
    </div>
  )
