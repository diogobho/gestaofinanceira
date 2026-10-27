import { CalendarClock } from 'lucide-react'
import type { ReuniaoLembretesConfig, MarcoReuniaoLembrete } from '@/types/crm'

/**
 * Editor dos LEMBRETES DE REUNIÃO por estágio (régua fixa de 5 marcos):
 *   - Lembretes ANTES da reunião (véspera / 1h antes) → confirmam presença;
 *   - No-show DEPOIS da reunião → resgatam quem não apareceu.
 * A data/hora base é a tarefa de reunião do lead. Cada marco pode ser ligado/desligado,
 * ter a mensagem editada e o tempo ajustado. Serializa para estagios_funil.reuniao_lembretes.
 */

type Unidade = 'minuto' | 'hora' | 'dia'
type Direcao = 'antes' | 'depois'
const MULT: Record<Unidade, number> = { minuto: 1, hora: 60, dia: 1440 }
const VARIAVEIS = ['PrimeiroNome', 'Horario', 'Data']

export interface MarcoEdit {
  marco: string
  grupo: 'lembrete' | 'noshow'
  _titulo: string          // rótulo humano (não é salvo)
  incluir: boolean
  direcao: Direcao
  quantidade: number
  unidade: Unidade
  tolerancia_min: number
  mensagem: string
}

export interface ReuniaoLembretesValue {
  ativo: boolean
  marcos: MarcoEdit[]
}

/** Régua padrão (mesma do sistema): 2 lembretes + 3 resgates de no-show. */
const TEMPLATE: Omit<MarcoEdit, 'incluir'>[] = [
  { marco: 'lembrete_24h', grupo: 'lembrete', _titulo: 'Lembrete de véspera',
    direcao: 'antes', quantidade: 24, unidade: 'hora', tolerancia_min: 180,
    mensagem: 'Oi [PrimeiroNome]! Passando para lembrar que a nossa conversa é amanhã às [Horario] 😊 Confirma que está tudo certo? Se precisar ajustar algo, é só me falar!' },
  { marco: 'lembrete_1h', grupo: 'lembrete', _titulo: 'Lembrete de última hora',
    direcao: 'antes', quantidade: 1, unidade: 'hora', tolerancia_min: 55,
    mensagem: 'Oi [PrimeiroNome]! Faltando 1 hora para a nossa conversa 🙌 Estou por aqui, até já!' },
  { marco: 'noshow_d0', grupo: 'noshow', _titulo: 'Não apareceu — 1ª tentativa',
    direcao: 'depois', quantidade: 2, unidade: 'hora', tolerancia_min: 240,
    mensagem: 'Oi [PrimeiroNome]! Tudo bem? Aguardei você hoje, mas sei que imprevistos acontecem 😊 Podemos remarcar? Me fala um horário que funcione melhor pra você.' },
  { marco: 'noshow_d1', grupo: 'noshow', _titulo: 'Não apareceu — 2ª tentativa',
    direcao: 'depois', quantidade: 1, unidade: 'dia', tolerancia_min: 240,
    mensagem: 'Oi [PrimeiroNome]! Passando novamente por aqui. Se ainda fizer sentido a nossa conversa, me diz um horário que funcione melhor pra você que eu já reservo 🙂' },
  { marco: 'noshow_d3', grupo: 'noshow', _titulo: 'Não apareceu — última tentativa',
    direcao: 'depois', quantidade: 3, unidade: 'dia', tolerancia_min: 240,
    mensagem: '[PrimeiroNome], última tentativa por aqui. Se ainda fizer sentido a gente conversar, é só me chamar — fico à disposição. Vou seguir te enviando conteúdos que possam ser úteis de tempos em tempos 🙂' },
]

function offsetParaPartes(offset: number): { direcao: Direcao; quantidade: number; unidade: Unidade } {
  const direcao: Direcao = offset < 0 ? 'antes' : 'depois'
  const abs = Math.abs(offset)
  let unidade: Unidade = 'minuto'
  if (abs !== 0 && abs % 1440 === 0) unidade = 'dia'
  else if (abs !== 0 && abs % 60 === 0) unidade = 'hora'
  return { direcao, quantidade: unidade === 'minuto' ? abs : abs / MULT[unidade], unidade }
}
function partesParaOffset(direcao: Direcao, quantidade: number, unidade: Unidade): number {
  const mag = Math.max(0, Math.round(quantidade)) * MULT[unidade]
  return direcao === 'antes' ? -mag : mag
}

export function reuniaoLembretesPadrao(): ReuniaoLembretesValue {
  return { ativo: false, marcos: TEMPLATE.map(t => ({ ...t, incluir: true })) }
}

/** Config salva no estágio → estado editável (marcos ausentes ficam desmarcados). */
export function configParaLembretes(cfg?: ReuniaoLembretesConfig | null): ReuniaoLembretesValue {
  if (!cfg) return reuniaoLembretesPadrao()
  const porId = new Map((cfg.marcos || []).map(m => [m.marco, m]))
  const marcos: MarcoEdit[] = TEMPLATE.map(t => {
    const db = porId.get(t.marco)
    if (!db) return { ...t, incluir: false }
    const { direcao, quantidade, unidade } = offsetParaPartes(db.offset_min)
    return {
      ...t, incluir: true, direcao, quantidade, unidade,
      tolerancia_min: db.tolerancia_min ?? t.tolerancia_min,
      mensagem: db.mensagem ?? t.mensagem,
    }
  })
  return { ativo: cfg.ativo ?? false, marcos }
}

