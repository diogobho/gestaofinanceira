import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Clock, Pencil, Check, X, Loader2, CalendarClock } from 'lucide-react'
import { followupsApi } from '@/api/crm'
import type { ConfigEnvio } from '@/api/crm'

/**
 * Configuração de envio da empresa, em dois blocos:
 *
 *  1. INTERVALO anti-ban entre uma mensagem e a seguinte. É o único freio de ritmo
 *     que existe — o agendador escoa a fila respeitando esse espaçamento (antes havia
 *     também um teto de um envio por ciclo, que travava a fila e foi removido).
 *  2. JANELA OPERACIONAL: horário de início/fim e dias da semana em que o sistema pode
 *     falar com o lead. Vale para o follow-up agendado E para o agente que responde
 *     sozinho no WhatsApp. Nada sai fora dela: o que vence fora do horário é
 *     reagendado para a próxima abertura.
 */

const DIAS = [
  { v: 0, label: 'D' },
  { v: 1, label: 'S' },
  { v: 2, label: 'T' },
  { v: 3, label: 'Q' },
  { v: 4, label: 'Q' },
  { v: 5, label: 'S' },
  { v: 6, label: 'S' },
]

const TODOS_OS_DIAS = 'Todos os dias'

function resumoDias(dias: number[] | null): string {
  if (!dias || dias.length === 0 || dias.length === 7) return TODOS_OS_DIAS
  const nomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const ordenados = [...dias].sort((a, b) => a - b)
  if (ordenados.join(',') === '1,2,3,4,5') return 'Seg a Sex'
  return ordenados.map((d) => nomes[d]).join(', ')
}

const PADRAO: ConfigEnvio = {
  intervalo_min_seg: 45,
  intervalo_max_seg: 90,
  janela_inicio: '08:00',
  janela_fim: '20:00',
  janela_dias: null,
}

