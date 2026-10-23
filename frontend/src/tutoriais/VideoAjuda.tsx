import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, ChevronDown, ChevronUp, Maximize2, Minimize2, Pause, Play, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  resolverVideo, useCanalDaConta, useCatalogoTutoriais,
  type RefVideo, type VideoTutorial,
} from './catalogo'
import './videoAjuda.css'

/**
 * Ajuda em vídeo dentro da própria tela (aprovado em 04/10/2026 a partir do
 * protótipo "Ajuda em vídeo no Duo").
 *
 * Três portas, um player só:
 * - a dica no botão da ação (`DicaVideo`, hover/foco de quem tem mouse);
 * - o Duo do chat, que responde com o vídeo (`[[video:<id>]]` na resposta);
 * - o Duo oferecendo sozinho, depois de um sinal de dificuldade
 *   (`sinalizarDificuldade`, ex.: fechou a importação sem importar).
 *
 * O player é uma janela no canto, não um modal: a pessoa assiste e faz junto, com
 * a tela livre. Quem narra os vídeos é a Lena (a voz é feminina), por isso é o
 * rosto dela no player; o Duo é quem oferece e "entrega" o vídeo. As duas
 * personagens nunca se mexem ao mesmo tempo.
 *
 * O que fica guardado é conveniência de quem está vendo, no navegador: vídeos já
 * vistos (a dica some), dicas dispensadas e ofertas recusadas. Perder isso só faz
 * a dica reaparecer — nada de regra de negócio depende dele.
 */

type Origem = 'dica' | 'chat' | 'oferta' | 'lista'

interface VideoAjudaValor {
  abrirVideo: (ref: RefVideo, origem?: Origem) => boolean
  fecharVideo: () => void
  /** Há vídeo para esta referência, nesta conta? */
  videoDe: (ref: RefVideo) => VideoTutorial | null
  jaViu: (id: string) => boolean
  dicaDesligada: (id: string) => boolean
  desligarDica: (id: string) => void
  /** A pessoa mostrou dificuldade com algo que tem vídeo: o Duo pode oferecer. */
  sinalizarDificuldade: (ref: RefVideo, frase: string) => void
  /** O painel do chat do Duo está aberto (o player abre ao lado dele). */
  setChatAberto: (aberto: boolean) => void
}

const Ctx = createContext<VideoAjudaValor | null>(null)

// Sem provedor (telas fora do Layout, como o login): nada a oferecer, nada quebra.
const NULO: VideoAjudaValor = {
  abrirVideo: () => false, fecharVideo: () => {}, videoDe: () => null, jaViu: () => false,
  dicaDesligada: () => true, desligarDica: () => {}, sinalizarDificuldade: () => {}, setChatAberto: () => {},
}

export const useVideoAjuda = () => useContext(Ctx) ?? NULO

const LENA = '/gestao/avatar/lena-face.svg'
const DUO = '/gestao/avatar/duo-face.svg'
const OFERTA_NA_SESSAO = 'tutoriais_oferta_sessao'
/** Depois disso a oferta some sozinha — ignorar não é recusar. */
const OFERTA_DURA_MS = 20_000

function lerLista(chave: string): string[] {
  try { return JSON.parse(localStorage.getItem(chave) || '[]') } catch { return [] }
}
function gravarLista(chave: string, lista: string[]) {
  try { localStorage.setItem(chave, JSON.stringify(lista.slice(-200))) } catch { /* só não lembra */ }
}

