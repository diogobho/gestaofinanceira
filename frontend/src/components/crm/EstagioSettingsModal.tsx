import { useState, useEffect } from 'react'
import { X, Trash2, MessageSquare, Send } from 'lucide-react'
import { useUpdateEstagio, useDeleteEstagio, useCreateEstagio } from '@/hooks/useCRM'
import { estagiosApi } from '@/api/crm'
import type { EstagioFunil } from '@/types/crm'
import AgendamentoConfig, { AgendamentoValue, agendamentoPadrao } from './AgendamentoConfig'

interface EstagioSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  estagio?: EstagioFunil | null
  funilId: number
  mode: 'edit' | 'create'
}

const coresPredefinidas = [
  '#6366f1', // indigo
  '#3a5483', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#64748b', // slate
]

export default function EstagioSettingsModal({
  isOpen,
  onClose,
  estagio,
  funilId,
  mode
}: EstagioSettingsModalProps) {
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState('#6366f1')
  const [isGanho, setIsGanho] = useState(false)
  const [isPerdido, setIsPerdido] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [estagioAposRespostaId, setEstagioAposRespostaId] = useState<number | null>(null)
  const [estagioAposEnvioId, setEstagioAposEnvioId] = useState<number | null>(null)
  const [estagiosList, setEstagiosList] = useState<EstagioFunil[]>([])
  // Follow-up automático por estágio (padrão único de agendamento)
  const [agendamento, setAgendamento] = useState<AgendamentoValue>(agendamentoPadrao())

  const updateEstagio = useUpdateEstagio()
  const deleteEstagio = useDeleteEstagio()
  const createEstagio = useCreateEstagio()

  useEffect(() => {
    if (mode === 'edit' && estagio) {
      setNome(estagio.nome)
      setCor(estagio.cor || '#6366f1')
      setIsGanho(estagio.is_ganho || false)
      setIsPerdido(estagio.is_perdido || false)
      setEstagioAposRespostaId(estagio.estagio_apos_resposta_id ?? null)
      setEstagioAposEnvioId(estagio.estagio_apos_envio_id ?? null)
      const fc = estagio.followup_config
      setAgendamento({
        ativo: fc?.ativo || false,
        tipo: fc?.tipo || 'manual',
        mensagem: fc?.mensagem || '',
        instrucao_ia: fc?.instrucao_ia || '',
        media_url: fc?.media_url ?? null,
        media_mimetype: fc?.media_mimetype ?? null,
        media_filename: fc?.media_filename ?? null,
        modo: fc?.modo || 'dias',
        atraso_dias: fc?.atraso_dias ?? 0,
        atraso_unidade: fc?.atraso_unidade || 'dia',
        data_fixa: fc?.data_fixa ?? null,
        hora_envio: fc?.hora_envio || '09:00',
        dias_semana: fc?.dias_semana ?? [1, 2, 3, 4, 5],
      })
    } else {
      setNome('')
      setCor('#6366f1')
      setIsGanho(false)
      setIsPerdido(false)
      setEstagioAposRespostaId(null)
      setEstagioAposEnvioId(null)
      setAgendamento(agendamentoPadrao())
    }
    setShowDeleteConfirm(false)
  }, [estagio, mode, isOpen])

  // Carregar estágios do funil para o seletor de automação
  useEffect(() => {
    if (isOpen && mode === 'edit' && funilId) {
      estagiosApi.listByFunil(funilId).then(setEstagiosList).catch(() => {})
    }
  }, [isOpen, mode, funilId])

  if (!isOpen) return null

  const handleSave = async () => {
    if (!nome.trim()) return

    if (mode === 'edit' && estagio) {
      await updateEstagio.mutateAsync({
        id: estagio.id,
        data: {
          nome, cor, is_ganho: isGanho, is_perdido: isPerdido,
          estagio_apos_resposta_id: estagioAposRespostaId,
          estagio_apos_envio_id: estagioAposEnvioId,
          followup_config: agendamento.ativo ? {
            ativo: true,
            tipo: agendamento.tipo,
            mensagem: agendamento.tipo === 'manual' ? agendamento.mensagem : undefined,
            instrucao_ia: agendamento.tipo === 'agente_ia' ? agendamento.instrucao_ia : undefined,
            media_url: agendamento.tipo === 'manual' ? (agendamento.media_url ?? undefined) : undefined,
            media_mimetype: agendamento.tipo === 'manual' ? (agendamento.media_mimetype ?? undefined) : undefined,
            media_filename: agendamento.tipo === 'manual' ? (agendamento.media_filename ?? undefined) : undefined,
            modo: agendamento.modo,
            atraso_dias: agendamento.modo === 'dias' ? (agendamento.atraso_dias ?? 0) : undefined,
            atraso_unidade: agendamento.modo === 'dias' ? (agendamento.atraso_unidade ?? 'dia') : undefined,
            data_fixa: agendamento.modo === 'data' ? (agendamento.data_fixa || undefined) : undefined,
            hora_envio: agendamento.hora_envio || undefined,
            dias_semana: (agendamento.dias_semana?.length ?? 0) > 0 ? agendamento.dias_semana : undefined,
          } : null,
        }
      })
    } else {
      await createEstagio.mutateAsync({
        funilId,
        data: { nome, cor, is_ganho: isGanho, is_perdido: isPerdido }
      })
    }
    onClose()
  }

  const handleDelete = async () => {
    if (!estagio) return
    await deleteEstagio.mutateAsync(estagio.id)
    onClose()
  }

  const isLoading = updateEstagio.isPending || deleteEstagio.isPending || createEstagio.isPending

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">
            {mode === 'edit' ? 'Editar Estagio' : 'Novo Estagio'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-160px)]">
          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome do Estagio *
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Negociacao, Proposta Enviada..."
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Cor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cor
            </label>
            <div className="flex flex-wrap gap-2">
              {coresPredefinidas.map((c) => (
                <button
                  key={c}
                  onClick={() => setCor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition-transform ${
                    cor === c ? 'border-gray-800 scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={cor}
                onChange={(e) => setCor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* Tipo especial */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Tipo de Estagio
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isGanho}
                  onChange={(e) => {
                    setIsGanho(e.target.checked)
                    if (e.target.checked) setIsPerdido(false)
                  }}
                  className="w-4 h-4 rounded text-green-600 focus:ring-green-500"
                />
                <span className="text-sm text-gray-700">Estagio de Ganho</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPerdido}
                  onChange={(e) => {
                    setIsPerdido(e.target.checked)
                    if (e.target.checked) setIsGanho(false)
                  }}
                  className="w-4 h-4 rounded text-red-600 focus:ring-red-500"
                />
                <span className="text-sm text-gray-700">Estagio de Perda</span>
              </label>
            </div>
            <p className="text-xs text-gray-500">
              Marque se este estagio representa o final do funil (venda concluida ou perdida)
            </p>
          </div>

          {/* Automação: mover lead (ao responder / após envio) */}
          {mode === 'edit' && (
            <div className="pt-4 border-t space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare size={15} className="text-green-500" />
                  <label className="text-sm font-medium text-gray-700">Ao lead responder, mover para</label>
                </div>
                <select
                  value={estagioAposRespostaId ?? ''}
                  onChange={e => setEstagioAposRespostaId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="">— Não mover —</option>
                  {estagiosList
                    .filter(e => e.id !== estagio?.id)
                    .map(e => (
                      <option key={e.id} value={e.id}>{e.nome}</option>
                    ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Quando um lead neste estágio responder uma mensagem no WhatsApp, ele será movido automaticamente.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Send size={15} className="text-amber-500" />
                  <label className="text-sm font-medium text-gray-700">Após enviar a mensagem agendada, mover para</label>
                </div>
                <select
                  value={estagioAposEnvioId ?? ''}
                  onChange={e => setEstagioAposEnvioId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                >
                  <option value="">— Não mover —</option>
                  {estagiosList
                    .filter(e => e.id !== estagio?.id)
                    .map(e => (
                      <option key={e.id} value={e.id}>{e.nome}</option>
                    ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Após o envio do agendamento abaixo, o lead é movido automaticamente para este estágio.
                </p>
              </div>
            </div>
          )}

          {/* Follow-up automático — padrão único de agendamento */}
          {mode === 'edit' && (
            <div className="pt-4 border-t">
              <AgendamentoConfig
                value={agendamento}
                onChange={setAgendamento}
                nivel="estagio"
                titulo="Follow-up automático"
              />
            </div>
          )}

          {/* Delete section */}
          {mode === 'edit' && estagio && !estagio.is_entrada && (
            <div className="pt-4 border-t">
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-2 text-red-600 hover:text-red-700 text-sm"
                >
                  <Trash2 size={16} />
                  Excluir este estagio
                </button>
              ) : (
                <div className="bg-red-50 p-3 rounded-lg">
                  <p className="text-sm text-red-700 mb-2">
                    Tem certeza? Leads neste estagio serao movidos para o primeiro estagio.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      disabled={isLoading}
                      className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
                    >
                      Sim, excluir
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!nome.trim() || isLoading}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
          >
            {isLoading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
