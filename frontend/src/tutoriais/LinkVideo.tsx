import { useVideoAjuda } from './VideoAjuda'
import { duracaoLegivel, type RefVideo } from './catalogo'

/**
 * "Ver em vídeo" ao lado do título de uma seção de configuração (cadência,
 * agente da etapa, follow-up do card…). Diferente da `DicaVideo`: ali a pessoa
 * está prestes a clicar num botão; aqui ela está lendo uma seção, e um link
 * discreto, sempre visível, serve também no celular e para rever o vídeo.
 * Sem vídeo para o canal da conta, não aparece.
 */
export function LinkVideo({ video, className = '' }: { video: RefVideo; className?: string }) {
  const { videoDe, abrirVideo } = useVideoAjuda()
  const alvo = videoDe(video)
  if (!alvo) return null
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirVideo(alvo.id, 'dica') }}
      title={alvo.titulo}
      // O texto visível é genérico ("Ver em vídeo · 1min36"); o leitor de tela ouve qual é o vídeo.
      aria-label={`Ver em vídeo: ${alvo.titulo}, ${duracaoLegivel(alvo.duracao)}`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2 text-xs font-medium text-primary-700 hover:bg-primary-50 dark:text-primary-200 dark:hover:bg-primary-900/30 ${className}`}
    >
      <span className="h-5 w-5 overflow-hidden rounded-full bg-[#F1E9DA]">
        <img src="/gestao/avatar/lena-face.svg" alt="" className="h-full w-full" />
      </span>
      Ver em vídeo · {duracaoLegivel(alvo.duracao)}
    </button>
  )
}
