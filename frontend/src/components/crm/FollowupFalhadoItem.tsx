import { useState } from 'react'
import { AlertTriangle, RotateCcw, X, Check } from 'lucide-react'
import { useReagendarFollowup } from '@/hooks/useCRM'
import { descreverErroFollowup, esgotouTentativas } from '@/utils/followupErros'
import type { FollowupErroCategoria } from '@/types/crm'

/**
 * Um follow-up FALHADO, com o motivo em linguagem de operador e o reagendamento.
 *
 * A rota `PATCH /crm/followups/:id/reagendar` e o hook `useReagendarFollowup` já
 * existiam, e **nenhum componente os usava**: retomar um follow-up depois de corrigir
 * o problema só era possível por curl. O bloco desta lista até tinha o comentário
 * "com opção de retry" e nenhum botão.
 *
 * A tela mostra a AÇÃO antes do botão. Reagendar um follow-up cujo chip está banido
 * ou cujo telefone não tem WhatsApp só gera outra falha — quando é esse o caso, o
 * botão vem com o aviso de que a causa continua de pé. Não bloqueamos: a pessoa pode
 * ter acabado de resolver o problema em outra aba.
 */

/**
 * Só os campos que este item usa. Tipagem ESTRUTURAL de propósito: o projeto tem dois
 * types de follow-up quase iguais (`Followup` em `api/crm.ts` e `FollowupAgendado` em
 * `types/crm.ts`) e cada tela usa um. Amarrar o componente a um deles obrigaria a
 * converter no outro — enquanto a duplicação não for resolvida, aceitar a forma
 * mínima serve às duas sem cast.
 */
interface FollowupFalhado {
  id: number
  tipo: 'manual' | 'agente_ia'
  origem: 'lead' | 'estagio'
  agendado_para: string
  erro?: string | null
  erro_categoria?: FollowupErroCategoria | null
}

interface Props {
  followup: FollowupFalhado
}

/** `datetime-local` espera 'YYYY-MM-DDTHH:mm' na parede local, sem fuso. */
function paraInputLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function FollowupFalhadoItem({ followup }: Props) {
  const [abrindo, setAbrindo] = useState(false)
  // Sugestão: daqui a 1h, arredondado. A janela operacional da empresa ainda vale no
  // envio — se cair fora dela, o motor reagenda para a próxima abertura.
  const [quando, setQuando] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000)
    d.setMinutes(0, 0, 0)
    return paraInputLocal(d)
  })
  const reagendar = useReagendarFollowup()

  const desc = descreverErroFollowup(followup.erro_categoria)
  const teto = esgotouTentativas(followup.erro)

  const confirmar = () => {
    if (!quando) return
    // datetime-local é hora local do navegador; o backend guarda timestamptz.
    reagendar.mutate(
      { id: followup.id, agendado_para: new Date(quando).toISOString() },
      { onSuccess: () => setAbrindo(false) }
    )
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs dark:border-red-500/40 dark:bg-red-500/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${desc.tom}`}>
              {desc.rotulo}
            </span>
            <span className="text-gray-600 dark:text-gray-300">
              {followup.tipo === 'agente_ia' ? 'Agente IA' : 'Manual'}
              {followup.origem === 'estagio' && ' · cadência'}
              {' · '}
              {new Date(followup.agendado_para).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                timeZone: 'America/Sao_Paulo',
              })}
            </span>
            {teto && (
              <span className="text-[10px] font-semibold text-red-700 dark:text-red-300">
                · tentativas esgotadas
              </span>
            )}
          </div>

          <p className="mt-1 leading-snug text-gray-700 dark:text-gray-300">{desc.explicacao}</p>

          {desc.acaoDoUsuario && (
            <p className="mt-1 flex items-start gap-1 font-medium leading-snug text-red-800 dark:text-red-300">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              {desc.acaoDoUsuario}
            </p>
          )}
        </div>

        {!abrindo && (
          <button
            onClick={() => setAbrindo(true)}
            className="flex shrink-0 items-center gap-1 rounded-md border border-red-300 bg-white px-2 py-1 font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-500/40 dark:bg-transparent dark:text-red-300"
            title="Reagendar este follow-up"
          >
            <RotateCcw size={12} />
            Reagendar
          </button>
        )}
      </div>

      {abrindo && (
        <div className="mt-2 border-t border-red-200 pt-2 dark:border-red-500/30">
          <label className="block font-medium text-gray-700 dark:text-gray-300">
            Nova data e hora
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <input
              type="datetime-local"
              value={quando}
              onChange={(e) => setQuando(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800"
            />
            <button
              onClick={confirmar}
              disabled={reagendar.isPending || !quando}
              className="flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <Check size={12} />
              {reagendar.isPending ? 'Salvando…' : 'Confirmar'}
            </button>
            <button
              onClick={() => setAbrindo(false)}
              disabled={reagendar.isPending}
              className="flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-gray-600 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300"
            >
              <X size={12} />
              Cancelar
            </button>
          </div>
          {!desc.reagendarResolve && (
            <p className="mt-1.5 leading-snug text-amber-700 dark:text-amber-300">
              A causa da falha não se resolve com o tempo. Se ela ainda não foi corrigida,
              o reagendamento vai falhar de novo.
            </p>
          )}
          <p className="mt-1 leading-snug text-gray-500 dark:text-gray-400">
            Fora da janela de envio da empresa, o sistema desloca sozinho para a próxima abertura.
          </p>
        </div>
      )}
    </div>
  )
}
