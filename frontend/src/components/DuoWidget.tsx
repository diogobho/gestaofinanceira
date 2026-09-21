import { useState, useRef, useEffect } from 'react'
import { X, Send, Loader2, Maximize2, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { agenteApi } from '@/api/agente'
import { useAuth } from '@/contexts/AuthContext'
import DuoFace from '@/components/avatar/DuoFace'
import toast from 'react-hot-toast'

interface Mensagem {
  id: number
  role: 'user' | 'assistant'
  conteudo: string
  created_at: string
}

/*
  Uma sugestão por tipo de coisa que ele faz: consulta de dado real (usa
  ferramenta), configuração do sistema e geração de texto. "Como crio uma
  automação de grupo?" saiu daqui — a funcionalidade não tem tela, e a sugestão
  levava a pessoa direto para uma resposta inventada.
*/
const SUGESTOES = [
  'Como está o financeiro deste mês?',
  'Como conecto meu WhatsApp?',
  'Monte um script de primeira abordagem',
]

// Corpo inteiro, animado, servido de public/. Aqui cabe o aceno: o <img> isola
// o <style> do SVG no próprio documento, então o rig original entra sem risco
// de vazar CSS para o app (ver components/avatar/duo.css).
const DUO_CORPO = '/gestao/avatar/duo-anim.svg'

export default function DuoWidget() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [loading, setLoading] = useState(false)
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && !hasLoadedHistory) {
      agenteApi.getHistorico(20)
        .then((data: Mensagem[]) => setMensagens(data || []))
        .catch(() => {})
        .finally(() => setHasLoadedHistory(true))
    }
  }, [open, hasLoadedHistory])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [mensagens, loading])

  // Esc fecha. No mobile o painel ocupa quase a tela toda e some com o botão de
  // fechar quando o teclado sobe; no desktop é o reflexo esperado de um painel.
  useEffect(() => {
    if (!open) return
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [open])

  const enviar = async (texto?: string) => {
    const msg = (texto || input).trim()
    if (!msg || loading) return

    const userMsg: Mensagem = {
      id: Date.now(),
      role: 'user',
      conteudo: msg,
      created_at: new Date().toISOString()
    }
    setMensagens(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await agenteApi.enviarMensagem(msg)
      setMensagens(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        conteudo: res.resposta,
        created_at: new Date().toISOString()
      }])
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao falar com o Duo')
      setMensagens(prev => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  const limpar = async () => {
    if (!confirm('Limpar conversa com o Duo?')) return
    try {
      await agenteApi.limparHistorico()
      setMensagens([])
      toast.success('Conversa limpa')
    } catch {
      toast.error('Erro ao limpar')
    }
  }

  if (!user) return null

  return (
    <>
      {/* Lançador. O fundo é creme, não navy: o corpo do Duo é navy e sumiria
          dentro de um círculo escuro — some a silhueta, some o mascote. */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          data-tour="widget-ia"
          className="group fixed right-4 z-40 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-brand-navy bg-[#F1E9DA] shadow-lg transition-shadow hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 sm:right-6 sm:h-[60px] sm:w-[60px]
                     bottom-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-6"
          title="Falar com o Duo"
          aria-label="Abrir o chat com o Duo"
        >
          <DuoFace interativo className="h-full w-full" />
          <span className="pointer-events-none absolute right-[calc(100%+0.5rem)] hidden whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 sm:block">
            Falar com o Duo
          </span>
        </button>
      )}

      {/*
        Painel. No celular é uma folha que sobe da base e ocupa 85% da altura —
        o retângulo de 380×540 do desktop, encolhido por max-w/max-h, virava um
        cartão flutuante com margem inútil dos quatro lados e área de digitação
        espremida. Da largura sm para cima ele volta a ser o painel ancorado.
      */}
      {open && (
        <div
          role="dialog"
          aria-label="Chat com o Duo"
          className="fixed inset-x-0 bottom-0 z-40 flex h-[85vh] flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800
                     sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[540px] sm:max-h-[calc(100vh-3rem)] sm:w-[380px] sm:rounded-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-gradient-to-r from-primary-600 to-primary-700 p-4 text-white">
            <div className="flex items-center gap-2.5">
              {/* Também interativo: enquanto a conversa está aberta é ele que
                  está falando com você, e o olhar acompanhando o ponteiro é o que
                  sustenta isso. Sem risco de id duplicado no SVG — o lançador
                  desmonta quando o painel abre, então só existe um por vez. */}
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-white/70 bg-[#F1E9DA]">
                <DuoFace interativo className="h-full w-full" />
              </div>
              <div>
                <h3 className="font-semibold leading-tight">Duo</h3>
                <p className="text-xs leading-tight text-white/80">Seu assistente de IA</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Link
                to="/agente-duo"
                onClick={() => setOpen(false)}
                title="Abrir em tela cheia"
                aria-label="Abrir em tela cheia"
                className="rounded-lg p-1.5 transition-colors hover:bg-white/20"
              >
                <Maximize2 className="h-4 w-4" />
              </Link>
              {mensagens.length > 0 && (
                <button
                  onClick={limpar}
                  title="Limpar conversa"
                  aria-label="Limpar conversa"
                  className="rounded-lg p-1.5 transition-colors hover:bg-white/20"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                title="Fechar"
                aria-label="Fechar o chat"
                className="rounded-lg p-1.5 transition-colors hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Mensagens */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-4 dark:bg-gray-900">
            {mensagens.length === 0 && !loading ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-6 text-center">
                {/* Aqui o Duo aparece de corpo inteiro e acenando: é a única tela
                    do widget com espaço para o gesto, e é o primeiro contato. */}
                <img
                  src={DUO_CORPO}
                  alt=""
                  aria-hidden="true"
                  width={112}
                  height={107}
                  className="h-24 w-auto sm:h-28"
                />
                <div>
                  <p className="font-medium text-gray-800 dark:text-gray-100">
                    Oi, {user?.nome?.split(' ')[0]}! Sou o Duo.
                  </p>
                  {/* Concreto em vez de categoria abstrata: "consultoria sobre o
                      negócio" não diz a ninguém o que digitar. */}
                  <p className="mx-auto mt-1 max-w-[270px] text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    Pergunte sobre seus números, peça ajuda com uma tela do sistema
                    ou me peça um texto para falar com um cliente.
                  </p>
                </div>
                <p className="-mb-0.5 mt-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  Para começar
                </p>
                <div className="flex w-full flex-col gap-1.5">
                  {SUGESTOES.map(s => (
                    <button
                      key={s}
                      onClick={() => enviar(s)}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs text-gray-700 transition-colors hover:border-primary-400 hover:bg-primary-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-primary-900/20"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {mensagens.map(m => (
                  <div
                    key={m.id}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] break-words rounded-2xl px-3 py-2 text-sm ${
                        m.role === 'user'
                          ? 'whitespace-pre-wrap rounded-br-sm bg-primary-600 text-white'
                          : 'rounded-bl-sm border border-gray-200 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'
                      }`}
                    >
                      {m.role === 'assistant' ? (
                        /*
                          A resposta do Duo passa por markdown, como já acontecia
                          na tela cheia. Aqui era texto puro: qualquer `**negrito**`
                          ou `##` do modelo aparecia cru no balão. O prompt já pede
                          para ele não usar título nem tabela — isto aqui é a rede
                          de segurança para o que escapar.
                        */
                        <div className="prose prose-sm max-w-none text-inherit [&_*]:!text-inherit [&_ol]:my-1 [&_ol]:pl-4 [&_p]:my-1 [&_ul]:my-1 [&_ul]:pl-4 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                          <ReactMarkdown>{m.conteudo}</ReactMarkdown>
                        </div>
                      ) : (
                        m.conteudo
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                      <Loader2 className="h-3 w-3 animate-spin text-primary-600" />
                      <span className="text-xs text-gray-500">o Duo está pensando...</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Input. O padding de baixo respeita a barra de gestos do iOS. */}
          <div className="border-t border-gray-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    enviar()
                  }
                }}
                placeholder="Pergunte alguma coisa..."
                rows={1}
                aria-label="Mensagem para o Duo"
                className="max-h-24 flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 sm:text-sm"
                disabled={loading}
              />
              <button
                onClick={() => enviar()}
                disabled={!input.trim() || loading}
                aria-label="Enviar"
                className="rounded-xl bg-primary-600 p-2 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
