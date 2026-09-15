import React, { useState, useRef, useEffect } from 'react'
import { useAbaNaUrl } from '@/hooks/useEstadoNaUrl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import {
  Send, Trash2, Bot, User, Loader2, WandSparkles,
  Key, Eye, EyeOff, Save, Cpu, Info,
  Zap, GitBranch, Clock, Mic,
  Search, Edit2, List, FileText,
  CheckSquare, CheckCircle, XCircle, CalendarCheck,
  PauseCircle, Download,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Header } from '@/components/layout'
import { Button, Switch } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { agenteApi } from '@/api/agente'
import { useAgenteIAConfig, useAgenteIAUpdateConfig } from '@/hooks/useCRM'
import type { AgenteIAConfig } from '@/types/crm'
import { isAdminEmpresa, podeConfigurarAgenteIA } from '@/utils/roles'

// ─── Tipos e constantes ────────────────────────────────────────────────────────

interface Mensagem {
  id: number
  role: 'user' | 'assistant'
  conteudo: string
  created_at: string
}

const QUICK_ACTIONS = [
  'Resumo do mês atual',
  'Quais são minhas despesas pendentes?',
  'Parcelas a vencer essa semana',
  'Como está meu saldo?',
  'Evolução dos últimos 3 meses',
  'Quanto gastei por categoria?',
]

// ─── Config do chat do Duo ────────────────────────────────────────────────────
// O Duo (este chat) e o agente do WhatsApp/CRM são mecanismos separados,
// com tabelas de config próprias: desligar um NÃO desliga o outro.

interface ChatFinanceiroConfig {
  ativo: boolean
  max_tokens?: number
  contexto_mensagens?: number
  empresa_id?: number | null
}

const CHAT_CONFIG_KEY = ['chat-financeiro-config']

function useChatFinanceiroConfig() {
  return useQuery<ChatFinanceiroConfig>({
    queryKey: CHAT_CONFIG_KEY,
    queryFn: () => agenteApi.getConfig(),
    staleTime: 30_000,
    retry: false,
  })
}

function useChatFinanceiroUpdateConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<ChatFinanceiroConfig>) => agenteApi.updateConfig(data),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: CHAT_CONFIG_KEY })
      toast.success(vars.ativo ? 'Duo ativado' : 'Duo desativado')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Erro ao salvar a configuração do Duo')
    },
  })
}

const MODELOS_CLAUDE = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Recomendado)' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (Mais poderoso)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Mais rápido)' },
]

const MODELOS_GEMINI = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Recomendado)' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Mais poderoso)' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (Mais rápido)' },
  { value: 'gemini-3.1-pro-preview-customtools', label: 'Gemini 3.1 Pro Ferramentas (Preview)' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)' },
  { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
]

const TONS = [
  { value: 'amigavel', label: '😊 Amigável', desc: 'Acolhedor e próximo, sem ser informal demais' },
  { value: 'casual', label: '😎 Casual', desc: 'Descontraído, pode usar linguagem informal' },
  { value: 'formal', label: '💼 Formal', desc: 'Profissional e respeitoso' },
]

type Aba = 'assistente' | 'configurar' | 'como-funciona'

