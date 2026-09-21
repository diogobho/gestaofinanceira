import { useCallback, useEffect, useRef, useState } from 'react'
import duoFaceSvg from '@/assets/avatar/duo-face.svg?raw'
import './duo.css'

/**
 * Rosto do Duo, inline no DOM.
 *
 * É inline (e não `<img src="duo.svg">`) porque só assim o CSS e o JS da página
 * alcançam as peças de dentro do SVG — sem isso não há olhar que siga o ponteiro
 * nem piscadela. O arquivo carregado é o ESTÁTICO: o `-anim.svg` traz um
 * `<style>` com `@media (prefers-reduced-motion){ * { animation:none } }`, que
 * inline viraria regra global e desligaria a animação do app inteiro.
 *
 * O recorte (`viewBox="92 180 216 210"`) é o rosto. O Duo de corpo inteiro tem
 * pernas, sombra e o braço da peça — a 56px isso vira borrão. Para tamanhos
 * grandes, use o corpo inteiro animado via <img src="/gestao/avatar/duo-anim.svg">.
 */

interface DuoFaceProps {
  /** Segue o ponteiro pela tela inteira, pisca o olho e reage ao hover. */
  interativo?: boolean
  /** Dispara o pulo de fora (ex.: enquanto o Duo está "pensando"). */
  ativo?: boolean
  className?: string
  /** Texto para leitor de tela. `null` marca como decorativo. */
  titulo?: string | null
}

/**
 * Deslocamento máximo da pupila, em unidades do viewBox — um por eixo, porque o
 * olho é uma elipse (rx 26, ry 28) e sobra mais folga na vertical.
 *
 * Conta: branco útil rx 24 / ry 26 (o traço de 4 fica metade para dentro), íris
 * r 13,5, e a íris nasce deslocada (+4,+4) do centro do olho. Isso deixaria só
 * 6,5 para a direita — por isso o grupo das pupilas é recortado por
 * `#d3-eyes` no SVG: com o recorte a íris no máximo encosta na borda, nunca
 * escapa do olho, e dá para soltar bem mais do que a geometria crua permitiria.
 *
 * Foi 3,5 nos dois eixos até 24/08/2026 e o olhar quase não se lia.
 */
const MAX_PUPILA_X = 9
const MAX_PUPILA_Y = 11

/**
 * Distância (em px de tela) em que o olhar chega ao desvio máximo. Sem essa
 * saturação, normalizar pelo tamanho do avatar — 60px — faria o olho bater no
 * limite a qualquer movimento e o olhar viraria um liga-desliga. Com ela, o
 * ponteiro perto move pouco a pupila e longe move tudo, que é como um olho se
 * comporta.
 */
const RAIO_SATURACAO = 190

/** Intervalo entre piscadelas espontâneas, em ms. */
const PISCADELA_MIN = 9000
const PISCADELA_MAX = 18000
/** Precisa casar com a duração de `duo-wink` no CSS. */
const PISCADELA_DURACAO = 520

