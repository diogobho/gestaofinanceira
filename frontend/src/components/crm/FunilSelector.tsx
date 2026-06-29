import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Plus, Edit2 } from 'lucide-react'
import type { Funil } from '@/types/crm'

interface FunilSelectorProps {
  funis: Funil[]
  selectedFunilId?: number
  onSelect: (funilId: number) => void
  onCreateNew: () => void
  onEdit: (funil: Funil) => void
}

export default function FunilSelector({ funis, selectedFunilId, onSelect, onCreateNew, onEdit }: FunilSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selected = funis.find(f => f.id === selectedFunilId)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
      >
        <span className="text-sm font-medium text-gray-700">
          {selected?.nome || 'Selecionar funil'}
        </span>
        {selected?.total_leads !== undefined && (
          <span className="text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full">
            {selected.total_leads}
          </span>
        )}
        <ChevronDown size={16} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border py-1 z-20 min-w-[220px]">
          {funis.map(funil => (
            <div
              key={funil.id}
              className={`flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer group ${
                funil.id === selectedFunilId ? 'bg-primary-50' : ''
              }`}
            >
              <button
                onClick={() => {
                  onSelect(funil.id)
                  setIsOpen(false)
                }}
                className="flex-1 text-left flex items-center gap-2"
              >
                <span className={`text-sm ${funil.id === selectedFunilId ? 'font-semibold text-primary-700' : 'text-gray-700'}`}>
                  {funil.nome}
                </span>
                {funil.padrao && (
                  <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">padrao</span>
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(funil)
                  setIsOpen(false)
                }}
                className="p-1 text-gray-400 hover:text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Editar funil"
              >
                <Edit2 size={14} />
              </button>
            </div>
          ))}

          <div className="border-t mt-1 pt-1">
            <button
              onClick={() => {
                onCreateNew()
                setIsOpen(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary-600 hover:bg-primary-50"
            >
              <Plus size={16} />
              Criar novo funil
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
