import React from 'react'
import { Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCapacidades } from '@/hooks/useCapacidades'
import { CATALOGO, type Capacidade } from '@/utils/capacidades'

/**
 * Um controle que só existe em certos planos.
 *
 * Regra do produto: **fora do plano, o botão não some — ele explica.** Esconder
 * não vende upgrade, e quem chegou pela página de preços vai procurar o botão;
 * não achar parece defeito do sistema, não limite do plano. Então o botão fica no
 * lugar de sempre, apagado, com cadeado, e o motivo aparece ao passar o mouse e
 * ao clicar.
 *
 * Quem de fato nega é a API (403 `PLANO_SEM_CAPACIDADE`). Isto aqui é só para a
 * tela não oferecer o que vai ser recusado — a mesma divisão do `utils/roles.ts`.
 */
export const BotaoDoPlano: React.FC<{
  capacidade: Capacidade
  children: React.ReactElement<any>
}> = ({ capacidade, children }) => {
  const { pode } = useCapacidades()
  const [mostrar, setMostrar] = React.useState(false)
  if (pode(capacidade)) return children

  const item = CATALOGO[capacidade]

  return (
    <div className="relative shrink-0">
      {React.cloneElement(children, {
        onClick: (e: React.MouseEvent) => { e.preventDefault(); setMostrar((v) => !v) },
        // Não usa `disabled`: um botão desabilitado não recebe clique nem foco, e
        // então não há como o cliente descobrir POR QUE ele está assim.
        'aria-describedby': `plano-${capacidade}`,
        className: `${children.props.className ?? ''} opacity-45 grayscale`,
        title: `${item.rotulo} — ${item.motivo}`,
      })}
      <span className="pointer-events-none absolute -top-1 -right-1 bg-gray-700 text-white rounded-full p-0.5">
        <Lock size={10} />
      </span>

      {mostrar && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMostrar(false)} />
          <div
            id={`plano-${capacidade}`}
            role="dialog"
            className="absolute z-50 top-full mt-2 right-0 w-72 p-3 rounded-lg shadow-lg border
                       bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-left"
          >
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{item.rotulo}</p>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{item.motivo}</p>
            <Link
              to="/planos"
              className="mt-2.5 inline-block text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              Ver o plano {item.planoMinimo} →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