/** Estado editável → config salva (só marcos marcados; nenhum → null = desligado). */
export function lembretesParaConfig(v: ReuniaoLembretesValue): ReuniaoLembretesConfig | null {
  const marcos: MarcoReuniaoLembrete[] = v.marcos
    .filter(m => m.incluir && m.mensagem.trim())
    .map(m => ({
      marco: m.marco,
      grupo: m.grupo,
      offset_min: partesParaOffset(m.direcao, m.quantidade, m.unidade),
      tolerancia_min: m.tolerancia_min,
      mensagem: m.mensagem.trim(),
    }))
  if (marcos.length === 0) return null
  return { ativo: v.ativo, marcos }
}

interface Props {
  value: ReuniaoLembretesValue
  onChange: (v: ReuniaoLembretesValue) => void
}

export default function ReuniaoLembretesConfig({ value, onChange }: Props) {
  const setMarco = (marco: string, patch: Partial<MarcoEdit>) =>
    onChange({ ...value, marcos: value.marcos.map(m => (m.marco === marco ? { ...m, ...patch } : m)) })

  const grupos: { key: 'lembrete' | 'noshow'; titulo: string; sub: string }[] = [
    { key: 'lembrete', titulo: 'Lembretes (antes da reunião)', sub: 'Confirmam a presença do lead.' },
    { key: 'noshow', titulo: 'Não compareceu — resgate', sub: 'Disparam se o lead ainda estiver neste estágio depois do horário da reunião.' },
  ]

  return (
    <div className="space-y-3">
      {/* Toggle mestre */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-blue-500" />
          <label className="text-sm font-medium text-gray-700">Lembretes de reunião</label>
        </div>
        <button
          type="button"
          onClick={() => onChange({ ...value, ativo: !value.ativo })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value.ativo ? 'bg-blue-500' : 'bg-gray-300'}`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${value.ativo ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {value.ativo && (
        <div className="space-y-3">
          <p className="text-[11px] text-gray-400">
            Usa a data/hora da tarefa de reunião do lead. Não dispara em fins de semana nem se a reunião estiver sem horário definido.
            Ao terminar a reunião, mova o lead para "Reunião Realizada" para parar os resgates de no-show.
            Variáveis: <code className="bg-gray-100 px-1 rounded">[PrimeiroNome]</code>, <code className="bg-gray-100 px-1 rounded">[Horario]</code>, <code className="bg-gray-100 px-1 rounded">[Data]</code>.
          </p>

          {grupos.map(g => (
            <div key={g.key} className="space-y-2">
              <div>
                <p className="text-xs font-semibold text-gray-600">{g.titulo}</p>
                <p className="text-[11px] text-gray-400">{g.sub}</p>
              </div>
              {value.marcos.filter(m => m.grupo === g.key).map(m => (
                <div key={m.marco} className={`rounded-lg border p-3 ${m.incluir ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200 bg-gray-50/60'}`}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={m.incluir}
                      onChange={e => setMarco(m.marco, { incluir: e.target.checked })}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">{m._titulo}</span>
                  </label>

                  {m.incluir && (
                    <div className="mt-2 space-y-2 pl-6">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
                        <input
                          type="number" min={0} value={m.quantidade}
                          onChange={e => setMarco(m.marco, { quantidade: Math.max(0, Number(e.target.value) || 0) })}
                          className="w-16 px-2 py-1 border rounded focus:ring-1 focus:ring-blue-500"
                        />
                        <select
                          value={m.unidade}
                          onChange={e => setMarco(m.marco, { unidade: e.target.value as Unidade })}
                          className="px-2 py-1 border rounded focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="minuto">minuto(s)</option>
                          <option value="hora">hora(s)</option>
                          <option value="dia">dia(s)</option>
                        </select>
                        <select
                          value={m.direcao}
                          onChange={e => setMarco(m.marco, { direcao: e.target.value as Direcao })}
                          className="px-2 py-1 border rounded focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="antes">antes da reunião</option>
                          <option value="depois">depois da reunião</option>
                        </select>
                      </div>

                      <textarea
                        value={m.mensagem} rows={3}
                        onChange={e => setMarco(m.marco, { mensagem: e.target.value })}
                        className="w-full px-2 py-1.5 border rounded text-sm resize-y focus:ring-1 focus:ring-blue-500"
                        placeholder="Mensagem enviada ao lead…"
                      />
                      <div className="flex flex-wrap gap-1">
                        {VARIAVEIS.map(v2 => (
                          <button
                            key={v2} type="button"
                            onClick={() => setMarco(m.marco, { mensagem: `${m.mensagem} [${v2}]`.trim() })}
                            className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-gray-500 hover:border-blue-300 hover:text-blue-600"
                          >
                            [{v2}]
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
