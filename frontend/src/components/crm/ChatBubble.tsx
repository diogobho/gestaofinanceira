import { Check, CheckCheck, AlertCircle } from 'lucide-react'
import MediaPreview from './MediaPreview'
import type { HistoricoMensagem } from '@/types/crm'

interface ChatBubbleProps {
  mensagem: HistoricoMensagem
}

function formatTime(dateStr: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'Hoje'
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function ChatDateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center justify-center my-3">
      <span className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded-full">
        {formatDate(date)}
      </span>
    </div>
  )
}

export default function ChatBubble({ mensagem }: ChatBubbleProps) {
  const isSaida = mensagem.direcao === 'saida'
  const hasMedia = mensagem.media_url && mensagem.tipo !== 'texto'
  const hasError = !!mensagem.erro

  return (
    <div className={`flex ${isSaida ? 'justify-end' : 'justify-start'} mb-1`}>
      <div
        className={`
          max-w-[75%] rounded-lg px-3 py-2 shadow-sm
          ${isSaida
            ? hasError
              ? 'bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-200'
              : 'bg-green-100 dark:bg-primary-700 text-gray-900 dark:text-primary-50'
            : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600'
          }
        `}
      >
        {/* Media */}
        {hasMedia && <MediaPreview mensagem={mensagem} />}

        {/* Texto (tipo texto ou caption sem media) */}
        {mensagem.tipo === 'texto' && (
          <p className="text-sm whitespace-pre-wrap break-words">
            {mensagem.conteudo || <span className="italic text-gray-400 dark:text-gray-500">[mensagem]</span>}
          </p>
        )}

        {/* Erro */}
        {hasError && (
          <div className="flex items-center gap-1 mt-1 text-xs text-red-600 dark:text-red-400">
            <AlertCircle size={12} />
            <span>Falha no envio</span>
          </div>
        )}

        {/* Hora + Status */}
        <div className={`flex items-center gap-1 mt-1 ${isSaida ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[10px] text-gray-500 dark:text-gray-400">{formatTime(mensagem.enviado_at)}</span>
          {isSaida && !hasError && (
            mensagem.lido_at
              ? <CheckCheck size={12} className="text-blue-500 dark:text-blue-400" />
              : <Check size={12} className="text-gray-400 dark:text-gray-500" />
          )}
        </div>
      </div>
    </div>
  )
}
