import React, { useCallback, useEffect, useRef, useState } from 'react'
import { LifeBuoy, Plus, Send, RefreshCw, Loader2, ArrowLeft, CheckCircle2, Bot, User, Headset } from 'lucide-react'
import toast from 'react-hot-toast'
import { Header } from '@/components/layout'
import { Button, Card, EstadoVazio, Modal, ModalFooter, Input, Select, Textarea } from '@/components/ui'
import {
  suporteApi, ROTULO_STATUS, ROTULO_CATEGORIA,
  type Ticket, type TicketMensagem, type StatusTicket,
} from '@/api/suporte'

/**
 * Suporte por chamado.
 *
 * Lista à esquerda, conversa à direita no desktop; no celular é uma coisa de
 * cada vez — dois painéis lado a lado em 360px deixariam os dois ilegíveis.
 *
 * Quem responde é a EQUIPE. O chamado nasce na fila humana e o rótulo de cada
 * balão diz quem falou: ninguém aqui finge ser pessoa. Até 25/08/2026 esta tela
 * prometia que "o Duo responde na hora" — e o Duo nunca respondeu, porque nunca
 * houve chave de IA configurada. Prometer atendimento que não existe é pior do
 * que não prometer nada.
 */

const CORES_STATUS: Record<StatusTicket, string> = {
  aberto: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  aguardando_cliente: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  aguardando_suporte: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  resolvido: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  fechado: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

const CATEGORIAS = [
  { value: 'duvida', label: 'Dúvida — como faço alguma coisa' },
  { value: 'problema', label: 'Problema — algo não está funcionando' },
  { value: 'cobranca', label: 'Cobrança — plano, fatura, assinatura' },
  { value: 'sugestao', label: 'Sugestão — ideia de melhoria' },
]

function quando(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function Balao({ m }: { m: TicketMensagem }) {
  const doCliente = m.autor === 'cliente'
  const Icone = m.autor === 'agente_ia' ? Bot : m.autor === 'suporte' ? Headset : User
  const rotulo = m.autor === 'agente_ia'
    ? 'Duo · assistente de IA'
    : m.autor === 'suporte'
      ? `Suporte DuoFuturo${m.autor_nome ? ` · ${m.autor_nome}` : ''}`
      : m.autor_nome || 'Você'

  return (
    <div className={`flex ${doCliente ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${doCliente ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <span className="flex items-center gap-1 px-1 text-[11px] text-gray-500 dark:text-gray-400">
          <Icone className="h-3 w-3" /> {rotulo} · {quando(m.created_at)}
        </span>
        <div
          className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm ${
            doCliente
              ? 'rounded-br-sm bg-primary-600 text-white'
              : m.autor === 'agente_ia'
                ? 'rounded-bl-sm border border-primary-100 bg-primary-50 text-gray-800 dark:border-primary-900/50 dark:bg-primary-900/20 dark:text-gray-100'
                : 'rounded-bl-sm border border-gray-200 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'
          }`}
        >
          {m.conteudo}
        </div>
      </div>
    </div>
  )
}

export const Suporte: React.FC = () => {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [atendente, setAtendente] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [selecionado, setSelecionado] = useState<Ticket | null>(null)
  const [mensagens, setMensagens] = useState<TicketMensagem[]>([])
  const [carregandoConversa, setCarregandoConversa] = useState(false)
  const [resposta, setResposta] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [novoAberto, setNovoAberto] = useState(false)
  const fimDaConversa = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const { tickets, atendente } = await suporteApi.listar()
      setTickets(tickets)
      setAtendente(atendente)
    } catch {
      toast.error('Não foi possível carregar seus chamados')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const abrirConversa = useCallback(async (id: number) => {
    setCarregandoConversa(true)
    try {
      const { ticket, mensagens } = await suporteApi.detalhe(id)
      setSelecionado(ticket)
      setMensagens(mensagens)
    } catch {
      toast.error('Não foi possível abrir o chamado')
    } finally {
      setCarregandoConversa(false)
    }
  }, [])

  useEffect(() => {
    fimDaConversa.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  const enviarResposta = async () => {
    const texto = resposta.trim()
    if (!texto || !selecionado || enviando) return
    setEnviando(true)
    try {
      const nova = await suporteApi.responder(selecionado.id, texto)
      setMensagens(prev => [...prev, nova])
      setResposta('')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao enviar a resposta')
    } finally {
      setEnviando(false)
    }
  }

  const mudarStatus = async (status: StatusTicket) => {
    if (!selecionado) return
    try {
      const atualizado = await suporteApi.alterarStatus(selecionado.id, status)
      setSelecionado(atualizado)
      toast.success(status === 'resolvido' ? 'Chamado marcado como resolvido' : 'Chamado reaberto')
      carregar()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao alterar o chamado')
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <Header
        title="Suporte"
        subtitle={atendente ? 'Chamados de todas as empresas' : 'Abra um chamado e nossa equipe responde'}
        action={
          <Button variant="primary" onClick={() => setNovoAberto(true)}>
            <Plus className="mr-2 h-4 w-4" /> Novo chamado
          </Button>
        }
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* Lista — no celular some quando há conversa aberta */}
        <Card className={`${selecionado ? 'hidden lg:block' : ''} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Meus chamados {tickets.length > 0 && <span className="text-gray-400">({tickets.length})</span>}
            </span>
            <button
              onClick={carregar}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Atualizar"
              aria-label="Atualizar lista"
            >
              <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} />
            </button>
          </div>

          {carregando ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
            </div>
          ) : tickets.length === 0 ? (
            <EstadoVazio
              avatar="duo"
              titulo="Nenhum chamado por aqui"
              descricao="Quando precisar de ajuda, abra um chamado. Ele vai direto para a nossa equipe de suporte, e você acompanha a conversa por aqui."
              acao={
                <Button variant="primary" onClick={() => setNovoAberto(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Abrir o primeiro chamado
                </Button>
              }
            />
          ) : (
            <ul className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-700 lg:max-h-[calc(100vh-16rem)]">
              {tickets.map(t => (
                <li key={t.id}>
                  <button
                    onClick={() => abrirConversa(t.id)}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                      selecionado?.id === t.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-sm font-medium text-gray-800 dark:text-gray-100">
                        {t.assunto}
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${CORES_STATUS[t.status]}`}>
                        {ROTULO_STATUS[t.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      #{t.id} · {ROTULO_CATEGORIA[t.categoria] || t.categoria} · {quando(t.updated_at)}
                      {atendente && t.empresa_nome && ` · ${t.empresa_nome}`}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Conversa */}
        <Card className={`${selecionado ? '' : 'hidden lg:flex'} flex min-h-[60vh] flex-col overflow-hidden`}>
          {!selecionado ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Escolha um chamado à esquerda para ver a conversa.
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                <div className="min-w-0 flex items-start gap-2">
                  <button
                    onClick={() => setSelecionado(null)}
                    className="mt-0.5 rounded-lg p-1 text-gray-500 hover:bg-gray-100 lg:hidden dark:hover:bg-gray-700"
                    aria-label="Voltar para a lista"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                      #{selecionado.id} · {selecionado.assunto}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {ROTULO_CATEGORIA[selecionado.categoria] || selecionado.categoria}
                      {atendente && ` · ${selecionado.empresa_nome} · ${selecionado.usuario_nome}`}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${CORES_STATUS[selecionado.status]}`}>
                    {ROTULO_STATUS[selecionado.status]}
                  </span>
                  {selecionado.status !== 'resolvido' && selecionado.status !== 'fechado' ? (
                    <button
                      onClick={() => mudarStatus('resolvido')}
                      className="inline-flex items-center gap-1 rounded-lg border border-green-200 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-300 dark:hover:bg-green-900/20"
                    >
                      <CheckCircle2 size={12} /> Resolvido
                    </button>
                  ) : selecionado.status === 'resolvido' && (
                    <button
                      onClick={() => mudarStatus('aberto')}
                      className="rounded-lg border px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300"
                    >
                      Reabrir
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50 p-4 dark:bg-gray-900">
                {carregandoConversa && mensagens.length === 0 ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
                  </div>
                ) : (
                  mensagens.map(m => <Balao key={m.id} m={m} />)
                )}
                {/* Silêncio depois da última mensagem do cliente parece falha —
                    então a tela diz onde o chamado está, sem prometer prazo. */}
                {selecionado.status === 'aguardando_suporte' && mensagens.length > 0 &&
                 mensagens[mensagens.length - 1].autor === 'cliente' && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Headset className="h-3 w-3" /> na fila da equipe de suporte
                  </div>
                )}
                <div ref={fimDaConversa} />
              </div>

              {selecionado.status === 'fechado' ? (
                <div className="border-t border-gray-200 p-3 text-center text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  Este chamado foi fechado. Abra um novo se precisar de mais alguma coisa.
                </div>
              ) : (
                <div className="border-t border-gray-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex items-end gap-2">
                    <textarea
                      value={resposta}
                      onChange={e => setResposta(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarResposta() }
                      }}
                      rows={2}
                      placeholder={atendente ? 'Responder como suporte…' : 'Escreva sua resposta…'}
                      aria-label="Sua mensagem"
                      className="max-h-32 flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 sm:text-sm"
                    />
                    <button
                      onClick={enviarResposta}
                      disabled={!resposta.trim() || enviando}
                      aria-label="Enviar"
                      className="rounded-xl bg-primary-600 p-2.5 text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
                    >
                      {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <NovoChamadoModal
        aberto={novoAberto}
        onFechar={() => setNovoAberto(false)}
        onCriado={ticket => {
          setNovoAberto(false)
          carregar()
          abrirConversa(ticket.id)
        }}
      />
    </div>
  )
}

function NovoChamadoModal({
  aberto, onFechar, onCriado,
}: {
  aberto: boolean
  onFechar: () => void
  onCriado: (t: Ticket) => void
}) {
  const [assunto, setAssunto] = useState('')
  const [categoria, setCategoria] = useState('duvida')
  const [mensagem, setMensagem] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (aberto) { setAssunto(''); setCategoria('duvida'); setMensagem('') }
  }, [aberto])

  const criar = async () => {
    if (assunto.trim().length < 3) { toast.error('Descreva o assunto do chamado'); return }
    if (mensagem.trim().length < 10) { toast.error('Conte um pouco mais sobre o que está acontecendo'); return }
    setSalvando(true)
    try {
      const ticket = await suporteApi.criar({ assunto: assunto.trim(), categoria, mensagem: mensagem.trim() })
      toast.success('Chamado aberto — já está com a nossa equipe')
      onCriado(ticket)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao abrir o chamado')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal isOpen={aberto} onClose={onFechar} title="Novo chamado" size="lg">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-primary-100 bg-primary-50 p-3 dark:border-primary-900/50 dark:bg-primary-900/20">
          <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-primary-600 dark:text-primary-300" />
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Seu chamado vai direto para a nossa equipe de suporte. Você acompanha a
            conversa por aqui e recebe aviso por e-mail quando houver resposta.
          </p>
        </div>

        <Input
          label="Assunto"
          value={assunto}
          onChange={e => setAssunto(e.target.value)}
          placeholder="Ex: WhatsApp desconectou e não reconecta"
          maxLength={200}
        />

        <Select label="Categoria" value={categoria} onChange={e => setCategoria(e.target.value)}>
          {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>

        <Textarea
          label="O que está acontecendo?"
          value={mensagem}
          onChange={e => setMensagem(e.target.value)}
          rows={6}
          placeholder="Conte o que você tentou fazer, o que aconteceu e em qual tela. Quanto mais detalhe, mais rápido resolvemos."
        />
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={onFechar}>Cancelar</Button>
        <Button variant="primary" onClick={criar} isLoading={salvando}>Abrir chamado</Button>
      </ModalFooter>
    </Modal>
  )
}
