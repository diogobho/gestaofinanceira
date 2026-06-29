import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Modal, Button, Badge, Spinner } from '@/components/ui'
import { Landmark, RefreshCw, Trash2, CreditCard, AlertTriangle } from 'lucide-react'
import { pluggyApi, type ConexaoPluggy } from '@/api/pluggy'

interface Props {
  isOpen: boolean
  onClose: () => void
}

const STATUS_LABEL: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' }> = {
  UPDATED: { label: 'Sincronizado', variant: 'success' },
  UPDATING: { label: 'Sincronizando…', variant: 'info' },
  WAITING_USER_INPUT: { label: 'Aguardando ação', variant: 'warning' },
  LOGIN_ERROR: { label: 'Erro de login', variant: 'danger' },
  OUTDATED: { label: 'Desatualizado', variant: 'warning' },
}

function formatSync(value: string | null): string {
  if (!value) return 'Nunca sincronizado'
  const d = new Date(value)
  return `Última sync: ${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

export const PluggyConnectionsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const queryClient = useQueryClient()
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const { data: conexoes, isLoading } = useQuery({
    queryKey: ['pluggy-conexoes'],
    queryFn: () => pluggyApi.listarConexoes(),
    enabled: isOpen,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['pluggy-conexoes'] })
    queryClient.invalidateQueries({ queryKey: ['expenses-list'] })
  }

  const syncMutation = useMutation({
    mutationFn: (id: string) => pluggyApi.syncManual(id),
    onSuccess: () => { toast.success('Sincronização iniciada'); invalidate() },
    onError: () => toast.error('Erro ao sincronizar'),
  })

  const toggleCartaoMutation = useMutation({
    mutationFn: ({ id, importar_cartao }: { id: string; importar_cartao: boolean }) =>
      pluggyApi.atualizarConexao(id, { importar_cartao }),
    onSuccess: (_, vars) => {
      toast.success(vars.importar_cartao ? 'Cartão de crédito será importado' : 'Cartão de crédito desativado')
      invalidate()
    },
    onError: () => toast.error('Erro ao atualizar conexão'),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => pluggyApi.desativarConexao(id),
    onSuccess: () => { toast.success('Banco desconectado'); setConfirmRemove(null); invalidate() },
    onError: () => toast.error('Erro ao desconectar'),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bancos conectados" size="lg">
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : !conexoes || conexoes.length === 0 ? (
        <div className="text-center py-10">
          <Landmark className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum banco conectado ainda.</p>
          <p className="text-xs text-gray-400 mt-1">Use o botão "Conectar banco" para vincular sua conta via Open Finance.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {conexoes.map((c: ConexaoPluggy) => {
            const st = STATUS_LABEL[c.status] ?? { label: c.status, variant: 'default' as const }
            const syncing = syncMutation.isPending && syncMutation.variables === c.id
            return (
              <div key={c.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <Landmark className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{c.instituicao || 'Instituição'}</p>
                      <p className="text-xs text-gray-500">{formatSync(c.ultima_sync_em)}</p>
                    </div>
                  </div>
                  <Badge variant={st.variant as any}>{st.label}</Badge>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={c.importar_cartao}
                      disabled={toggleCartaoMutation.isPending}
                      onChange={(e) => toggleCartaoMutation.mutate({ id: c.id, importar_cartao: e.target.checked })}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="flex items-center gap-1 text-sm text-gray-600">
                      <CreditCard className="w-3.5 h-3.5" /> Importar cartão de crédito
                    </span>
                  </label>

                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" disabled={syncing}
                      onClick={() => syncMutation.mutate(c.id)}>
                      <RefreshCw className={`w-3.5 h-3.5 mr-1 ${syncing ? 'animate-spin' : ''}`} />
                      Sincronizar
                    </Button>
                    <Button variant="ghost" size="sm"
                      onClick={() => setConfirmRemove(c.id)}>
                      <Trash2 className="w-3.5 h-3.5 mr-1 text-red-500" />
                      Desconectar
                    </Button>
                  </div>
                </div>

                {confirmRemove === c.id && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg">
                    <p className="flex items-center gap-1.5 text-sm text-red-700 mb-2">
                      <AlertTriangle className="w-4 h-4" /> Desconectar este banco?
                    </p>
                    <p className="text-xs text-gray-600 mb-3">
                      As despesas já importadas serão mantidas. Novas transações não serão mais sincronizadas.
                    </p>
                    <div className="flex gap-2">
                      <Button variant="danger" size="sm" disabled={removeMutation.isPending}
                        onClick={() => removeMutation.mutate(c.id)}>
                        Confirmar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
