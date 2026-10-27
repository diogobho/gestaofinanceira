import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useVideoAjuda } from './VideoAjuda'
import { duracaoLegivel, type RefVideo } from './catalogo'

/**
 * "Ver como funciona" no botão da ação. Envolve o botão sem mudar o visual dele.
 *
 * Sutil de propósito: só aparece depois de ~0,7s parado em cima (passar o mouse
 * de raspão não dispara), some de vez quando a pessoa assiste ou dispensa, e não
 * existe em tela de toque — lá o hover não existe, e o primeiro toque viraria
 * dica em vez de ação. Nem no foco por Tab: o balão vive num portal no fim do
 * <body>, e o Tab seguinte ia para o próximo botão sem nunca alcançá-lo (testado
 * em 05/10). Para teclado e celular ficam o `LinkVideo`, o Duo e Suporte → Tutoriais.
 *
 * O balão vai num portal com posição fixa: dentro de modal com rolagem um
 * `absolute` seria cortado pelo `overflow`.
 */

const ESPERA_MS = 700
const SAIDA_MS = 250
const LARGURA = 264

interface Props {
  video: RefVideo
  children: React.ReactElement
  /** De que lado o balão se alinha ao botão. */
  alinhar?: 'inicio' | 'fim'
  className?: string
}

/**
 * O `title` do botão abriria a dica nativa do navegador por cima do balão. Enquanto
 * a dica de vídeo vale, ele vira `aria-label` (o nome acessível continua o mesmo).
 * Só em elemento HTML: num componente (ex.: `BotaoDoPlano`) o `title` é dele.
 */
function semTitle(el: React.ReactElement) {
  const props = el.props as { title?: string; 'aria-label'?: string }
  if (typeof el.type !== 'string' || !props.title) return el
  return React.cloneElement(el as React.ReactElement<Record<string, unknown>>, { title: undefined, 'aria-label': props['aria-label'] ?? props.title })
}

const temMouse = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches

export function DicaVideo({ video, children, alinhar = 'fim', className }: Props) {
  const { videoDe, jaViu, dicaDesligada, desligarDica, abrirVideo } = useVideoAjuda()
  const alvo = videoDe(video)
  const ativa = !!alvo && !jaViu(alvo.id) && !dicaDesligada(alvo.id)

  const ref = useRef<HTMLSpanElement>(null)
  const balao = useRef<HTMLDivElement>(null)
  const tEntrar = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const tSair = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => () => { clearTimeout(tEntrar.current); clearTimeout(tSair.current) }, [])
  useEffect(() => { if (!ativa) setPos(null) }, [ativa])

  const mostrar = () => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const left = alinhar === 'fim' ? r.right - LARGURA : r.left
    setPos({ top: r.bottom + 10, left: Math.max(8, Math.min(left, window.innerWidth - LARGURA - 8)) })
  }
  const entrar = () => {
    if (!ativa) return
    clearTimeout(tSair.current)
    clearTimeout(tEntrar.current)
    tEntrar.current = setTimeout(mostrar, ESPERA_MS)
  }
  const sair = () => {
    clearTimeout(tEntrar.current)
    tSair.current = setTimeout(() => setPos(null), SAIDA_MS)
  }

  if (!ativa) return children

  return (
    <span
      ref={ref}
      className={className ?? 'inline-flex'}
      onMouseEnter={() => { if (temMouse()) entrar() }}
      onMouseLeave={sair}
      // Clicou na ação: a pessoa sabe o que quer, a dica sai do caminho. Na fase
      // de bolha e ignorando o próprio balão (que é filho no React, via portal): na
      // captura, o balão sumia antes de o clique chegar ao "Ver como funciona".
      onClick={(e) => {
        if (balao.current?.contains(e.target as Node)) return
        clearTimeout(tEntrar.current); setPos(null)
      }}
    >
      {semTitle(children)}
      {pos && alvo && createPortal(
        <div
          ref={balao}
          role="tooltip"
          className="video-ajuda-dica fixed z-[70] flex flex-col gap-1.5 rounded-xl bg-brand-navy p-2.5 text-white shadow-xl ring-1 ring-white/10"
          style={{ top: pos.top, left: pos.left, width: LARGURA }}
          onMouseEnter={() => clearTimeout(tSair.current)}
          onMouseLeave={sair}
        >
          <button
            type="button"
            onClick={() => { setPos(null); abrirVideo(alvo.id, 'dica') }}
            className="flex items-center gap-2.5 rounded-lg p-0.5 text-left hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D2B773]"
          >
            <span className="relative h-11 w-11 shrink-0">
              <span className="block h-11 w-11 overflow-hidden rounded-full bg-[#F1E9DA]">
                <img src="/gestao/avatar/lena-face.svg" alt="" className="h-full w-full" />
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 grid h-[18px] w-[18px] place-items-center rounded-full border-2 border-brand-navy bg-[#D2B773]">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="#13264C" aria-hidden="true"><path d="M6 4l14 8-14 8z" /></svg>
              </span>
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-bold">Ver como funciona</span>
              <span className="text-xs text-[#C9D2E3]">A Lena mostra em {duracaoLegivel(alvo.duracao)}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setPos(null); desligarDica(alvo.id) }}
            className="self-start rounded px-1 py-0.5 text-xs text-[#9FB0CC] underline hover:text-white"
          >
            Não mostrar de novo
          </button>
        </div>,
        document.body,
      )}
    </span>
  )
}
