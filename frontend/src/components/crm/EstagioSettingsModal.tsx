import { useState, useEffect } from 'react'
import { X, Trash2, MessageSquare, Send, UserPlus, Bot } from 'lucide-react'
import { useUpdateEstagio, useDeleteEstagio, useCreateEstagio, useUsuariosEmpresa } from '@/hooks/useCRM'
import { estagiosApi } from '@/api/crm'
import type { EstagioFunil } from '@/types/crm'
import CadenciaConfig, {
  CadenciaValue,
  cadenciaPadrao,
  passoNovo,
  followupConfigParaCadencia,
  cadenciaParaFollowupConfig,
} from './CadenciaConfig'
import ReuniaoLembretesConfig, {
  ReuniaoLembretesValue,
  reuniaoLembretesPadrao,
  configParaLembretes,
  lembretesParaConfig,
} from './ReuniaoLembretesConfig'

interface EstagioSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  estagio?: EstagioFunil | null
  funilId: number
  mode: 'edit' | 'create'
  /** Ao abrir, já anexa um passo novo à cadência (nunca sobrescreve o existente). */
  appendPassoOnOpen?: boolean
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
  mode,
  appendPassoOnOpen = false
}: EstagioSettingsModalProps) {
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState('#6366f1')
  const [isGanho, setIsGanho] = useState(false)
  const [isPerdido, setIsPerdido] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [estagioAposRespostaId, setEstagioAposRespostaId] = useState<number | null>(null)
  const [estagioAposEnvioId, setEstagioAposEnvioId] = useState<number | null>(null)
  const [estagiosList, setEstagiosList] = useState<EstagioFunil[]>([])
  // Follow-up automático por estágio: cadência de vários toques
  const [cadencia, setCadencia] = useState<CadenciaValue>(cadenciaPadrao())
  // Criação automática de lead a partir de mensagens recebidas no WhatsApp
  const [autoCriarLead, setAutoCriarLead] = useState(false)
  const [autoCriarUsuarios, setAutoCriarUsuarios] = useState<number[]>([])
  // Agente de IA reativo (responde às mensagens do lead neste estágio)
  const [agenteIaAtivo, setAgenteIaAtivo] = useState(false)
  const [instrucoesAgenteIa, setInstrucoesAgenteIa] = useState('')
  // Lembretes de reunião (−24h/−1h + resgate de no-show)
  const [reuniaoLembretes, setReuniaoLembretes] = useState<ReuniaoLembretesValue>(reuniaoLembretesPadrao())

  const updateEstagio = useUpdateEstagio()
  const deleteEstagio = useDeleteEstagio()
  const createEstagio = useCreateEstagio()
  const { data: usuariosEmpresa = [] } = useUsuariosEmpresa()
  // Só usuários com número WhatsApp configurado podem disparar criação automática.
  const usuariosComNumero = usuariosEmpresa.filter(u => u.whatsapp_porta != null)

  useEffect(() => {
    if (mode === 'edit' && estagio) {
      setNome(estagio.nome)
      setCor(estagio.cor || '#6366f1')
      setIsGanho(estagio.is_ganho || false)
      setIsPerdido(estagio.is_perdido || false)
      setEstagioAposRespostaId(estagio.estagio_apos_resposta_id ?? null)
      setEstagioAposEnvioId(estagio.estagio_apos_envio_id ?? null)
      setAutoCriarLead(estagio.auto_criar_lead ?? false)
      setAutoCriarUsuarios(estagio.auto_criar_lead_usuarios ?? [])
      setAgenteIaAtivo(estagio.agente_ia_ativo ?? false)
      setInstrucoesAgenteIa(estagio.instrucoes_agente_ia ?? '')
      setReuniaoLembretes(configParaLembretes(estagio.reuniao_lembretes))
      const base = followupConfigParaCadencia(estagio.followup_config)
      if (appendPassoOnOpen) {
        // "+ Adicionar passo" vindo do Fluxo: preserva os passos existentes e anexa um novo.
        const jaTemAutomacao = !!estagio.followup_config?.ativo
        const passos = jaTemAutomacao
          ? [...base.passos, passoNovo(base.passos[base.passos.length - 1])]
          : base.passos
        setCadencia({ ...base, ativo: true, passos })
      } else {
        setCadencia(base)
      }
    } else {
      setNome('')
      setCor('#6366f1')
      setIsGanho(false)
      setIsPerdido(false)
      setEstagioAposRespostaId(null)
      setEstagioAposEnvioId(null)
      setAutoCriarLead(false)
      setAutoCriarUsuarios([])
      setAgenteIaAtivo(false)
      setReuniaoLembretes(reuniaoLembretesPadrao())
      setCadencia(cadenciaPadrao())
    }
    setShowDeleteConfirm(false)
  }, [estagio, mode, isOpen, appendPassoOnOpen])

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
          followup_config: cadenciaParaFollowupConfig(cadencia),
          auto_criar_lead: autoCriarLead,
          auto_criar_lead_usuarios: autoCriarLead ? autoCriarUsuarios : [],
          agente_ia_ativo: agenteIaAtivo,
          instrucoes_agente_ia: instrucoesAgenteIa,
          reuniao_lembretes: lembretesParaConfig(reuniaoLembretes),
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
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
              Nome do estágio *
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Negociação, Proposta Enviada..."
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
              Tipo de estágio
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
                <span className="text-sm text-gray-700">Estágio de ganho</span>
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
                <span className="text-sm text-gray-700">Estágio de perda</span>
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

          {/* Agente de IA reativo — responde às mensagens do lead neste estágio */}
          {mode === 'edit' && (
            <div className="pt-4 border-t">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agenteIaAtivo}
                  onChange={(e) => setAgenteIaAtivo(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded text-primary-600 focus:ring-primary-500"
                />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    <Bot size={15} className="text-primary-500" />
                    Agente de IA reativo neste estágio
                  </span>
                  <span className="block text-xs text-gray-400 mt-0.5">
                    Quando ligado, o agente <strong>responde</strong> às mensagens que o lead enviar enquanto estiver neste estágio,
                    seguindo a instrução abaixo. Independente do follow-up (que só envia as mensagens agendadas).
                    Pode ser sobrescrito lead a lead na tela do lead.
                  </span>
                </span>
              </label>

              {agenteIaAtivo && (
                <div className="mt-3 pl-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Instrução do agente neste estágio
                  </label>
                  <textarea
                    value={instrucoesAgenteIa}
                    onChange={(e) => setInstrucoesAgenteIa(e.target.value)}
                    rows={6}
                    placeholder={
                      'Ex.: O objetivo aqui é fazer o lead responder e abrir conversa.\n' +
                      'Não apresente o programa nem fale de preço neste estágio.\n' +
                      'Se ele demonstrar interesse, ofereça uma conversa com a Débora.\n' +
                      'Se pedir valores, diga que quem passa isso é a Débora na conversa.'
                    }
                    className="w-full px-3 py-2 border rounded-lg text-sm leading-relaxed resize-y focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    O que o agente deve buscar e o que ele <strong>não</strong> pode fazer ao responder neste
                    estágio. Vale só para as respostas — as mensagens da cadência têm a instrução delas em cada passo.
                    Em branco, o agente responde apenas com o prompt geral da empresa.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Criação automática de lead a partir de mensagens recebidas */}
          {mode === 'edit' && (
            <div className="pt-4 border-t space-y-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCriarLead}
                  onChange={e => setAutoCriarLead(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    <UserPlus size={15} className="text-emerald-500" />
                    Criar lead automaticamente
                  </span>
                  <span className="block text-xs text-gray-400 mt-0.5">
                    Quando um contato mandar mensagem no WhatsApp, cria um lead neste estágio.
                    Respeita a regra de duplicidade: não cria se já existir lead do contato neste funil.
                  </span>
                </span>
              </label>

              {autoCriarLead && (
                <div className="pl-6 space-y-2">
                  <p className="text-xs font-medium text-gray-600">Para quais números?</p>
                  {usuariosComNumero.length === 0 ? (
                    <p className="text-xs text-amber-600">
                      Nenhum número de WhatsApp configurado nos usuários da empresa.
                    </p>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        {usuariosComNumero.map(u => (
                          <label key={u.id} className="flex items-center gap-2 cursor-pointer text-sm">
                            <input
                              type="checkbox"
                              checked={autoCriarUsuarios.includes(u.id)}
                              onChange={e => {
                                setAutoCriarUsuarios(prev =>
                                  e.target.checked ? [...prev, u.id] : prev.filter(x => x !== u.id)
                                )
                              }}
                              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="text-gray-700">{u.nome}</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400">
                        {autoCriarUsuarios.length === 0
                          ? 'Nenhum selecionado = vale para TODOS os números da empresa.'
                          : `${autoCriarUsuarios.length} número(s) selecionado(s).`}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Follow-up automático — cadência de vários toques */}
          {mode === 'edit' && (
            <div className="pt-4 border-t">
              <CadenciaConfig
                value={cadencia}
                onChange={setCadencia}
                titulo="Follow-up automático"
              />
            </div>
          )}

          {/* Lembretes de reunião — para estágios de "Reunião agendada" */}
          {mode === 'edit' && (
            <div className="pt-4 border-t">
              <ReuniaoLembretesConfig
                value={reuniaoLembretes}
                onChange={setReuniaoLembretes}
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