function formatTime(dateStr: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

// ─── Aba 1: Assistente Financeiro ─────────────────────────────────────────────

function AssistenteChat() {
  const { user } = useAuth()
  const { data: chatConfig } = useChatFinanceiroConfig()
  const desativada = chatConfig?.ativo === false
  const queryClient = useQueryClient()
  const [input, setInput] = useState('')
  const [mensagensLocais, setMensagensLocais] = useState<Mensagem[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { data: historico = [], isLoading } = useQuery<Mensagem[]>({
    queryKey: ['chat-financeiro-historico'],
    queryFn: () => agenteApi.getHistorico(50),
    staleTime: 30_000,
  })

  useEffect(() => {
    if (historico.length > 0 && !enviarMutation.isPending &&
        historico.length > mensagensLocais.length) {
      setMensagensLocais(historico)
    }
  }, [historico])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagensLocais, isTyping])

  const enviarMutation = useMutation({
    mutationFn: (mensagem: string) => agenteApi.enviarMensagem(mensagem),
    onMutate: (mensagem) => {
      const novaMensagemUser: Mensagem = {
        id: Date.now(),
        role: 'user',
        conteudo: mensagem,
        created_at: new Date().toISOString(),
      }
      setMensagensLocais(prev => [...prev, novaMensagemUser])
      setIsTyping(true)
      setInput('')
    },
    onSuccess: (data) => {
      setIsTyping(false)
      const respostaAssistente: Mensagem = {
        id: Date.now() + 1,
        role: 'assistant',
        conteudo: data.resposta,
        created_at: new Date().toISOString(),
      }
      setMensagensLocais(prev => [...prev, respostaAssistente])
      queryClient.invalidateQueries({ queryKey: ['chat-financeiro-historico'] })
    },
    onError: (error: any) => {
      setIsTyping(false)
      const errMsg = error.response?.data?.message || 'Erro ao processar mensagem'
      toast.error(errMsg)
      setMensagensLocais(prev => prev.slice(0, -1))
    },
  })

  const limparMutation = useMutation({
    mutationFn: () => agenteApi.limparHistorico(),
    onSuccess: () => {
      setMensagensLocais([])
      queryClient.invalidateQueries({ queryKey: ['chat-financeiro-historico'] })
      toast.success('Conversa limpa com sucesso')
    },
  })

  const handleSend = () => {
    const texto = input.trim()
    if (!texto || enviarMutation.isPending || desativada) return
    enviarMutation.mutate(texto)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleQuickAction = (acao: string) => {
    if (enviarMutation.isPending || desativada) return
    enviarMutation.mutate(acao)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 gap-4">
      {desativada && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-100 border border-gray-300">
          <PauseCircle size={18} className="text-gray-500 shrink-0 mt-0.5" />
          <p className="text-xs text-gray-600 leading-relaxed">
            <strong className="text-gray-800">Duo desativado.</strong> Um administrador
            desligou o assistente em <strong>Configurações → Duo ativo</strong>. O histórico
            continua salvo e volta a funcionar assim que ela for reativada.
          </p>
        </div>
      )}

      {mensagensLocais.length > 0 && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => limparMutation.mutate()}
            disabled={limparMutation.isPending}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Limpar conversa
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        ) : mensagensLocais.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
              <WandSparkles className="w-8 h-8 -rotate-12 text-primary-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800">
                Olá{user?.nome ? `, ${user.nome.split(' ')[0]}` : ''}!
              </h3>
              <p className="text-gray-500 text-sm mt-1">
                Sou seu assistente financeiro. Pergunte sobre as finanças do negócio, adicione despesas ou receitas, analise gastos e muito mais.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg mt-2">
              {QUICK_ACTIONS.map((acao) => (
                <button
                  key={acao}
                  onClick={() => handleQuickAction(acao)}
                  disabled={enviarMutation.isPending || desativada}
                  className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-full text-gray-700 hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700 transition-colors disabled:opacity-50"
                >
                  {acao}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {mensagensLocais.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-3 shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-primary-600 text-white rounded-tr-sm'
                      : 'bg-white border border-gray-100 text-gray-900 rounded-tl-sm'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none text-gray-900 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown>{msg.conteudo}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.conteudo}</p>
                  )}
                  <p className={`text-[10px] mt-1.5 ${msg.role === 'user' ? 'text-primary-200 text-right' : 'text-gray-400'}`}>
                    {formatTime(msg.created_at)}
                  </p>
                </div>
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-1">
                    <User className="w-4 h-4 text-gray-600" />
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1 items-center h-5">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {mensagensLocais.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {QUICK_ACTIONS.slice(0, 4).map((acao) => (
            <button
              key={acao}
              onClick={() => handleQuickAction(acao)}
              disabled={enviarMutation.isPending || desativada}
              className="px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-full text-gray-600 hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700 transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {acao}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-3 items-end bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={desativada}
          placeholder={desativada
            ? 'Duo desativado — ative em Configurações para conversar'
            : 'Digite sua mensagem... (Enter para enviar, Shift+Enter para nova linha)'}
          rows={1}
          className="flex-1 resize-none outline-none text-sm text-gray-900 placeholder-gray-400 max-h-32 overflow-y-auto disabled:bg-transparent disabled:cursor-not-allowed"
          style={{ height: 'auto', minHeight: '24px' }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement
            target.style.height = 'auto'
            target.style.height = Math.min(target.scrollHeight, 128) + 'px'
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || enviarMutation.isPending || desativada}
          className="w-9 h-9 rounded-lg bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          {enviarMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Toggle do Duo (chat interno) ─────────────────────────────────────────────
// Vive na aba Configurações, mas grava em chat_financeiro_config — nada a ver com
// o "Agente ativo" logo abaixo, que controla o agente do WhatsApp/CRM.

function ChatDuoToggle() {
  const { user } = useAuth()
  const { data: config, isLoading } = useChatFinanceiroConfig()
  const updateConfig = useChatFinanceiroUpdateConfig()

  // Mesma regra do backend (chat-financeiro.controller.ts): quem administra a empresa.
  const podeEditar = isAdminEmpresa(user)
  const ativo = config?.ativo ?? true

  return (
    <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200" data-tour="agcfg-sexta-feira">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-indigo-900 flex items-center gap-1.5">
            <Bot size={15} className="text-indigo-600" />
            Duo ativo
          </p>
          <p className="text-xs text-indigo-700/80 mt-0.5">
            Liga ou desliga a assistente da aba <strong>Assistente</strong> (chat interno desta página)
          </p>
          {!ativo && (
            <p className="text-xs text-indigo-800 mt-1.5">
              Desligada: o chat para de responder para todos os usuários da empresa. Não afeta o
              agente do WhatsApp nem os follow-ups do CRM.
            </p>
          )}
          {!podeEditar && (
            <p className="text-xs text-gray-500 mt-1.5">
              Apenas administradores podem alterar esta opção.
            </p>
          )}
        </div>
        <Switch
          checked={ativo}
          onChange={() => updateConfig.mutate({ ativo: !ativo })}
          disabled={!podeEditar || isLoading || updateConfig.isPending}
          labels={{ on: 'Ativa', off: 'Inativa' }}
          title={podeEditar ? undefined : 'Apenas administradores podem alterar esta opção'}
          aria-label="Ativar ou desativar o Duo"
        />
      </div>
    </div>
  )
}

// ─── Aba 2: Configurar Agente ──────────────────────────────────────────────────

function ConfigurarAgente() {
  const [mostrarApiKey, setMostrarApiKey] = useState(false)
  const [mostrarGeminiKey, setMostrarGeminiKey] = useState(false)
  const [form, setForm] = useState<Partial<AgenteIAConfig>>({
    ativo: false,
    provider: 'claude',
    api_key: '',
    gemini_api_key: '',
    modelo: 'claude-sonnet-4-6',
    nome_agente: 'Assistente',
    tom: 'amigavel',
    area_negocio: '',
    system_prompt_extra: '',
    max_tokens: 1024,
    contexto_mensagens: 10,
    usuarios_habilitados: [],
    delay_segundos: 0,
  })

  const { data: config, isLoading } = useAgenteIAConfig()
  const updateConfig = useAgenteIAUpdateConfig()

  useEffect(() => {
    if (config) {
      setForm({
        ativo: config.ativo,
        provider: config.provider || 'claude',
        api_key: config.api_key_configurada ? '••••••••••••••••••••••••' : '',
        gemini_api_key: config.gemini_api_key_configurada ? '••••••••••••••••••••••••' : '',
        modelo: config.modelo,
        nome_agente: config.nome_agente,
        tom: config.tom,
        area_negocio: config.area_negocio || '',
        system_prompt_extra: config.system_prompt_extra || '',
        max_tokens: config.max_tokens,
        contexto_mensagens: config.contexto_mensagens,
        usuarios_habilitados: config.usuarios_habilitados || [],
        delay_segundos: config.delay_segundos ?? 0,
      })
    }
  }, [config])

  const handleSave = () => {
    const payload: Partial<AgenteIAConfig> = { ...form }
    if (payload.api_key && payload.api_key.includes('•')) delete payload.api_key
    if (payload.gemini_api_key && payload.gemini_api_key.includes('•')) delete payload.gemini_api_key
    updateConfig.mutate(payload)
  }

  const set = (key: keyof AgenteIAConfig, value: any) =>
    setForm(prev => ({ ...prev, [key]: value }))

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin h-8 w-8 border-2 border-primary-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-5">
      {/* Sub-tabs (só Configurações — a aba "Acesso" foi removida por não ter efeito real) */}
      <div className="flex border-b">
        {[
          { key: 'config', label: 'Configurações', icon: Cpu },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 border-primary-600 text-primary-600"
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <>
          {/* Guia dos três níveis de instrução (empresa, estágio do funil, passo da
              cadência). Arquivo estático em frontend/public/, servido em /gestao/. */}
          <div className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 bg-gray-50 dark:bg-gray-800/40 dark:border-gray-700">
            <FileText size={18} className="text-primary-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 text-sm">Guia de configuração do agente</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                Explica os três níveis de instrução — empresa, estágio do funil e passo da
                cadência — e o que escrever em cada um. Para guardar em PDF, abra o guia e use
                Imprimir → Salvar como PDF.
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-2">
                <a
                  href="/gestao/guia-agente-ia.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-primary-600 hover:text-primary-700 underline"
                >
                  Abrir guia
                </a>
                <a
                  href="/gestao/guia-agente-ia.html"
                  download="guia-agente-ia.html"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700"
                >
                  <Download size={13} />
                  Baixar
                </a>
              </div>
            </div>
          </div>

          {/* Duo (chat interno desta página) — config SEPARADA do agente do
              WhatsApp/CRM. Salva na hora, sem depender do botão "Salvar configurações". */}
          <ChatDuoToggle />

          {/* Fila parada: com o agente desligado os follow-ups de IA ficam esperando.
              Eles NÃO são perdidos — só voltam a sair quando o agente for reativado. */}
          {!config?.ativo && (config?.followups_pausados ?? 0) > 0 && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-300">
              <PauseCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-amber-900">
                  {config!.followups_pausados} follow-up{config!.followups_pausados! > 1 ? 's' : ''} de IA em espera
                </p>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                  Com o agente desligado, os follow-ups agendados não são enviados — eles ficam
                  guardados na fila e <strong>nenhum é perdido</strong>. Assim que você reativar o
                  agente, a fila volta a sair sozinha, respeitando o intervalo entre envios.
                </p>
              </div>
            </div>
          )}

          {/* Toggle ativo */}
          <div
            className={`flex items-center justify-between gap-4 p-4 rounded-xl border transition-colors ${
              form.ativo
                ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/40'
                : 'bg-gray-50 border-gray-200'
            }`}
            data-tour="agcfg-ativo"
          >
            <div>
              <p className="font-medium text-gray-900 flex items-center gap-1.5">
                <Zap size={15} className={form.ativo ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'} />
                Agente do WhatsApp/CRM ativo
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Liga ou desliga o agente globalmente para toda a empresa (não afeta o Duo acima)
              </p>
              {!form.ativo && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1.5">
                  Desligado: follow-ups de IA ficam em espera na fila (não são perdidos) e o agente
                  para de responder no WhatsApp. Follow-ups de <strong>mensagem fixa</strong> da
                  cadência continuam saindo — eles não passam pela IA.
                </p>
              )}
            </div>
            <Switch
              checked={!!form.ativo}
              onChange={(v) => set('ativo', v)}
              aria-label="Ativar ou desativar o agente do WhatsApp/CRM"
            />
          </div>

          {/* Provedor */}
          <div data-tour="agcfg-provider">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Provedor de IA</label>
            <div className="flex gap-2">
              {[
                { value: 'claude', label: 'Claude (Anthropic)', note: 'Com ferramentas CRM completas' },
                { value: 'gemini', label: 'Gemini (Google)', note: 'Com ferramentas CRM completas' },
              ].map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => {
                    set('provider', p.value)
                    set('modelo', p.value === 'claude' ? 'claude-sonnet-4-6' : 'gemini-2.5-flash')
                  }}
                  className={`flex-1 text-left px-3 py-2.5 border rounded-lg text-sm transition-colors ${
                    form.provider === p.value
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium">{p.label}</div>
                  <div className="text-xs opacity-70 mt-0.5">{p.note}</div>
                </button>
              ))}
            </div>
          </div>

          {/* API Key Claude */}
          {form.provider !== 'gemini' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <Key size={14} className="inline mr-1.5 text-gray-400" />
                API Key da Anthropic
              </label>
              <div className="relative">
                <input
                  type={mostrarApiKey ? 'text' : 'password'}
                  value={form.api_key || ''}
                  onChange={e => set('api_key', e.target.value)}
                  placeholder="sk-ant-api03-..."
                  className="w-full pr-10 px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setMostrarApiKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {mostrarApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {config?.api_key_configurada && (
                <p className="text-xs text-green-600 mt-1">✓ Chave configurada — deixe em branco para manter a atual</p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                Obtenha em <span className="font-mono">console.anthropic.com</span>
              </p>
            </div>
          )}

          {/* API Key Gemini */}
          {form.provider === 'gemini' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <Key size={14} className="inline mr-1.5 text-gray-400" />
                API Key do Google Gemini
              </label>
              <div className="relative">
                <input
                  type={mostrarGeminiKey ? 'text' : 'password'}
                  value={form.gemini_api_key || ''}
                  onChange={e => set('gemini_api_key', e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full pr-10 px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setMostrarGeminiKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {mostrarGeminiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {config?.gemini_api_key_configurada && (
                <p className="text-xs text-green-600 mt-1">✓ Chave configurada — deixe em branco para manter a atual</p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                Obtenha em <span className="font-mono">aistudio.google.com</span>
              </p>
            </div>
          )}

          {/* Modelo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Modelo de IA</label>
            <select
              value={form.modelo}
              onChange={e => set('modelo', e.target.value)}
              className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            >
              {(form.provider === 'gemini' ? MODELOS_GEMINI : MODELOS_CLAUDE).map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Tom de voz — o "Nome do agente" saiu daqui: a identidade não é global, é de
              quem está atendendo. O agente assina com o nome do dono do número que está
              na conversa (e, no follow-up, do responsável pelo lead). */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tom de voz</label>
            <select
              value={form.tom}
              onChange={e => set('tom', e.target.value as any)}
              className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            >
              {TONS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              {TONS.find(t => t.value === form.tom)?.desc}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              O agente se apresenta com o nome de <strong>quem está atendendo</strong> —
              o dono do número em que a conversa acontece. No follow-up automático, o
              responsável pelo lead. Não há um nome fixo por empresa.
            </p>
          </div>

          {/* Área do negócio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Área/contexto do negócio</label>
            <input
              type="text"
              value={form.area_negocio || ''}
              onChange={e => set('area_negocio', e.target.value)}
              placeholder="Ex: academia de dança, clínica de estética, escola de inglês..."
              className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">Isso vai para o system prompt para contextualizar o agente</p>
          </div>

          {/* System prompt extra */}
          <div data-tour="agcfg-instrucoes">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Instruções adicionais
              <span className="ml-1.5 text-xs font-normal text-gray-400">(system prompt)</span>
            </label>
            <textarea
              value={form.system_prompt_extra || ''}
              onChange={e => set('system_prompt_extra', e.target.value)}
              rows={5}
              placeholder={`Ex:\n- Nossos planos são R$ 150/mês (mensal) ou R$ 120/mês (semestral)\n- Não oferecer desconto sem aprovação do gerente\n- Sempre perguntar qual dia/horário é melhor para uma visita\n- Priorizar leads com temperatura "quente"`}
              className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none font-mono"
            />
          </div>

          {/* Configurações avançadas */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Histórico de contexto
                <span className="ml-1 text-xs text-gray-400">mensagens</span>
              </label>
              <input
                type="number"
                min={3}
                max={20}
                value={form.contexto_mensagens}
                onChange={e => set('contexto_mensagens', parseInt(e.target.value))}
                className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">Mensagens anteriores enviadas ao modelo</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Tamanho máximo da resposta
                <span className="ml-1 text-xs text-gray-400">tokens</span>
              </label>
              <input
                type="number"
                min={256}
                max={4096}
                step={256}
                value={form.max_tokens}
                onChange={e => set('max_tokens', parseInt(e.target.value))}
                className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
          </div>

          {/* Delay de resposta */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Delay antes de responder
            </label>
            <select
              value={form.delay_segundos ?? 0}
              onChange={e => set('delay_segundos', parseInt(e.target.value))}
              className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            >
              <option value={0}>Sem delay (responde imediatamente)</option>
              <option value={5}>5 segundos</option>
              <option value={10}>10 segundos</option>
              <option value={15}>15 segundos</option>
              <option value={30}>30 segundos</option>
              <option value={60}>1 minuto</option>
              <option value={120}>2 minutos</option>
              <option value={300}>5 minutos</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Tempo de espera após receber a mensagem antes de processar. Útil para parecer mais natural.
            </p>
          </div>

          {/* Aviso */}
          <div className="flex gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <Info size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              O agente responde automaticamente apenas mensagens de <strong>texto</strong>. Arquivos de áudio, imagens e documentos são armazenados mas não processados pela IA.
            </p>
          </div>
      </>

      {/* Botão salvar */}
      <div className="flex justify-end pt-2 pb-6">
        <button
          onClick={handleSave}
          disabled={updateConfig.isPending}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <Save size={15} />
          {updateConfig.isPending ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </div>
    </div>
  )
}

// ─── Aba 3: Como Funciona ──────────────────────────────────────────────────────

function ComoFunciona() {
  // ── Main flowchart constants ──
  const CX = 215, DW = 85, DH = 30, RW = 90, RH = 21, OW = 80, OH = 18
  const YS=36,  YD1=105, YD2=185, YD3=265, YD4=345, YD5=425,
        YLCK=535, YHST=600, YAI=672, YD6=772,
        YIGN=510, YRSP=872, YSND=932, YCRM=992, YULK=1052, YEND=1105
  const GRAY='#94a3b8', RED='#ef4444', ORANGE='#f97316', PURPLE='#9333ea'
  const dp = (cx: number, cy: number) =>
    `M${cx},${cy-DH} L${cx+DW},${cy} L${cx},${cy+DH} L${cx-DW},${cy}Z`

  const markers = [
    {id:'arr-gray',fill:GRAY},{id:'arr-red',fill:RED},
    {id:'arr-orange',fill:ORANGE},{id:'arr-purple',fill:PURPLE},
    {id:'arr-green',fill:'#22c55e'},
  ]
  const grads = [
    {id:'g-green',c1:'#4ade80',c2:'#16a34a'},
    {id:'g-blue',c1:'#93c5fd',c2:'#3b82f6'},
    {id:'g-violet',c1:'#c084fc',c2:'#243a65'},
    {id:'g-amber',c1:'#fcd34d',c2:'#d97706'},
    {id:'g-red',c1:'#f87171',c2:'#dc2626'},
    {id:'g-orange',c1:'#fb923c',c2:'#ea580c'},
    {id:'g-purple',c1:'#e9d5ff',c2:'#9333ea'},
    {id:'g-teal',c1:'#5eead4',c2:'#0f766e'},
  ]
  const mainArrows: [number,number,number,number][] = [
    [CX, YS+OH,    CX, YD1-DH  ],
    [CX, YD1+DH,   CX, YD2-DH  ],
    [CX, YD2+DH,   CX, YD3-DH  ],
    [CX, YD3+DH,   CX, YD4-DH  ],
    [CX, YD4+DH,   CX, YD5-DH  ],
    [CX, YD5+DH,   CX, YLCK-RH ],
    [CX, YLCK+RH,  CX, YHST-RH ],
    [CX, YHST+RH,  CX, YAI-26  ],
    [CX, YAI+26,   CX, YD6-DH  ],
    [CX, YD6+DH,   CX, YRSP-RH ],
    [CX, YRSP+RH,  CX, YSND-RH ],
    [CX, YSND+RH,  CX, YCRM-RH ],
    [CX, YCRM+RH,  CX, YULK-RH ],
    [CX, YULK+RH,  CX, YEND-OH ],
  ]

  // ── Follow-up flowchart constants ──
  const FCX = 215
  const FYS=40, FYBU=118, FYD1=196, FYD2=282, FYD3=368
  const FYBRN=460, FYCONV=522, FYMARK=566, FYCRM2=628, FYEND=688
  const FBMANX=82, FBAGX=390, FBBOXW=130, FBBOXH=40
  const fuDp = (cx: number, cy: number) =>
    `M${cx},${cy-DH} L${cx+DW},${cy} L${cx},${cy+DH} L${cx-DW},${cy}Z`
  const fuMarkers = [
    {id:'fu-arr-gray',fill:GRAY},{id:'fu-arr-green',fill:'#22c55e'},
    {id:'fu-arr-red',fill:RED},{id:'fu-arr-orange',fill:ORANGE},
    {id:'fu-arr-emerald',fill:'#10b981'},{id:'fu-arr-violet',fill:PURPLE},
  ]
  const fuGrads = [
    {id:'fu-g-green',c1:'#4ade80',c2:'#16a34a'},
    {id:'fu-g-blue',c1:'#93c5fd',c2:'#3b82f6'},
    {id:'fu-g-amber',c1:'#fcd34d',c2:'#d97706'},
    {id:'fu-g-orange',c1:'#fb923c',c2:'#ea580c'},
    {id:'fu-g-emerald',c1:'#6ee7b7',c2:'#059669'},
    {id:'fu-g-violet',c1:'#c084fc',c2:'#243a65'},
    {id:'fu-g-teal',c1:'#5eead4',c2:'#0f766e'},
    {id:'fu-g-red',c1:'#f87171',c2:'#dc2626'},
  ]

  /**
   * Ferramentas do agente do CRM — as 9 que ele realmente tem.
   *
   * Em 14/08/2026 o conjunto financeiro (`listar_clientes`, `buscar_cliente`,
   * `listar_receitas`, `listar_despesas`, `criar_receita`, `criar_despesa`,
   * `criar_sessao`, `listar_sessoes`) foi REMOVIDO: este agente conversa com o
   * LEAD pelo WhatsApp, que é terceiro não confiável, e prompt não é barreira de
   * segurança — a carteira de clientes e o financeiro da empresa ficavam a um
   * pedido bem construído de distância. Quem tem o conjunto financeiro é o Duo,
   * no chat interno, que só a própria equipe acessa.
   */
  const ferramentas = [
    { name: 'agendar_reuniao',        icon: CalendarCheck, desc: 'Marca a reunião na agenda do lead e liga os lembretes automáticos (véspera, 1h antes e resgate de no-show). Se já existe reunião pendente, REMARCA a mesma em vez de criar outra — duas tarefas significariam duas réguas de lembrete para a mesma pessoa' },
    { name: 'criar_tarefa',           icon: CheckSquare,  desc: 'Ligação, e-mail, follow-up, proposta ou visita, com data e hora convertidas do fuso de Brasília para o formato que o CRM guarda. Reunião NÃO entra aqui — tem ferramenta própria' },
    { name: 'listar_tarefas',         icon: List,         desc: 'Tarefas do lead, com status e vencimento' },
    { name: 'concluir_tarefa',        icon: CheckCircle,  desc: 'Marca uma tarefa do lead como concluída' },
    { name: 'mover_lead_estagio',     icon: GitBranch,    desc: 'Move o lead para outro estágio do funil. Só entre os estágios que o prompt lista — id desconhecido é recusado' },
    { name: 'criar_anotacao',         icon: FileText,     desc: 'Registra nota no histórico do lead, gravada com autoria "agente" para o próprio agente não reler isso depois como se fosse observação de um vendedor' },
    { name: 'atualizar_lead',         icon: Edit2,        desc: 'Temperatura, valor potencial, e-mail, empresa, cargo, probabilidade e notas' },
    { name: 'marcar_lead_perdido',    icon: XCircle,      desc: 'Move para o estágio de perdido do funil registrando o motivo' },
    { name: 'buscar_atividades_lead', icon: Search,       desc: 'Histórico de movimentações, tarefas, anotações e mensagens do lead' },
  ]

  return (
    <div className="max-w-3xl mx-auto p-4 pb-10 space-y-5">

      {/* ── CSS animations ── */}
      <style>{`
        .fn-node {
          animation: fnNodeIn 0.45s cubic-bezier(.22,.68,0,1.2) both;
          transform-box: fill-box;
          transform-origin: center;
        }
        @keyframes fnNodeIn {
          from { opacity: 0; transform: scale(0.72); }
          to   { opacity: 1; transform: scale(1); }
        }
        .fn-ai-ring {
          animation: fnAiPulse 2.6s ease-in-out infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
        @keyframes fnAiPulse {
          0%, 100% { opacity: 0.18; transform: scale(1); }
          50%      { opacity: 0.55; transform: scale(1.07); }
        }
      `}</style>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 p-6 text-white shadow-xl">
        <div className="relative z-10 flex items-start gap-4">
          <div className="p-3 bg-white/15 rounded-2xl flex-shrink-0 backdrop-blur-sm">
            <Bot size={26} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-xl text-white">Arquitetura dos Agentes de IA</h3>
            <p className="text-primary-200 text-sm mt-1.5 max-w-lg leading-relaxed">
              Três mecanismos independentes: <strong className="text-white">Agente Reativo</strong> (responde o lead no WhatsApp),
              <strong className="text-white"> Follow-up Agendado</strong> (cadência por estágio, manual ou por IA) e
              <strong className="text-white"> Duo</strong> (assistente interno da equipe, fora do WhatsApp).
              Cada regra de negócio tem <strong className="text-white">um dono só</strong>: quando o envio acontece é a cadência,
              quando é permitido enviar é a janela, o espaçamento entre envios é o anti-ban, e quem tem o direito de
              processar é o claim. Contexto de IA vem de <code className="text-primary-100 font-mono text-xs">historico_mensagens</code>,
              a conversa do contato — não do lead.
            </p>
          </div>
        </div>
        <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute right-10 -bottom-12 w-44 h-44 rounded-full bg-white/5 pointer-events-none" />
      </div>

      {/* Comparativo dos mecanismos */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <h4 className="text-sm font-semibold text-gray-800">Visão geral dos mecanismos</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium w-32">Mecanismo</th>
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium">O que dispara</th>
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Ferramentas</th>
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Janela</th>
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Anti-ban</th>
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Loop</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <tr className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5"><span className="font-semibold text-primary-700">Agente Reativo</span></td>
                <td className="px-4 py-2.5 text-gray-600">O lead escreve → fila BullMQ</td>
                <td className="px-4 py-2.5 text-gray-600">9 (só CRM)</td>
                <td className="px-4 py-2.5 text-gray-600">Sim, no enfileiramento</td>
                <td className="px-4 py-2.5 text-gray-400">Não entra</td>
                <td className="px-4 py-2.5"><span className="text-green-600 dark:text-green-400 font-medium">Sim</span> (10 iter · 45s por chamada · 2min total)</td>
              </tr>
              <tr className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5"><span className="font-semibold text-orange-700 dark:text-orange-300">Follow-up IA</span></td>
                <td className="px-4 py-2.5 text-gray-600">Cron 1min (instância 0)</td>
                <td className="px-4 py-2.5 text-gray-400">Nenhuma — escreve e envia</td>
                <td className="px-4 py-2.5 text-gray-600">Sim, no envio</td>
                <td className="px-4 py-2.5 text-gray-600">Sim, por chip</td>
                <td className="px-4 py-2.5"><span className="text-gray-400">Não</span></td>
              </tr>
              <tr className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5"><span className="font-semibold text-blue-700 dark:text-blue-300">Follow-up Manual</span></td>
                <td className="px-4 py-2.5 text-gray-600">Cron 1min (instância 0)</td>
                <td className="px-4 py-2.5 text-gray-400">—</td>
                <td className="px-4 py-2.5 text-gray-600">Sim, no envio</td>
                <td className="px-4 py-2.5 text-gray-600">Sim, por chip</td>
                <td className="px-4 py-2.5"><span className="text-gray-400">Não</span></td>
              </tr>
              <tr className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5"><span className="font-semibold text-emerald-700 dark:text-emerald-300">Lembrete de reunião</span></td>
                <td className="px-4 py-2.5 text-gray-600">Cron 1min · marcos da tarefa</td>
                <td className="px-4 py-2.5 text-gray-400">—</td>
                <td className="px-4 py-2.5 text-amber-700 dark:text-amber-300">Regra própria</td>
                <td className="px-4 py-2.5 text-amber-700 dark:text-amber-300">Ainda não</td>
                <td className="px-4 py-2.5"><span className="text-gray-400">Não</span></td>
              </tr>
              <tr className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5"><span className="font-semibold text-violet-700 dark:text-violet-300">Disparo em massa</span></td>
                <td className="px-4 py-2.5 text-gray-600">Manual ou agendado</td>
                <td className="px-4 py-2.5 text-gray-400">—</td>
                <td className="px-4 py-2.5 text-amber-700 dark:text-amber-300">Ainda não</td>
                <td className="px-4 py-2.5 text-amber-700 dark:text-amber-300">Intervalo próprio</td>
                <td className="px-4 py-2.5"><span className="text-gray-400">Não</span></td>
              </tr>
              <tr className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5"><span className="font-semibold text-teal-700 dark:text-teal-300">Duo</span></td>
                <td className="px-4 py-2.5 text-gray-600">Chat na web (não é WhatsApp)</td>
                <td className="px-4 py-2.5 text-gray-600">11 financeiras</td>
                <td className="px-4 py-2.5 text-gray-400">Não se aplica</td>
                <td className="px-4 py-2.5 text-gray-400">Não se aplica</td>
                <td className="px-4 py-2.5"><span className="text-green-600 dark:text-green-400 font-medium">Sim</span> (10 iter · 2min)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-gray-100 bg-amber-50/60">
          <p className="text-xs text-amber-800 leading-relaxed">
            <strong>Onde ainda há regra separada:</strong> lembrete de reunião tem janela própria (bloqueia fim de semana e
            horário fora de 06h–22h, em vez de usar a janela da empresa) e o disparo em massa tem intervalo próprio, por
            disparo, sem consultar o espaçamento do chip. Os dois estão mapeados para unificação; até então, um disparo
            pode sair grudado com um follow-up no mesmo número.
          </p>
        </div>
      </div>

      {/* Flowchart card */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Legend */}
        <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50 text-xs font-medium">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block"/><span className="text-gray-600">Decisão</span></span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-400 inline-block"/><span className="text-gray-600">Processo</span></span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-primary-500 inline-block"/><span className="text-gray-600">IA</span></span>
          <span className="flex items-center gap-1.5 ml-auto"><span className="w-5 h-0.5 bg-red-400 inline-block" style={{borderTop:'1.5px dashed #ef4444',background:'transparent'}}/><span className="text-gray-500">ignorar</span></span>
          <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 inline-block" style={{borderTop:'1.5px dashed #f97316',background:'transparent'}}/><span className="text-gray-500">delay</span></span>
          <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 inline-block" style={{borderTop:'1.5px dashed #9333ea',background:'transparent'}}/><span className="text-gray-500">ferramenta</span></span>
        </div>

        {/* SVG */}
        <div className="bg-[#f8fafc] overflow-x-auto">
          <svg
            viewBox="0 0 620 1145"
            style={{ maxWidth: 620, minWidth: 380, width: '100%', display: 'block', margin: '0 auto' }}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            <defs>
              <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="0.8" fill="#cbd5e1" opacity="0.5"/>
              </pattern>
              {markers.map(m => (
                <marker key={m.id} id={m.id} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0,0 L0,7 L7,3.5Z" fill={m.fill}/>
                </marker>
              ))}
              {grads.map(g => (
                <linearGradient key={g.id} id={g.id} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={g.c1}/>
                  <stop offset="100%" stopColor={g.c2}/>
                </linearGradient>
              ))}
              <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0000001a"/>
              </filter>
              <filter id="sh-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#9333ea" floodOpacity="0.5"/>
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#00000033"/>
              </filter>
            </defs>

            <rect x="0" y="0" width="620" height="1145" fill="url(#dots)"/>

            {/* ── MAIN VERTICAL ARROWS ── */}
            {mainArrows.map(([x1,y1,x2,y2],i) => (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={GRAY} strokeWidth="1.8" markerEnd="url(#arr-gray)"/>
            ))}

            {/* ── RIGHT IGNORE RAIL ── */}
            {[YD1,YD2,YD3,YD4].map(cy => (
              <line key={`hr-${cy}`} x1={CX+DW} y1={cy} x2={492} y2={cy}
                stroke={RED} strokeWidth="1.5" strokeDasharray="4 2"/>
            ))}
            {[YD1,YD2,YD3,YD4].map(cy => (
              <circle key={`dot-${cy}`} cx={492} cy={cy} r={3} fill={RED}/>
            ))}
            <line x1={492} y1={YD1} x2={492} y2={YIGN-OH}
              stroke={RED} strokeWidth="1.5" strokeDasharray="4 2" markerEnd="url(#arr-red)"/>

            {/* ── DELAY BYPASS ── */}
            <line x1={CX-DW} y1={YD5} x2={112} y2={YD5}
              stroke={ORANGE} strokeWidth="1.5" markerEnd="url(#arr-orange)"/>
            <path d={`M62,${YD5+22} L62,${YLCK} L${CX-RW},${YLCK}`}
              fill="none" stroke={ORANGE} strokeWidth="1.5" strokeDasharray="5 2" markerEnd="url(#arr-orange)"/>

            {/* ── TOOL LOOP ── */}
            <line x1={CX+DW} y1={YD6} x2={408} y2={YD6}
              stroke={PURPLE} strokeWidth="1.5" markerEnd="url(#arr-purple)"/>
            <path d={`M556,${YD6} L576,${YD6} L576,${YAI} L${CX+97},${YAI}`}
              fill="none" stroke={PURPLE} strokeWidth="1.5" strokeDasharray="5 2" markerEnd="url(#arr-purple)"/>

            {/* ══════════════ NODES ══════════════ */}

            <g className="fn-node" style={{animationDelay:'0s'}}>
              <ellipse cx={CX} cy={YS} rx={OW} ry={OH} fill="url(#g-green)" filter="url(#sh)"/>
              <text x={CX} y={YS+1} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="700" fill="#fff">INÍCIO</text>
            </g>

            <g className="fn-node" style={{animationDelay:'0.08s'}}>
              <path d={dp(CX,YD1)} fill="url(#g-amber)" filter="url(#sh)"/>
              <text x={CX} y={YD1-8} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="600" fill="#fff">Texto ou áudio</text>
              <text x={CX} y={YD1+8} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="600" fill="#fff">elegível?</text>
            </g>

            <g className="fn-node" style={{animationDelay:'0.16s'}}>
              <path d={dp(CX,YD2)} fill="url(#g-amber)" filter="url(#sh)"/>
              <text x={CX} y={YD2-8} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="600" fill="#fff">Lead existe</text>
              <text x={CX} y={YD2+8} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="600" fill="#fff">no CRM?</text>
            </g>

            <g className="fn-node" style={{animationDelay:'0.24s'}}>
              <path d={dp(CX,YD3)} fill="url(#g-amber)" filter="url(#sh)"/>
              <text x={CX} y={YD3-8} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="600" fill="#fff">Agente ativo</text>
              <text x={CX} y={YD3+8} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="600" fill="#fff">(global)?</text>
            </g>

            <g className="fn-node" style={{animationDelay:'0.32s'}}>
              <path d={dp(CX,YD4)} fill="url(#g-amber)" filter="url(#sh)"/>
              <text x={CX} y={YD4-8} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="600" fill="#fff">Agente ativo</text>
              <text x={CX} y={YD4+8} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="600" fill="#fff">p/ este lead?</text>
            </g>

            <g className="fn-node" style={{animationDelay:'0.4s'}}>
              <path d={dp(CX,YD5)} fill="url(#g-amber)" filter="url(#sh)"/>
              <text x={CX} y={YD5-8} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="600" fill="#fff">Delay</text>
              <text x={CX} y={YD5+8} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="600" fill="#fff">configurado?</text>
            </g>

            <g className="fn-node" style={{animationDelay:'0.44s'}}>
              <rect x={12} y={YD5-20} width={100} height={40} rx={7} fill="url(#g-orange)" filter="url(#sh)"/>
              <text x={62} y={YD5-5} textAnchor="middle" dominantBaseline="middle" fontSize="8" fontWeight="700" fill="#fff">Aguarda delay/janela</text>
              <text x={62} y={YD5+9} textAnchor="middle" dominantBaseline="middle" fontSize="7.5" fill="#fff">agrega msgs do período</text>
            </g>

            <g className="fn-node" style={{animationDelay:'0.28s'}}>
              <ellipse cx={492} cy={YIGN} rx={78} ry={OH} fill="url(#g-red)" filter="url(#sh)"/>
              <text x={492} y={YIGN+1} textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="700" fill="#fff">IGNORAR msg</text>
            </g>

            <g className="fn-node" style={{animationDelay:'0.48s'}}>
              <rect x={CX-RW} y={YLCK-RH} width={RW*2} height={RH*2} rx={7} fill="url(#g-blue)" filter="url(#sh)"/>
              <text x={CX} y={YLCK-7} textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="700" fill="#fff">🔒 Guard anti-duplicação</text>
              <text x={CX} y={YLCK+8} textAnchor="middle" dominantBaseline="middle" fontSize="7.5" fill="#bfdbfe">aborta se humano respondeu</text>
            </g>

            <g className="fn-node" style={{animationDelay:'0.56s'}}>
              <rect x={CX-RW} y={YHST-RH} width={RW*2} height={RH*2} rx={7} fill="url(#g-blue)" filter="url(#sh)"/>
              <text x={CX} y={YHST-7} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="700" fill="#fff">Carrega histórico WA</text>
              <text x={CX} y={YHST+8} textAnchor="middle" dominantBaseline="middle" fontSize="7.5" fill="#bfdbfe">+ anotações + tags</text>
            </g>

            <g className="fn-node" style={{animationDelay:'0.64s'}}>
              <rect x={CX-97} y={YAI-28} width={194} height={56} rx={10} fill="url(#g-violet)" filter="url(#sh-glow)"/>
              <rect x={CX-97} y={YAI-28} width={194} height={56} rx={10}
                fill="none" stroke="#a855f7" strokeWidth="5" className="fn-ai-ring"/>
              <text x={CX} y={YAI-10} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="800" fill="#fff">🤖 Modelo de IA</text>
              <text x={CX} y={YAI+8} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fill="#e9d5ff">Claude / Gemini</text>
            </g>

            <g className="fn-node" style={{animationDelay:'0.72s'}}>
              <path d={dp(CX,YD6)} fill="url(#g-amber)" filter="url(#sh)"/>
              <text x={CX} y={YD6-8} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="600" fill="#fff">Usa</text>
              <text x={CX} y={YD6+8} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="600" fill="#fff">ferramenta?</text>
            </g>

            <g className="fn-node" style={{animationDelay:'0.76s'}}>
              <rect x={408} y={YD6-22} width={148} height={44} rx={7} fill="url(#g-purple)" filter="url(#sh)"/>
              <text x={482} y={YD6-7} textAnchor="middle" dominantBaseline="middle" fontSize="8" fontWeight="700" fill="#4c1d95">Executa ferramenta</text>
              <text x={482} y={YD6+8} textAnchor="middle" dominantBaseline="middle" fontSize="7.5" fill="#13264C">tarefa / reunião / estágio</text>
            </g>

            <g className="fn-node" style={{animationDelay:'0.8s'}}>
              <rect x={CX-RW} y={YRSP-RH} width={RW*2} height={RH*2} rx={7} fill="url(#g-blue)" filter="url(#sh)"/>
              <text x={CX} y={YRSP+1} textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="700" fill="#fff">Gera resposta</text>
            </g>

            <g className="fn-node" style={{animationDelay:'0.88s'}}>
              <rect x={CX-RW} y={YSND-RH} width={RW*2} height={RH*2} rx={7} fill="url(#g-green)" filter="url(#sh)"/>
              <text x={CX} y={YSND+1} textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="700" fill="#fff">📤 Envia WhatsApp</text>
            </g>

            <g className="fn-node" style={{animationDelay:'0.96s'}}>
              <rect x={CX-RW} y={YCRM-RH} width={RW*2} height={RH*2} rx={7} fill="url(#g-teal)" filter="url(#sh)"/>
              <text x={CX} y={YCRM+1} textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="700" fill="#fff">Atualiza CRM</text>
            </g>

            <g className="fn-node" style={{animationDelay:'1.04s'}}>
              <rect x={CX-RW} y={YULK-RH} width={RW*2} height={RH*2} rx={7} fill="url(#g-blue)" filter="url(#sh)"/>
              <text x={CX} y={YULK+1} textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="700" fill="#fff">🔓 Libera lock</text>
            </g>

            <g className="fn-node" style={{animationDelay:'1.12s'}}>
              <ellipse cx={CX} cy={YEND} rx={OW} ry={OH} fill="url(#g-green)" filter="url(#sh)"/>
              <text x={CX} y={YEND+1} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="700" fill="#fff">FIM</text>
            </g>

            {/* ══════════════ EDGE LABELS ══════════════ */}
            {[YD1,YD2,YD3,YD4].map(cy => (
              <text key={`ln-${cy}`} x={CX+DW+4} y={cy-4} fontSize="8.5" fontWeight="700" fill={RED}>Não</text>
            ))}
            {[YD1,YD2,YD3,YD4].map(cy => (
              <text key={`ls-${cy}`} x={CX+4} y={cy+DH+11} fontSize="8.5" fontWeight="700" fill="#16a34a">Sim</text>
            ))}
            <text x={CX-DW-4} y={YD5-4} textAnchor="end" fontSize="8.5" fontWeight="700" fill={ORANGE}>Sim</text>
            <text x={CX+4} y={YD5+DH+11} fontSize="8.5" fontWeight="700" fill="#16a34a">Não</text>
            <text x={CX+DW+4} y={YD6-4} fontSize="8.5" fontWeight="700" fill={PURPLE}>Sim</text>
            <text x={CX+4} y={YD6+DH+11} fontSize="8.5" fontWeight="700" fill="#16a34a">Não</text>
            <text x={580} y={(YAI+YD6)/2} textAnchor="middle" fontSize="7.5" fontWeight="600" fill={PURPLE}
              transform={`rotate(-90,580,${(YAI+YD6)/2})`}>até 10 iter.</text>
            <text x={46} y={(YD5+YLCK)/2} textAnchor="middle" fontSize="7.5" fontWeight="600" fill={ORANGE}
              transform={`rotate(-90,46,${(YD5+YLCK)/2})`}>retoma fluxo</text>
            <text x={492} y={YIGN-OH-5} textAnchor="middle" fontSize="8" fill={RED} fontWeight="600">Não elegível</text>
          </svg>
        </div>
      </div>

      {/* Tools grid */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 bg-primary-100 rounded-lg">
            <Zap size={14} className="text-primary-600" />
          </div>
          <h4 className="font-semibold text-gray-900 text-sm">Ferramentas disponíveis para o agente</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {ferramentas.map(t => {
            const TIcon = t.icon
            return (
              <div key={t.name} className="flex gap-3 p-3.5 rounded-xl bg-white border border-gray-100 hover:border-primary-200 hover:shadow-sm transition-all duration-200">
                <div className="p-1.5 bg-primary-50 rounded-lg flex-shrink-0 h-fit mt-0.5">
                  <TIcon size={13} className="text-primary-600" />
                </div>
                <div>
                  <code className="text-xs font-mono font-semibold text-primary-700">{t.name}</code>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{t.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Follow-up flowchart ── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1.5 bg-emerald-100 rounded-lg">
            <Clock size={14} className="text-emerald-600" />
          </div>
          <h4 className="font-semibold text-gray-900 text-sm">Fluxo de Follow-up</h4>
        </div>
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
          O scheduler roda a cada minuto <strong>exclusivamente na instância 0</strong> do cluster PM2 — eliminando envios duplicados em ambiente de 3 instâncias.
          Respeita data agendada, horário exato e dias da semana configurados; fora da janela o registro
          permanece <code className="text-xs font-mono bg-gray-100 px-1 rounded">pendente</code> e é tentado no próximo ciclo.
          Os passos saem <strong>sempre em ordem e no máximo um por lead por dia</strong> — quando dois passos colidem no mesmo dia
          (ex.: um passo rola do fim de semana para segunda), o seguinte é empurrado, preservando o intervalo desenhado na cadência.
          Passo tipo <strong>Manual</strong> envia mensagem pré-definida (com variáveis como [PrimeiroNome] e anexo de mídia);
          passo tipo <strong>Agente IA</strong> lê a <strong>conversa completa do contato</strong> no WhatsApp
          (<code className="text-xs font-mono bg-gray-100 px-1 rounded">historico_mensagens</code>), as anotações do CRM, as tags e a
          data e hora atuais (fuso de Brasília) para escrever uma mensagem personalizada — sem repetir perguntas já respondidas
          e com saudação coerente com o horário. Após o envio, uma
          anotação é criada automaticamente no lead para rastreabilidade.
        </p>

        {/* Como montar o fluxo de atendimento (cadência por estágio) */}
        <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 leading-relaxed">
          <p className="font-semibold mb-1">🧭 Montando o fluxo de atendimento — visão "Fluxo" do CRM</p>
          <p>
            Em <strong>CRM / Funil → botão "Fluxo"</strong> você enxerga e edita a operação inteira: cada estágio vira um
            card com a sua <strong>cadência de passos</strong> (ex.: <code className="font-mono bg-emerald-100 px-1 rounded">+2d</code>, <code className="font-mono bg-emerald-100 px-1 rounded">+3d</code>, <code className="font-mono bg-emerald-100 px-1 rounded">+6d</code>),
            contados da <em>entrada do lead no estágio</em> ou do <em>passo anterior</em>. Cada passo pode ser
            <strong> WhatsApp manual</strong> (script fixo) ou <strong>Agente IA</strong> (instrução do que buscar naquele toque).
          </p>
          <p className="mt-1">
            As setas embaixo do card mostram as automações de movimento: <strong>"Ao responder →"</strong> (qualquer resposta
            do lead move para o próximo estágio e encerra a cadência atual) e <strong>"Após a cadência →"</strong> (terminou os passos
            sem resposta, o último passo move o lead — ex.: para Nutrição). Mover de estágio sempre encerra a régua antiga e
            inicia a do estágio novo.
          </p>
          <p className="mt-1">
            Ícones no cabeçalho do estágio (kanban e fluxo): <strong>🤖 robô</strong> = agente de IA reativo ativo
            (responde as mensagens recebidas na hora, seguindo a instrução do estágio) · <strong>🔔 sino</strong> = cadência
            de follow-up ativa · o estágio <em>Reunião Agendada</em> ainda tem lembretes automáticos (−24h/−1h) e régua de no-show —
            que <strong>não disparam em fins de semana</strong> nem quando a reunião está <strong>sem horário definido</strong>, sempre no fuso de Brasília.
          </p>
        </div>

        {/* Distinção: manual vs estágio */}
        <div className="mb-3 rounded-xl border border-orange-100 bg-orange-50 p-3 text-xs text-orange-800 leading-relaxed">
          <p className="font-semibold mb-1">⚡ Follow-up Individual vs Follow-up de Estágio</p>
          <p>
            <strong>Origem <code className="font-mono bg-orange-100 px-1 rounded">lead</code></strong> (criado manualmente no card do lead):
            o agente executa mesmo sem o estágio ter o agente IA ativo. Só cancela se há
            um <em>override explícito</em> <code className="font-mono bg-orange-100 px-1 rounded">leads.agente_ia_ativo = false</code> no lead.
          </p>
          <p className="mt-1">
            <strong>Origem <code className="font-mono bg-orange-100 px-1 rounded">estagio</code></strong> (criado automaticamente pela cadência do estágio):
            cancela se o agente não estiver ativo por nenhuma fonte (estágio ou lead), se o lead for arquivado
            ou quando ele muda de estágio (a cadência nova assume).
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50 text-xs font-medium">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block"/><span className="text-gray-600">Decisão</span></span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-400 inline-block"/><span className="text-gray-600">Processo</span></span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500 inline-block"/><span className="text-gray-600">Manual</span></span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-primary-500 inline-block"/><span className="text-gray-600">Agente IA</span></span>
          </div>
          <div className="bg-[#f8fafc] overflow-x-auto">
            <svg
              viewBox="0 0 620 730"
              style={{ maxWidth: 620, minWidth: 380, width: '100%', display: 'block', margin: '0 auto' }}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              <defs>
                <pattern id="fu-dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="0.8" fill="#cbd5e1" opacity="0.5"/>
                </pattern>
                {fuMarkers.map(m => (
                  <marker key={m.id} id={m.id} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                    <path d="M0,0 L0,7 L7,3.5Z" fill={m.fill}/>
                  </marker>
                ))}
                {fuGrads.map(g => (
                  <linearGradient key={g.id} id={g.id} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={g.c1}/>
                    <stop offset="100%" stopColor={g.c2}/>
                  </linearGradient>
                ))}
                <filter id="fu-sh" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0000001a"/>
                </filter>
              </defs>

              <rect x="0" y="0" width="620" height="730" fill="url(#fu-dots)"/>

              {/* ── ARROWS ── */}
              <line x1={FCX} y1={FYS+OH} x2={FCX} y2={FYBU-RH} stroke={GRAY} strokeWidth="1.8" markerEnd="url(#fu-arr-gray)"/>
              <line x1={FCX} y1={FYBU+RH} x2={FCX} y2={FYD1-DH} stroke={GRAY} strokeWidth="1.8" markerEnd="url(#fu-arr-gray)"/>
              <line x1={FCX} y1={FYD1+DH} x2={FCX} y2={FYD2-DH} stroke={GRAY} strokeWidth="1.8" markerEnd="url(#fu-arr-gray)"/>
              <line x1={FCX} y1={FYD2+DH} x2={FCX} y2={FYD3-DH} stroke={GRAY} strokeWidth="1.8" markerEnd="url(#fu-arr-gray)"/>
              {/* D1 Não → NENHUM (right) */}
              <line x1={FCX+DW} y1={FYD1} x2={422} y2={FYD1}
                stroke={RED} strokeWidth="1.5" strokeDasharray="4 2" markerEnd="url(#fu-arr-red)"/>
              {/* D2 Não → AGUARDA (left) */}
              <line x1={FCX-DW} y1={FYD2} x2={118} y2={FYD2}
                stroke={ORANGE} strokeWidth="1.5" strokeDasharray="4 2" markerEnd="url(#fu-arr-orange)"/>
              {/* D3 Sim → Manual (left branch) */}
              <path d={`M${FCX-DW},${FYD3} H${FBMANX} V${FYBRN-FBBOXH/2}`}
                fill="none" stroke="#10b981" strokeWidth="1.5" markerEnd="url(#fu-arr-emerald)"/>
              {/* D3 Não → Agente (right branch) */}
              <path d={`M${FCX+DW},${FYD3} H${FBAGX} V${FYBRN-FBBOXH/2}`}
                fill="none" stroke={PURPLE} strokeWidth="1.5" markerEnd="url(#fu-arr-violet)"/>
              {/* Manual → convergence */}
              <path d={`M${FBMANX},${FYBRN+FBBOXH/2} V${FYCONV} H${FCX}`}
                fill="none" stroke={GRAY} strokeWidth="1.5"/>
              {/* Agente → convergence */}
              <path d={`M${FBAGX},${FYBRN+FBBOXH/2} V${FYCONV} H${FCX}`}
                fill="none" stroke={GRAY} strokeWidth="1.5"/>
              {/* convergence → MARK */}
              <line x1={FCX} y1={FYCONV} x2={FCX} y2={FYMARK-RH}
                stroke={GRAY} strokeWidth="1.8" markerEnd="url(#fu-arr-gray)"/>
              {/* MARK → CRM */}
              <line x1={FCX} y1={FYMARK+RH} x2={FCX} y2={FYCRM2-RH}
                stroke={GRAY} strokeWidth="1.8" markerEnd="url(#fu-arr-gray)"/>
              {/* CRM → FIM */}
              <line x1={FCX} y1={FYCRM2+RH} x2={FCX} y2={FYEND-OH}
                stroke={GRAY} strokeWidth="1.8" markerEnd="url(#fu-arr-gray)"/>

              {/* ══════════════ NODES ══════════════ */}

              <g className="fn-node" style={{animationDelay:'0s'}}>
                <ellipse cx={FCX} cy={FYS} rx={OW+15} ry={OH} fill="url(#fu-g-green)" filter="url(#fu-sh)"/>
                <text x={FCX} y={FYS-3} textAnchor="middle" dominantBaseline="middle" fontSize="9.5" fontWeight="700" fill="#fff">⏱ Scheduler (1 min)</text>
                <text x={FCX} y={FYS+9} textAnchor="middle" dominantBaseline="middle" fontSize="7.5" fontWeight="500" fill="#bbf7d0">instância 0 apenas</text>
              </g>

              <g className="fn-node" style={{animationDelay:'0.08s'}}>
                <rect x={FCX-RW} y={FYBU-RH} width={RW*2} height={RH*2} rx={7} fill="url(#fu-g-blue)" filter="url(#fu-sh)"/>
                <text x={FCX} y={FYBU+1} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="700" fill="#fff">Busca follow-ups pendentes</text>
              </g>

              <g className="fn-node" style={{animationDelay:'0.16s'}}>
                <path d={fuDp(FCX,FYD1)} fill="url(#fu-g-amber)" filter="url(#fu-sh)"/>
                <text x={FCX} y={FYD1-8} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="600" fill="#fff">Encontrou</text>
                <text x={FCX} y={FYD1+8} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="600" fill="#fff">pendentes?</text>
              </g>

              <g className="fn-node" style={{animationDelay:'0.2s'}}>
                <ellipse cx={500} cy={FYD1} rx={78} ry={OH} fill="url(#fu-g-red)" filter="url(#fu-sh)"/>
                <text x={500} y={FYD1+1} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="700" fill="#fff">Nenhum → FIM</text>
              </g>

              <g className="fn-node" style={{animationDelay:'0.24s'}}>
                <path d={fuDp(FCX,FYD2)} fill="url(#fu-g-amber)" filter="url(#fu-sh)"/>
                <text x={FCX} y={FYD2-8} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="600" fill="#fff">Dentro da</text>
                <text x={FCX} y={FYD2+8} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="600" fill="#fff">janela?</text>
              </g>

              <g className="fn-node" style={{animationDelay:'0.28s'}}>
                <rect x={12} y={FYD2-20} width={106} height={40} rx={7} fill="url(#fu-g-orange)" filter="url(#fu-sh)"/>
                <text x={65} y={FYD2-5} textAnchor="middle" dominantBaseline="middle" fontSize="8" fontWeight="700" fill="#fff">Reagenda p/</text>
                <text x={65} y={FYD2+9} textAnchor="middle" dominantBaseline="middle" fontSize="7.5" fill="#fff">próxima abertura</text>
              </g>

              <g className="fn-node" style={{animationDelay:'0.32s'}}>
                <path d={fuDp(FCX,FYD3)} fill="url(#fu-g-amber)" filter="url(#fu-sh)"/>
                <text x={FCX} y={FYD3-8} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="600" fill="#fff">Tipo</text>
                <text x={FCX} y={FYD3+8} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="600" fill="#fff">manual?</text>
              </g>

              <g className="fn-node" style={{animationDelay:'0.4s'}}>
                <rect x={FBMANX-FBBOXW/2} y={FYBRN-FBBOXH/2} width={FBBOXW} height={FBBOXH} rx={7} fill="url(#fu-g-emerald)" filter="url(#fu-sh)"/>
                <text x={FBMANX} y={FYBRN-6} textAnchor="middle" dominantBaseline="middle" fontSize="8" fontWeight="700" fill="#fff">Envia msg</text>
                <text x={FBMANX} y={FYBRN+8} textAnchor="middle" dominantBaseline="middle" fontSize="7.5" fill="#fff">pré-definida</text>
              </g>

              <g className="fn-node" style={{animationDelay:'0.4s'}}>
                <rect x={FBAGX-FBBOXW/2} y={FYBRN-FBBOXH/2} width={FBBOXW} height={FBBOXH} rx={7} fill="url(#fu-g-violet)" filter="url(#fu-sh)"/>
                <text x={FBAGX} y={FYBRN-6} textAnchor="middle" dominantBaseline="middle" fontSize="8" fontWeight="700" fill="#fff">Agente IA</text>
                <text x={FBAGX} y={FYBRN+8} textAnchor="middle" dominantBaseline="middle" fontSize="7.5" fill="#e9d5ff">lê histórico WA real</text>
              </g>

              <circle cx={FCX} cy={FYCONV} r={4} fill={GRAY}/>

              <g className="fn-node" style={{animationDelay:'0.48s'}}>
                <rect x={FCX-RW} y={FYMARK-RH} width={RW*2} height={RH*2} rx={7} fill="url(#fu-g-blue)" filter="url(#fu-sh)"/>
                <text x={FCX} y={FYMARK+1} textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="700" fill="#fff">Marca como enviado</text>
              </g>

              <g className="fn-node" style={{animationDelay:'0.56s'}}>
                <rect x={FCX-RW} y={FYCRM2-RH} width={RW*2} height={RH*2} rx={7} fill="url(#fu-g-teal)" filter="url(#fu-sh)"/>
                <text x={FCX} y={FYCRM2+1} textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="700" fill="#fff">Atualiza CRM</text>
              </g>

              <g className="fn-node" style={{animationDelay:'0.64s'}}>
                <ellipse cx={FCX} cy={FYEND} rx={OW} ry={OH} fill="url(#fu-g-green)" filter="url(#fu-sh)"/>
                <text x={FCX} y={FYEND+1} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="700" fill="#fff">FIM</text>
              </g>

              {/* ══════════════ EDGE LABELS ══════════════ */}
              <text x={FCX+4} y={FYD1+DH+11} fontSize="8.5" fontWeight="700" fill="#16a34a">Sim</text>
              <text x={FCX+DW+4} y={FYD1-4} fontSize="8.5" fontWeight="700" fill={RED}>Não</text>
              <text x={FCX+4} y={FYD2+DH+11} fontSize="8.5" fontWeight="700" fill="#16a34a">Sim</text>
              <text x={FCX-DW-4} y={FYD2-4} textAnchor="end" fontSize="8.5" fontWeight="700" fill={ORANGE}>Não</text>
              <text x={FCX-DW-4} y={FYD3-4} textAnchor="end" fontSize="8.5" fontWeight="700" fill="#10b981">Manual</text>
              <text x={FCX+DW+4} y={FYD3-4} fontSize="8.5" fontWeight="700" fill={PURPLE}>Agente IA</text>
            </svg>
          </div>
        </div>
      </div>

      {/* ── Responsabilidades: uma dona para cada regra ── */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <h4 className="text-sm font-semibold text-gray-800">Por trás dos panos: quem decide o quê</h4>
          <p className="text-xs text-gray-500 mt-0.5">
            O sistema já teve a mesma pergunta respondida em dois lugares diferentes, com respostas em conflito.
            Hoje cada uma destas seis perguntas tem uma fonte única.
          </p>
        </div>
        <div className="divide-y divide-gray-50">
          {[
            { t: 'Agendamento — QUANDO o toque deve sair',
              d: 'A cadência do estágio. Cada passo tem base (entrada no estágio ou horário do passo anterior), atraso em minutos/horas/dias ou data fixa, hora exata e dias da semana permitidos. O primeiro passo sempre conta da entrada. Nada além da cadência decide o ritmo — não existe teto de "um toque por dia" nem de "um envio por empresa por ciclo": os dois existiram e foram removidos, porque atropelavam o horário que o administrador desenhou.' },
            { t: 'Janela — QUANDO é permitido falar com o lead',
              d: 'Uma configuração por empresa (Agendamentos → Horário de envio): início, fim e dias da semana. Padrão 08:00–20:00, todos os dias. Vale para o follow-up e para o agente reativo — o reativo tinha 08h–20h escrito no código. Os dias do PASSO são interseccionados com os dias da janela: o passo pode restringir mais, nunca ampliar. Follow-up atrasado não escapa da janela: ele é reagendado para a próxima abertura, com alguns minutos de folga aleatória para a fila não sair em rajada às 8h.' },
            { t: 'Anti-ban — o espaçamento entre envios automáticos',
              d: 'Medido por CHIP (o número que envia), nunca por empresa: o risco de bloqueio é do número, e medir por empresa fazia o chip de uma pessoa segurar a fila de outra sem reduzir risco nenhum. Conta só automação — follow-up, disparo, agente de IA e lembrete entram; conversa manual do operador e mensagem recebida NÃO entram. Antes qualquer saída contava, e um operador ativo o dia todo empurrava a fila indefinidamente, sem erro e sem alerta. O intervalo é aleatório entre um mínimo e um máximo configuráveis por empresa.' },
            { t: 'Concorrência — quem tem o direito de processar',
              d: 'A API roda em 3 instâncias e o cron dispara a cada minuto. Antes de enviar, o ciclo RECLAMA o registro com uma escrita condicional no banco: de dois ciclos concorrentes, um vence e o outro vê que não pegou nada. A garantia é do Postgres, não da memória do processo. Um registro reclamado não aparece mais na fila, então nem outro ciclo nem outra instância pega o mesmo follow-up.' },
            { t: 'Retry — o que fazer quando falha',
              d: 'Cada categoria de erro tem um destino próprio (tabela abaixo) e todas as que re-tentam têm teto: 8 tentativas. Ao estourar, o follow-up vira "falhou" com o motivo acumulado, aparece na tela e pode ser reagendado depois que o problema for corrigido. Existe ainda um disjuntor por chip: diagnosticado um número bloqueado, os demais follow-ups daquele responsável param de ser tentados no resto do ciclo — sem isso, 40 follow-ups gastariam 40 tentativas num problema que é um só.' },
            { t: 'Pós-envio — como confirmar o que aconteceu',
              d: 'Se o processo morre no meio de um envio (restart, OOM, orçamento estourado), o registro fica "processando". Um reaper resolve no ciclo seguinte pela EVIDÊNCIA no histórico: existe uma saída de follow-up, sem erro, na janela de tempo daquele envio? Então saiu — marca como enviado. Não existe? Volta para a fila. Nunca por palpite: chutar "provavelmente não enviou" mandaria a mensagem duas vezes, que é o pior desfecho.' },
          ].map((x) => (
            <div key={x.t} className="px-5 py-3">
              <p className="text-xs font-semibold text-gray-800">{x.t}</p>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">{x.d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Categorias de erro ── */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <h4 className="text-sm font-semibold text-gray-800">O que acontece quando um follow-up falha</h4>
          <p className="text-xs text-gray-500 mt-0.5">
            Quem decide não é o código HTTP, é a categoria. O mesmo 503 pode ser instância reiniciando ou chip banido,
            e os destinos são opostos — por isso o sistema consulta o estado real do número antes de escolher.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Categoria</th>
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Quando</th>
                <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Destino</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[
                ['Instabilidade', 'Rede, rate limit, sobrecarga, timeout', 'Adia 15min · teto de 8 tentativas'],
                ['WhatsApp indisponível', 'A instância respondeu 503 e o diagnóstico diz que ela só está reconectando', 'Adia 30min · teto de 8 · abre o disjuntor do chip'],
                ['Número desconectado', 'Diagnóstico confirma ban, logout ou sessão inválida', 'Falha na hora — esperar não resolve. Reconecte o número e reagende'],
                ['Número sem WhatsApp', 'A instância confirmou que o telefone não tem conta (422)', 'Falha definitiva, sem retry. Corrija o telefone do lead'],
                ['IA sem saldo/chave', 'O provedor recusou por credencial ou saldo', 'Pausa a EMPRESA por 60min — a fila inteira cairia igual'],
                ['Agente não configurado', 'A empresa não tem agente de IA configurado', 'Falha explícita e reagendável. Antes era adiada de hora em hora, para sempre, sem nada na tela'],
                ['Conflito de configuração', 'Os dias do passo não têm nenhum dia em comum com a janela da empresa', 'Falha explícita — não existe dia possível. Nunca envia num dia não autorizado'],
                ['Lead arquivado', 'O lead foi arquivado e a régua deixou de valer', 'Encerrado como cancelado, com motivo. Reative o lead para retomar'],
              ].map(([c, q, d]) => (
                <tr key={c} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">{c}</td>
                  <td className="px-4 py-2.5 text-gray-600">{q}</td>
                  <td className="px-4 py-2.5 text-gray-600">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-600 leading-relaxed">
            Falha nenhuma some em silêncio: o motivo aparece no card do lead, em linguagem de operador, com o que
            precisa ser feito antes de reagendar. Quando a causa não se resolve com o tempo, a tela avisa que
            reagendar sem corrigir vai falhar de novo.
          </p>
        </div>
      </div>

      {/* Notices */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">

        {/* Contexto unificado */}
        <div className="flex gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 sm:col-span-2">
          <FileText size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-800">Contexto da IA — as duas pontas recebem a mesma coisa</p>
            <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
              O follow-up de IA e o agente reativo montam o contexto com as <strong>mesmas funções</strong>, para não
              acontecer de um saber algo que o outro não sabe. Vão juntos: a conversa do WhatsApp lida
              por <strong>contato</strong> (um contato pode ter leads em vários funis, e ler só por lead perdia metade
              do diálogo), o lead completo do banco, o estágio atual, a instrução do estágio, a instrução daquele passo
              da cadência, a agenda (tarefas pendentes, encerradas e reunião marcada), as 20 últimas anotações
              <strong> com autoria</strong> e a data e hora de São Paulo. Mensagem de grupo fica fora: ela é gravada no
              contato do participante e não é conversa 1:1 com o lead.
            </p>
          </div>
        </div>

        {/* Reunião marcada */}
        <div className="flex gap-3 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
          <CalendarCheck size={15} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-emerald-800">Reunião marcada é compromisso, não sugestão</p>
            <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">
              Havendo reunião pendente, o prompt recebe a data e a hora exatas e a instrução de tratá-las como
              combinadas: não propor outro horário, não pedir para remarcar por conta própria e não criar outra tarefa
              de reunião. Se a hora não foi preenchida no sistema (o formulário preenche com "agora" quando alguém
              escolhe só o dia), o agente é instruído a <strong>confirmar</strong> em vez de afirmar um horário que
              ninguém combinou — e o lembrete automático não sai nesse caso, porque mandar "sua conversa é às 10h37"
              com hora inventada é pior que não mandar nada.
            </p>
          </div>
        </div>

        {/* Autoria das anotações */}
        <div className="flex gap-3 p-3.5 rounded-xl bg-violet-50 border border-violet-200">
          <FileText size={15} className="text-violet-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-violet-800">Anotações têm autor</p>
            <p className="text-xs text-violet-700 mt-0.5 leading-relaxed">
              Cada anotação é gravada como <strong>usuário</strong>, <strong>agente</strong> ou <strong>sistema</strong>, e
              o prompt rotula a origem linha por linha. O agente registra uma nota a cada follow-up enviado; sem o
              rótulo, ele relia as próprias mensagens como se fossem observações escritas por um vendedor — eco que
              virava contexto falso a cada novo toque. As notas continuam no histórico: o que mudou é ele saber quem
              escreveu cada uma. A autoria nunca vem do cliente, para não ser possível forjar "evento do sistema".
            </p>
          </div>
        </div>

        {/* Guards do agente reativo */}
        <div className="flex gap-3 p-3.5 rounded-xl bg-blue-50 border border-blue-200">
          <Info size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-blue-800">Guards do agente reativo</p>
            <ul className="text-xs text-blue-700 mt-1 space-y-0.5 leading-relaxed list-none">
              <li>🔹 <strong>Elegibilidade</strong> — só texto (e áudio, depois de transcrito); grupo nunca dispara resposta</li>
              <li>🔹 <strong>Um lead principal</strong> — contato com leads em vários funis gera UMA resposta, não uma por lead</li>
              <li>🔹 <strong>Agente ativo</strong> — override do lead &gt; toggle do estágio &gt; inativo</li>
              <li>🔹 <strong>Anti-loop</strong> — aborta se o contato é o próprio número da instância</li>
              <li>🔹 <strong>Agregação</strong> — mensagens que chegam durante o delay entram na mesma resposta; se chegam com o turno já rodando, viram uma continuação em vez de sumir</li>
              <li>🔹 <strong>Anti-duplicação</strong> — aborta se saiu resposta <strong>bem-sucedida</strong> durante o delay. Falha de envio não conta: o balão vermelho é tentativa, não resposta, e antes ele silenciava o agente justamente quando o envio anterior tinha falhado</li>
              <li>🔹 <strong>Retry seguro</strong> — falha transitória antes de qualquer ferramenta é re-tentada; depois de uma ferramenta ter rodado, não, porque repetir o turno recriaria tarefa e moveria estágio de novo</li>
            </ul>
          </div>
        </div>

        {/* Guards do follow-up */}
        <div className="flex gap-3 p-3.5 rounded-xl bg-orange-50 border border-orange-200">
          <Clock size={15} className="text-orange-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-orange-800">Guards do follow-up agendado</p>
            <ul className="text-xs text-orange-700 mt-1 space-y-0.5 leading-relaxed">
              <li>🔸 <strong>Conversa viva</strong> — adia 15min se o <strong>LEAD</strong> escreveu na última hora. Só a fala dele conta: até 25/08 o ramo de IA olhava qualquer mensagem, inclusive as nossas, e isso virava um teto de "um toque por hora" que empurrava todo passo curto da cadência</li>
              <li>🔸 <strong>Ordem da cadência</strong> — um passo não passa na frente de outro anterior que ainda esteja pendente ou em voo, mesmo que um adiamento tenha reordenado os horários</li>
              <li>🔸 <strong>Fila isolada</strong> — por empresa e, dentro dela, por chip, em paralelo. Um chip parado não segura outro; uma empresa pausada não segura as demais</li>
              <li>🔸 <strong>Orçamento</strong> — 45s por chamada ao provedor, 90s por follow-up e 55s por ciclo. Nenhuma chamada pendurada segura a fila das outras empresas</li>
              <li>🔸 <strong>Lead arquivado</strong> — não recebe cadência, e o que estiver pendente é encerrado com motivo em todo ciclo (vale mesmo quando o lead foi arquivado direto no banco)</li>
              <li>🔸 <strong>Envio verificado</strong> — falha no WhatsApp nunca marca como enviado; mensagem sem texto e sem mídia não é disparada</li>
              <li>🔸 <strong>Grupo não conta</strong> — atividade em grupo não adia nem bloqueia follow-up 1:1</li>
            </ul>
          </div>
        </div>

        {/* Ativação */}
        <div className="flex gap-3 p-3.5 rounded-xl bg-primary-50 border border-primary-200">
          <Zap size={15} className="text-primary-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-primary-800">Três níveis de instrução</p>
            <p className="text-xs text-primary-700 mt-0.5 leading-relaxed">
              <strong>Empresa</strong> (aqui, em Configurar Agente): quem ele é, tom e regras gerais.
              <strong> Estágio</strong> (configurações da coluna no Kanban): como responder nesta etapa do funil — é a
              instrução do agente <em>reativo</em>. <strong>Passo da cadência</strong>: o que aquele toque específico deve
              dizer. Os três chegam juntos ao prompt e não competem. Ativação segue a mesma hierarquia: override do
              lead &gt; toggle do estágio &gt; inativo — o 🤖 no cabeçalho da coluna mostra quando está ligado.
            </p>
          </div>
        </div>

        {/* Áudio */}
        <div className="flex gap-3 p-3.5 rounded-xl bg-primary-50 border border-primary-200">
          <Mic size={15} className="text-primary-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-primary-800">Áudio, mídia e privacidade</p>
            <p className="text-xs text-primary-700 mt-0.5 leading-relaxed">
              Áudio do WhatsApp é transcrito pelo Gemini e entra como texto (<strong>requer chave Gemini</strong>).
              Imagem e documento são armazenados, mas não analisados pela IA. Desde 25/08 a mídia de conversa
              <strong> não é mais pública</strong>: o acesso passa por autenticação e o sistema confere no banco de qual
              empresa é cada arquivo antes de entregá-lo — a árvore de pastas não serve para isso, porque grava id de
              usuário num caminho e id de empresa no outro.
            </p>
          </div>
        </div>

        {/* Como o agente escreve */}
        <div className="flex gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-200 sm:col-span-2">
          <Bot size={15} className="text-gray-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-gray-800">Como o agente escreve — e o que ele não faz</p>
            <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
              Ele se apresenta com o nome de <strong>quem é dono do número que está enviando</strong>, não de quem criou o
              follow-up: um número se apresentando como outra pessoa é o tipo de detalhe que o lead percebe. Mensagens
              curtas, sem asterisco, sem lista, saudação coerente com a hora de São Paulo, e blocos separados por linha
              em branco saem como mensagens separadas (no máximo 3 por turno). Ele <strong>nunca</strong> menciona que
              criou tarefa, moveu estágio ou agendou algo — essas ações acontecem em silêncio. E nunca promete preço,
              desconto ou condição que não esteja confirmada.
            </p>
          </div>
        </div>

        {/* Duo */}
        <div className="flex gap-3 p-3.5 rounded-xl bg-teal-50 border border-teal-200 sm:col-span-2">
          <Bot size={15} className="text-teal-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-teal-800">Duo — assistente interno da equipe</p>
            <p className="text-xs text-teal-700 mt-0.5 leading-relaxed">
              Mecanismo separado do agente do CRM: atende a <strong>equipe</strong> pelo chat da interface e não opera no
              WhatsApp. Tem <strong>11 ferramentas financeiras</strong> (resumo, receitas, despesas, categorias, parcelas
              pendentes, evolução mensal, lançamentos) e, para <code className="font-mono bg-teal-100 px-1 rounded">super_admin</code>,
              gestão de assinatura de empresa. Foi por existir esse canal interno que o agente do WhatsApp
              <strong> perdeu</strong> o conjunto financeiro em 14/08: conversar com um lead é conversar com terceiro não
              confiável, e prompt não é barreira de segurança. O Duo tem histórico próprio e configuração própria de
              liga/desliga; o que ele compartilha com o agente do CRM é só a credencial de IA. No formato, o prompt
              proíbe título, tabela, divisória e citação, limita emoji a um, mira 4–8 linhas e manda encerrar quando a
              resposta acaba — tabela numa janela de 380px é ilegível mesmo renderizada.
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────────

export const AgenteFinanceiro: React.FC = () => {
  const { user } = useAuth()

  // Configurar o agente é exclusivo do CREATOR (o dono) — mesma regra do backend em
  // agente-ia.controller.ts. Master administra usuários, mas não mexe no prompt.
  const podeConfigurar = podeConfigurarAgenteIA(user)

  const tabs: { key: Aba; label: string }[] = [
    { key: 'assistente', label: 'Duo' },
    ...(podeConfigurar ? [{ key: 'configurar' as Aba, label: 'Configurar Agente' }] : []),
    { key: 'como-funciona', label: 'Como Funciona' },
  ]
  // Na URL, para o F5 reabrir a mesma aba; só vale aba que este papel enxerga.
  const [aba, setAba] = useAbaNaUrl<Aba>('aba', 'assistente', tabs.map((t) => t.key))

  // h-full, não h-screen: a área útil já vem descontada da barra de topo do mobile.
  return (
    <div className="flex flex-col h-full">
      <Header
        title="Duo"
        subtitle="Sua consultora de sistema, operação e abordagens — também responde no WhatsApp"
        tourId="agente"
      />

      {/* Tabs */}
      {/* overflow-x-auto + whitespace-nowrap: em telas estreitas as abas rolam
          lateralmente em vez de quebrar o rótulo em duas linhas. */}
      <div className="flex overflow-x-auto border-b border-gray-200 px-4 bg-white flex-shrink-0" data-tour="agente-abas">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setAba(tab.key)}
            data-tour={`agente-tab-${tab.key}`}
            className={`whitespace-nowrap px-4 sm:px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              aba === tab.key
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div data-tour="agente-conteudo" className={`flex-1 min-h-0 ${aba === 'assistente' ? 'flex flex-col' : 'overflow-y-auto'}`}>
        {aba === 'assistente' && <AssistenteChat />}
        {aba === 'configurar' && <ConfigurarAgente />}
        {aba === 'como-funciona' && <ComoFunciona />}
      </div>
    </div>
  )
}
