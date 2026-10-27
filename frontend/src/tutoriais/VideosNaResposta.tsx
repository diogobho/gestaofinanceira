import { Play } from 'lucide-react'
import { useVideoAjuda } from './VideoAjuda'
import { duracaoLegivel } from './catalogo'

/**
 * O Duo do chat indica um tutorial escrevendo `[[video:<id>]]` na resposta (o
 * prompt lista os ids — `chat-financeiro.service.ts`). Aqui o marcador sai do
 * texto e vira um botão que abre o vídeo no player do canto, ao lado do chat.
 * Id que não existe, ou que não vale para o canal da conta, simplesmente some.
 */

const MARCADOR = /\[\[\s*video\s*:\s*([a-z0-9-]+)\s*\]\]/gi

export function separarVideos(texto: string): { texto: string; ids: string[] } {
  const ids: string[] = []
  const limpo = texto.replace(MARCADOR, (_, id: string) => { if (!ids.includes(id)) ids.push(id); return '' })
  return { texto: limpo.replace(/\n{3,}/g, '\n\n').trim(), ids }
}

export function BotoesDeVideo({ ids }: { ids: string[] }) {
  const { videoDe, abrirVideo } = useVideoAjuda()
  const videos = ids.map(id => videoDe(id)).filter((v): v is NonNullable<typeof v> => !!v)
  if (!videos.length) return null
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {videos.map(v => (
        <button
          key={v.id}
          type="button"
          onClick={() => abrirVideo(v.id, 'chat')}
          className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50 p-1.5 pr-3 text-left transition-colors hover:border-primary-400 hover:bg-primary-50 dark:border-gray-600 dark:bg-gray-700/50 dark:hover:bg-gray-700"
        >
          <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-[#F1E9DA]">
            <img src="/gestao/avatar/lena-face.svg" alt="" className="h-full w-full" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">{v.titulo}</span>
            <span className="block text-[11px] text-gray-500 dark:text-gray-400">Vídeo · {duracaoLegivel(v.duracao)}</span>
          </span>
          <Play className="h-4 w-4 shrink-0 fill-current text-primary-600 dark:text-primary-300" />
        </button>
      ))}
    </div>
  )
}
