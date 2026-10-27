import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useOrigensCatalogo, useCreateOrigem, useUpdateOrigem, useDeleteOrigem } from '@/hooks/useCRM'
import type { Origem } from '@/types/crm'

interface GerenciarOrigensModalProps {
  isOpen: boolean
  onClose: () => void
}

// Paleta de cores para as origens (hex — armazenado em crm_origens.cor)
const CORES = [
  '#6B7280', '#10b981', '#3B82F6', '#8B5CF6', '#EC4899',
  '#F59E0B', '#EF4444', '#14B8A6', '#D2B773', '#0EA5E9',
]

export default function GerenciarOrigensModal({ isOpen, onClose }: GerenciarOrigensModalProps) {
  const { data: origens = [], isLoading } = useOrigensCatalogo()
  const createOrigem = useCreateOrigem()
  const updateOrigem = useUpdateOrigem()
  const deleteOrigem = useDeleteOrigem()

  const [novoNome, setNovoNome] = useState('')
  const [novaCor, setNovaCor] = useState(CORES[0])

  const [editId, setEditId] = useState<number | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editCor, setEditCor] = useState(CORES[0])

  const handleCriar = () => {
    const nome = novoNome.trim()
    if (!nome) return
    createOrigem.mutate(
      { nome, cor: novaCor },
      { onSuccess: () => { setNovoNome(''); setNovaCor(CORES[0]) } }
    )
  }

  const iniciarEdicao = (o: Origem) => {
    setEditId(o.id)
    setEditNome(o.nome)
    setEditCor(o.cor || CORES[0])
  }

  const salvarEdicao = () => {
    if (editId == null) return
    const nome = editNome.trim()
    if (!nome) return
    updateOrigem.mutate(
      { id: editId, data: { nome, cor: editCor } },
      { onSuccess: () => setEditId(null) }
    )
  }

  const handleDeletar = (o: Origem) => {
    const aviso = (o.total_leads ?? 0) > 0
      ? `Remover a origem "${o.nome}"? ${o.total_leads} lead(s) ficarão sem origem.`
      : `Remover a origem "${o.nome}"?`
    if (window.confirm(aviso)) {
      deleteOrigem.mutate(o.id)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Gerenciar origens" size="md">
      {/* Criar nova */}
      <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCriar() }}
            placeholder="Nova origem…"
            className="flex-1 px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          />
          <button
            onClick={handleCriar}
            disabled={!novoNome.trim() || createOrigem.isPending}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            <Plus size={16} /> Criar
          </button>
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          {CORES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setNovaCor(c)}
              className={`w-5 h-5 rounded-full border-2 ${novaCor === c ? 'border-gray-900 dark:border-white' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {/* Lista */}
      {isLoading ? (
        <p className="text-sm text-gray-500 text-center py-4">Carregando…</p>
      ) : origens.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">Nenhuma origem cadastrada.</p>
      ) : (
        <ul className="space-y-1 max-h-[45vh] overflow-y-auto">
          {origens.map((o) => (
            <li
              key={o.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              {editId === o.id ? (
                <>
                  <input
                    type="text"
                    value={editNome}
                    onChange={(e) => setEditNome(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') salvarEdicao()
                      if (e.key === 'Escape') setEditId(null)
                    }}
                    autoFocus
                    className="flex-1 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  />
                  <div className="flex items-center gap-1">
                    {CORES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEditCor(c)}
                        className={`w-4 h-4 rounded-full border-2 ${editCor === c ? 'border-gray-900 dark:border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <button onClick={salvarEdicao} className="p-1 text-green-600 hover:text-green-700">
                    <Check size={16} />
                  </button>
                  <button onClick={() => setEditId(null)} className="p-1 text-gray-400 hover:text-gray-600">
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: o.cor || '#6B7280' }}
                  />
                  <span className="flex-1 text-sm text-gray-900 dark:text-gray-100 truncate">{o.nome}</span>
                  {(o.total_leads ?? 0) > 0 && (
                    <span className="text-xs text-gray-400">{o.total_leads}</span>
                  )}
                  <button
                    onClick={() => iniciarEdicao(o)}
                    className="p-1 text-gray-400 hover:text-primary-600"
                    title="Renomear"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => handleDeletar(o)}
                    className="p-1 text-gray-400 hover:text-red-600"
                    title="Excluir"
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
