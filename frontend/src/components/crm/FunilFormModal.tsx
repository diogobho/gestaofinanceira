import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useCreateFunil, useUpdateFunil } from '@/hooks/useCRM'
import type { Funil } from '@/types/crm'

interface FunilFormModalProps {
  isOpen: boolean
  onClose: () => void
  funil?: Funil | null
  defaultTipo?: 'aquisicao' | 'cx'
}

export default function FunilFormModal({ isOpen, onClose, funil, defaultTipo = 'aquisicao' }: FunilFormModalProps) {
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [padrao, setPadrao] = useState(false)

  const isCX = defaultTipo === 'cx'

  const createFunil = useCreateFunil()
  const updateFunil = useUpdateFunil()

  const isEditing = !!funil

  useEffect(() => {
    if (funil) {
      setNome(funil.nome)
      setDescricao(funil.descricao || '')
      setPadrao(funil.padrao)
    } else {
      setNome('')
      setDescricao('')
      setPadrao(false)
    }
  }, [funil, isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) return

    if (isEditing) {
      await updateFunil.mutateAsync({
        id: funil.id,
        data: { nome: nome.trim(), descricao: descricao.trim() || undefined, padrao },
      })
    } else {
      await createFunil.mutateAsync({
        nome: nome.trim(),
        descricao: descricao.trim() || undefined,
        ...(isCX
          ? { tipo: 'cx' as const, padrao_cx: padrao }
          : { padrao }),
      })
    }
    onClose()
  }

  const isPending = createFunil.isPending || updateFunil.isPending

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">
            {isEditing ? 'Editar Funil' : 'Novo Funil'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome do Funil *
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              placeholder="Ex: Vendas B2B, Pos-venda..."
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descricao
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
              placeholder="Descricao do funil (opcional)"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="padrao"
              checked={padrao}
              onChange={(e) => setPadrao(e.target.checked)}
              className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
            />
            <label htmlFor="padrao" className="text-sm text-gray-700">
              {isCX ? 'Definir como funil padrão CX' : 'Definir como funil padrao'}
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending || !nome.trim()}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
            >
              {isPending ? 'Salvando...' : isEditing ? 'Salvar' : 'Criar Funil'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
