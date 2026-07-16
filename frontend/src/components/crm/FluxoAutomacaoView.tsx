import { useState, useMemo, useEffect } from 'react'
import {
  Workflow, Clock, MessageCircle, Bot, Paperclip, ArrowRight,
  Reply, Send, Plus, Settings2, Trophy, XCircle
} from 'lucide-react'
import { Spinner } from '@/components/ui'
import { useFunisAquisicao, useFunisCX, useEstagios } from '@/hooks/useCRM'
import EstagioSettingsModal from './EstagioSettingsModal'
import type { EstagioFunil, EstagioFollowupConfig, PassoFollowupConfig } from '@/types/crm'

/**
 * Visão "Fluxo": mostra, de forma visual, a cadência de automações de cada estágio
 * do funil selecionado (D0 → D+1 → D+3…), as transições entre estágios e permite
 * abrir o editor do estágio para montar/ajustar o fluxo.
 */

const UNIDADE_LABEL: Record<string, string> = { minuto: 'min', hora: 'h', dia: 'd' }

/** Normaliza followup_config (novo ou antigo) numa lista de passos. */
function extrairPassos(fc?: EstagioFollowupConfig | null): PassoFollowupConfig[] {
  if (!fc || !fc.ativo) return []
  if (Array.isArray(fc.passos) && fc.passos.length > 0) return fc.passos
  return [fc as unknown as PassoFollowupConfig]
}

/** Rótulo curto do timing de um passo (ex.: "D0", "+1d", "data fixa"). */
function rotuloTiming(p: PassoFollowupConfig, idx: number): string {
  if (p.modo === 'data') return p.data_fixa ? `📅 ${p.data_fixa}` : 'data fixa'
  const qtd = p.atraso_dias ?? 0
  const un = UNIDADE_LABEL[p.atraso_unidade || 'dia'] || 'd'
  if (idx === 0 && qtd === 0) return 'D0'
  return `+${qtd}${un}`
}

