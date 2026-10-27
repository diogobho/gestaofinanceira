import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, AlertTriangle, Trash2, Loader2 } from 'lucide-react'
import { leadsApi } from '@/api/crm'
import { useExcluirLeadsEmMassa } from '@/hooks/useCRM'

interface ExcluirLeadsEmMassaModalProps {
  /** null = fechado. Sem `estagio`, o alvo é o funil inteiro. */
  alvo: { funil: { id: number; nome: string }; estagio?: { id: number; nome: string } } | null
  onClose: () => void
}

const PALAVRA = 'EXCLUIR'

/**
 * Exclui de uma vez os leads ativos de um estágio ou de um funil inteiro — o funil e as
 * colunas ficam. O total vem do servidor (a coluna pode não ter carregado todos os cards)
 * e a confirmação exige digitar EXCLUIR.
 */
export default function ExcluirLeadsEmMassaModal({ alvo, onClose }: ExcluirLeadsEmMassaModalProps) {
  const [confirmacao, setConfirmacao] = useState('')
  const excluir = useExcluirLeadsEmMassa()

  useEffect(() => {
    setConfirmacao('')
  }, [alvo])

  const { data: previa, isLoading } = useQuery({
    queryKey: ['crm', 'excluir-em-massa', alvo?.funil.id, alvo?.estagio?.id],
    queryFn: () => leadsApi.previaExclusaoEmMassa(alvo!.funil.id, alvo!.estagio?.id),
    enabled: !!alvo,
    staleTime: 0,
  })

  if (!alvo) return null

  const total = previa?.total ?? 0
  const onde = alvo.estagio ? (
    <>do estágio <b>{alvo.estagio.nome}</b>, no funil <b>{alvo.funil.nome}</b></>
  ) : (
    <>do funil <b>{alvo.funil.nome}</b>, em todos os estágios</>
  )
  const confere = confirmacao.trim().toUpperCase() === PALAVRA

  const handleExcluir = async () => {
    if (!confere || total === 0) return
    await excluir.mutateAsync({ funilId: alvo.funil.id, estagioId: alvo.estagio?.id })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
        <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-red-600 flex items-center gap-2">
            <AlertTriangle size={20} />
            {alvo.estagio ? 'Excluir leads do estágio' : 'Esvaziar funil'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" aria-label="Fechar">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {isLoading ? (
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Contando os leads...
            </p>
          ) : total === 0 ? (
            <p className="text-sm text-gray-700 dark:text-gray-200">Não há leads ativos {onde}.</p>
          ) : (
            <>
              <p className="text-sm text-gray-700 dark:text-gray-200">
                Você vai excluir <b>{total} lead{total > 1 ? 's' : ''}</b> {onde}.
              </p>

              <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20 p-3">
                <ul className="text-xs text-red-700 dark:text-red-300 list-disc list-inside space-y-0.5">
                  <li>Saem junto as tarefas, anotações e tags desses leads</li>
                  <li>Follow-ups agendados que ainda não saíram são cancelados</li>
                  <li>O histórico de conversas do WhatsApp continua guardado</li>
                  <li>Leads arquivados não são excluídos</li>
                  {!alvo.estagio && <li>O funil e os estágios continuam existindo</li>}
                </ul>
                <p className="mt-2 text-xs font-semibold text-red-700 dark:text-red-300">
                  Não é possível desfazer.
                </p>
              </div>

              <div>
                <label htmlFor="confirmar-exclusao-massa" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Para confirmar, digite {PALAVRA}:
                </label>
                <input
                  id="confirmar-exclusao-massa"
                  type="text"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  placeholder={PALAVRA}
                  autoFocus
                  autoComplete="off"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            {total === 0 && !isLoading ? 'Fechar' : 'Cancelar'}
          </button>
          {total > 0 && (
            <button
              onClick={handleExcluir}
              disabled={!confere || excluir.isPending}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Trash2 size={16} />
              {excluir.isPending ? 'Excluindo...' : `Excluir ${total} lead${total > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
