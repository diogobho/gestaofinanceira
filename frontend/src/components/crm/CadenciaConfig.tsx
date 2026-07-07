import { useMemo, useState } from 'react'
import {
  Bell, Plus, Trash2, CornerDownRight, LogIn,
  MessageCircle, Bot, Paperclip, ChevronDown, ChevronRight,
} from 'lucide-react'
import AgendamentoConfig, { AgendamentoValue, agendamentoPadrao } from './AgendamentoConfig'
import type { EstagioFollowupConfig, PassoFollowupConfig } from '@/types/crm'

/**
 * Editor de CADÊNCIA de follow-up por estágio: uma sequência de toques (D0 → D+10min → …).
 * Cada passo reutiliza o AgendamentoConfig e escolhe a "base" do atraso:
 *   - entrada  → conta a partir da entrada do lead no estágio;
 *   - anterior → conta a partir do horário agendado da mensagem anterior.
 *
 * Os passos são AUTO-ORDENADOS pelo horário de disparo: se você criar um passo de 10min e
 * depois um de 5min, o de 5min vira o Passo 1 automaticamente. Os passos são recolhíveis
 * (só um aberto por vez) para a lista ficar compacta.
 */

const UNIDADE_LABEL: Record<string, string> = { minuto: 'min', hora: 'h', dia: 'dia(s)' }
const MULT_MIN: Record<string, number> = { minuto: 1, hora: 60, dia: 1440 }

export interface CadenciaValue {
  ativo: boolean
  passos: AgendamentoValue[]
}

const genKey = () => Math.random().toString(36).slice(2, 10)

/** Minutos-do-dia de um 'HH:MM'. */
function horaEmMin(hhmm?: string | null): number {
  const [h, m] = (hhmm || '09:00').split(':').map(Number)
  return (Number(h) || 0) * 60 + (Number(m) || 0)
}

/** Offset "próprio" do passo (sem considerar a base), em minutos. */
function offsetProprio(p: AgendamentoValue): number {
  if (p.modo === 'data') {
    // Data fixa é um instante absoluto — vai para o fim, ordenado entre si pela data.
    const base = Number.MAX_SAFE_INTEGER / 2
    if (!p.data_fixa) return base
    const ts = new Date(`${p.data_fixa}T00:00:00`).getTime()
    return base + ts / 60000 + horaEmMin(p.hora_envio)
  }
  const qtd = Math.max(0, p.atraso_dias ?? 0)
  const un = p.atraso_unidade || 'dia'
  const proprio = qtd * (MULT_MIN[un] ?? 1440)
  // Para 'dia', o horário do dia desempata a ordem no mesmo dia.
  return proprio + (un === 'dia' ? horaEmMin(p.hora_envio) : 0)
}

/**
 * Ordena os passos pelo horário de disparo (offset a partir da entrada, em minutos).
 * Passos com base 'anterior' somam o offset do passo que vem antes na sequência.
 * O primeiro passo nunca pode ser 'anterior' (não há mensagem antes dele).
 */
export function ordenarPassos(passos: AgendamentoValue[]): AgendamentoValue[] {
  let acumulado = 0
  const comOffset = passos.map((p, i) => {
    const proprio = offsetProprio(p)
    const off = i > 0 && p.base === 'anterior' ? acumulado + proprio : proprio
    acumulado = off
    return { p, off, i }
  })
  const ordenados = comOffset
    .sort((a, b) => a.off - b.off || a.i - b.i)
    .map((x) => x.p)
  if (ordenados[0] && ordenados[0].base === 'anterior') {
    ordenados[0] = { ...ordenados[0], base: 'entrada' }
  }
  return ordenados
}

/** Cadência inicial padrão: inativa, com um passo. */
export function cadenciaPadrao(): CadenciaValue {
  return { ativo: false, passos: [{ ...agendamentoPadrao(), _key: genKey(), ativo: true, base: 'entrada' }] }
}

/** Cria um passo novo (nó seguinte da cadência), herdando ajustes do anterior. */
export function passoNovo(anterior?: AgendamentoValue): AgendamentoValue {
  return {
    ...agendamentoPadrao(),
    _key: genKey(),
    ativo: true,
    base: 'anterior',
    tipo: anterior?.tipo ?? 'manual',
    atraso_dias: 10,
    atraso_unidade: anterior?.atraso_unidade ?? 'minuto',
    hora_envio: anterior?.hora_envio ?? '09:00',
    dias_semana: anterior?.dias_semana ?? [1, 2, 3, 4, 5],
  }
}

