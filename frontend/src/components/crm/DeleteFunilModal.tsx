import { useState, useEffect } from 'react'
import { X, AlertTriangle, Trash2 } from 'lucide-react'
import { useDeleteFunil } from '@/hooks/useCRM'
import type { Funil } from '@/types/crm'

interface DeleteFunilModalProps {
  isOpen: boolean
  onClose: () => void
  funil: Funil | null
  /** Chamado após excluir, para a tela sair do funil que deixou de existir. */
  onDeleted?: (funilId: number) => void
}

/**
 * Confirmação de exclusão de funil.
 *
 * Excluir o funil apaga junto TODOS os leads que estiverem nele (e o que está
 * pendurado neles: tarefas, anotações, follow-ups agendados, tags). Por isso a
 * confirmação exige digitar o nome do funil — e mostra, em destaque, quantos
 * leads vão embora.
 */
export default function DeleteFunilModal({ isOpen, onClose, funil, onDeleted }: DeleteFunilModalProps) {
  const [confirmacao, setConfirmacao] = useState('')
  const deleteFunil = useDeleteFunil()

  useEffect(() => {
    setConfirmacao('')
  }, [funil, isOpen])

  if (!isOpen || !funil) return null

  // total_leads do seletor ignora arquivados; a exclusão apaga todos — usa o número real.
  const totalLeads = funil.total_leads_geral ?? funil.total_leads ?? 0
  const arquivados = totalLeads - (funil.total_leads ?? 0)
  const nomeConfere = confirmacao.trim().toLowerCase() === funil.nome.trim().toLowerCase()

  const handleDelete = async () => {
    if (!nomeConfere) return
    await deleteFunil.mutateAsync(funil.id)
    onDeleted?.(funil.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
        <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-red-600 flex items-center gap-2">
            <AlertTriangle size={20} />
            Excluir funil
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            Você está excluindo o funil <b>{funil.nome}</b>.
          </p>

          <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20 p-3">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              {totalLeads > 0
                ? `Isso apaga também os ${totalLeads} lead${totalLeads > 1 ? 's' : ''} que estão nele` +
                  (arquivados > 0 ? ` (incluindo ${arquivados} arquivado${arquivados > 1 ? 's' : ''}).` : '.')
                : 'Este funil não tem nenhum lead.'}
            </p>
            <ul className="mt-2 text-xs text-red-700 dark:text-red-300 list-disc list-inside space-y-0.5">
              <li>Todas as colunas (estágios) do funil</li>
              {totalLeads > 0 && <li>Os leads, com tarefas, anotações e tags</li>}
              {totalLeads > 0 && <li>Follow-ups agendados que ainda não foram enviados</li>}
              <li>As automações configuradas nas colunas</li>
            </ul>
            <p className="mt-2 text-xs font-semibold text-red-700 dark:text-red-300">
              Não é possível desfazer.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Para confirmar, digite o nome do funil:
            </label>
            <input
              type="text"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              placeholder={funil.nome}
              autoFocus
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>
        </div>

        <div className="p-4 border-t dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={!nomeConfere || deleteFunil.isPending}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <Trash2 size={16} />
            {deleteFunil.isPending
              ? 'Excluindo...'
              : totalLeads > 0
                ? `Excluir funil e ${totalLeads} lead${totalLeads > 1 ? 's' : ''}`
                : 'Excluir funil'}
          </button>
        </div>
      </div>
    </div>
  )
}