export default function DuoFace({
  interativo = false,
  ativo = false,
  className = '',
  titulo = null,
}: DuoFaceProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [seguindo, setSeguindo] = useState(false)
  const [pulando, setPulando] = useState(false)
  const [piscando, setPiscando] = useState(false)

  /**
   * Ponteiro fino = mouse. Em tela de toque não existe hover: o olhar ficaria
   * congelado no último ponto tocado e o pulo dispararia junto com o clique.
   * Quem pede menos movimento também fica de fora — olhar que persegue o cursor
   * é movimento, e o CSS já corta o resto.
   */
  const [podeAnimar, setPodeAnimar] = useState(false)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mouse = window.matchMedia('(hover: hover) and (pointer: fine)')
    const calmo = window.matchMedia('(prefers-reduced-motion: reduce)')
    const aplicar = () => setPodeAnimar(mouse.matches && !calmo.matches)
    aplicar()
    mouse.addEventListener('change', aplicar)
    calmo.addEventListener('change', aplicar)
    return () => {
      mouse.removeEventListener('change', aplicar)
      calmo.removeEventListener('change', aplicar)
    }
  }, [])

  const ligado = interativo && podeAnimar

  // ── pulo ───────────────────────────────────────────────────────────────────
  // Animação de uma passada só: sem tirar e repor o atributo, ela roda na
  // primeira vez e nunca mais.
  const dispararPulo = useCallback(() => {
    setPulando(false)
    requestAnimationFrame(() => setPulando(true))
  }, [])

  useEffect(() => {
    if (ativo) dispararPulo()
  }, [ativo, dispararPulo])

  // ── piscadela ──────────────────────────────────────────────────────────────
  const piscarRef = useRef<number | null>(null)
  const piscar = useCallback(() => {
    setPiscando(false)
    requestAnimationFrame(() => {
      setPiscando(true)
      window.setTimeout(() => setPiscando(false), PISCADELA_DURACAO)
    })
  }, [])

  useEffect(() => {
    if (!ligado) return
    // Intervalo sorteado a cada vez: piscadela em cadência fixa lê como tique
    // nervoso, não como gesto.
    const agendar = () => {
      const espera = PISCADELA_MIN + Math.random() * (PISCADELA_MAX - PISCADELA_MIN)
      piscarRef.current = window.setTimeout(() => {
        // Aba escondida não anima; piscar para ninguém só gasta bateria.
        if (!document.hidden) piscar()
        agendar()
      }, espera)
    }
    agendar()
    return () => { if (piscarRef.current) window.clearTimeout(piscarRef.current) }
  }, [ligado, piscar])

  // ── olhar seguindo o ponteiro, na tela inteira ─────────────────────────────
  useEffect(() => {
    if (!ligado) return
    const el = ref.current
    if (!el) return

    // O retângulo do avatar só muda em rolagem/redimensionamento — medir a cada
    // mousemove forçaria reflow dezenas de vezes por segundo.
    let caixa: DOMRect | null = null
    const medir = () => { caixa = el.getBoundingClientRect() }
    medir()

    let frame = 0
    let alvo: { x: number; y: number } | null = null
    // Flag em variável local, não em estado: ligar o tracking pelo `seguindo`
    // colocaria o efeito para re-executar (e re-assinar os listeners) no
    // primeiro movimento do mouse.
    let jaSeguindo = false

    const aplicar = () => {
      frame = 0
      if (!alvo || !caixa || !caixa.width) return
      const cx = caixa.left + caixa.width / 2
      const cy = caixa.top + caixa.height / 2
      const dx = alvo.x - cx
      const dy = alvo.y - cy
      const distancia = Math.hypot(dx, dy)
      if (distancia < 1) return

      const forca = Math.min(1, distancia / RAIO_SATURACAO)
      // Direção normalizada primeiro, amplitude por eixo depois: assim o olhar
      // aponta para o ponteiro e ainda respeita o formato do olho.
      const ux = dx / distancia
      const uy = dy / distancia
      el.style.setProperty('--duo-eye-x', `${(ux * MAX_PUPILA_X * forca).toFixed(2)}px`)
      el.style.setProperty('--duo-eye-y', `${(uy * MAX_PUPILA_Y * forca).toFixed(2)}px`)
    }

    const aoMover = (e: MouseEvent) => {
      alvo = { x: e.clientX, y: e.clientY }
      if (!jaSeguindo) { jaSeguindo = true; setSeguindo(true) }
      // Coalesce: o navegador dispara mousemove muito acima da taxa de quadros.
      if (!frame) frame = requestAnimationFrame(aplicar)
    }

    // Ponteiro fora da janela: volta ao olhar à toa em vez de ficar travado
    // encarando o último canto por onde o mouse saiu.
    const aoSairDaJanela = (e: MouseEvent) => {
      if (e.relatedTarget === null) {
        jaSeguindo = false
        setSeguindo(false)
        el.style.removeProperty('--duo-eye-x')
        el.style.removeProperty('--duo-eye-y')
      }
    }

    window.addEventListener('mousemove', aoMover, { passive: true })
    document.addEventListener('mouseout', aoSairDaJanela)
    window.addEventListener('scroll', medir, { passive: true })
    window.addEventListener('resize', medir)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('mousemove', aoMover)
      document.removeEventListener('mouseout', aoSairDaJanela)
      window.removeEventListener('scroll', medir)
      window.removeEventListener('resize', medir)
    }
  }, [ligado])

  // Hover é o cumprimento: pulo e piscadela juntos.
  const aoEntrar = () => {
    if (!ligado) return
    dispararPulo()
    piscar()
  }

  return (
    <div
      ref={ref}
      className={`duo-face ${className}`}
      data-tracking={seguindo ? 'on' : 'off'}
      data-active={pulando ? 'on' : 'off'}
      data-wink={piscando ? 'on' : 'off'}
      onMouseEnter={aoEntrar}
      onAnimationEnd={e => {
        // O evento borbulha de dentro do SVG: sem checar o nome, o fim da
        // piscadela derrubaria o pulo no meio.
        if (e.animationName.includes('duo-hop')) setPulando(false)
      }}
      role={titulo ? 'img' : undefined}
      aria-label={titulo || undefined}
      aria-hidden={titulo ? undefined : true}
      dangerouslySetInnerHTML={{ __html: duoFaceSvg }}
    />
  )
}
