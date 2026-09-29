import { useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Tag as TagIcon, X } from 'lucide-react'
import { useTags, useCreateTag, useAddTagToLead, useRemoveTagFromLead } from '@/hooks/useCRM'
import type { Lead } from '@/types/crm'

// Cor de tag nova: gira pela paleta conforme quantas a empresa já tem, para duas tags
// criadas em seguida não nascerem iguais. Quem quiser outra cor não perde nada — a cor
// só ajuda a achar a tag no card.
const PALETA = ['#2563eb', '#059669', '#d97706', '#db2777', '#7c3aed', '#0891b2', '#dc2626', '#65a30d']

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Tags do lead: aplicar, criar na hora e tirar. A tag é da EMPRESA — a mesma lista
 * para o time inteiro — e o card do quadro mostra as duas primeiras.
 */
export default function TagsDoLead({ lead }: { lead: Lead }) {
  const { data: todas = [] } = useTags()
  const criar = useCreateTag()
  const adicionar = useAddTagToLead()
  const remover = useRemoveTagFromLead()
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const doLead = lead.tags ?? []
  const idsDoLead = new Set(doLead.map((t) => t.id))
  const busca = normalizar(texto)
  const sugestoes = useMemo(
    () => todas.filter((t) => !idsDoLead.has(t.id) && normalizar(t.nome).includes(busca)).slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todas, busca, doLead.length]
  )
  const existeIgual = todas.some((t) => normalizar(t.nome) === busca)
  const ocupado = criar.isPending || adicionar.isPending

  const aplicar = async (tagId: number) => {
    if (ocupado) return
    try {
      await adicionar.mutateAsync({ leadId: lead.id, tagId })
      setTexto('')
      inputRef.current?.focus()
    } catch {
      toast.error('Não foi possível colocar a tag')
    }
  }

  const criarEAplicar = async () => {
    const nome = texto.replace(/\s+/g, ' ').trim()
    if (!nome || ocupado) return
    try {
      const tag = await criar.mutateAsync({ nome: nome.slice(0, 50), cor: PALETA[todas.length % PALETA.length] })
      await aplicar(tag.id)
    } catch {
      toast.error('Não foi possível criar a tag')
    }
  }

  const aoTeclar = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setAberto(false); setTexto(''); return }
    if (e.key !== 'Enter') return
    e.preventDefault()
    const exata = todas.find((t) => normalizar(t.nome) === busca)
    if (exata) { if (!idsDoLead.has(exata.id)) aplicar(exata.id); else setTexto('') }
    else if (sugestoes.length === 1) aplicar(sugestoes[0].id)
    else criarEAplicar()
  }

  return (
    <div className="border-t pt-4">
      <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
        <TagIcon size={14} />
        Tags
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        {doLead.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded text-xs font-medium"
            style={{ backgroundColor: `${tag.cor}22`, color: tag.cor }}
          >
            {tag.nome}
            <button
              type="button"
              onClick={() => remover.mutate({ leadId: lead.id, tagId: tag.id })}
              className="rounded p-0.5 hover:bg-black/10"
              aria-label={`Tirar a tag ${tag.nome}`}
              title="Tirar a tag"
            >
              <X size={12} />
            </button>
          </span>
        ))}

        {!aberto ? (
          <button
            type="button"
            onClick={() => { setAberto(true); setTimeout(() => inputRef.current?.focus(), 0) }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-dashed border-gray-300 text-xs text-gray-500 hover:text-primary-600 hover:border-primary-400"
          >
            <Plus size={12} />
            {doLead.length ? 'Tag' : 'Adicionar tag'}
          </button>
        ) : (
          <input
              ref={inputRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={aoTeclar}
              onBlur={() => setTimeout(() => { setAberto(false); setTexto('') }, 150)}
              maxLength={50}
              placeholder="Buscar ou criar tag"
              aria-label="Buscar ou criar tag"
              className="w-48 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white text-gray-800"
            />
        )}
      </div>
      {/* Em fluxo, não flutuante: o modal rola por dentro e cortaria uma lista solta. */}
      {aberto && (sugestoes.length > 0 || (busca && !existeIgual)) && (
          <ul
            role="listbox"
            className="mt-2 w-full sm:w-72 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-sm py-1"
          >
            {sugestoes.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => aplicar(t.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100"
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.cor }} />
                  <span className="truncate">{t.nome}</span>
                </button>
              </li>
            ))}
            {busca && !existeIgual && (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={criarEAplicar}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-primary-600 hover:bg-gray-100"
                >
                  <Plus size={12} />
                  <span className="truncate">Criar “{texto.trim()}”</span>
                </button>
              </li>
            )}
          </ul>
      )}
    </div>
  )
}
