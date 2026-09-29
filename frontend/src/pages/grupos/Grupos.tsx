import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  UsersRound, Send, Plus, Pencil, Trash2, History, HandHeart, Search, ShieldCheck, Lock, BadgeCheck, RefreshCw, Megaphone,
} from 'lucide-react'
import { Badge, Button, Card, EstadoVazio, Input, Modal, Spinner, Switch, Tabs } from '@/components/ui'
import { useAbaNaUrl } from '@/hooks/useEstadoNaUrl'
import { gruposApi, type BoasVindas, type GrupoWhatsApp, type MensagemGrupo } from '@/api/grupos'
import { MensagemGrupoModal } from './MensagemGrupoModal'
import { BoasVindasModal } from './BoasVindasModal'
import { dataHora, descreverQuando, previaWhatsApp } from './util'
import { CampanhasAba } from './Campanhas'
import { useAuth } from '@/contexts/AuthContext'
import { useCapacidades } from '@/hooks/useCapacidades'
import { CATALOGO } from '@/utils/capacidades'

/*
  Grupos do WhatsApp (migration 088). Três coisas, como o SendFlow: mensagem para
  vários grupos (na hora, agendada ou repetindo), boas-vindas a quem entra e a
  lista dos grupos do chip. Só pelo QR Code — quem está no número oficial vê o que
  a Meta exige (selo verde, até 8 pessoas) em vez de uma tela que não funcionaria.
*/