function FluxoAutomacaoView({
  variante,
  funilId,
}: {
  variante: 'aquisicao' | 'cx'
  /** Quando informado, usa este funil e esconde o seletor interno (compartilha com o funil). */
  funilId?: number
}) {
  // Chamamos ambos os hooks (regras do React) e usamos o do tipo selecionado.
  const funisAq = useFunisAquisicao()
  const funisCx = useFunisCX()
  const funisQuery = variante === 'aquisicao' ? funisAq : funisCx
  const funis = funisQuery.data ?? []
  const [selfFunilId, setSelfFunilId] = useState<number | undefined>()

  useEffect(() => {
    if (!funilId && !selfFunilId && funis.length > 0) setSelfFunilId(funis[0].id)
  }, [funis, selfFunilId, funilId])

  // Se o funil vier de fora (seletor do funil), usamos ele e escondemos o seletor próprio.
  const selectedFunilId = funilId ?? selfFunilId
  const setSelectedFunilId = setSelfFunilId

  const estagiosQuery = useEstagios(selectedFunilId)
  const estagios = useMemo(
    () => [...(estagiosQuery.data ?? [])].sort((a, b) => a.ordem - b.ordem),
    [estagiosQuery.data]
  )
  const nomePorId = useMemo(() => {
    const m = new Map<number, string>()
    estagios.forEach((e) => m.set(e.id, e.nome))
    return m
  }, [estagios])

  const [editarEstagio, setEditarEstagio] = useState<EstagioFunil | null>(null)
  // Quando aberto via "+ Adicionar passo", o modal anexa um nó novo (não sobrescreve).
  const [modoAppend, setModoAppend] = useState(false)
  const abrirEditor = (estagio: EstagioFunil, append: boolean) => {
    setModoAppend(append)
    setEditarEstagio(estagio)
  }

  const totalPassos = estagios.reduce((s, e) => s + extrairPassos(e.followup_config).length, 0)
  const estagiosComAuto = estagios.filter((e) => extrairPassos(e.followup_config).length > 0).length

  return (
    <div className="space-y-4">
      {/* Cabeçalho + seletor de funil */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Workflow className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Fluxo de automações</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {estagios.length} estágio{estagios.length !== 1 ? 's' : ''} · {estagiosComAuto} com automação ·{' '}
            {totalPassos} mensagem{totalPassos !== 1 ? 's' : ''} agendada{totalPassos !== 1 ? 's' : ''}
          </p>
        </div>
        {!funilId && funis.length > 0 && (
          <select
            value={selectedFunilId ?? ''}
            onChange={(e) => setSelectedFunilId(Number(e.target.value))}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          >
            {funis.map((f) => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select>
        )}
      </div>

      {estagiosQuery.isLoading ? (
        <div className="flex items-center justify-center py-16"><Spinner /></div>
      ) : estagios.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-16 text-center dark:border-gray-700 dark:bg-gray-900/50">
          <Workflow className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">Nenhum estágio neste funil.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {estagios.map((estagio, colIdx) => {
            const passos = extrairPassos(estagio.followup_config)
            const proximo = estagios[colIdx + 1]
            const nomeAposResp = estagio.estagio_apos_resposta_id
              ? nomePorId.get(estagio.estagio_apos_resposta_id)
              : null
            const nomeAposEnvio = estagio.estagio_apos_envio_id
              ? nomePorId.get(estagio.estagio_apos_envio_id)
              : null

            return (
              <div
                key={estagio.id}
                className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
                style={{ borderTop: `3px solid ${estagio.cor || '#94a3b8'}` }}
              >
                {/* Header do estágio */}
                <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ backgroundColor: estagio.cor || '#94a3b8' }}
                    >
                      {colIdx + 1}
                    </span>
                    <span className="truncate font-semibold text-gray-800 dark:text-gray-100">{estagio.nome}</span>
                    {estagio.is_ganho && <Trophy className="h-4 w-4 shrink-0 text-emerald-500" />}
                    {estagio.is_perdido && <XCircle className="h-4 w-4 shrink-0 text-red-500" />}
                    {estagio.agente_ia_ativo && (
                      <span title="Agente de IA reativo ativo neste estágio" className="flex items-center shrink-0">
                        <Bot className="h-4 w-4 text-emerald-500" />
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => abrirEditor(estagio, false)}
                    className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-600"
                    title="Editar automação do estágio"
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Corpo: cadência ou vazio */}
                <div className="flex-1 px-4 py-3">
                  {passos.length === 0 ? (
                    <button
                      onClick={() => abrirEditor(estagio, true)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-4 text-xs text-gray-500 hover:border-amber-400 hover:text-amber-600 dark:border-gray-700"
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar automação
                    </button>
                  ) : (
                    <div className="space-y-2">
                      {passos.map((p, i) => {
                        const ehIA = (p.tipo || 'manual') === 'agente_ia'
                        const texto = ehIA ? (p.instrucao_ia || 'Instrução do agente IA') : (p.mensagem || 'Mensagem sem texto')
                        return (
                          <div key={i} className="flex items-start gap-2 rounded-lg bg-gray-50 px-2.5 py-2 dark:bg-gray-800/50">
                            <span className="mt-0.5 inline-flex min-w-[34px] justify-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                              {rotuloTiming(p, i)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                {ehIA ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                                    <Bot className="h-3 w-3" /> Agente IA
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                    <MessageCircle className="h-3 w-3" /> WhatsApp
                                  </span>
                                )}
                                {p.media_url && <Paperclip className="h-3 w-3 text-gray-400" />}
                                {i > 0 && (p.base ?? 'anterior') === 'anterior' && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400" title="Contado a partir da mensagem anterior">
                                    <Clock className="h-3 w-3" /> após anterior
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 truncate text-xs text-gray-600 dark:text-gray-300" title={texto}>
                                {texto}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                      <button
                        onClick={() => abrirEditor(estagio, true)}
                        className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-amber-300 py-1.5 text-[11px] font-medium text-amber-600 hover:bg-amber-50 dark:border-amber-700"
                      >
                        <Plus className="h-3 w-3" /> Adicionar passo
                      </button>
                    </div>
                  )}
                </div>

                {/* Transições */}
                {(nomeAposResp || nomeAposEnvio || proximo) && (
                  <div className="space-y-1 border-t border-gray-100 px-4 py-2.5 dark:border-gray-800">
                    {nomeAposResp && (
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                        <Reply className="h-3.5 w-3.5" /> Ao responder <ArrowRight className="h-3 w-3" />
                        <strong className="font-medium">{nomeAposResp}</strong>
                      </div>
                    )}
                    {nomeAposEnvio && (
                      <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                        <Send className="h-3.5 w-3.5" /> Após a cadência <ArrowRight className="h-3 w-3" />
                        <strong className="font-medium">{nomeAposEnvio}</strong>
                      </div>
                    )}
                    {!nomeAposEnvio && proximo && (
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                        <ArrowRight className="h-3.5 w-3.5" /> Próximo: {proximo.nome}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editarEstagio && selectedFunilId && (
        <EstagioSettingsModal
          isOpen={!!editarEstagio}
          onClose={() => { setEditarEstagio(null); setModoAppend(false) }}
          estagio={editarEstagio}
          funilId={selectedFunilId}
          mode="edit"
          appendPassoOnOpen={modoAppend}
        />
      )}
    </div>
  )
}

export default FluxoAutomacaoView
