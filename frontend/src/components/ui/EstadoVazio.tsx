import React from 'react'

/**
 * Estado vazio de primeira execução.
 *
 * A ilustração é enfeite: quem faz o estado vazio funcionar é o título, a frase
 * de apoio e o botão. Por isso `avatar` é opcional e o texto nunca depende dele
 * — se a arte não carregar, a tela continua dizendo o que fazer.
 *
 * **Só use em lista vazia de verdade.** Resultado vazio de busca ou de filtro
 * pede outra mensagem ("nada encontrado para X" + limpar filtro); mascote
 * animado sugerindo "cadastre o primeiro" quando a base tem 300 registros e o
 * filtro é que não bate lê como se o sistema tivesse perdido os dados.
 */

const ARTE = {
  // Mascote: assuntos de sistema (nenhum funil, nenhuma automação).
  duo: { src: '/gestao/avatar/duo-anim.svg', classe: 'h-24 sm:h-28' },
  // A dupla mentor + cliente: assuntos de relacionamento (clientes, leads).
  // Bem mais alta que o Duo de propósito: são duas figuras e um gráfico numa
  // arte de 440×620 — abaixo de ~160px de altura os rostos viram borrão.
  dupla: { src: '/gestao/avatar/dupla-anim.svg', classe: 'h-40 sm:h-48' },
} as const

interface EstadoVazioProps {
  titulo: string
  descricao?: string
  /** Botão de ação. É ele que faz o trabalho — evite estado vazio sem saída. */
  acao?: React.ReactNode
  avatar?: keyof typeof ARTE | null
  className?: string
}

export const EstadoVazio: React.FC<EstadoVazioProps> = ({
  titulo,
  descricao,
  acao,
  avatar = null,
  className = '',
}) => {
  const arte = avatar ? ARTE[avatar] : null

  return (
    <div className={`flex flex-col items-center justify-center gap-3 px-6 py-10 text-center ${className}`}>
      {arte && (
        // alt vazio + aria-hidden: o texto abaixo já diz tudo, e um leitor de
        // tela anunciando "ilustração do mascote" só atrasa quem usa o sistema.
        <img
          src={arte.src}
          alt=""
          aria-hidden="true"
          className={`${arte.classe} w-auto`}
          loading="lazy"
        />
      )}
      <div className="max-w-sm space-y-1">
        <p className="font-medium text-gray-800 dark:text-gray-100">{titulo}</p>
        {descricao && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{descricao}</p>
        )}
      </div>
      {acao && <div className="mt-1">{acao}</div>}
    </div>
  )
}