export function IntervaloEnvioConfig() {
  const [cfg, setCfg] = useState<ConfigEnvio>(PADRAO)
  const [rascunho, setRascunho] = useState<ConfigEnvio>(PADRAO)
  const [editando, setEditando] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    followupsApi.getConfig()
      .then((c) => setCfg({ ...PADRAO, ...c }))
      .catch(() => {})
      .finally(() => setCarregando(false))
  }, [])

  const iniciarEdicao = () => {
    setRascunho(cfg)
    setEditando(true)
  }

  const alternarDia = (d: number) => {
    // null = todos; o primeiro clique parte de "todos" e remove o dia clicado.
    const atuais = rascunho.janela_dias ?? [0, 1, 2, 3, 4, 5, 6]
    const novos = atuais.includes(d) ? atuais.filter((x) => x !== d) : [...atuais, d]
    // Zero dias significaria "nunca enviar" — nesse caso volta para todos.
    setRascunho({ ...rascunho, janela_dias: novos.length === 0 || novos.length === 7 ? null : novos.sort() })
  }

  const salvar = async () => {
    setSalvando(true)
    try {
      const salvo = await followupsApi.setConfig(rascunho)
      setCfg({ ...PADRAO, ...salvo })
      setEditando(false)
      // Estreitar a janela pode inviabilizar passos de cadência já configurados —
      // eles só teriam dia de envio fora do horário permitido. O backend devolve a
      // lista; sem este aviso o usuário descobriria por follow-up que não sai.
      const conflitos = salvo.conflitos ?? []
      if (conflitos.length > 0) {
        const nomes = [...new Set(conflitos.map((c) => c.estagio_nome))].join(', ')
        toast.error(
          `Salvo, mas ${conflitos.length} passo(s) de cadência ficaram sem dia possível: ${nomes}. ` +
          `Ajuste os dias desses passos ou o horário de envio.`,
          { duration: 12000 }
        )
      } else {
        toast.success('Configuração de envio salva!')
      }
    } catch {
      toast.error('Erro ao salvar configuração')
    } finally {
      setSalvando(false)
    }
  }

  const diasSelecionados = rascunho.janela_dias ?? [0, 1, 2, 3, 4, 5, 6]

  return (
    <div data-tour="followup-intervalo" className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-800/40 space-y-2">
      {/* Intervalo entre envios */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <Clock size={15} className="text-orange-500" />
          <span className="font-medium">Intervalo entre envios</span>
          <span className="text-xs text-gray-400">(anti-bloqueio)</span>
        </div>

        {carregando ? (
          <Loader2 size={14} className="animate-spin text-gray-400" />
        ) : editando ? (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-gray-500">de</span>
            <input
              type="number" min={10} max={3600} value={rascunho.intervalo_min_seg}
              onChange={(e) => setRascunho({ ...rascunho, intervalo_min_seg: Number(e.target.value) })}
              className="w-16 px-2 py-1 border rounded text-sm bg-white dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
            />
            <span className="text-gray-500">a</span>
            <input
              type="number" min={10} max={3600} value={rascunho.intervalo_max_seg}
              onChange={(e) => setRascunho({ ...rascunho, intervalo_max_seg: Number(e.target.value) })}
              className="w-16 px-2 py-1 border rounded text-sm bg-white dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
            />
            <span className="text-gray-500">s</span>
          </div>
        ) : (
          <button
            onClick={iniciarEdicao}
            className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 hover:text-primary-600"
            title="Editar configuração de envio"
          >
            <span className="font-semibold">{cfg.intervalo_min_seg}–{cfg.intervalo_max_seg}s</span>
            <Pencil size={13} className="text-gray-400" />
          </button>
        )}
      </div>

      {/* Janela operacional */}
      <div className="flex items-center justify-between gap-2 flex-wrap border-t border-gray-200 dark:border-gray-700 pt-2">
        <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <CalendarClock size={15} className="text-primary-600" />
          <span className="font-medium">Horário de envio</span>
          <span className="text-xs text-gray-400">(follow-up e agente)</span>
        </div>

        {carregando ? null : editando ? (
          <div className="flex items-center gap-1.5 text-sm flex-wrap justify-end">
            <input
              type="time" value={rascunho.janela_inicio}
              onChange={(e) => setRascunho({ ...rascunho, janela_inicio: e.target.value })}
              className="px-2 py-1 border rounded text-sm bg-white dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
            />
            <span className="text-gray-500">às</span>
            <input
              type="time" value={rascunho.janela_fim}
              onChange={(e) => setRascunho({ ...rascunho, janela_fim: e.target.value })}
              className="px-2 py-1 border rounded text-sm bg-white dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
            />
            <div className="flex items-center gap-1 ml-1">
              {DIAS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => alternarDia(d.v)}
                  title={['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][d.v]}
                  className={`h-6 w-6 rounded-full text-[11px] font-semibold transition-colors ${
                    diasSelecionados.includes(d.v)
                      ? 'bg-primary-600 text-white'
                      : 'bg-white dark:bg-gray-900 text-gray-400 border border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <button onClick={salvar} disabled={salvando} className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50" title="Salvar">
              {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            </button>
            <button onClick={() => setEditando(false)} className="p-1 text-gray-400 hover:text-gray-600" title="Cancelar">
              <X size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={iniciarEdicao}
            className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 hover:text-primary-600"
            title="Editar horário de envio"
          >
            <span className="font-semibold">{cfg.janela_inicio}–{cfg.janela_fim}</span>
            <span className="text-xs text-gray-500">· {resumoDias(cfg.janela_dias)}</span>
            <Pencil size={13} className="text-gray-400" />
          </button>
        )}
      </div>

      {!editando && !carregando && (
        <p className="text-xs text-gray-400">
          Vale para toda a empresa. Fora do horário nada é enviado: o que vencer é reagendado
          para a próxima abertura, sem se perder.
        </p>
      )}
    </div>
  )
}
