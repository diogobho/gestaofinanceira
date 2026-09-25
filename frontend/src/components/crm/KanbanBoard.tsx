import { useState, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { DragDropContext, Droppable, Draggable, DropResult, BeforeCapture } from '@hello-pangea/dnd'
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

  // Barra de destinos (#123). O quadro rola na horizontal e cada coluna rola na
  // vertical — scroll aninhado, que a lib não suporta: rolar o quadro durante o
  // arrasto faria o card cair na coluna errada. Em vez de auto-scroll, enquanto um
  // CARD é arrastado aparece no rodapé uma faixa com todas as etapas, e soltar numa
  // delas move o card para o topo daquela coluna, esteja ela na tela ou não.
  // Montada no onBeforeCapture (antes de a lib medir os Droppables) e com flushSync:
  // Droppable que nasce no meio do arrasto não é enxergado.
  const [arrastandoCardDe, setArrastandoCardDe] = useState<string | null>(null)

  const handleBeforeCapture = (before: BeforeCapture) => {
    if (!before.draggableId.startsWith('lead-')) return
    const origem = colunasOrdenadas.find(c => c.leads.some(l => `lead-${l.id}` === before.draggableId))
    flushSync(() => setArrastandoCardDe(origem ? `estagio-${origem.id}` : ''))
  }

  const handleDragEnd = (result: DropResult) => {
    setArrastandoCardDe(null)
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
    if (destination.droppableId.startsWith('atalho-')) {
      const estagioId = parseInt(destination.droppableId.replace('atalho-', ''))
      if (`estagio-${estagioId}` === source.droppableId) return
      onMoverLead(leadId, estagioId, 0)
      return
    }
    const novoEstagioId = parseInt(destination.droppableId.replace('estagio-', ''))
    const novaOrdemLead = destination.index
    onMoverLead(leadId, novoEstagioId, novaOrdemLead)
  }

  return (
    <DragDropContext onBeforeCapture={handleBeforeCapture} onDragEnd={handleDragEnd}>
      {/* O wrapper posiciona a barra de destinos sobre o rodapé do QUADRO, fora do
          contêiner que rola — fixa na tela ela ficaria por baixo do menu lateral. */}
      <div className="relative h-full">
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

      {arrastandoCardDe !== null && (
        <div className="absolute inset-x-0 bottom-0 z-40 rounded-t-xl border-t border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 backdrop-blur px-3 py-2 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
          <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">
            Solte aqui para mover direto para a etapa
          </p>
          <div className="flex flex-wrap gap-1.5">
            {colunasOrdenadas.map(coluna => {
              const atual = `estagio-${coluna.id}` === arrastandoCardDe
              return (
                <Droppable key={coluna.id} droppableId={`atalho-${coluna.id}`} isDropDisabled={atual}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        atual
                          ? 'border-dashed border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500'
                          : snapshot.isDraggingOver
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/40 text-primary-700 dark:text-primary-200'
                            : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200'
                      }`}
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: coluna.cor || '#9ca3af' }} />
                      {coluna.nome}
                      {atual && <span className="font-normal">(atual)</span>}
                      <span className="hidden">{provided.placeholder}</span>
                    </div>
                  )}
                </Droppable>
              )
            })}
          </div>
        </div>
      )}
      </div>
    </DragDropContext>
  )
}
