import { Draggable } from '@hello-pangea/dnd'
import { Phone, Building, DollarSign, MessageCircle, Clock, CheckCircle, CalendarCheck, AlertCircle, User, Send, Bell, Bot } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import type { Lead } from '@/types/crm'

interface KanbanCardProps {
  lead: Lead
  index: number
  onClick?: (lead: Lead) => void
}

const temperaturaConfig = {
  frio: { color: 'bg-blue-100 text-blue-700', label: 'Frio' },
  morno: { color: 'bg-yellow-100 text-yellow-700', label: 'Morno' },
  quente: { color: 'bg-red-100 text-red-700', label: 'Quente' },
}

export default function KanbanCard({ lead, index, onClick }: KanbanCardProps) {
  const temp = temperaturaConfig[lead.temperatura] || temperaturaConfig.frio
  const unreadCount = lead.mensagens_nao_lidas || 0
  const hasUnread = unreadCount > 0
  const isWaiting = lead.aguardando_resposta === true
  const clienteRespondeu = !isWaiting && !!lead.ultima_resposta_cliente_at
  // Status efetivo do agente: override de lead tem prioridade, senão herda do estágio
  const agenteAtivo = lead.agente_ia_ativo != null
    ? lead.agente_ia_ativo
    : (lead.estagio_agente_ia_ativo ?? false)

  // Verificar se a resposta do cliente e recente (ultimas 24h)
  const respostaRecente = clienteRespondeu && lead.ultima_resposta_cliente_at
    ? (Date.now() - new Date(lead.ultima_resposta_cliente_at).getTime()) < 24 * 60 * 60 * 1000
    : false

  return (
    <Draggable draggableId={`lead-${lead.id}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick?.(lead)}
          className={`
            bg-white rounded-lg shadow-sm border p-2.5 mb-1.5 cursor-pointer
            hover:shadow-md transition-all
            ${snapshot.isDragging ? 'shadow-lg ring-2 ring-primary-500 ring-opacity-50' : ''}
            ${hasUnread
              ? 'border-green-400 border-2 bg-green-50'
              : 'border-gray-200 hover:border-gray-300'
            }
          `}
        >
          {/* Header com Avatar */}
          <div className="flex items-start gap-2 mb-1.5">
            <div className="relative">
              <Avatar
                name={lead.nome}
                src={lead.foto_url}
                size="sm"
              />
              {/* Badge de nao lido sobre o avatar */}
              {hasUnread && (
                <span className="absolute -top-1 -right-1 px-1 min-w-[18px] h-[18px] flex items-center justify-center bg-green-500 text-white text-[10px] font-bold rounded-full animate-pulse">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-medium text-gray-900 text-sm leading-tight truncate flex-1">
                  {lead.titulo || lead.nome}
                </h4>
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${temp.color}`}>
                  {temp.label}
                </span>
              </div>
              {/* Nome do contato */}
              {lead.titulo && (
                <p className="text-xs text-gray-600 truncate">{lead.nome}</p>
              )}
            </div>
          </div>

          {/* Info compacta */}
          <div className="flex flex-wrap gap-2 text-xs text-gray-500">
            {lead.codigo_externo && (
              <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-mono font-medium">
                #{lead.codigo_externo}
              </span>
            )}
            {lead.telefone && (
              <span className="flex items-center gap-1">
                <Phone size={12} />
                {lead.telefone.replace(/^55/, '').replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')}
              </span>
            )}
            {lead.empresa && (
              <span className="flex items-center gap-1">
                <Building size={12} />
                {lead.empresa}
              </span>
            )}
          </div>

          {/* Valor e tags */}
          <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-gray-100">
            {lead.valor_potencial ? (
              <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                <DollarSign size={12} />
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lead.valor_potencial)}
              </span>
            ) : (
              <span />
            )}

            {/* Tags */}
            {lead.tags && lead.tags.length > 0 && (
              <div className="flex gap-1">
                {lead.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag.id}
                    className="px-1.5 py-0.5 rounded text-xs"
                    style={{ backgroundColor: `${tag.cor}20`, color: tag.cor }}
                  >
                    {tag.nome}
                  </span>
                ))}
                {lead.tags.length > 2 && (
                  <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                    +{lead.tags.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Indicador de tarefa */}
          <div className="mt-1.5 flex items-center gap-1.5 text-xs">
            {lead.proxima_tarefa ? (() => {
              const venc = new Date(lead.proxima_tarefa.data_vencimento)
              const hoje = new Date()
              hoje.setHours(0, 0, 0, 0)
              const amanha = new Date(hoje)
              amanha.setDate(amanha.getDate() + 1)
              const fimHoje = new Date(hoje)
              fimHoje.setHours(23, 59, 59, 999)

              if (venc < hoje) {
                return (
                  <span className="flex items-center gap-1 text-red-600 font-medium">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <AlertCircle size={12} />
                    {lead.proxima_tarefa.titulo} - Atrasada
                  </span>
                )
              } else if (venc <= fimHoje) {
                return (
                  <span className="flex items-center gap-1 text-green-600 font-medium">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <CalendarCheck size={12} />
                    {lead.proxima_tarefa.titulo} - Hoje
                  </span>
                )
              } else {
                return (
                  <span className="flex items-center gap-1 text-gray-500">
                    <span className="w-2 h-2 rounded-full bg-gray-400" />
                    <CalendarCheck size={12} />
                    {lead.proxima_tarefa.titulo}
                  </span>
                )
              }
            })() : (
              <span className="flex items-center gap-1 text-yellow-600">
                <span className="w-2 h-2 rounded-full bg-yellow-400" />
                <AlertCircle size={12} />
                Sem tarefa pendente
              </span>
            )}
          </div>

          {/* Responsável */}
          {lead.responsavel_nome && (
            <div className="mt-1 flex items-center gap-1 text-xs text-gray-400">
              <User size={11} />
              <span className="truncate">{lead.responsavel_nome}</span>
            </div>
          )}

          {/* Disparo counter */}
          {(lead.total_disparos || 0) > 0 && (
            <div className="mt-1 flex items-center gap-1 text-xs text-amber-600">
              <Send size={11} />
              <span>{lead.total_disparos}x disparado</span>
              {lead.ultimo_estagio_disparo && (
                <span className="text-amber-400 truncate">· {lead.ultimo_estagio_disparo}</span>
              )}
            </div>
          )}

          {/* WhatsApp status indicator */}
          {lead.contato_whatsapp_id && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs">
              {hasUnread ? (
                <span className="flex items-center gap-1 text-green-600 font-medium">
                  <MessageCircle size={12} className="fill-green-500 text-green-500" />
                  {unreadCount} {unreadCount === 1 ? 'nova mensagem' : 'novas mensagens'}
                </span>
              ) : isWaiting ? (
                <span className="flex items-center gap-1 text-yellow-600">
                  <Clock size={12} />
                  Aguardando resposta
                </span>
              ) : respostaRecente ? (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle size={12} />
                  Cliente respondeu
                </span>
              ) : (
                <span className="flex items-center gap-1 text-gray-400">
                  <MessageCircle size={12} />
                  WhatsApp conectado
                </span>
              )}
            </div>
          )}

          {/* Linha de status: agente IA + follow-up */}
          {(agenteAtivo || (lead.followup_pendente_count ?? 0) > 0) && (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              {/* Agente IA ativo */}
              {agenteAtivo && !lead.contato_whatsapp_id && (
                <span
                  className="flex items-center gap-1 text-xs text-amber-600 font-medium"
                  title="Agente ativo mas lead sem contato WhatsApp vinculado — não recebe nem envia mensagens"
                >
                  <AlertCircle size={11} />
                  IA ativa · sem WA
                </span>
              )}
              {agenteAtivo && lead.contato_whatsapp_id && (
                <span className="flex items-center gap-1 text-xs text-primary-600 font-medium">
                  <Bot size={11} className="text-primary-500" />
                  IA ativa
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary-500" />
                  </span>
                </span>
              )}
              {/* Follow-up agendado */}
              {(lead.followup_pendente_count ?? 0) > 0 && (() => {
                const isAtrasado = lead.proximo_followup_at
                  ? new Date(lead.proximo_followup_at) < new Date()
                  : false
                return (
                  <span className={`flex items-center gap-1 text-xs ${isAtrasado ? 'text-red-600' : 'text-orange-600'}`}>
                    <Bell size={11} className={isAtrasado ? 'fill-red-100' : 'fill-orange-100'} />
                    {lead.followup_pendente_count === 1
                      ? '1 follow-up'
                      : `${lead.followup_pendente_count} follow-ups`}
                    {isAtrasado && <span className="font-semibold">· atrasado</span>}
                    {!isAtrasado && lead.proximo_followup_at && (
                      <span className="text-orange-400">
                        · {new Date(lead.proximo_followup_at).toLocaleString('pt-BR', {
                            day: '2-digit', month: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                            timeZone: 'America/Sao_Paulo'
                          })}
                      </span>
                    )}
                  </span>
                )
              })()}
            </div>
          )}
        </div>
      )}
    </Draggable>
  )
}
