import { useState, useEffect } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import KanbanColumn from './KanbanColumn'
import type { EstagioFunil, Lead } from '@/types/crm'

interface KanbanBoardProps {
  colunas: (EstagioFunil & { leads: Lead[]; total_no_estagio?: number })[]
  onMoverLead: (leadId: number, novoEstagioId: number, novaOrdem: number) => void
  onReorderEstagios?: (estagios: { id: number; ordem: number }[]) => void
  onCardClick?: (lead: Lead) => void
  onAddClick?: (estagioId: number) => void
  onEditEstagio?: (estagio: EstagioFunil) => void
  onLoadMore?: (estagioId: number) => void
  loadingMore?: Record<number, boolean>
}

export default function KanbanBoard({
  colunas,
  onMoverLead,
  onReorderEstagios,
  onCardClick,
  onAddClick,
  onEditEstagio,
  onLoadMore,
  loadingMore,
}: KanbanBoardProps) {
  // Estado local para reordenação otimista das colunas
  const [colunasOrdenadas, setColunasOrdenadas] = useState(colunas)

  // Sincronizar dados de leads e estágios sem perder a ordem local do usuário
  useEffect(() => {
    setColunasOrdenadas(prev => {
      const prevIds = prev.map(c => c.id)
      const newIds = colunas.map(c => c.id)

      // Se os estágios mudaram (adicionado/removido), resetar para a ordem do servidor
      const mesmoConjunto =
        prevIds.length === newIds.length && prevIds.every(id => newIds.includes(id))

      if (!mesmoConjunto) return colunas

      // Manter ordem local, mas atualizar dados (leads, cor, nome, etc.)
      return prev.map(col => {
        const updated = colunas.find(c => c.id === col.id)
        return updated ? { ...updated } : col
      })
    })
  }, [colunas])

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, type } = result

    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    // Drag de coluna (reordenar estágio)
    if (type === 'COLUMN') {
      const novaOrdem = [...colunasOrdenadas]
      const [removida] = novaOrdem.splice(source.index, 1)
      novaOrdem.splice(destination.index, 0, removida)

      setColunasOrdenadas(novaOrdem)
      onReorderEstagios?.(novaOrdem.map((c, i) => ({ id: c.id, ordem: i + 1 })))
      return
    }

    // Drag de lead (mover entre estágios)
    const leadId = parseInt(result.draggableId.replace('lead-', ''))
    const novoEstagioId = parseInt(destination.droppableId.replace('estagio-', ''))
    const novaOrdemLead = destination.index
    onMoverLead(leadId, novoEstagioId, novaOrdemLead)
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="kanban-columns" type="COLUMN" direction="horizontal">
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex gap-4 h-full overflow-x-auto pb-4 px-1"
          >
            {colunasOrdenadas.map((coluna, index) => (
              <Draggable
                key={coluna.id}
                draggableId={`coluna-${coluna.id}`}
                index={index}
              >
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    className={`flex-shrink-0 transition-shadow ${
                      snapshot.isDragging ? 'shadow-2xl opacity-95' : ''
                    }`}
                  >
                    <KanbanColumn
                      estagio={coluna}
                      dragHandleProps={provided.dragHandleProps}
                      isDragging={snapshot.isDragging}
                      onCardClick={onCardClick}
                      onAddClick={onAddClick}
                      onEditEstagio={onEditEstagio}
                      onLoadMore={onLoadMore ? () => onLoadMore(coluna.id) : undefined}
                      isLoadingMore={loadingMore?.[coluna.id] ?? false}
                      totalNoEstagio={coluna.total_no_estagio}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  )
}