const ABAS = ['mensagens', 'boas-vindas', 'campanhas', 'grupos'] as const
const erroDe = (e: unknown, padrao: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || padrao

const Cabecalho: React.FC<{ numero?: string | null; conectado?: boolean }> = ({ numero, conectado }) => (
  <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <UsersRound className="w-8 h-8 text-green-600" aria-hidden="true" /> Grupos do WhatsApp
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mt-1">Avisos para vários grupos de uma vez, mensagens que se repetem e boas-vindas automáticas.</p>
    </div>
    {conectado !== undefined && (
      <Badge variant={conectado ? 'success' : 'warning'}>
        {conectado ? `Chip conectado${numero ? ` · +${numero}` : ''}` : 'Chip desconectado'}
      </Badge>
    )}
  </div>
)

const AvisoMeta: React.FC<{ texto?: string }> = ({ texto }) => (
  <div className="max-w-5xl mx-auto px-4 pt-4 pb-24 sm:px-6 sm:pb-8">
    <Cabecalho />
    <Card className="max-w-3xl">
      <div className="flex gap-4">
        <BadgeCheck className="w-10 h-10 text-emerald-600 shrink-0" aria-hidden="true" />
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Grupos pelo número oficial ainda não estão disponíveis para você</h2>
          <p>{texto || 'O seu WhatsApp está no número oficial da Meta.'}</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Conta Comercial Oficial</strong> — o selo verde ao lado do nome, que a Meta concede por pedido e análise.</li>
            <li><strong>Até 8 participantes</strong> por grupo, que entram só pelo link de convite. É feito para atendimento em grupo pequeno, não para comunidade.</li>
          </ul>
          <p>
            Grupos grandes — comunidade, turma, lista de avisos — funcionam pelo WhatsApp conectado por QR Code. Quem da sua equipe
            está no QR Code usa esta página normalmente.
          </p>
        </div>
      </div>
    </Card>
  </div>
)

export const Grupos: React.FC = () => {
  const qc = useQueryClient()
  const [aba, setAba] = useAbaNaUrl('aba', 'mensagens', ABAS)
  const { user } = useAuth()
  const { pode } = useCapacidades()
  const temCampanhas = pode('grupos_campanhas')
  const canal = useQuery({ queryKey: ['grupos', 'canal'], queryFn: gruposApi.canal, staleTime: 60_000 })
  const noQr = canal.data?.provedor === 'baileys'
  const lista = useQuery({ queryKey: ['grupos', 'lista'], queryFn: gruposApi.lista, enabled: noQr && !!canal.data?.conectado, staleTime: 5 * 60_000, retry: false })
  const mensagens = useQuery({ queryKey: ['grupos', 'mensagens'], queryFn: gruposApi.mensagens, enabled: noQr, refetchInterval: 30_000 })
  const boasVindas = useQuery({ queryKey: ['grupos', 'boas-vindas'], queryFn: gruposApi.boasVindas, enabled: noQr })

  const [modalMsg, setModalMsg] = useState<{ editando?: MensagemGrupo | null; pre?: string[] } | null>(null)
  const [modalBv, setModalBv] = useState<{ editando?: BoasVindas | null; grupo?: string } | null>(null)
  const [historico, setHistorico] = useState<MensagemGrupo | null>(null)
  const [busca, setBusca] = useState('')

  const invalidar = () => qc.invalidateQueries({ queryKey: ['grupos'] })
  const acao = useMutation({
    mutationFn: (f: () => Promise<unknown>) => f(),
    onSuccess: invalidar,
    onError: (e) => toast.error(erroDe(e, 'Não foi possível concluir')),
  })

  const grupos = useMemo(() => lista.data || [], [lista.data])
  const comBoasVindas = useMemo(() => new Set((boasVindas.data || []).map(b => b.grupo_whatsapp_id)), [boasVindas.data])
  const gruposFiltrados = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return b ? grupos.filter(g => g.nome.toLowerCase().includes(b)) : grupos
  }, [grupos, busca])

  if (canal.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (canal.data?.provedor === 'cloud_api') return <AvisoMeta texto={canal.data.aviso} />
  if (!noQr || !canal.data?.conectado) {
    return (
      <div className="max-w-5xl mx-auto px-4 pt-4 pb-24 sm:px-6 sm:pb-8">
        <Cabecalho conectado={noQr ? false : undefined} />
        <EstadoVazio avatar="duo" titulo="Conecte o seu WhatsApp por QR Code"
          descricao="Os grupos que aparecem aqui são os do número conectado. Conecte (ou reconecte) em WhatsApp e volte."
          acao={<Link to="/whatsapp"><Button>Ir para WhatsApp</Button></Link>} />
      </div>
    )
  }

  const erroLista = lista.error ? erroDe(lista.error, 'Não foi possível ler os grupos do WhatsApp') : null

  return (
    // pb-24 no celular: o botão flutuante do Duo cobria as ações do último card.
    <div className="max-w-5xl mx-auto px-4 pt-4 pb-24 sm:px-6 sm:pb-8">
      <Cabecalho conectado numero={canal.data.numero} />

      <Tabs className="mb-5" active={aba} onChange={(k) => setAba(k as typeof ABAS[number])} tabs={[
        { key: 'mensagens', label: 'Mensagens', icon: <Send className="w-4 h-4" />, badge: mensagens.data?.filter(m => m.ativa && m.proxima_execucao).length || undefined },
        { key: 'boas-vindas', label: 'Boas-vindas', icon: <HandHeart className="w-4 h-4" /> },
        { key: 'campanhas', label: 'Campanhas', icon: <Megaphone className="w-4 h-4" /> },
        { key: 'grupos', label: 'Meus grupos', icon: <UsersRound className="w-4 h-4" />, badge: grupos.length || undefined },
      ]} />

      {erroLista && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3 text-sm text-amber-800 dark:text-amber-200 flex items-center justify-between gap-3">
          <span>{erroLista}</span>
          <Button size="sm" variant="secondary" onClick={() => lista.refetch()}>Tentar de novo</Button>
        </div>
      )}

      {aba === 'mensagens' && (
        <section aria-label="Mensagens para grupos">
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setModalMsg({})} disabled={!grupos.length} title={!grupos.length ? 'Nenhum grupo carregado do WhatsApp' : undefined}><Plus className="w-4 h-4 mr-1" /> Nova mensagem</Button>
          </div>
          {mensagens.isLoading ? <Spinner /> : !mensagens.data?.length ? (
            <EstadoVazio avatar="duo" titulo="Nenhuma mensagem ainda"
              descricao="Mande um aviso para vários grupos de uma vez, agende para depois ou deixe repetindo — o lembrete da live toda quinta, por exemplo." />
          ) : (
            <ul className="space-y-3">
              {mensagens.data.map(m => (
                <li key={m.id}>
                  <Card>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{m.titulo}</h3>
                          {m.campanha_nome && <Badge variant="success">campanha · {m.campanha_nome}</Badge>}
                          {m.mencionar_todos && <Badge variant="info">marca todos</Badge>}
                          {!m.ativa && <Badge variant="default">pausada</Badge>}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                          {descreverQuando(m)} · {m.campanha_id ? 'todos os grupos da campanha' : `${m.grupos.length} grupo(s) · pelo chip de ${m.usuario_nome}`}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {m.ativa && m.proxima_execucao ? <>Próximo envio: <strong className="text-gray-800 dark:text-gray-200">{dataHora(m.proxima_execucao)}</strong></> : m.ultima_execucao ? `Último envio: ${dataHora(m.ultima_execucao)}` : 'Sem envio marcado'}
                          {' · '}{m.total_enviados} enviada(s){m.total_falhas ? <span className="text-red-600 dark:text-red-400"> · {m.total_falhas} falha(s)</span> : null}
                        </p>
                        {m.texto && <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 line-clamp-2 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: previaWhatsApp(m.texto) }} />}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {m.modo !== 'agora' && (
                          <Switch checked={m.ativa} labels={{ on: 'Ativa', off: 'Pausada' }} aria-label={`Envio de "${m.titulo}"`}
                            onChange={(v) => acao.mutate(() => gruposApi.alternarMensagem(m.id, v))} title={m.ativa ? 'Pausar' : 'Retomar'} />
                        )}
                        <Button size="sm" variant="secondary" title="Enviar agora"
                          onClick={() => acao.mutate(async () => { await gruposApi.enviarAgora(m.id); toast.success('Na fila — sai em até 1 minuto') })}>
                          <Send className="w-4 h-4" /><span className="sr-only">Enviar agora</span>
                        </Button>
                        <Button size="sm" variant="secondary" title="Histórico" onClick={() => setHistorico(m)}><History className="w-4 h-4" /><span className="sr-only">Histórico</span></Button>
                        <Button size="sm" variant="secondary" title="Editar" onClick={() => setModalMsg({ editando: m })}><Pencil className="w-4 h-4" /><span className="sr-only">Editar</span></Button>
                        <Button size="sm" variant="ghost" title="Excluir"
                          onClick={() => { if (confirm(`Excluir "${m.titulo}"? O histórico de envios sai junto.`)) acao.mutate(() => gruposApi.excluirMensagem(m.id)) }}>
                          <Trash2 className="w-4 h-4 text-red-600" /><span className="sr-only">Excluir</span>
                        </Button>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {aba === 'boas-vindas' && (
        <section aria-label="Boas-vindas">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">Quando alguém entra no grupo, o chip manda uma mensagem no próprio grupo. Quem entra junto recebe uma só.</p>
            <Button onClick={() => setModalBv({})} disabled={!grupos.length} title={!grupos.length ? 'Nenhum grupo carregado do WhatsApp' : undefined} className="shrink-0"><Plus className="w-4 h-4 mr-1" /> Nova boas-vindas</Button>
          </div>
          {boasVindas.isLoading ? <Spinner /> : !boasVindas.data?.length ? (
            <EstadoVazio avatar="duo" titulo="Nenhuma boas-vindas configurada" descricao="Quem entra no grupo pelo link é recebido com o seu texto, na hora ou alguns minutos depois." />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {boasVindas.data.map(b => (
                <li key={b.id}>
                  <Card className="h-full">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{b.grupo_nome || b.grupo_whatsapp_id}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {b.delay_segundos ? `${Math.round(b.delay_segundos / 60)} min depois` : 'Na hora'} · recebida por {b.total_disparos} {b.total_disparos === 1 ? 'pessoa' : 'pessoas'}
                          {b.ultimo_disparo_at ? ` · última ${dataHora(b.ultimo_disparo_at)}` : ''}
                        </p>
                      </div>
                      <Switch checked={b.ativa} labels={{ on: 'Ligada', off: 'Desligada' }} aria-label={`Boas-vindas de ${b.grupo_nome || 'grupo'}`} title={b.ativa ? 'Desligar' : 'Ligar'}
                        onChange={(v) => acao.mutate(() => gruposApi.atualizarBoasVindas(b.id, { mensagem: b.mensagem, delay_segundos: b.delay_segundos, mencionar: b.mencionar, ativa: v }))} />
                    </div>
                    <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 line-clamp-3 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: previaWhatsApp(b.mensagem) }} />
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setModalBv({ editando: b })}><Pencil className="w-4 h-4 mr-1" /> Editar</Button>
                      <Button size="sm" variant="ghost" title="Excluir" onClick={() => { if (confirm('Excluir esta boas-vindas?')) acao.mutate(() => gruposApi.excluirBoasVindas(b.id)) }}>
                        <Trash2 className="w-4 h-4 text-red-600" /><span className="sr-only">Excluir</span>
                      </Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {aba === 'campanhas' && (temCampanhas ? (
        <CampanhasAba grupos={grupos} meuId={user?.id ? Number(user.id) : undefined} mensagens={mensagens.data || []} />
      ) : (
        <EstadoVazio avatar="duo" titulo="Campanhas de grupo são do plano Enterprise"
          descricao={`${CATALOGO.grupos_campanhas.motivo} Um link só para divulgar, grupos que abrem sozinhos quando enchem, o painel de quem entrou e saiu — e quem entra vira lead no CRM.`}
          acao={<Link to="/planos"><Button>Ver planos</Button></Link>} />
      ))}

      {aba === 'grupos' && (
        <section aria-label="Meus grupos">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1"><Input placeholder="Buscar grupo" icon={<Search className="w-4 h-4" />} value={busca} onChange={e => setBusca(e.target.value)} /></div>
            <Button variant="secondary" onClick={() => lista.refetch()} isLoading={lista.isFetching}><RefreshCw className="w-4 h-4 mr-1" /> Atualizar</Button>
          </div>
          {lista.isLoading ? <Spinner /> : erroLista && !grupos.length ? null : !grupos.length ? (
            <EstadoVazio avatar="duo" titulo="Este número não está em nenhum grupo" descricao="Os grupos aparecem aqui assim que o número conectado participar deles." />
          ) : (
            <Card className="p-0 overflow-hidden">
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {!gruposFiltrados.length && <li className="px-4 py-6 text-sm text-center text-gray-500 dark:text-gray-400">Nenhum grupo com “{busca.trim()}”.</li>}
                {gruposFiltrados.map((g: GrupoWhatsApp) => {
                  const bloqueado = g.soAdminsEnviam && !g.souAdmin
                  return (
                    <li key={g.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{g.nome}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-2">
                          <span>{g.participantes} participantes</span>
                          {g.souAdmin && <span className="inline-flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> você é admin</span>}
                          {bloqueado && <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400"><Lock className="w-3.5 h-3.5" /> só administradores enviam</span>}
                          {comBoasVindas.has(g.id) && <span>· tem boas-vindas</span>}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="secondary" disabled={bloqueado} onClick={() => setModalMsg({ pre: [g.id] })}><Send className="w-4 h-4 mr-1" /> Mensagem</Button>
                        {!comBoasVindas.has(g.id) && (
                          <Button size="sm" variant="secondary" disabled={bloqueado} onClick={() => setModalBv({ grupo: g.id })}><HandHeart className="w-4 h-4 mr-1" /> Boas-vindas</Button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}
        </section>
      )}

      {modalMsg && (
        <MensagemGrupoModal aberto onFechar={() => setModalMsg(null)} grupos={grupos} editando={modalMsg.editando} preSelecionados={modalMsg.pre} />
      )}
      {modalBv && (
        <BoasVindasModal aberto onFechar={() => setModalBv(null)} grupos={grupos} editando={modalBv.editando}
          grupoInicial={modalBv.grupo} gruposComBoasVindas={comBoasVindas} />
      )}
      {historico && <HistoricoEnvios mensagem={historico} onFechar={() => setHistorico(null)} />}
    </div>
  )
}

const HistoricoEnvios: React.FC<{ mensagem: MensagemGrupo; onFechar: () => void }> = ({ mensagem, onFechar }) => {
  const q = useQuery({ queryKey: ['grupos', 'envios', mensagem.id], queryFn: () => gruposApi.envios(mensagem.id) })
  return (
    <Modal isOpen onClose={onFechar} title={`Envios · ${mensagem.titulo}`} size="lg">
      {q.isLoading ? <Spinner /> : q.isError ? (
        <div className="flex items-center justify-between gap-3 text-sm text-red-700 dark:text-red-300">
          <span>{erroDe(q.error, 'Não foi possível carregar os envios.')}</span>
          <Button size="sm" variant="secondary" onClick={() => q.refetch()}>Tentar de novo</Button>
        </div>
      ) : !q.data?.length ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">Ainda não saiu nenhum envio.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700 max-h-[60vh] overflow-y-auto">
          {q.data.map((e, i) => (
            <li key={i} className="py-2 text-sm flex items-start gap-3">
              <Badge variant={e.status === 'enviado' ? 'success' : 'danger'}>{e.status}</Badge>
              <div className="min-w-0">
                <p className="text-gray-900 dark:text-gray-100 truncate">{e.grupo_nome || e.grupo_id}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{dataHora(e.enviado_at)}{e.erro ? ` · ${e.erro}` : ''}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
