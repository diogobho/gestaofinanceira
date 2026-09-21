import { Check, CheckCheck, AlertCircle, ImageOff } from 'lucide-react'
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

const MIDIA_EXPIRADA: Record<string, string> = {
  imagem: 'Imagem não está mais guardada', audio: 'Áudio não está mais guardado',
  video: 'Vídeo não está mais guardado', documento: 'Documento não está mais guardado',
  sticker: 'Figurinha não está mais guardada',
}

export default function ChatBubble({ mensagem }: ChatBubbleProps) {
  const isSaida = mensagem.direcao === 'saida'
  // Arquivo apagado pela cota de mídia da conta (migration 076): a mensagem fica,
  // o balão diz o que era — sem isso ficaria um <img> quebrado.
  const midiaExpirada = !!mensagem.midia_expirada_em && mensagem.tipo !== 'texto'
  const hasMedia = mensagem.media_url && mensagem.tipo !== 'texto' && !midiaExpirada
  const hasError = !!mensagem.erro

  return (
    <div className={`flex ${isSaida ? 'justify-end' : 'justify-start'} mb-1`}>
      <div
        className={`
          max-w-[min(75%,36rem)] rounded-lg px-3 py-2 shadow-sm
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
        {midiaExpirada && (
          <div title="A conta guarda a mídia mais recente das conversas; a mais antiga é apagada para caber no limite.">
            <p className="flex items-center gap-1.5 text-xs italic text-gray-500 dark:text-gray-400">
              <ImageOff size={13} className="shrink-0" />
              {MIDIA_EXPIRADA[mensagem.tipo] || 'Mídia não está mais guardada'}
            </p>
            {mensagem.conteudo && <p className="text-sm mt-1 whitespace-pre-wrap break-words">{mensagem.conteudo}</p>}
          </div>
        )}

        {/* Texto (tipo texto ou caption sem media) */}
        {mensagem.tipo === 'texto' && (
          <p className="text-sm whitespace-pre-wrap break-words">
            {mensagem.conteudo || <span className="italic text-gray-400 dark:text-gray-500">[mensagem]</span>}
          </p>
        )}

        {/* Erro */}
        {hasError && (
          <div className="flex items-start gap-1 mt-1 text-xs text-red-600 dark:text-red-400" title={mensagem.erro || undefined}>
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            {/* O motivo é o que diz ao operador o que fazer (janela de 24h fechada,
                número sem WhatsApp, marketing segurado pela Meta…). */}
            <span>{mensagem.erro ? `Não enviada: ${mensagem.erro}` : 'Falha no envio'}</span>
          </div>
        )}

        {/* Hora + Status */}
        <div className={`flex items-center gap-1 mt-1 ${isSaida ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[10px] text-gray-500 dark:text-gray-400">{formatTime(mensagem.enviado_at)}</span>
          {isSaida && !hasError && (
            mensagem.lido_at
              ? <CheckCheck size={12} className="text-blue-500 dark:text-blue-400" aria-label="Lida" />
              : mensagem.entregue_at
                ? <CheckCheck size={12} className="text-gray-400 dark:text-gray-500" aria-label="Entregue" />
                : <Check size={12} className="text-gray-400 dark:text-gray-500" aria-label="Enviada" />
          )}
        </div>
      </div>
    </div>
  )
}
