import React from 'react'
import { Calendar } from 'lucide-react'

export type DateRangePreset = 'hoje' | '7dias' | '30dias' | 'mes' | 'personalizado'

interface DateRangePresetsProps {
  dataInicio: string
  dataFim: string
  onChange: (dataInicio: string, dataFim: string) => void
  onClear?: () => void
  label?: string
  referenceLabel?: string
}

const formatDateForInput = (date: Date): string => {
  return date.toISOString().split('T')[0]
}

const getPresetRange = (preset: DateRangePreset): { inicio: string; fim: string } => {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const inicio = new Date(hoje)

  switch (preset) {
    case 'hoje':
      return { inicio: formatDateForInput(hoje), fim: formatDateForInput(hoje) }
    case '7dias':
      inicio.setDate(hoje.getDate() - 7)
      return { inicio: formatDateForInput(inicio), fim: formatDateForInput(hoje) }
    case '30dias':
      inicio.setDate(hoje.getDate() - 30)
      return { inicio: formatDateForInput(inicio), fim: formatDateForInput(hoje) }
    case 'mes':
      inicio.setDate(1)
      return { inicio: formatDateForInput(inicio), fim: formatDateForInput(hoje) }
    default:
      return { inicio: '', fim: '' }
  }
}

export const DateRangePresets: React.FC<DateRangePresetsProps> = ({
  dataInicio,
  dataFim,
  onChange,
  onClear,
  label = 'Período',
  referenceLabel
}) => {
  const temFiltro = Boolean(dataInicio || dataFim)

  const handlePresetClick = (preset: DateRangePreset) => {
    const { inicio, fim } = getPresetRange(preset)
    onChange(inicio, fim)
  }

  const presets: { key: DateRangePreset; label: string }[] = [
    { key: 'hoje', label: 'Hoje' },
    { key: '7dias', label: '7 dias' },
    { key: '30dias', label: '30 dias' },
    { key: 'mes', label: 'Este mês' }
  ]

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border dark:border-gray-700">
      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 mb-3">
        <Calendar size={18} className="text-primary-500" />
        <span className="text-sm font-medium">{label}</span>
        {referenceLabel && (
          <span className="text-xs text-gray-400">({referenceLabel})</span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">De</label>
          <input
            type="date"
            value={dataInicio}
            max={dataFim || undefined}
            onChange={(e) => onChange(e.target.value, dataFim)}
            className="px-3 py-2 border dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">Até</label>
          <input
            type="date"
            value={dataFim}
            min={dataInicio || undefined}
            onChange={(e) => onChange(dataInicio, e.target.value)}
            className="px-3 py-2 border dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset.key}
              onClick={() => handlePresetClick(preset.key)}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-primary-100 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300 rounded-lg transition"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {temFiltro && onClear && (
          <button
            onClick={onClear}
            className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg border dark:border-gray-600"
          >
            Limpar
          </button>
        )}

        {temFiltro && (
          <span className="ml-auto text-xs text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 px-3 py-1 rounded-full">
            Filtro ativo
          </span>
        )}
      </div>
    </div>
  )
}
