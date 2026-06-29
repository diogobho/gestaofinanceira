import { useState, useRef } from 'react'
import { Filter, X, ChevronDown, Users, Thermometer, Clock, MessageSquare, Phone, UserX, Tag, Layers } from 'lucide-react'
import type { FiltrosLead } from '@/api/crm'
import { useOrigens } from '@/hooks/useCRM'

interface KanbanFiltersProps {
  filtros: FiltrosLead
  onChange: (filtros: FiltrosLead) => void
  usuarios?: Array<{ id: number; nome: string }>
  estagios?: Array<{ id: number; nome: string }>
  funilId?: number
}

export default function KanbanFilters({ filtros, onChange, usuarios = [], estagios = [], funilId }: KanbanFiltersProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const { data: origens = [] } = useOrigens(funilId)

  const hasActiveFilters = Object.values(filtros).some(v => v !== undefined && v !== false)

  const openPanel = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPanelPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      })
    }
    setIsOpen(!isOpen)
  }

  const clearFilters = () => {
    onChange({})
    setIsOpen(false)
  }

  const toggleFilter = (key: keyof FiltrosLead, value: any) => {
    const newFiltros = { ...filtros }
    if (newFiltros[key] === value) {
      delete newFiltros[key]
    } else {
      newFiltros[key] = value
    }
    onChange(newFiltros)
  }

  const FilterChip = ({
    active,
    onClick,
    children,
    color = 'gray'
  }: {
    active: boolean
    onClick: () => void
    children: React.ReactNode
    color?: 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'orange'
  }) => {
    const colorClasses = {
      gray: active ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
      blue: active ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100',
      green: active ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100',
      yellow: active ? 'bg-yellow-600 text-white' : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100',
      red: active ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100',
      orange: active ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-700 hover:bg-orange-100',
    }

    return (
      <button
        onClick={onClick}
        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${colorClasses[color]}`}
      >
        {children}
      </button>
    )
  }

  return (
    <div>
      {/* Botao de filtro */}
      <button
        ref={buttonRef}
        onClick={openPanel}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
          hasActiveFilters
            ? 'bg-primary-50 border-primary-200 text-primary-700'
            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
      >
        <Filter size={18} />
        <span className="hidden sm:inline">Filtros</span>
        {hasActiveFilters && (
          <span className="w-5 h-5 rounded-full bg-primary-600 text-white text-xs flex items-center justify-center">
            {Object.values(filtros).filter(v => v !== undefined && v !== false).length}
          </span>
        )}
        <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Painel de filtros */}
      {isOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel — fixed para escapar do overflow-x-auto do toolbar */}
          <div
            className="fixed w-80 bg-white rounded-xl shadow-xl border z-50 overflow-hidden"
            style={{ top: panelPos.top, right: panelPos.right }}
          >
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Filtrar Leads</h3>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-primary-600 hover:text-primary-800 flex items-center gap-1"
                >
                  <X size={14} />
                  Limpar
                </button>
              )}
            </div>

            <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
              {/* Estágio */}
              {estagios.length > 0 && (
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                    <Layers size={16} />
                    Estágio
                  </label>
                  <select
                    value={filtros.estagio_id || ''}
                    onChange={(e) => {
                      const value = e.target.value ? parseInt(e.target.value) : undefined
                      onChange({ ...filtros, estagio_id: value })
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">Todos os estágios</option>
                    {estagios.map(e => (
                      <option key={e.id} value={e.id}>{e.nome}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Responsavel */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <Users size={16} />
                  Responsavel
                </label>
                <select
                  value={filtros.responsavel_id || ''}
                  onChange={(e) => {
                    const value = e.target.value ? parseInt(e.target.value) : undefined
                    onChange({ ...filtros, responsavel_id: value })
                  }}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Todos</option>
                  {usuarios.map(u => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </div>

              {/* Temperatura */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <Thermometer size={16} />
                  Temperatura
                </label>
                <div className="flex flex-wrap gap-2">
                  <FilterChip
                    active={filtros.temperatura === 'frio'}
                    onClick={() => toggleFilter('temperatura', 'frio')}
                    color="blue"
                  >
                    Frio
                  </FilterChip>
                  <FilterChip
                    active={filtros.temperatura === 'morno'}
                    onClick={() => toggleFilter('temperatura', 'morno')}
                    color="yellow"
                  >
                    Morno
                  </FilterChip>
                  <FilterChip
                    active={filtros.temperatura === 'quente'}
                    onClick={() => toggleFilter('temperatura', 'quente')}
                    color="red"
                  >
                    Quente
                  </FilterChip>
                </div>
              </div>

              {/* Status de Tarefa */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <Clock size={16} />
                  Status de Tarefa
                </label>
                <div className="flex flex-wrap gap-2">
                  <FilterChip
                    active={filtros.com_tarefa_hoje === true}
                    onClick={() => toggleFilter('com_tarefa_hoje', true)}
                    color="green"
                  >
                    Para Hoje
                  </FilterChip>
                  <FilterChip
                    active={filtros.com_tarefa_atrasada === true}
                    onClick={() => toggleFilter('com_tarefa_atrasada', true)}
                    color="red"
                  >
                    Atrasadas
                  </FilterChip>
                  <FilterChip
                    active={filtros.sem_tarefa === true}
                    onClick={() => toggleFilter('sem_tarefa', true)}
                    color="orange"
                  >
                    Sem Tarefa
                  </FilterChip>
                </div>
              </div>

              {/* Aguardando Resposta / Msg não lida */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <MessageSquare size={16} />
                  Status WhatsApp
                </label>
                <div className="flex flex-wrap gap-2">
                  <FilterChip
                    active={filtros.aguardando_resposta === true}
                    onClick={() => toggleFilter('aguardando_resposta', true)}
                    color="blue"
                  >
                    Aguardando Resposta
                  </FilterChip>
                  <FilterChip
                    active={filtros.com_mensagens_nao_lidas === true}
                    onClick={() => toggleFilter('com_mensagens_nao_lidas', true)}
                    color="orange"
                  >
                    Msg Não Lida
                  </FilterChip>
                </div>
              </div>

              {/* Qualidade do Lead */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <Phone size={16} />
                  Dados do Lead
                </label>
                <div className="flex flex-wrap gap-2">
                  <FilterChip
                    active={filtros.com_telefone === true}
                    onClick={() => toggleFilter('com_telefone', true)}
                    color="green"
                  >
                    Com Telefone
                  </FilterChip>
                  <FilterChip
                    active={filtros.sem_nome_real === true}
                    onClick={() => toggleFilter('sem_nome_real', true)}
                    color="gray"
                  >
                    <span className="flex items-center gap-1">
                      <UserX size={13} />
                      Sem Nome Real
                    </span>
                  </FilterChip>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  "Sem Nome Real" = lead cujo nome é apenas o número do contato
                </p>
              </div>

              {/* Origem */}
              {origens.length > 0 && (
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                    <Tag size={16} />
                    Origem
                  </label>
                  <select
                    value={filtros.origem || ''}
                    onChange={(e) => {
                      const value = e.target.value || undefined
                      onChange({ ...filtros, origem: value })
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">Todas</option>
                    {origens.map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Arquivados */}
              <div className="pt-2 border-t">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filtros.arquivados === true}
                    onChange={(e) => onChange({ ...filtros, arquivados: e.target.checked || undefined })}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Mostrar arquivados</span>
                </label>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
