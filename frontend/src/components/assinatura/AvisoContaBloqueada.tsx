import React, { useEffect, useRef } from 'react'
import { CheckCircle2, MessageCircle, RefreshCw, X, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { BloqueioConta } from '@/api/assinaturas'

interface Props {
  motivo: BloqueioConta
  nome?: string
  /** Fim do teste grátis — só usado quando o motivo é o trial. */
  terminouEm?: string | null
  onFechar: () => void
}

const WHATSAPP_SUPORTE =
  'https://wa.me/5511940524435?text=' +
  encodeURIComponent('Oi! Quero tirar uma dúvida sobre os planos do Gestão Financeira CRM.')

const NADA_APAGADO = 'Nada foi apagado: clientes, lançamentos, funis e conversas continuam guardados.'
const WHATSAPP_REGISTRA = 'As mensagens que chegam no seu WhatsApp continuam sendo registradas.'

/**
 * Aviso de conta sem acesso — aparece uma vez por sessão, quando a pessoa entra e é
 * levada à Minha Conta (único lugar liberado, com a escolha de plano). O tom é de
 * continuidade, não de cobrança: nada foi apagado, e voltar é escolher o plano e
 * pagar. Um texto por motivo; a moldura é a mesma.
 */
export const AvisoContaBloqueada: React.FC<Props> = ({ motivo, nome, terminouEm, onFechar }) => {
  const navigate = useNavigate()
  const principal = useRef<HTMLButtonElement>(null)
  const primeiroNome = (nome || '').trim().split(/\s+/)[0]
  const oi = primeiroNome ? <>Oi, {primeiroNome}! </> : null
  const data = terminouEm ? new Date(terminouEm).toLocaleDateString('pt-BR') : null
  const aguardando = motivo === 'aguardando_pagamento'

  useEffect(() => {
    principal.current?.focus()
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  const conteudo = {
    trial_encerrado: {
      titulo: 'Seu teste grátis terminou',
      texto: (
        <>
          {oi}Obrigado por testar o sistema com a gente
          {data ? <> — o seu período terminou em <strong>{data}</strong></> : null}.
          Para continuar, é só <strong>escolher o seu plano e ativar a conta</strong>.
        </>
      ),
      itens: [NADA_APAGADO, WHATSAPP_REGISTRA, 'O acesso volta assim que o pagamento é confirmado.'],
    },
    suspensa: {
      titulo: 'O acesso da sua conta está pausado',
      texto: (
        <>
          {oi}Para voltar a usar o sistema, é só <strong>escolher o seu plano e ativar a
          assinatura</strong>.
        </>
      ),
      itens: [NADA_APAGADO, WHATSAPP_REGISTRA, 'O acesso volta assim que o pagamento é confirmado.'],
    },
    aguardando_pagamento: {
      titulo: 'Estamos aguardando o seu pagamento',
      texto: (
        <>
          {oi}Recebemos a escolha do seu plano. <strong>Assim que o pagamento for
          confirmado, o acesso volta sozinho</strong>.
        </>
      ),
      itens: [
        'PIX costuma ser confirmado em poucos minutos.',
        'Boleto pode levar até 2 dias úteis.',
        NADA_APAGADO,
      ],
    },
  }[motivo]

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="conta-bloqueada-titulo"
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onFechar}
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
          aria-label="Fechar aviso"
        >
          <X size={18} />
        </button>

        <div className="flex items-end gap-4 bg-gradient-to-br from-[#13264C] to-[#2a4270] px-6 pt-6">
          <img src="/gestao/avatar/duo-anim.svg" alt="" className="h-28 w-auto shrink-0 translate-y-2" />
          <div className="pb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#D2B773]">Gestão Financeira CRM</p>
            <h2 id="conta-bloqueada-titulo" className="mt-1 text-xl font-bold leading-snug text-white">
              {conteudo.titulo}
            </h2>
          </div>
        </div>

        <div className="space-y-4 px-6 pb-6 pt-5">
          <p className="text-[15px] leading-relaxed text-gray-700 dark:text-gray-200">{conteudo.texto}</p>

          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
            {conteudo.itens.map((t) => (
              <li key={t} className="flex items-start gap-2">
                <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>{t}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
            <button
              ref={principal}
              type="button"
              onClick={() => {
                if (aguardando) { window.location.reload(); return }
                onFechar()
                navigate('/planos')
              }}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 font-semibold text-white hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 dark:bg-primary-500 dark:hover:bg-primary-600"
            >
              {aguardando
                ? <><RefreshCw size={16} /> Já paguei, verificar</>
                : <><Zap size={16} /> Escolher meu plano</>}
            </button>
            <button
              type="button"
              onClick={onFechar}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Ver minha conta
            </button>
          </div>

          <a
            href={WHATSAPP_SUPORTE}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <MessageCircle size={15} /> Ficou com alguma dúvida? Fale com a gente
          </a>
        </div>
      </div>
    </div>
  )
}
