import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ExternalLink, Play } from 'lucide-react'
import { EstadoVazio, Spinner } from '@/components/ui'
import {
  useCatalogoTutoriais, useCanalDaConta, duracaoLegivel, PAGINA_PUBLICA_TUTORIAIS, type VideoTutorial,
} from '@/tutoriais/catalogo'
import { useVideoAjuda } from '@/tutoriais/VideoAjuda'

/**
 * Vídeos-tutoriais, os mesmos da página pública /gestao-financeira/tutoriais.
 *
 * Catálogo e player são os da ajuda em vídeo (`src/tutoriais/`): o vídeo abre no
 * player do canto, já grande, e conta como visto — a dica daquele botão some.
 * O filtro começa no canal da conta: quem está no QR não vê, de cara, o passo a
 * passo do número oficial, e vice-versa.
 *
 * Link direto para um vídeo: /gestao/suporte?aba=tutoriais&video=<id>.
 */

type Filtro = 'meu' | 'todos'
const SELO: Record<string, string> = { qr: 'WhatsApp por QR Code', oficial: 'Número oficial' }

export function ListaTutoriais() {
  const meuCanal = useCanalDaConta()
  const { abrirVideo } = useVideoAjuda()
  const [filtro, setFiltro] = useState<Filtro>('meu')
  const [params, setParams] = useSearchParams()
  const abertoId = params.get('video')

  const { data: videos = [], isLoading, isError } = useCatalogoTutoriais()

  // O catálogo já vem na ordem dos temas; aqui só se agrupa, mantendo a ordem.
  const grupos = useMemo(() => {
    const lista: [string, VideoTutorial[]][] = []
    videos
      .filter(v => filtro === 'todos' || v.canal === 'todos' || v.canal === meuCanal)
      .forEach(v => {
        const tema = v.tema || 'Outros'
        const g = lista.find(([t]) => t === tema)
        if (g) g[1].push(v); else lista.push([tema, [v]])
      })
    return lista
  }, [videos, filtro, meuCanal])

  // Id exato nos dois canais: aqui a pessoa escolheu ESTE vídeo, mesmo sendo do outro canal.
  const abrir = (id: string) => abrirVideo({ qr: id, oficial: id }, 'lista')

  // Link direto (?video=<id>): abre uma vez, quando o catálogo chega, e sai da URL.
  const abriuDoLink = useRef(false)
  useEffect(() => {
    if (!abertoId || abriuDoLink.current || !videos.length) return
    abriuDoLink.current = true
    abrir(abertoId)
    const p = new URLSearchParams(params)
    p.delete('video')
    setParams(p, { replace: true })
  }, [abertoId, videos.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>
  if (isError) {
    return (
      <EstadoVazio avatar="duo" titulo="Não foi possível carregar os vídeos agora"
        descricao="Tente de novo em instantes. Se continuar, abra um chamado e avise a gente." />
    )
  }

  return (
    <div className="mt-4 space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Vídeos de um a dois minutos, com narração e legenda, mostrando cada tarefa na própria tela.
        </p>
        <div className="flex shrink-0 gap-1.5" role="group" aria-label="Quais vídeos mostrar">
          {([['meu', meuCanal === 'oficial' ? 'Do meu WhatsApp (oficial)' : 'Do meu WhatsApp (QR Code)'], ['todos', 'Todos']] as const).map(([k, rotulo]) => (
            <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${filtro === k
                ? 'border-primary-600 bg-primary-600 text-white dark:border-primary-400 dark:bg-primary-500'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'}`}>
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {grupos.length === 0 && <EstadoVazio avatar="duo" titulo="Nenhum vídeo ainda" />}

      {grupos.map(([tema, itens]) => (
        <section key={tema}>
          <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">{tema}</h2>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {itens.map(v => (
              <li key={v.id}>
                <button type="button" onClick={() => abrir(v.id)}
                  className="group w-full overflow-hidden rounded-xl border border-gray-200 bg-white text-left transition hover:border-primary-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-gray-700 dark:bg-gray-800">
                  <div className="relative">
                    <img src={v.capa} alt="" loading="lazy" className="block aspect-[1280/884] w-full object-cover" />
                    <span className="absolute inset-0 grid place-items-center bg-black/20 transition group-hover:bg-black/5">
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-white/90 text-primary-700 shadow">
                        <Play className="ml-0.5 h-5 w-5 fill-current" />
                      </span>
                    </span>
                    <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">{duracaoLegivel(v.duracao)}</span>
                  </div>
                  <div className="space-y-1 p-3">
                    <p className="text-sm font-semibold leading-snug text-gray-900 dark:text-white">{v.titulo}</p>
                    {SELO[v.canal] && (
                      <p className={`text-xs font-medium ${v.canal === 'oficial' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}`}>{SELO[v.canal]}</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Para mandar a alguém de fora do Duo, use a{' '}
        <a href={PAGINA_PUBLICA_TUTORIAIS} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary-600 hover:underline dark:text-primary-300">
          página pública dos tutoriais <ExternalLink className="h-3 w-3" />
        </a>
        . Não achou o que precisava? Abra um chamado.
      </p>

    </div>
  )
}
