import { useRef, useState } from 'react'
import { Bell, Paperclip, X, FileText, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { followupsApi } from '@/api/crm'

const MEDIA_BASE = import.meta.env.VITE_API_URL || ''
// Formatos aceitos (espelha o filtro do backend / o que o WhatsApp suporta).
const MEDIA_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/ogg,application/pdf,.doc,.docx,.xls,.xlsx'

/**
 * Padrão ÚNICO de agendamento de mensagens (estágio · lead · geral).
 *
 * Fonte de verdade do FRONTEND para os parâmetros e a identidade visual (cor âmbar)
 * de qualquer agendamento, independente do nível. Use sempre este componente para
 * configurar: modo (após X dias / data fixa), horário exato, dias da semana
 * (com roll-forward no backend) e tipo de mensagem (fixa/personalizada/agente IA).
 */

export interface AgendamentoValue {
  ativo: boolean
  tipo: 'manual' | 'agente_ia'      // manual = mensagem fixa ou personalizada (com variáveis)
  mensagem?: string
  instrucao_ia?: string
  // Mídia opcional (só tipo manual): a mensagem vira a legenda do anexo.
  media_url?: string | null
  media_mimetype?: string | null
  media_filename?: string | null
  modo: 'dias' | 'data' | 'imediato'
  atraso_dias?: number | null
  data_fixa?: string | null         // 'YYYY-MM-DD'
  hora_envio?: string | null        // 'HH:MM'
  dias_semana?: number[] | null     // 0=Dom..6=Sáb
}

// Variáveis de personalização disponíveis (todos os atributos do lead).
export const VARIAVEIS_AGENDAMENTO = [
  'Nome', 'PrimeiroNome', 'Telefone', 'Email', 'Empresa',
  'Cargo', 'Titulo', 'ValorPotencial', 'Origem', 'CpfCnpj', 'Temperatura',
]

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

/** Valor inicial padrão de um agendamento. */
export function agendamentoPadrao(): AgendamentoValue {
  return {
    ativo: false,
    tipo: 'manual',
    modo: 'dias',
    atraso_dias: 0,
    hora_envio: '09:00',
    dias_semana: [1, 2, 3, 4, 5],
  }
}

interface Props {
  value: AgendamentoValue
  onChange: (v: AgendamentoValue) => void
  /** estagio/geral usam atraso por dias; lead também. Apenas muda textos auxiliares. */
  nivel?: 'estagio' | 'lead' | 'geral'
  /** Exibe o toggle de ativo (ex.: no estágio). No lead o form já é sempre ativo. */
  showToggle?: boolean
  titulo?: string
}

export default function AgendamentoConfig({
  value,
  onChange,
  nivel = 'estagio',
  showToggle = true,
  titulo = 'Agendamento de mensagem',
}: Props) {
  const set = (patch: Partial<AgendamentoValue>) => onChange({ ...value, ...patch })

  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File | null) => {
    if (!file) return
    setUploading(true)
    try {
      const media = await followupsApi.uploadMedia(file)
      set({
        media_url: media.media_url,
        media_mimetype: media.media_mimetype,
        media_filename: media.media_filename,
      })
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erro ao anexar arquivo')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removerMidia = () =>
    set({ media_url: null, media_mimetype: null, media_filename: null })

  const toggleDia = (i: number) => {
    const atual = value.dias_semana ?? []
    set({ dias_semana: atual.includes(i) ? atual.filter(x => x !== i) : [...atual, i].sort() })
  }

  const inserirVariavel = (v: string) =>
    set({ mensagem: `${value.mensagem ?? ''}[${v}]` })

  const baseAtraso =
    nivel === 'lead' ? 'a partir de agora'
    : nivel === 'geral' ? 'a partir do disparo'
    : 'a partir da entrada do lead no estágio'

  return (
    <div className="space-y-3">
      {showToggle && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-amber-500" />
            <label className="text-sm font-medium text-gray-700">{titulo}</label>
          </div>
          <button
            type="button"
            onClick={() => set({ ativo: !value.ativo })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              value.ativo ? 'bg-amber-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                value.ativo ? 'translate-x-4.5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      )}

      {(!showToggle || value.ativo) && (
        <div className="space-y-3 pl-1">
          {/* Quando enviar: modo + atraso/data + hora */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Quando enviar</label>
            <div className="flex gap-3 mb-2 flex-wrap">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={value.modo === 'imediato'}
                  onChange={() => set({ modo: 'imediato' })}
                  className="text-amber-500"
                />
                Imediato (na entrada)
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={value.modo === 'dias'}
                  onChange={() => set({ modo: 'dias' })}
                  className="text-amber-500"
                />
                Após X dias
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={value.modo === 'data'}
                  onChange={() => set({ modo: 'data' })}
                  className="text-amber-500"
                />
                Data fixa
              </label>
            </div>
            {value.modo === 'imediato' ? (
              <p className="text-[11px] text-gray-400 mt-1">
                Envia assim que o lead entra no estágio (ou ao criar o follow-up), respeitando os
                dias permitidos abaixo. Pode levar até 1 min. Se cair num dia não permitido, envia no próximo dia válido.
              </p>
            ) : (
            <div className="grid grid-cols-2 gap-2">
              {value.modo === 'dias' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={value.atraso_dias ?? 0}
                    onChange={(e) => set({ atraso_dias: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-16 px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                  />
                  <span className="text-xs text-gray-500">dia(s)</span>
                </div>
              ) : (
                <input
                  type="date"
                  value={value.data_fixa ?? ''}
                  onChange={(e) => set({ data_fixa: e.target.value })}
                  className="px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                />
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">às</span>
                <input
                  type="time"
                  value={value.hora_envio ?? '09:00'}
                  onChange={(e) => set({ hora_envio: e.target.value })}
                  className="px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                />
              </div>
            </div>
            )}
            {value.modo === 'dias' && (
              <p className="text-[11px] text-gray-400 mt-1">Contado {baseAtraso}.</p>
            )}
          </div>

          {/* Dias da semana (roll-forward) — vale para todos os modos, inclusive imediato */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dias permitidos para envio</label>
            <div className="flex gap-1 flex-wrap">
              {DIAS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDia(i)}
                  className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                    (value.dias_semana ?? []).includes(i)
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-amber-400'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Se o envio cair num dia não permitido, vai para o próximo dia permitido no mesmo horário.
            </p>
          </div>

          {/* Tipo de mensagem */}
          <div className="pt-2 border-t">
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de mensagem</label>
            <div className="flex gap-3 mb-2">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={value.tipo === 'manual'}
                  onChange={() => set({ tipo: 'manual' })}
                  className="text-amber-500"
                />
                Fixa / personalizada
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={value.tipo === 'agente_ia'}
                  onChange={() => set({ tipo: 'agente_ia' })}
                  className="text-amber-500"
                />
                Agente IA
              </label>
            </div>

            {value.tipo === 'manual' ? (
              <div>
                <textarea
                  value={value.mensagem ?? ''}
                  onChange={(e) => set({ mensagem: e.target.value })}
                  placeholder="Olá [PrimeiroNome]! Tudo bem? ..."
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 resize-none"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {VARIAVEIS_AGENDAMENTO.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => inserirVariavel(v)}
                      className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[11px] hover:bg-amber-100"
                      title={`Inserir [${v}]`}
                    >
                      [{v}]
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Clique numa variável para inserir. Deixe sem variáveis para uma mensagem fixa.
                </p>

                {/* Anexo de mídia (opcional) — a mensagem acima vira a legenda */}
                <div className="mt-2 pt-2 border-t border-dashed">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={MEDIA_ACCEPT}
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                  />
                  {value.media_url ? (
                    <div className="flex items-center gap-2">
                      {value.media_mimetype?.startsWith('image/') ? (
                        <img
                          src={`${MEDIA_BASE}${value.media_url}`}
                          alt="anexo"
                          className="h-12 w-12 rounded object-cover border"
                        />
                      ) : (
                        <FileText size={20} className="text-amber-600 flex-shrink-0" />
                      )}
                      <span className="text-xs text-gray-600 truncate flex-1" title={value.media_filename ?? ''}>
                        {value.media_filename || 'arquivo anexado'}
                      </span>
                      <button
                        type="button"
                        onClick={removerMidia}
                        className="p-1 text-gray-400 hover:text-red-500"
                        title="Remover anexo"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-1.5 text-xs text-amber-700 hover:text-amber-800 disabled:opacity-50"
                    >
                      {uploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
                      {uploading ? 'Enviando...' : 'Anexar imagem, GIF, vídeo ou documento'}
                    </button>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1">
                    Opcional. A mensagem acima vira a legenda. Formatos: imagem, GIF, vídeo (mp4), PDF, doc/xls. Máx 20MB.
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <textarea
                  value={value.instrucao_ia ?? ''}
                  onChange={(e) => set({ instrucao_ia: e.target.value })}
                  placeholder="Instrução pré-definida ao agente. Ex: Retome o contato perguntando se ficou alguma dúvida sobre a proposta..."
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 resize-none"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  O agente IA gera a resposta seguindo esta instrução pré-definida.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
