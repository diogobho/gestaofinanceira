import { useState, useRef, useEffect } from 'react'
import { Droppable } from '@hello-pangea/dnd'
import { Plus, MoreVertical, Settings, Bot, GripVertical, ChevronDown, Loader2, Bell } from 'lucide-react'
import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd'
import KanbanCard from './KanbanCard'
import { useAgenteIAToggleEstagio } from '@/hooks/useCRM'
import type { EstagioFunil, Lead } from '@/types/crm'

interface KanbanColumnProps {
  estagio: EstagioFunil & { leads: Lead[]; total_no_estagio?: number }
  dragHandleProps?: DraggableProvidedDragHandleProps | null
  isDragging?: boolean
  onCardClick?: (lead: Lead) => void
  onAddClick?: (estagioId: number) => void
  onEditEstagio?: (estagio: EstagioFunil) => void
  onLoadMore?: () => void
  isLoadingMore?: boolean
  totalNoEstagio?: number
}

export default function KanbanColumn({
  estagio,
  dragHandleProps,
  isDragging,
  onCardClick,
  onAddClick,
  onEditEstagio,
  onLoadMore,
  isLoadingMore,
  totalNoEstagio,
}: KanbanColumnProps) {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const toggleEstagio = useAgenteIAToggleEstagio()
  const valorTotal = estagio.leads.reduce((acc, lead) => acc + (lead.valor_potencial || 0), 0)

  // Fechar menu ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div
      className={`flex flex-col w-72 min-w-72 h-full max-h-full bg-gray-100 rounded-lg ${
        isDragging ? 'ring-2 ring-primary-400' : ''
      }`}
    >
      {/* Header da coluna */}
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Grip handle para arrastar a coluna */}
            <div
              {...dragHandleProps}
              className="flex-shrink-0 cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
              title="Arrastar para reordenar"
            >
              <GripVertical size={14} />
            </div>

            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: estagio.cor }}
            />
            <h3 className="font-semibold text-gray-700 text-sm truncate">{estagio.nome}</h3>
            <span className="bg-gray-200 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0">
              {totalNoEstagio ?? estagio.leads.length}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Badge follow-up configurado no estágio */}
            {estagio.followup_config?.ativo && (
              <span title="Follow-up automático ativo neste estágio" className="flex items-center">
                <Bell size={13} className="text-orange-500" />
              </span>
            )}
            {/* Badge do Agente IA por coluna */}
            {estagio.agente_ia_ativo && (
              <span title="Agente IA ativo para este estágio" className="flex items-center">
                <Bot size={14} className="text-primary-500" />
              </span>
            )}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 hover:bg-gray-200 rounded"
              >
                <MoreVertical size={16} className="text-gray-400" />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border py-1 z-10 min-w-[180px]">
                  <button
                    onClick={() => {
                      onEditEstagio?.(estagio)
                      setShowMenu(false)
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <Settings size={14} />
                    Configurar estágio
                  </button>
                  <button
                    onClick={() => {
                      toggleEstagio.mutate({ estagioId: estagio.id, ativo: !estagio.agente_ia_ativo })
                      setShowMenu(false)
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                  >
                    <Bot size={14} className={estagio.agente_ia_ativo ? 'text-primary-600' : 'text-gray-400'} />
                    <span className={estagio.agente_ia_ativo ? 'text-primary-700' : 'text-gray-700'}>
                      {estagio.agente_ia_ativo ? 'Desativar IA neste estágio' : 'Ativar IA neste estágio'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Valor total */}
        {valorTotal > 0 && (
          <p className="text-xs text-gray-500 ml-6">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorTotal)}
          </p>
        )}
      </div>

      {/* Droppable area para leads */}
      <Droppable droppableId={`estagio-${estagio.id}`}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`
              flex-1 p-2 min-h-[200px] overflow-y-auto
              ${snapshot.isDraggingOver ? 'bg-primary-50' : ''}
            `}
          >
            {estagio.leads.map((lead, index) => (
              <KanbanCard
                key={lead.id}
                lead={lead}
                index={index}
                onClick={onCardClick}
              />
            ))}
            {provided.placeholder}

            {/* Empty state */}
            {estagio.leads.length === 0 && !snapshot.isDraggingOver && (
              <div className="text-center py-8 text-gray-400">
                <p className="text-sm">Nenhum lead</p>
                <p className="text-xs">Arraste aqui ou adicione</p>
              </div>
            )}

            {/* Carregar mais */}
            {onLoadMore && totalNoEstagio !== undefined && estagio.leads.length < totalNoEstagio && (
              <button
                onClick={onLoadMore}
                disabled={isLoadingMore}
                className="w-full mt-2 py-2 flex items-center justify-center gap-1.5 text-xs text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded transition-colors disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <ChevronDown size={13} />
                )}
                Carregar mais (+{totalNoEstagio - estagio.leads.length})
              </button>
            )}
          </div>
        )}
      </Droppable>

      {/* Footer - Add button */}
      <div className="p-2 border-t border-gray-200">
        <button
          onClick={() => onAddClick?.(estagio.id)}
          className="w-full flex items-center justify-center gap-1 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors text-sm"
        >
          <Plus size={16} />
          Adicionar lead
        </button>
      </div>
    </div>
  )
}
