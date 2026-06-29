import { useState } from 'react'
import React from 'react'
import { X, Bell, Clock, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { useAllFollowups, useReagendarFollowup, useCancelarFollowup } from '@/hooks/useCRM'
import type { Followup } from '@/api/crm'

interface FollowupAgendaProps {
  onClose: () => void
}

type Filtro = 'hoje' | 'semana' | 'atrasados' | 'todos'

const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'hoje', label: 'Hoje' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'atrasados', label: 'Atrasados' },
  { key: 'todos', label: 'Todos pendentes' },
]

const STATUS_ICON: Record<string, React.ReactElement> = {
  pendente: <Clock size={13} className="text-orange-500" />,
  enviado: <CheckCircle size={13} className="text-green-500" />,
  falhou: <AlertCircle size={13} className="text-red-500" />,
  cancelado: <XCircle size={13} className="text-gray-400" />,
}

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

function FollowupRow({ followup, onReagendar }: { followup: Followup; onReagendar: (f: Followup) => void }) {
  const cancelar = useCancelarFollowup()
  const isAtrasado = followup.status === 'pendente' && new Date(followup.agendado_para) < new Date()

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${
      isAtrasado ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-white'
    }`}>
      <div className="mt-0.5">{STATUS_ICON[followup.status]}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-gray-900 truncate">
            {followup.lead_nome || `Lead #${followup.lead_id}`}
          </span>
          {followup.estagio_nome && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full text-white"
              style={{ backgroundColor: followup.estagio_cor || '#6366f1' }}
            >
              {followup.estagio_nome}
            </span>
          )}
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
            followup.tipo === 'agente_ia'
              ? 'bg-primary-100 text-primary-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {followup.tipo === 'agente_ia' ? 'Agente IA' : 'Manual'}
          </span>
          {followup.origem === 'estagio' && (
            <span className="text-xs text-orange-500">(estágio)</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={`text-xs ${isAtrasado ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
            {formatarData(followup.agendado_para)}
            {isAtrasado && ' · atrasado'}
          </span>
          {followup.hora_inicio && (
            <span className="text-xs text-gray-400">
              janela: {followup.hora_inicio}{followup.hora_fim ? `–${followup.hora_fim}` : ''}
            </span>
          )}
          {followup.usuario_nome && (
            <span className="text-xs text-gray-400">por {followup.usuario_nome}</span>
          )}
        </div>
        {followup.erro && (
          <p className="text-xs text-red-500 mt-0.5 truncate">{followup.erro}</p>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {(followup.status === 'falhou' || followup.status === 'cancelado') && (
          <button
            onClick={() => onReagendar(followup)}
            className="p-1 text-orange-500 hover:bg-orange-50 rounded"
            title="Reagendar"
          >
            <RefreshCw size={13} />
          </button>
        )}
        {followup.status === 'pendente' && (
          <button
            onClick={() => cancelar.mutate({ id: followup.id, leadId: followup.lead_id })}
            disabled={cancelar.isPending}
            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
            title="Cancelar"
          >
            <XCircle size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

export default function FollowupAgenda({ onClose }: FollowupAgendaProps) {
  const [filtro, setFiltro] = useState<Filtro>('hoje')
  const [reagendarModal, setReagendarModal] = useState<Followup | null>(null)
  const [novaData, setNovaData] = useState('')
  const [novaHora, setNovaHora] = useState('09:00')

  const { data: followups = [], isLoading, refetch } = useAllFollowups(filtro)
  const reagendar = useReagendarFollowup()

  const handleReagendar = async () => {
    if (!reagendarModal || !novaData || !novaHora) return
    const agendado_para = new Date(`${novaData}T${novaHora}:00`).toISOString()
    await reagendar.mutateAsync({ id: reagendarModal.id, agendado_para })
    setReagendarModal(null)
    setNovaData('')
    setNovaHora('09:00')
    refetch()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-orange-500" />
            <h2 className="text-lg font-semibold text-gray-800">Agenda de Follow-ups</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
              title="Atualizar"
            >
              <RefreshCw size={16} />
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <X size={18} className="text-gray-500" />
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex gap-1 p-3 border-b bg-gray-50">
          {FILTROS.map(f => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filtro === f.key
                  ? 'bg-orange-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <RefreshCw size={20} className="animate-spin mr-2" /> Carregando...
            </div>
          ) : followups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Bell size={32} className="mb-2 opacity-30" />
              <p className="text-sm">Nenhum follow-up encontrado</p>
            </div>
          ) : (
            followups.map(f => (
              <FollowupRow
                key={f.id}
                followup={f}
                onReagendar={(fu) => {
                  setReagendarModal(fu)
                  const d = new Date(fu.agendado_para)
                  setNovaData(d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))
                  setNovaHora(d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }))
                }}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t bg-gray-50 text-xs text-gray-400 text-right">
          {followups.length} follow-up{followups.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Modal reagendar */}
      {reagendarModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl shadow-xl w-80 p-5 space-y-4">
            <h3 className="font-semibold text-gray-800">Reagendar follow-up</h3>
            <p className="text-sm text-gray-600">
              Lead: <strong>{reagendarModal.lead_nome || `#${reagendarModal.lead_id}`}</strong>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={novaData}
                onChange={(e) => setNovaData(e.target.value)}
                className="px-2 py-1.5 border rounded text-sm focus:ring-2 focus:ring-orange-400"
              />
              <input
                type="time"
                value={novaHora}
                onChange={(e) => setNovaHora(e.target.value)}
                className="px-2 py-1.5 border rounded text-sm focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setReagendarModal(null)}
                className="flex-1 px-3 py-2 border rounded text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleReagendar}
                disabled={!novaData || !novaHora || reagendar.isPending}
                className="flex-1 px-3 py-2 bg-orange-500 text-white rounded text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
              >
                {reagendar.isPending ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