/** Converte o followup_config do estágio (que pode ser antigo/passo único) em cadência. */
export function followupConfigParaCadencia(fc?: EstagioFollowupConfig | null): CadenciaValue {
  if (!fc) return cadenciaPadrao()
  const brutos = Array.isArray(fc.passos) && fc.passos.length > 0
    ? fc.passos
    : [fc as unknown as PassoFollowupConfig] // shape antigo: o próprio config é o passo
  const passos: AgendamentoValue[] = brutos.map((p, i) => ({
    _key: genKey(),
    ativo: true,
    base: i === 0 ? 'entrada' : (p.base ?? 'anterior'),
    tipo: p.tipo || 'manual',
    mensagem: p.mensagem || '',
    instrucao_ia: p.instrucao_ia || '',
    media_url: p.media_url ?? null,
    media_mimetype: p.media_mimetype ?? null,
    media_filename: p.media_filename ?? null,
    modo: p.modo || 'dias',
    atraso_dias: p.atraso_dias ?? 0,
    atraso_unidade: p.atraso_unidade || 'dia',
    data_fixa: p.data_fixa ?? null,
    hora_envio: p.hora_envio || '09:00',
    dias_semana: p.dias_semana ?? [1, 2, 3, 4, 5],
  }))
  return { ativo: fc.ativo || false, passos: ordenarPassos(passos.length ? passos : cadenciaPadrao().passos) }
}

/**
 * Serializa a cadência para o followup_config a ser salvo.
 * - Sem passos → null (limpa a config).
 * - Com passos, inativo → { ativo:false, passos } (PAUSA, preservando os passos).
 * - Com passos, ativo → { ativo:true, passos }.
 */
export function cadenciaParaFollowupConfig(c: CadenciaValue): EstagioFollowupConfig | null {
  if (c.passos.length === 0) return null
  const passos: PassoFollowupConfig[] = ordenarPassos(c.passos).map((p, i) => ({
    base: i === 0 ? 'entrada' : (p.base ?? 'anterior'),
    tipo: p.tipo,
    mensagem: p.tipo === 'manual' ? p.mensagem : undefined,
    instrucao_ia: p.tipo === 'agente_ia' ? p.instrucao_ia : undefined,
    media_url: p.tipo === 'manual' ? (p.media_url ?? undefined) : undefined,
    media_mimetype: p.tipo === 'manual' ? (p.media_mimetype ?? undefined) : undefined,
    media_filename: p.tipo === 'manual' ? (p.media_filename ?? undefined) : undefined,
    modo: p.modo,
    atraso_dias: p.modo === 'dias' ? (p.atraso_dias ?? 0) : undefined,
    atraso_unidade: p.modo === 'dias' ? (p.atraso_unidade ?? 'dia') : undefined,
    data_fixa: p.modo === 'data' ? (p.data_fixa || undefined) : undefined,
    hora_envio: p.hora_envio || undefined,
    dias_semana: (p.dias_semana?.length ?? 0) > 0 ? p.dias_semana : undefined,
  }))
  return { ativo: c.ativo, passos }
}

/** Resumo curto do timing de um passo, para o cabeçalho recolhido. */
function resumoTiming(p: AgendamentoValue, idx: number): string {
  if (p.modo === 'data') return p.data_fixa ? `em ${p.data_fixa}` : 'data fixa'
  const qtd = p.atraso_dias ?? 0
  const un = UNIDADE_LABEL[p.atraso_unidade || 'dia'] || 'dia(s)'
  const base = idx === 0 ? 'da entrada' : (p.base === 'entrada' ? 'da entrada' : 'da msg anterior')
  if (idx === 0 && qtd === 0) return 'na entrada (imediato)'
  return `${qtd} ${un} ${base}`
}

interface Props {
  value: CadenciaValue
  onChange: (v: CadenciaValue) => void
  titulo?: string
}

