import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Clock, Pencil, Check, X, Loader2 } from 'lucide-react'
import { followupsApi } from '@/api/crm'

/**
 * Configuração global (por empresa) do intervalo anti-ban entre envios de
 * follow-up. Quando os follow-ups acumulam, o agendador envia no máximo um por
 * ciclo, aguardando um tempo aleatório entre o mínimo e o máximo definidos aqui.
 */
export function IntervaloEnvioConfig() {
  const [min, setMin] = useState(45)
  const [max, setMax] = useState(90)
  const [editando, setEditando] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [rascunhoMin, setRascunhoMin] = useState(45)
  const [rascunhoMax, setRascunhoMax] = useState(90)

  useEffect(() => {
    followupsApi.getConfig()
      .then(cfg => { setMin(cfg.intervalo_min_seg); setMax(cfg.intervalo_max_seg) })
      .catch(() => {})
      .finally(() => setCarregando(false))
  }, [])

  const iniciarEdicao = () => {
    setRascunhoMin(min)
    setRascunhoMax(max)
    setEditando(true)
  }

  const salvar = async () => {
    setSalvando(true)
    try {
      const cfg = await followupsApi.setConfig({
        intervalo_min_seg: rascunhoMin,
        intervalo_max_seg: rascunhoMax,
      })
      setMin(cfg.intervalo_min_seg)
      setMax(cfg.intervalo_max_seg)
      setEditando(false)
      toast.success('Intervalo salvo!')
    } catch {
      toast.error('Erro ao salvar intervalo')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-800/40">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <Clock size={15} className="text-orange-500" />
          <span className="font-medium">Intervalo entre envios de follow-up</span>
          <span className="text-xs text-gray-400">(anti-bloqueio)</span>
        </div>

        {carregando ? (
          <Loader2 size={14} className="animate-spin text-gray-400" />
        ) : editando ? (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-gray-500">de</span>
            <input
              type="number" min={10} max={3600} value={rascunhoMin}
              onChange={e => setRascunhoMin(Number(e.target.value))}
              className="w-16 px-2 py-1 border rounded text-sm bg-white dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
            />
            <span className="text-gray-500">a</span>
            <input
              type="number" min={10} max={3600} value={rascunhoMax}
              onChange={e => setRascunhoMax(Number(e.target.value))}
              className="w-16 px-2 py-1 border rounded text-sm bg-white dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
            />
            <span className="text-gray-500">s</span>
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
            title="Editar intervalo"
          >
            <span className="font-semibold">{min}–{max}s</span>
            <Pencil size={13} className="text-gray-400" />
          </button>
        )}
      </div>
      {!editando && !carregando && (
        <p className="text-xs text-gray-400 mt-1">
          Vale para toda a empresa. Ao acumular follow-ups, o sistema espaça os envios respeitando esse intervalo.
        </p>
      )}
    </div>
  )
}
