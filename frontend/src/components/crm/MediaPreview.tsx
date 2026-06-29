import { FileText, Download } from 'lucide-react'
import type { HistoricoMensagem } from '@/types/crm'

interface MediaPreviewProps {
  mensagem: HistoricoMensagem
}

const API_BASE = import.meta.env.VITE_API_URL || ''

function getMediaUrl(path: string): string {
  if (path.startsWith('http')) return path
  return `${API_BASE}${path}`
}

export default function MediaPreview({ mensagem }: MediaPreviewProps) {
  if (!mensagem.media_url) return null

  const url = getMediaUrl(mensagem.media_url)

  switch (mensagem.tipo) {
    case 'imagem':
      return (
        <div className="max-w-[240px]">
          <img
            src={url}
            alt={mensagem.media_filename || 'Imagem'}
            className="rounded-lg max-w-full cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => window.open(url, '_blank')}
            loading="lazy"
          />
          {mensagem.conteudo && (
            <p className="text-sm mt-1">{mensagem.conteudo}</p>
          )}
        </div>
      )

    case 'audio':
      return (
        <div className="min-w-[200px]">
          <audio controls className="w-full max-w-[280px]" preload="none">
            <source src={url} type={mensagem.media_mimetype || 'audio/ogg'} />
            Seu navegador nao suporta audio.
          </audio>
        </div>
      )

    case 'video': {
      const isGif = mensagem.gifPlayback === true
      return (
        <div className="max-w-[280px]">
          {isGif ? (
            <img
              src={url}
              alt="GIF"
              className="rounded-lg w-full"
              loading="lazy"
            />
          ) : (
            <video controls className="rounded-lg w-full" preload="none">
              <source src={url} type={mensagem.media_mimetype || 'video/mp4'} />
            </video>
          )}
          {mensagem.conteudo && (
            <p className="text-sm mt-1">{mensagem.conteudo}</p>
          )}
        </div>
      )
    }

    case 'documento':
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 p-2 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-colors min-w-[180px]"
        >
          <FileText size={28} className="flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {mensagem.media_filename || 'Documento'}
            </p>
            {mensagem.media_tamanho && (
              <p className="text-xs opacity-75">
                {(mensagem.media_tamanho / 1024).toFixed(0)} KB
              </p>
            )}
          </div>
          <Download size={16} className="flex-shrink-0" />
        </a>
      )

    case 'sticker':
      return (
        <img
          src={url}
          alt="Sticker"
          className="max-w-[160px] rounded-lg"
          loading="lazy"
        />
      )

    default:
      return (
        <div className="flex items-center gap-2 p-2 bg-white bg-opacity-20 rounded-lg">
          <FileText size={20} />
          <span className="text-sm">{mensagem.media_filename || `[${mensagem.tipo}]`}</span>
        </div>
      )
  }
}
