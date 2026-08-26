import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  LifeBuoy, Plus, Send, RefreshCw, Loader2, ArrowLeft, CheckCircle2, Bot, User, Headset,
  Paperclip, Info, Lock, X, Sparkles, AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Header } from '@/components/layout'
import { Button, Card, EstadoVazio, Modal, ModalFooter, Input, Select, Textarea } from '@/components/ui'
import {
  suporteApi, ROTULO_STATUS, ROTULO_CATEGORIA, ROTULO_PRIORIDADE, urlAnexo,
  type Ticket, type TicketMensagem, type StatusTicket, type TicketAnexo,
  type SugestaoIA, type MetricasSuporte,
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

/** Minutos → texto curto. Média de horas em "312 min" não se lê. */
function duracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`
  if (minutos < 60 * 24) return `${(minutos / 60).toFixed(1).replace('.0', '')} h`
  return `${(minutos / 60 / 24).toFixed(1).replace('.0', '')} d`
}

function quando(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Anexo: imagem abre como miniatura clicável; o resto vira linha de arquivo. */
function Anexos({ anexos }: { anexos: TicketAnexo[] }) {
  if (!anexos?.length) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {anexos.map(a => {
        const url = urlAnexo(a.id)
        const ehImagem = a.mimetype.startsWith('image/')
        return (
          <a
            key={a.id}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={`${a.nome_original} · ${(a.tamanho_bytes / 1024).toFixed(0)} KB`}
            className="group block"
          >
            {ehImagem ? (
              <img
                src={url}
                alt={a.nome_original}
                loading="lazy"
                className="h-24 w-24 rounded-lg border border-gray-200 object-cover transition-opacity group-hover:opacity-80 dark:border-gray-600"
              />
            ) : (
              <span className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                <Paperclip className="h-3 w-3 shrink-0" />
                <span className="truncate">{a.nome_original}</span>
              </span>
            )}
          </a>
        )
      })}
    </div>
  )
}

function Balao({ m }: { m: TicketMensagem }) {
  // Evento do sistema não é fala de ninguém: vira uma linha discreta no meio da
  // conversa, para a ordem dos fatos ficar legível sem competir com as mensagens.
  if (m.tipo === 'evento') {
    return (
      <div className="flex items-center justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          <Info className="h-3 w-3" /> {m.conteudo} · {quando(m.created_at)}
        </span>
      </div>
    )
  }

  // Nota interna: só a equipe recebe do backend (`visivel_cliente = false`), mas o
  // visual precisa deixar isso óbvio para ninguém escrever ali achando que o
  // cliente vai ler.
  if (m.tipo === 'nota_interna') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%]">
          <span className="flex items-center gap-1 px-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
            <Lock className="h-3 w-3" /> Nota interna{m.autor_nome ? ` · ${m.autor_nome}` : ''} · {quando(m.created_at)} · o cliente não vê
          </span>
          <div className="mt-1 whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            {m.conteudo}
          </div>
          <Anexos anexos={m.anexos || []} />
        </div>
      </div>
    )
  }

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
        <Anexos anexos={m.anexos || []} />
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
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [arquivos, setArquivos] = useState<File[]>([])
  const [interna, setInterna] = useState(false)
  const [sugestao, setSugestao] = useState<SugestaoIA | null>(null)
  const [pedindoSugestao, setPedindoSugestao] = useState(false)
  const [metricas, setMetricas] = useState<MetricasSuporte | null>(null)
  const fimDaConversa = useRef<HTMLDivElement>(null)
  const inputArquivo = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const { tickets, atendente } = await suporteApi.listar(filtroStatus)
      setTickets(tickets)
      setAtendente(atendente)
      // Métricas só interessam a quem atende; para o cliente seriam números do
      // próprio chamado, que ele já vê na lista.
      if (atendente) {
        suporteApi.metricas().then(setMetricas).catch(() => setMetricas(null))
      }
    } catch {
      toast.error('Não foi possível carregar seus chamados')
    } finally {
      setCarregando(false)
    }
  }, [filtroStatus])

  useEffect(() => { carregar() }, [carregar])

  const abrirConversa = useCallback(async (id: number) => {
    setCarregandoConversa(true)
    // Sugestão e anexo pertencem ao chamado que estava aberto: levá-los para o
    // próximo seria anexar arquivo no ticket errado.
    setSugestao(null)
    setArquivos([])
    setInterna(false)
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
      // Anexo sobe ANTES da mensagem: o id de cada arquivo é o que amarra os dois.
      // Se o upload falhar, a mensagem não é enviada — melhor o usuário tentar de
      // novo do que receber um texto que promete um print que não chegou.
      const anexoIds: number[] = []
      for (const arq of arquivos) {
        const anexo = await suporteApi.subirAnexo(selecionado.id, arq)
        anexoIds.push(anexo.id)
      }
      await suporteApi.responder(selecionado.id, texto, {
        anexoIds: anexoIds.length ? anexoIds : undefined,
        interna: interna || undefined,
      })
      // Recarrega a conversa em vez de só empilhar: a resposta pode ter gerado
      // evento de status, e o anexo vem resolvido pelo backend.
      const { ticket, mensagens: msgs } = await suporteApi.detalhe(selecionado.id)
      setSelecionado(ticket)
      setMensagens(msgs)
      setResposta('')
      setArquivos([])
      setInterna(false)
      carregar()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao enviar a resposta')
    } finally {
      setEnviando(false)
    }
  }

  const escolherArquivos = (lista: FileList | null) => {
    if (!lista?.length) return
    // Teto no cliente só para dar erro imediato; quem decide é o backend, que lê a
    // assinatura do arquivo — MIME e extensão são afirmações de quem envia.
    const aceitos: File[] = []
    for (const f of Array.from(lista)) {
      if (f.size > 10 * 1024 * 1024) { toast.error(`"${f.name}" passa de 10 MB`); continue }
      aceitos.push(f)
    }
    setArquivos(prev => [...prev, ...aceitos].slice(0, 3))
    if (inputArquivo.current) inputArquivo.current.value = ''
  }

  const pedirSugestao = async () => {
    if (!selecionado || pedindoSugestao) return
    setPedindoSugestao(true)
    try {
      setSugestao(await suporteApi.sugestaoIA(selecionado.id))
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Não foi possível pedir a sugestão')
    } finally {
      setPedindoSugestao(false)
    }
  }

  const mudarPrioridade = async (prioridade: string) => {
    if (!selecionado) return
    try {
      setSelecionado(await suporteApi.alterarPrioridade(selecionado.id, prioridade))
      carregar()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao alterar a prioridade')
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

      {/* Métricas da Central. Média só de quem já foi respondido — chamado sem
          resposta não tem tempo de resposta, e contá-lo como zero mentiria. */}
      {atendente && metricas && (
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { r: 'Na fila', v: String(metricas.na_fila), destaque: metricas.na_fila > 0 },
            { r: 'Com o cliente', v: String(metricas.com_cliente) },
            { r: 'Sem 1ª resposta', v: String(metricas.sem_resposta), destaque: metricas.sem_resposta > 0 },
            { r: 'Prioridade alta', v: String(metricas.abertos_alta), destaque: metricas.abertos_alta > 0 },
            { r: '1ª resposta', v: metricas.min_primeira_resposta != null ? duracao(metricas.min_primeira_resposta) : '—' },
            { r: 'Resolução', v: metricas.min_resolucao != null ? duracao(metricas.min_resolucao) : '—' },
          ].map(c => (
            <div
              key={c.r}
              className={`rounded-xl border p-3 ${
                c.destaque
                  ? 'border-amber-200 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10'
                  : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
              }`}
            >
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{c.r}</p>
              <p className={`mt-0.5 text-lg font-semibold ${c.destaque ? 'text-amber-800 dark:text-amber-200' : 'text-gray-900 dark:text-white'}`}>
                {c.v}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* Lista — no celular some quando há conversa aberta */}
        <Card className={`${selecionado ? 'hidden lg:block' : ''} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {atendente ? 'Central de suporte' : 'Meus chamados'}{' '}
              {tickets.length > 0 && <span className="text-gray-400">({tickets.length})</span>}
            </span>
            <div className="flex items-center gap-1.5">
            <select
              value={filtroStatus}
              onChange={e => setFiltroStatus(e.target.value)}
              aria-label="Filtrar por status"
              className="rounded-lg border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              <option value="todos">Todos</option>
              <option value="aguardando_suporte">Na fila</option>
              <option value="aguardando_cliente">Com o cliente</option>
              <option value="aberto">Abertos</option>
              <option value="resolvido">Resolvidos</option>
              <option value="fechado">Fechados</option>
            </select>
            <button
              onClick={carregar}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Atualizar"
              aria-label="Atualizar lista"
            >
              <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} />
            </button>
            </div>
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
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${CORES_STATUS[selecionado.status]}`}>
                    {ROTULO_STATUS[selecionado.status]}
                  </span>
                  {/* Prioridade é da equipe: o cliente não escolhe na abertura,
                      justamente para "urgente" continuar querendo dizer algo. */}
                  {atendente ? (
                    <select
                      value={selecionado.prioridade}
                      onChange={e => mudarPrioridade(e.target.value)}
                      aria-label="Prioridade"
                      className={`rounded-lg border px-1.5 py-1 text-[10px] font-semibold ${
                        selecionado.prioridade === 'alta'
                          ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300'
                          : 'border-gray-300 bg-white text-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {['baixa', 'normal', 'alta'].map(p => (
                        <option key={p} value={p}>{ROTULO_PRIORIDADE[p]}</option>
                      ))}
                    </select>
                  ) : selecionado.prioridade === 'alta' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-[10px] font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">
                      <AlertTriangle className="h-3 w-3" /> Alta
                    </span>
                  )}
                  {atendente && (
                    <button
                      onClick={pedirSugestao}
                      disabled={pedindoSugestao}
                      title="Pedir à IA um resumo e um rascunho de resposta"
                      className="inline-flex items-center gap-1 rounded-lg border border-violet-300 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50 dark:border-violet-500/40 dark:text-violet-300 dark:hover:bg-violet-500/10"
                    >
                      {pedindoSugestao ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      Sugestão
                    </button>
                  )}
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

              {/* Copiloto: SUGERE, nunca envia. O rascunho vai para a caixa de
                  texto e a pessoa revisa antes de mandar — premissa da fase 6. */}
              {atendente && sugestao && (
                <div className="border-b border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-500/30 dark:bg-violet-500/10">
                  {!sugestao.disponivel ? (
                    <p className="flex items-start gap-2 text-xs text-violet-800 dark:text-violet-200">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {sugestao.motivo}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-900 dark:text-violet-100">
                          <Sparkles className="h-3.5 w-3.5" /> Sugestão da IA — revise antes de enviar
                        </p>
                        <button
                          onClick={() => setSugestao(null)}
                          className="rounded p-0.5 text-violet-600 hover:bg-violet-100 dark:text-violet-300 dark:hover:bg-violet-500/20"
                          aria-label="Fechar sugestão"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {sugestao.resumo && (
                        <p className="text-xs leading-relaxed text-violet-900 dark:text-violet-100">
                          <strong>Resumo:</strong> {sugestao.resumo}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        {sugestao.classificacao && (
                          <span className="rounded-full bg-white px-2 py-0.5 font-medium text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">
                            categoria sugerida: {ROTULO_CATEGORIA[sugestao.classificacao] || sugestao.classificacao}
                          </span>
                        )}
                        {sugestao.prioridade_sugerida && (
                          <button
                            onClick={() => mudarPrioridade(sugestao.prioridade_sugerida!)}
                            className="rounded-full bg-white px-2 py-0.5 font-medium text-violet-700 hover:bg-violet-100 dark:bg-violet-500/20 dark:text-violet-200"
                            title="Aplicar esta prioridade"
                          >
                            prioridade sugerida: {ROTULO_PRIORIDADE[sugestao.prioridade_sugerida] || sugestao.prioridade_sugerida} · aplicar
                          </button>
                        )}
                      </div>
                      {sugestao.resposta_sugerida && (
                        <>
                          <p className="whitespace-pre-wrap rounded-lg border border-violet-200 bg-white p-2 text-xs leading-relaxed text-gray-700 dark:border-violet-500/30 dark:bg-gray-800 dark:text-gray-200">
                            {sugestao.resposta_sugerida}
                          </p>
                          <button
                            onClick={() => { setResposta(sugestao.resposta_sugerida!); setSugestao(null) }}
                            className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700"
                          >
                            Usar como rascunho
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

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
                  {/* Arquivos escolhidos, antes do envio: dá para tirar um sem
                      perder o texto já escrito. */}
                  {arquivos.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {arquivos.map((a, i) => (
                        <span
                          key={`${a.name}-${i}`}
                          className="inline-flex max-w-[200px] items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                        >
                          <Paperclip className="h-3 w-3 shrink-0" />
                          <span className="truncate">{a.name}</span>
                          <button
                            onClick={() => setArquivos(prev => prev.filter((_, j) => j !== i))}
                            aria-label={`Remover ${a.name}`}
                            className="rounded p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-100"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {atendente && (
                    <label className="mb-2 flex cursor-pointer items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={interna}
                        onChange={e => setInterna(e.target.checked)}
                        className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                      />
                      <Lock className="h-3 w-3" /> Nota interna — o cliente não vê e o chamado não muda de status
                    </label>
                  )}

                  <div className="flex items-end gap-2">
                    <input
                      ref={inputArquivo}
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                      onChange={e => escolherArquivos(e.target.files)}
                      className="hidden"
                    />
                    <button
                      onClick={() => inputArquivo.current?.click()}
                      title="Anexar print ou PDF (até 10 MB, no máximo 3)"
                      aria-label="Anexar arquivo"
                      disabled={arquivos.length >= 3}
                      className="rounded-xl border border-gray-300 p-2.5 text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                    <textarea
                      value={resposta}
                      onChange={e => setResposta(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarResposta() }
                      }}
                      rows={2}
                      placeholder={interna ? 'Nota interna da equipe…' : atendente ? 'Responder como suporte…' : 'Escreva sua resposta…'}
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
  const [arquivos, setArquivos] = useState<File[]>([])

  useEffect(() => {
    if (aberto) { setAssunto(''); setCategoria('duvida'); setMensagem(''); setArquivos([]) }
  }, [aberto])

  const criar = async () => {
    if (assunto.trim().length < 3) { toast.error('Descreva o assunto do chamado'); return }
    if (mensagem.trim().length < 10) { toast.error('Conte um pouco mais sobre o que está acontecendo'); return }
    setSalvando(true)
    try {
      const ticket = await suporteApi.criar({ assunto: assunto.trim(), categoria, mensagem: mensagem.trim() })

      // O anexo só pode subir DEPOIS: o ticket precisa existir para a autorização
      // saber de quem é o arquivo. Falha aqui não desfaz o chamado — ele já está
      // na fila da equipe, e perder o chamado por causa do print seria pior.
      let anexosComFalha = 0
      for (const arq of arquivos) {
        try {
          await suporteApi.subirAnexo(ticket.id, arq)
        } catch {
          anexosComFalha++
        }
      }
      if (anexosComFalha > 0) {
        toast.error(`Chamado aberto, mas ${anexosComFalha} anexo(s) não subiram. Você pode enviá-los na conversa.`)
      } else {
        toast.success('Chamado aberto — já está com a nossa equipe')
      }
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

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Anexos <span className="font-normal text-gray-400">(opcional)</span>
          </label>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            Um print da tela costuma resolver o chamado em uma ida e volta a menos.
            Imagem ou PDF, até 10 MB, no máximo 3 arquivos.
          </p>
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            onChange={e => {
              const lista = e.target.files
              if (!lista?.length) return
              const aceitos = Array.from(lista).filter(f => {
                if (f.size > 10 * 1024 * 1024) { toast.error(`"${f.name}" passa de 10 MB`); return false }
                return true
              })
              setArquivos(prev => [...prev, ...aceitos].slice(0, 3))
              e.target.value = ''
            }}
            className="block w-full cursor-pointer rounded-xl border border-gray-300 p-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          />
          {arquivos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {arquivos.map((a, i) => (
                <span
                  key={`${a.name}-${i}`}
                  className="inline-flex max-w-[220px] items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                >
                  <Paperclip className="h-3 w-3 shrink-0" />
                  <span className="truncate">{a.name}</span>
                  <button
                    onClick={() => setArquivos(prev => prev.filter((_, j) => j !== i))}
                    aria-label={`Remover ${a.name}`}
                    className="rounded p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={onFechar}>Cancelar</Button>
        <Button variant="primary" onClick={criar} isLoading={salvando}>Abrir chamado</Button>
      </ModalFooter>
    </Modal>
  )
}
