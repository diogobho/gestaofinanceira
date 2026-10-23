import { useQuery } from '@tanstack/react-query'
import { useCanalWhatsApp } from '@/hooks/useCanalWhatsApp'

/**
 * Catálogo dos vídeos-tutoriais.
 *
 * Mora ao lado dos vídeos, na landing, e é gerado por `api/scripts/videos/catalogo.js`
 * (que também define o tema e a ordem). Vídeo novo aparece no sistema sem build.
 */

export type CanalVideo = 'todos' | 'qr' | 'oficial'

export interface VideoTutorial {
  id: string
  titulo: string
  tema?: string
  canal: CanalVideo
  duracao: number
  mp4: string
  legenda: string
  capa: string
}

/**
 * Um vídeo, ou um por canal quando a tela muda conforme o WhatsApp da conta
 * (ex.: follow-up no QR × no número oficial, com modelo de reserva). Faltar a
 * chave do canal da conta = sem vídeo para ela (disparo em massa só existe no oficial).
 */
export type RefVideo = string | { qr?: string; oficial?: string }

const CATALOGO = '/assets/videos/tutoriais/catalogo.json'
export const PAGINA_PUBLICA_TUTORIAIS = 'https://duofuturo.tech/gestao-financeira/tutoriais'

export const duracaoLegivel = (s: number) =>
  (s < 60 ? `${s}s` : `${Math.floor(s / 60)}min${String(s % 60).padStart(2, '0')}`)

export function useCatalogoTutoriais() {
  return useQuery({
    queryKey: ['tutoriais', 'catalogo'],
    queryFn: async () => {
      const r = await fetch(CATALOGO, { cache: 'no-cache' })
      if (!r.ok) throw new Error(String(r.status))
      return ((await r.json()).videos || []) as VideoTutorial[]
    },
    staleTime: 30 * 60_000,
    retry: 1,
  })
}

/** O canal da conta, no vocabulário do catálogo. */
export function useCanalDaConta(): 'qr' | 'oficial' {
  const { data } = useCanalWhatsApp()
  return data?.provedor === 'cloud_api' ? 'oficial' : 'qr'
}

/**
 * Resolve uma referência para o vídeo que vale para esta conta. Um id solto que
 * tenha a versão `-oficial` no catálogo vira ela quando a conta está no oficial —
 * é o que permite ao Duo citar só `agendar-followup` sem saber o canal.
 */
export function resolverVideo(ref: RefVideo, canal: 'qr' | 'oficial', videos: VideoTutorial[]): VideoTutorial | null {
  const id = typeof ref === 'string' ? ref : ref[canal]
  if (!id) return null
  if (typeof ref === 'string' && canal === 'oficial') {
    const oficial = videos.find(v => v.id === `${id}-oficial`)
    if (oficial) return oficial
  }
  return videos.find(v => v.id === id) ?? null
}
