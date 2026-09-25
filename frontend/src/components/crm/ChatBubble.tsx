import { useEffect, useRef, useState } from 'react'
import { Check, CheckCheck, AlertCircle, ImageOff, Reply, SmilePlus } from 'lucide-react'
import MediaPreview from './MediaPreview'
import type { HistoricoMensagem } from '@/types/crm'
import { REACOES_RAPIDAS, trechoDaMensagem } from '@/utils/mensagemChat'

interface ChatBubbleProps {
  mensagem: HistoricoMensagem
  /** Nome do lead — rótulo da citação quando a citada é dele. */
  nomeContato?: string
  /** Sem os dois handlers o balão é só leitura (ex.: telas sem envio). */
  onResponder?: (mensagem: HistoricoMensagem) => void
  onReagir?: (mensagem: HistoricoMensagem, emoji: string) => void
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

export default function ChatBubble({ mensagem, nomeContato, onResponder, onReagir }: ChatBubbleProps) {
  const isSaida = mensagem.direcao === 'saida'
  const [paletaAberta, setPaletaAberta] = useState(false)
  const paletaRef = useRef<HTMLDivElement>(null)
  // Reagir e citar precisam do id do WhatsApp; mensagem que falhou nunca saiu.
  const interativa = !!mensagem.whatsapp_message_id && !mensagem.erro && !!(onResponder || onReagir)

  useEffect(() => {
    if (!paletaAberta) return
    const fechar = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !paletaRef.current?.contains(e.target as Node)) {
        setPaletaAberta(false)
      }
    }
    document.addEventListener('mousedown', fechar)
    document.addEventListener('keydown', fechar)
    return () => {
      document.removeEventListener('mousedown', fechar)
      document.removeEventListener('keydown', fechar)
    }
  }, [paletaAberta])

  const reagir = (emoji: string) => {
    setPaletaAberta(false)
    // Tocar na reação que já é sua desfaz, como no WhatsApp.
    onReagir?.(mensagem, emoji === mensagem.reacao_minha ? '' : emoji)
  }
  const reacoes = [
    mensagem.reacao_contato && { emoji: mensagem.reacao_contato, titulo: `Reação de ${nomeContato || 'o lead'}` },
    mensagem.reacao_minha && { emoji: mensagem.reacao_minha, titulo: 'Sua reação — clique para remover' },
  ].filter(Boolean) as { emoji: string; titulo: string }[]
  // Arquivo apagado pela cota de mídia da conta (migration 076): a mensagem fica,
  // o balão diz o que era — sem isso ficaria um <img> quebrado.
  const midiaExpirada = !!mensagem.midia_expirada_em && mensagem.tipo !== 'texto'
  const hasMedia = mensagem.media_url && mensagem.tipo !== 'texto' && !midiaExpirada
  const hasError = !!mensagem.erro

  return (
    <div className={`group flex items-center gap-1 ${isSaida ? 'justify-end' : 'justify-start'} ${reacoes.length ? 'mb-4' : 'mb-1'}`}>
      {/* Ações ficam do lado de dentro da conversa: à esquerda do balão enviado,
          à direita do recebido. Aparecem no hover/foco; em tela de toque, sempre. */}
      {interativa && (
        <div
          ref={paletaRef}
          className={`relative flex shrink-0 items-center gap-0.5 transition-opacity ${isSaida ? 'order-first' : 'order-last'} ${
            paletaAberta ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100'
          }`}
        >
          {onResponder && (
            <button
              type="button"
              onClick={() => onResponder(mensagem)}
              className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              title="Responder"
              aria-label="Responder a esta mensagem"
            >
              <Reply size={15} />
            </button>
          )}
          {onReagir && (
            <button
              type="button"
              onClick={() => setPaletaAberta(v => !v)}
              className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              title="Reagir"
              aria-label="Reagir a esta mensagem"
              aria-expanded={paletaAberta}
            >
              <SmilePlus size={15} />
            </button>
          )}
          {paletaAberta && (
            <div
              role="menu"
              className={`absolute bottom-full z-20 mb-1 flex gap-0.5 rounded-full border border-gray-200 bg-white px-1.5 py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800 ${
                isSaida ? 'right-0' : 'left-0'
              }`}
            >
              {REACOES_RAPIDAS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  role="menuitem"
                  onClick={() => reagir(emoji)}
                  className={`rounded-full px-1 text-xl leading-8 transition-transform hover:scale-125 ${
                    mensagem.reacao_minha === emoji ? 'bg-gray-100 dark:bg-gray-700' : ''
                  }`}
                  aria-label={mensagem.reacao_minha === emoji ? `Remover ${emoji}` : `Reagir com ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div
        className={`
          relative max-w-[min(75%,36rem)] rounded-lg px-3 py-2 shadow-sm
          ${isSaida
            ? hasError
              ? 'bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-200'
              : 'bg-green-100 dark:bg-primary-700 text-gray-900 dark:text-primary-50'
            : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600'
          }
        `}
      >
        {/* Citação: a mensagem que esta responde */}
        {mensagem.resposta_a_message_id && (
          <div className={`mb-1.5 rounded border-l-4 px-2 py-1 text-xs ${
            mensagem.citada_direcao === 'saida' ? 'border-green-500' : 'border-primary-400'
          } bg-black/5 dark:bg-white/10`}>
            <p className="font-semibold text-gray-700 dark:text-gray-200">
              {mensagem.citada_direcao === 'saida' ? 'Você' : mensagem.citada_direcao ? (nomeContato || 'Lead') : 'Resposta'}
            </p>
            <p className="line-clamp-2 text-gray-600 dark:text-gray-300">
              {mensagem.citada_direcao
                ? trechoDaMensagem(mensagem.citada_conteudo, mensagem.citada_tipo)
                : <span className="italic">a uma mensagem anterior ao CRM</span>}
            </p>
          </div>
        )}

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

        {/* Reações: presas na borda de baixo do balão, como no WhatsApp */}
        {reacoes.length > 0 && (
          <div className={`absolute -bottom-3.5 flex gap-0.5 ${isSaida ? 'right-2' : 'left-2'}`}>
            {reacoes.map((r, i) => {
              const minha = i === reacoes.length - 1 && !!mensagem.reacao_minha && r.emoji === mensagem.reacao_minha
              const classe = 'rounded-full border border-gray-200 bg-white px-1.5 text-sm leading-6 shadow-sm dark:border-gray-600 dark:bg-gray-800'
              return minha && onReagir ? (
                <button key={i} type="button" onClick={() => reagir(r.emoji)} title={r.titulo} aria-label={r.titulo} className={`${classe} hover:bg-gray-100 dark:hover:bg-gray-700`}>
                  {r.emoji}
                </button>
              ) : (
                <span key={i} title={r.titulo} aria-label={r.titulo} className={classe}>{r.emoji}</span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