export default function CadenciaConfig({ value, onChange, titulo = 'Follow-up automático' }: Props) {
  // Passos sempre exibidos ordenados pelo horário de disparo.
  const passos = useMemo(() => ordenarPassos(value.passos), [value.passos])
  // Passo aberto identificado por _key (estável mesmo quando a ordem muda).
  const [abertoKey, setAbertoKey] = useState<string | undefined>(
    () => passos[passos.length - 1]?._key
  )

  const commit = (novos: AgendamentoValue[]) =>
    onChange({ ...value, passos: ordenarPassos(novos) })

  const setPasso = (key: string, patch: AgendamentoValue) =>
    commit(value.passos.map((p) => (p._key === key ? { ...patch, _key: key } : p)))

  const setBase = (key: string, base: 'entrada' | 'anterior') => {
    const p = value.passos.find((x) => x._key === key)
    if (p) setPasso(key, { ...p, base })
  }

  const addPasso = () => {
    const novo = passoNovo(passos[passos.length - 1])
    commit([...value.passos, novo])
    setAbertoKey(novo._key)
  }

  const removePasso = (key: string) =>
    commit(value.passos.filter((p) => p._key !== key))

  return (
    <div className="space-y-3">
      {/* Toggle mestre da cadência */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-amber-500" />
          <label className="text-sm font-medium text-gray-700">{titulo}</label>
        </div>
        <button
          type="button"
          onClick={() => onChange({ ...value, ativo: !value.ativo })}
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

      {value.ativo && (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-400">
            Monte a sequência de mensagens do estágio. Os passos são ordenados automaticamente pelo
            horário de disparo. Clique num passo para editar. O lead só avança de estágio (se
            configurado) após o último passo.
          </p>

          {passos.map((passo, idx) => {
            const key = passo._key as string
            const estaAberto = abertoKey === key
            const ehIA = (passo.tipo || 'manual') === 'agente_ia'
            const preview = ehIA ? (passo.instrucao_ia || 'Instrução do agente IA') : (passo.mensagem || 'Sem mensagem')
            return (
              <div key={key} className="rounded-lg border border-amber-200 bg-amber-50/40 overflow-hidden">
                {/* Cabeçalho do passo (sempre visível, clicável para recolher/expandir) */}
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setAbertoKey(estaAberto ? undefined : key)}
                    className="flex flex-1 items-center gap-2 min-w-0 text-left"
                  >
                    {estaAberto
                      ? <ChevronDown size={14} className="shrink-0 text-amber-600" />
                      : <ChevronRight size={14} className="shrink-0 text-amber-600" />}
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[11px] text-white">
                      {idx + 1}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-amber-700">Passo {idx + 1}</span>
                    <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500 border border-amber-100">
                      {resumoTiming(passo, idx)}
                    </span>
                    {!estaAberto && (
                      <span className="flex items-center gap-1 min-w-0 text-[11px] text-gray-500">
                        {ehIA ? <Bot size={11} className="shrink-0" /> : <MessageCircle size={11} className="shrink-0 text-emerald-500" />}
                        {passo.media_url && <Paperclip size={10} className="shrink-0 text-gray-400" />}
                        <span className="truncate">{preview}</span>
                      </span>
                    )}
                  </button>
                  {value.passos.length > 1 && (
                    <button type="button" onClick={() => removePasso(key)}
                      className="shrink-0 p-1 text-gray-400 hover:text-red-500" title="Remover passo">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {/* Corpo do passo (só quando aberto) */}
                {estaAberto && (
                  <div className="border-t border-amber-100 px-3 py-3">
                    {/* Seletor de base — o primeiro passo é sempre "da entrada" */}
                    {idx === 0 ? (
                      <div className="mb-2 inline-flex items-center gap-1.5 rounded bg-white px-2 py-1 text-[11px] text-gray-500 border border-gray-200">
                        <LogIn size={12} className="text-amber-500" />
                        Conta a partir da <strong className="font-medium">entrada no estágio</strong>
                      </div>
                    ) : (
                      <div className="mb-2 flex flex-wrap gap-2">
                        <button type="button" onClick={() => setBase(key, 'anterior')}
                          className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] border transition-colors ${
                            (passo.base ?? 'anterior') === 'anterior'
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-white text-gray-600 border-gray-300 hover:border-amber-400'
                          }`}>
                          <CornerDownRight size={12} /> Após a mensagem anterior
                        </button>
                        <button type="button" onClick={() => setBase(key, 'entrada')}
                          className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] border transition-colors ${
                            passo.base === 'entrada'
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-white text-gray-600 border-gray-300 hover:border-amber-400'
                          }`}>
                          <LogIn size={12} /> Da entrada no estágio
                        </button>
                      </div>
                    )}

                    <AgendamentoConfig
                      value={passo}
                      onChange={(v) => setPasso(key, v)}
                      nivel="estagio"
                      showToggle={false}
                    />
                  </div>
                )}
              </div>
            )
          })}

          <button
            type="button"
            onClick={addPasso}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-amber-300 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
          >
            <Plus size={15} />
            Adicionar passo
          </button>
        </div>
      )}
    </div>
  )
}
