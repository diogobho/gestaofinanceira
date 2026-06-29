import { useState, useEffect } from 'react'
import { X, Trash2, Bot, MessageSquare, Bell } from 'lucide-react'
import { useUpdateEstagio, useDeleteEstagio, useCreateEstagio } from '@/hooks/useCRM'
import { estagiosApi } from '@/api/crm'
import type { EstagioFunil } from '@/types/crm'

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
  const [agenteIaAtivo, setAgenteIaAtivo] = useState(false)
  const [instrucoesAgenteIa, setInstrucoesAgenteIa] = useState('')
  const [estagioAposRespostaId, setEstagioAposRespostaId] = useState<number | null>(null)
  const [estagiosList, setEstagiosList] = useState<EstagioFunil[]>([])
  // Follow-up automático por estágio
  const [followupAtivo, setFollowupAtivo] = useState(false)
  const [followupTipo, setFollowupTipo] = useState<'manual' | 'agente_ia'>('agente_ia')
  const [followupMensagem, setFollowupMensagem] = useState('')
  const [followupInstrucaoIa, setFollowupInstrucaoIa] = useState('')
  const [followupData, setFollowupData] = useState('')
  const [followupHoraInicio, setFollowupHoraInicio] = useState('09:00')
  const [followupHoraFim, setFollowupHoraFim] = useState('18:00')
  const [followupDiasSemana, setFollowupDiasSemana] = useState<number[]>([1, 2, 3, 4, 5])

  const updateEstagio = useUpdateEstagio()
  const deleteEstagio = useDeleteEstagio()
  const createEstagio = useCreateEstagio()

  useEffect(() => {
    if (mode === 'edit' && estagio) {
      setNome(estagio.nome)
      setCor(estagio.cor || '#6366f1')
      setIsGanho(estagio.is_ganho || false)
      setIsPerdido(estagio.is_perdido || false)
      setAgenteIaAtivo(estagio.agente_ia_ativo || false)
      setInstrucoesAgenteIa(estagio.instrucoes_agente_ia || '')
      setEstagioAposRespostaId(estagio.estagio_apos_resposta_id ?? null)
      const fc = estagio.followup_config
      setFollowupAtivo(fc?.ativo || false)
      setFollowupTipo(fc?.tipo || 'agente_ia')
      setFollowupMensagem(fc?.mensagem || '')
      setFollowupInstrucaoIa(fc?.instrucao_ia || '')
      setFollowupData(fc?.data || '')
      setFollowupHoraInicio(fc?.hora_inicio || '09:00')
      setFollowupHoraFim(fc?.hora_fim || '18:00')
      setFollowupDiasSemana(fc?.dias_semana ?? [1, 2, 3, 4, 5])
    } else {
      setNome('')
      setCor('#6366f1')
      setIsGanho(false)
      setIsPerdido(false)
      setAgenteIaAtivo(false)
      setInstrucoesAgenteIa('')
      setEstagioAposRespostaId(null)
      setFollowupAtivo(false)
      setFollowupTipo('agente_ia')
      setFollowupMensagem('')
      setFollowupInstrucaoIa('')
      setFollowupData('')
      setFollowupHoraInicio('09:00')
      setFollowupHoraFim('18:00')
      setFollowupDiasSemana([1, 2, 3, 4, 5])
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
          agente_ia_ativo: agenteIaAtivo, instrucoes_agente_ia: instrucoesAgenteIa,
          estagio_apos_resposta_id: estagioAposRespostaId,
          followup_config: followupAtivo ? {
            ativo: true,
            tipo: followupTipo,
            mensagem: followupTipo === 'manual' ? followupMensagem : undefined,
            instrucao_ia: followupTipo === 'agente_ia' ? followupInstrucaoIa : undefined,
            data: followupData || undefined,
            hora_inicio: followupHoraInicio || undefined,
            hora_fim: followupTipo === 'agente_ia' ? (followupHoraFim || undefined) : undefined,
            dias_semana: followupDiasSemana.length > 0 ? followupDiasSemana : undefined,
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

          {/* Automação: ao responder */}
          {mode === 'edit' && (
            <div className="pt-4 border-t space-y-2">
              <div className="flex items-center gap-2">
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
              <p className="text-xs text-gray-400">
                Quando um lead neste estágio responder uma mensagem no WhatsApp, ele será movido automaticamente.
              </p>
            </div>
          )}

          {/* Agente IA */}
          {mode === 'edit' && (
            <div className="pt-4 border-t space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot size={16} className="text-primary-500" />
                  <label className="text-sm font-medium text-gray-700">Agente IA</label>
                </div>
                <button
                  type="button"
                  onClick={() => setAgenteIaAtivo(!agenteIaAtivo)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    agenteIaAtivo ? 'bg-primary-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      agenteIaAtivo ? 'translate-x-4.5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Instrucoes especificas deste estagio
                </label>
                <textarea
                  value={instrucoesAgenteIa}
                  onChange={(e) => setInstrucoesAgenteIa(e.target.value)}
                  placeholder="Ex: Neste estagio, sempre pergunte sobre o orcamento disponivel e tente agendar uma reuniao..."
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Complementa as instrucoes globais do agente. Aplicado apenas aos leads neste estagio.
                </p>
              </div>
            </div>
          )}

          {/* Follow-up automático */}
          {mode === 'edit' && (
            <div className="pt-4 border-t space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell size={16} className="text-orange-500" />
                  <label className="text-sm font-medium text-gray-700">Follow-up automatico</label>
                </div>
                <button
                  type="button"
                  onClick={() => setFollowupAtivo(!followupAtivo)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    followupAtivo ? 'bg-orange-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      followupAtivo ? 'translate-x-4.5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              {followupAtivo && (
                <div className="space-y-3 pl-1">
                  <p className="text-xs text-gray-400">
                    Quando um lead entrar neste estagio, um follow-up sera agendado automaticamente.
                  </p>
                  {/* Tipo — primeiro para determinar os campos de data */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input
                          type="radio"
                          value="agente_ia"
                          checked={followupTipo === 'agente_ia'}
                          onChange={() => setFollowupTipo('agente_ia')}
                          className="text-orange-500"
                        />
                        Agente IA
                      </label>
                      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input
                          type="radio"
                          value="manual"
                          checked={followupTipo === 'manual'}
                          onChange={() => setFollowupTipo('manual')}
                          className="text-orange-500"
                        />
                        Mensagem fixa
                      </label>
                    </div>
                  </div>
                  {/* Campos de data/hora por tipo */}
                  {followupTipo === 'agente_ia' ? (
                    <div className="space-y-2">
                      <p className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1.5">
                        O agente ativa imediatamente quando um lead entra neste estágio. A janela de horário define em que período do dia o agente pode agir.
                      </p>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Janela de atuação do agente
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={followupHoraInicio}
                            onChange={(e) => setFollowupHoraInicio(e.target.value)}
                            className="px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
                          />
                          <span className="text-xs text-gray-500">até</span>
                          <input
                            type="time"
                            value={followupHoraFim}
                            onChange={(e) => setFollowupHoraFim(e.target.value)}
                            className="px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Data e hora de disparo da mensagem
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="date"
                          value={followupData}
                          onChange={(e) => setFollowupData(e.target.value)}
                          className="px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
                        />
                        <input
                          type="time"
                          value={followupHoraInicio}
                          onChange={(e) => setFollowupHoraInicio(e.target.value)}
                          className="px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
                        />
                      </div>
                    </div>
                  )}
                  {/* Conteúdo */}
                  {followupTipo === 'manual' ? (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Mensagem
                      </label>
                      <textarea
                        value={followupMensagem}
                        onChange={(e) => setFollowupMensagem(e.target.value)}
                        placeholder="Ola! Gostaria de saber se tem alguma duvida..."
                        rows={3}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400 resize-none"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Instrucao para o agente (opcional)
                      </label>
                      <textarea
                        value={followupInstrucaoIa}
                        onChange={(e) => setFollowupInstrucaoIa(e.target.value)}
                        placeholder="Ex: Retome o contato perguntando se o lead ja tomou uma decisao sobre a proposta..."
                        rows={3}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400 resize-none"
                      />
                    </div>
                  )}

                  {/* Dias da semana */}
                  <div className="pt-2 border-t">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Dias da semana</label>
                    <div className="flex gap-1 flex-wrap">
                      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map((d, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setFollowupDiasSemana(prev =>
                            prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i].sort()
                          )}
                          className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                            followupDiasSemana.includes(i)
                              ? 'bg-orange-500 text-white border-orange-500'
                              : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
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
