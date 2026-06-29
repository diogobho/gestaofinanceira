import { useState, useRef, useEffect } from 'react'
import { Sparkles, X, Send, Loader2, ExternalLink, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { agenteApi } from '@/api/agente'
import { useAuth } from '@/contexts/AuthContext'
import toast from 'react-hot-toast'

interface Mensagem {
  id: number
  role: 'user' | 'assistant'
  conteudo: string
  created_at: string
}

const SUGESTOES = [
  'Como funciona o CRM?',
  'Monte um script de abordagem para vendas',
  'Como crio uma automação de grupo?',
]

export default function SextaFeiraWidget() {
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
      toast.error(err.response?.data?.message || 'Erro ao falar com Sexta-feira')
      setMensagens(prev => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  const limpar = async () => {
    if (!confirm('Limpar conversa com Sexta-feira?')) return
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
      {/* Botão flutuante */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          data-tour="widget-ia"
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-primary-600 to-primary-700 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center group"
          title="Sexta-feira — sua consultora IA"
          aria-label="Abrir Sexta-feira"
        >
          <Sparkles className="w-6 h-6" />
          <span className="absolute right-16 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Sexta-feira
          </span>
        </button>
      )}

      {/* Drawer */}
      {open && (
        <div className="fixed bottom-6 right-6 z-40 w-[380px] max-w-[calc(100vw-3rem)] h-[540px] max-h-[calc(100vh-3rem)] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold leading-tight">Sexta-feira</h3>
                <p className="text-xs text-white/80 leading-tight">Sua consultora IA</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Link
                to="/agente-financeiro"
                onClick={() => setOpen(false)}
                title="Abrir em tela cheia"
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </Link>
              {mensagens.length > 0 && (
                <button
                  onClick={limpar}
                  title="Limpar conversa"
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                title="Fechar"
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mensagens */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 dark:bg-gray-900">
            {mensagens.length === 0 && !loading ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
                <div className="w-14 h-14 bg-primary-100 dark:bg-primary-900/40 rounded-full flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-primary-600 dark:text-primary-300" />
                </div>
                <div>
                  <p className="font-medium text-gray-800 dark:text-gray-100">
                    Oi {user?.nome?.split(' ')[0]}! Sou a Sexta-feira.
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-[260px]">
                    Tire dúvidas do sistema, peça scripts de abordagem ou consultoria sobre o negócio.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 w-full mt-2">
                  {SUGESTOES.map(s => (
                    <button
                      key={s}
                      onClick={() => enviar(s)}
                      className="text-left px-3 py-2 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors text-gray-700 dark:text-gray-300"
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
                      className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                        m.role === 'user'
                          ? 'bg-primary-600 text-white rounded-br-sm'
                          : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-bl-sm'
                      }`}
                    >
                      {m.conteudo}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-bl-sm px-3 py-2 flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin text-primary-600" />
                      <span className="text-xs text-gray-500">pensando...</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
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
                className="flex-1 resize-none px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 max-h-24"
                disabled={loading}
              />
              <button
                onClick={() => enviar()}
                disabled={!input.trim() || loading}
                className="p-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