export const VideoAjudaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth()
  const uid = user?.id ?? 'anon'
  const { data: videos = [] } = useCatalogoTutoriais()
  const canal = useCanalDaConta()

  const chave = useCallback((tipo: string) => `tutoriais_${tipo}_${uid}`, [uid])
  const [vistos, setVistos] = useState<string[]>([])
  const [dicasOff, setDicasOff] = useState<string[]>([])
  useEffect(() => {
    setVistos(lerLista(chave('vistos')))
    setDicasOff(lerLista(chave('dica_off')))
  }, [chave])

  const [aberto, setAberto] = useState<{ video: VideoTutorial; origem: Origem } | null>(null)
  const [grande, setGrande] = useState(false)
  const [duoComenta, setDuoComenta] = useState(false)
  const [chatAberto, setChatAberto] = useState(false)
  const [oferta, setOferta] = useState<{ video: VideoTutorial; frase: string } | null>(null)
  const tComenta = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const tOferta = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const videoDe = useCallback((ref: RefVideo) => resolverVideo(ref, canal, videos), [canal, videos])

  const abrirVideo = useCallback((ref: RefVideo, origem: Origem = 'lista') => {
    const video = videoDe(ref)
    if (!video) return false
    clearTimeout(tOferta.current)
    setOferta(null)
    setAberto({ video, origem })
    // Da lista do Suporte a pessoa veio para assistir: já abre grande.
    setGrande(origem === 'lista')
    setVistos(v => {
      if (v.includes(video.id)) return v
      const nova = [...v, video.id]
      gravarLista(chave('vistos'), nova)
      return nova
    })
    // O Duo "entrega" o vídeo e sai. Pela lista do Suporte não (a pessoa já foi
    // buscar o vídeo) nem pelo chat (o Duo já está ali, no painel ao lado).
    clearTimeout(tComenta.current)
    setDuoComenta(origem === 'dica' || origem === 'oferta')
    tComenta.current = setTimeout(() => setDuoComenta(false), 4500)
    return true
  }, [videoDe, chave])

  const fecharVideo = useCallback(() => {
    clearTimeout(tComenta.current)
    setAberto(null); setGrande(false); setDuoComenta(false)
  }, [])

  const desligarDica = useCallback((id: string) => {
    setDicasOff(v => {
      const nova = v.includes(id) ? v : [...v, id]
      gravarLista(chave('dica_off'), nova)
      return nova
    })
  }, [chave])

  const sinalizarDificuldade = useCallback((ref: RefVideo, frase: string) => {
    const video = videoDe(ref)
    if (!video || vistos.includes(video.id) || aberto) return
    if (lerLista(chave('oferta_recusada')).includes(video.id)) return
    // Uma oferta por sessão, no máximo: ajuda que aparece toda hora vira ruído.
    try { if (sessionStorage.getItem(OFERTA_NA_SESSAO)) return; sessionStorage.setItem(OFERTA_NA_SESSAO, '1') } catch { /* segue */ }
    clearTimeout(tOferta.current)
    // Um respiro depois do fechamento do modal, para não parecer que o Duo pulou na frente.
    tOferta.current = setTimeout(() => {
      setOferta({ video, frase })
      tOferta.current = setTimeout(() => setOferta(null), OFERTA_DURA_MS)
    }, 1200)
  }, [videoDe, vistos, aberto, chave])

  const recusarOferta = useCallback(() => {
    if (oferta) gravarLista(chave('oferta_recusada'), [...lerLista(chave('oferta_recusada')), oferta.video.id])
    clearTimeout(tOferta.current)
    setOferta(null)
  }, [oferta, chave])

  useEffect(() => () => { clearTimeout(tComenta.current); clearTimeout(tOferta.current) }, [])

  // Esc fecha o player — mas, com o chat aberto, o Esc é dele.
  useEffect(() => {
    if (!aberto || chatAberto) return
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') fecharVideo() }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aberto, chatAberto, fecharVideo])

  const valor = useMemo<VideoAjudaValor>(() => ({
    abrirVideo, fecharVideo, videoDe,
    jaViu: (id) => vistos.includes(id),
    dicaDesligada: (id) => dicasOff.includes(id),
    desligarDica, sinalizarDificuldade, setChatAberto,
  }), [abrirVideo, fecharVideo, videoDe, vistos, dicasOff, desligarDica, sinalizarDificuldade])

  return (
    <Ctx.Provider value={valor}>
      {children}
      {aberto && (
        <MiniPlayer
          video={aberto.video}
          grande={grande}
          aoLadoDoChat={chatAberto}
          duoComenta={duoComenta}
          onAlternarTamanho={() => setGrande(g => !g)}
          onFechar={fecharVideo}
        />
      )}
      {oferta && !aberto && !chatAberto && (
        <OfertaDoDuo
          frase={oferta.frase}
          onVer={() => abrirVideo(oferta.video.id, 'oferta')}
          onRecusar={recusarOferta}
        />
      )}
    </Ctx.Provider>
  )
}

function MiniPlayer({ video, grande, aoLadoDoChat, duoComenta, onAlternarTamanho, onFechar }: {
  video: VideoTutorial
  grande: boolean
  aoLadoDoChat: boolean
  duoComenta: boolean
  onAlternarTamanho: () => void
  onFechar: () => void
}) {
  // Minimizado: o vídeo segue tocando (o elemento não desmonta, só some) e o
  // player vira uma faixa com o título — para quando ele cobre o que a pessoa está
  // preenchendo, como o card do lead, que é um modal largo.
  const [minimizado, setMinimizado] = useState(false)
  const [tocando, setTocando] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => { setMinimizado(false) }, [video.id])
  const alternarPlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => {}); else v.pause()
  }
  const botao = 'grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-[#E5DDD1] hover:bg-white/20'
  // Lado da tela, escolhido pela pessoa e lembrado: nenhuma posição fixa serve a
  // todas as telas (no card do lead, o canto direito é o do botão Enviar).
  const [lado, setLado] = useState<'direita' | 'esquerda'>(() => {
    try { return localStorage.getItem('tutoriais_lado') === 'esquerda' ? 'esquerda' : 'direita' } catch { return 'direita' }
  })
  const trocarLado = () => setLado(l => {
    const novo = l === 'direita' ? 'esquerda' : 'direita'
    try { localStorage.setItem('tutoriais_lado', novo) } catch { /* só não lembra */ }
    return novo
  })
  // Aberto: acima do lançador do Duo (ou à esquerda do painel do chat). Minimizado:
  // desce para a linha do lançador, longe dos botões de formulário.
  const posicao = lado === 'esquerda'
    ? 'sm:bottom-6 sm:left-4 sm:flex-row-reverse'
    : aoLadoDoChat
      ? 'sm:bottom-6 sm:right-[calc(380px+2.5rem)]'
      : minimizado ? 'sm:bottom-6 sm:right-[5.5rem]' : 'sm:bottom-24 sm:right-4'

  return (
    <div className={`fixed inset-x-3 bottom-[5.5rem] z-50 flex items-end gap-2.5 sm:inset-x-auto ${lado === 'esquerda' ? 'justify-start' : 'justify-end'} ${posicao}`}>
      {duoComenta && !minimizado && (
        <div className="video-ajuda-peek mb-2 hidden flex-col items-end gap-1.5 sm:flex" aria-hidden="true">
          <div className="max-w-[200px] rounded-2xl rounded-br-sm border border-gray-200 bg-white px-3 py-2 text-[13px] leading-snug text-gray-800 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
            Pode ir fazendo junto. Se o vídeo atrapalhar, é só minimizar.
          </div>
          <div className="h-12 w-12 overflow-hidden rounded-full border-2 border-brand-navy bg-[#F1E9DA] shadow-md">
            <img src={DUO} alt="" className="h-full w-full" />
          </div>
        </div>
      )}
      <section
        aria-label={`Vídeo-tutorial: ${video.titulo}`}
        className={`video-ajuda-mini w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0a162f] shadow-2xl ${minimizado ? 'sm:w-[320px]' : grande ? 'sm:w-[640px]' : 'sm:w-[380px]'}`}
      >
        <div className="flex items-center gap-2.5 py-2 pl-3 pr-2">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-[#F1E9DA]">
            <img src={LENA} alt="" className="h-full w-full" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#D2B773]">Lena explica</p>
            <p className="truncate text-[13px] font-semibold text-white" title={video.titulo}>{video.titulo}</p>
          </div>
          {minimizado ? (
            <>
              <button type="button" onClick={alternarPlay} aria-label={tocando ? 'Pausar vídeo' : 'Continuar vídeo'} title={tocando ? 'Pausar' : 'Continuar'} className={botao}>
                {tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button type="button" onClick={() => setMinimizado(false)} aria-label="Mostrar o vídeo" title="Mostrar o vídeo" className={botao}>
                <ChevronUp className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setMinimizado(true)} aria-label="Minimizar vídeo" title="Minimizar (o vídeo continua)" className={botao}>
                <ChevronDown className="h-4 w-4" />
              </button>
              <button type="button" onClick={trocarLado}
                aria-label={lado === 'direita' ? 'Levar o vídeo para a esquerda' : 'Levar o vídeo para a direita'}
                title={lado === 'direita' ? 'Levar para a esquerda' : 'Levar para a direita'}
                className={`${botao} hidden sm:grid`}>
                <ArrowLeftRight className="h-4 w-4" />
              </button>
              <button type="button" onClick={onAlternarTamanho}
                aria-label={grande ? 'Diminuir vídeo' : 'Ampliar vídeo'} title={grande ? 'Diminuir' : 'Ampliar'}
                className={`${botao} hidden sm:grid`}>
                {grande ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            </>
          )}
          <button type="button" onClick={onFechar} aria-label="Fechar vídeo" title="Fechar" className={botao}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className={minimizado ? 'hidden' : ''}>
          {/* A legenda já vem gravada na imagem; a faixa .vtt fica para leitores de tela. */}
          <video ref={videoRef} key={video.id} controls autoPlay playsInline preload="metadata" poster={video.capa}
            onPlay={() => setTocando(true)} onPause={() => setTocando(false)} className="block w-full bg-black">
            <source src={video.mp4} type="video/mp4" />
            <track kind="captions" srcLang="pt-BR" label="Português" src={video.legenda} />
          </video>
          <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-[#9FB0CC]">
            <span>Mais vídeos em Suporte → Tutoriais</span>
            <Link to="/suporte?aba=tutoriais" className="font-semibold text-[#D2B773] hover:underline">Ver todos</Link>
          </div>
        </div>
      </section>
    </div>
  )
}

function OfertaDoDuo({ frase, onVer, onRecusar }: { frase: string; onVer: () => void; onRecusar: () => void }) {
  return (
    <div role="status" className="video-ajuda-balao fixed bottom-[calc(max(1rem,env(safe-area-inset-bottom))+4.25rem)] right-4 z-40 w-[min(280px,calc(100vw-2rem))] rounded-2xl rounded-br-sm border border-gray-200 bg-white p-3.5 shadow-xl dark:border-gray-700 dark:bg-gray-800 sm:bottom-[6.5rem]">
      <p className="text-sm leading-snug text-gray-800 dark:text-gray-100">{frase}</p>
      <div className="mt-2.5 flex gap-2">
        <button type="button" onClick={onVer}
          className="rounded-lg bg-brand-navy px-3 py-2 text-[13px] font-semibold text-white hover:bg-brand-navy/90">
          Ver agora
        </button>
        <button type="button" onClick={onRecusar}
          className="rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
          Agora não
        </button>
      </div>
    </div>
  )
}
