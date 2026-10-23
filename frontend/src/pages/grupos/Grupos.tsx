import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  UsersRound, Send, Plus, Pencil, Trash2, History, HandHeart, Search, ShieldCheck, Lock, BadgeCheck, RefreshCw, Megaphone, ExternalLink, AtSign, Repeat, CalendarClock, UserPlus,
  AlertTriangle, Clock,
} from 'lucide-react'
import { Badge, Button, Card, EstadoVazio, Input, Modal, Spinner, Switch, Tabs } from '@/components/ui'
import { useAbaNaUrl } from '@/hooks/useEstadoNaUrl'
import { gruposApi, type BoasVindas, type GrupoWhatsApp, type MensagemGrupo, type RegraCrmGrupo } from '@/api/grupos'
import { MensagemGrupoModal } from './MensagemGrupoModal'
import { BoasVindasModal } from './BoasVindasModal'
import { CriarLeadModal } from './CriarLeadModal'
import { dataHora, descreverQuando, previaWhatsApp, telefoneLegivel } from './util'
import { CampanhasAba, Opcoes, casa } from './Campanhas'
import { HorariosAba } from './HorariosAba'
import { useAuth } from '@/contexts/AuthContext'
import { useCapacidades } from '@/hooks/useCapacidades'
import { CATALOGO } from '@/utils/capacidades'
import { DicaVideo } from '@/tutoriais/DicaVideo'
import { LinkVideo } from '@/tutoriais/LinkVideo'

/*
  Grupos do WhatsApp (migration 088). Três coisas, como o SendFlow: mensagem para
  vários grupos (na hora, agendada ou repetindo), boas-vindas a quem entra e a
  lista dos grupos do chip. Só pelo QR Code — quem está no número oficial conecta
  aqui um chip por QR só para os grupos (ConectarChipGrupos).
*/

const ABAS = ['mensagens', 'boas-vindas', 'criar-lead', 'horarios', 'campanhas', 'grupos'] as const
const erroDe = (e: unknown, padrao: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || padrao

const Cabecalho: React.FC<{ numero?: string | null; conectado?: boolean; chip?: boolean; onDesconectar?: () => void }> = ({ numero, conectado, chip, onDesconectar }) => (
  <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <UsersRound className="w-8 h-8 text-green-600" aria-hidden="true" /> Grupos do WhatsApp
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mt-1">Avisos para vários grupos de uma vez, mensagens que se repetem e boas-vindas automáticas.</p>
    </div>
    {conectado !== undefined && (
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <Badge variant={conectado ? 'success' : 'warning'} className="whitespace-nowrap">
          {conectado ? `${chip ? 'WhatsApp dos grupos' : 'WhatsApp'} conectado${numero ? ` · ${telefoneLegivel(numero)}` : ''}` : 'WhatsApp desconectado'}
        </Badge>
        {chip && onDesconectar && (
          <button type="button" onClick={onDesconectar} className="text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 underline-offset-2 hover:underline">
            Trocar o número dos grupos
          </button>
        )}
      </div>
    )}
  </div>
)

/*
  Chip de Grupos (101): quem está no número oficial (Enterprise) conecta aqui um segundo
  WhatsApp por QR Code que serve só aos grupos. A Groups API da Meta exige o selo verde e
  para em 8 pessoas — comunidade, turma e lista de avisos só funcionam pelo QR.
*/
const ConectarChipGrupos: React.FC<{ temChip: boolean; temQr: boolean }> = ({ temChip, temQr }) => {
  const qc = useQueryClient()
  const { pode } = useCapacidades()
  const ativar = useMutation({
    mutationFn: gruposApi.ativarChip,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grupos', 'canal'] }),
    onError: (e) => toast.error(erroDe(e, 'Não foi possível preparar o QR Code agora')),
  })
  // O QR muda a cada ~60 s; a imagem vem com o token, então é buscada como blob.
  const qr = useQuery({
    queryKey: ['grupos', 'chip-qr'],
    queryFn: async () => URL.createObjectURL(await gruposApi.qrDoChip()),
    enabled: temChip && temQr,
    refetchInterval: 15_000,
    retry: false,
  })
  React.useEffect(() => () => { if (qr.data) URL.revokeObjectURL(qr.data) }, [qr.data])

  return (
    <div className="max-w-5xl mx-auto px-4 pt-4 pb-24 sm:px-6 sm:pb-8">
      <Cabecalho />
      <Card className="max-w-3xl">
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 flex-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <BadgeCheck className="w-6 h-6 text-emerald-600 shrink-0" aria-hidden="true" /> Grupos com um WhatsApp por QR Code
            </h2>
            <LinkVideo video="conectar-chip-grupos" />
            <p>
              O seu atendimento está no número oficial da Meta, que só cria grupos com o selo verde e até 8 pessoas.
              Para os grupos, conecte aqui um WhatsApp por QR Code — de preferência o número que já está nos seus grupos.
            </p>
            <p>
              Ele serve só a esta página: mensagens para grupos, boas-vindas, criar lead e campanhas. As conversas com os
              leads continuam no número oficial.
            </p>
            {temChip ? (
              <ol className="list-decimal pl-5 space-y-1">
                <li>Abra o WhatsApp no celular do número dos grupos.</li>
                <li>Toque em <strong>⋮</strong> (Android) ou <strong>Configurações</strong> (iPhone) → <strong>Dispositivos conectados</strong>.</li>
                <li>Toque em <strong>Conectar dispositivo</strong> e aponte a câmera para o QR Code.</li>
              </ol>
            ) : !pode('whatsapp_oficial') ? (
              <p className="text-amber-700 dark:text-amber-300">Disponível no plano Enterprise.</p>
            ) : (
              <Button onClick={() => ativar.mutate()} isLoading={ativar.isPending}>Conectar WhatsApp por QR Code</Button>
            )}
          </div>
          {temChip && (
            <div className="flex flex-col items-center justify-center sm:w-64 shrink-0">
              {qr.data && temQr
                ? <img src={qr.data} alt="QR Code para conectar o WhatsApp dos grupos" className="w-60 h-60 rounded-lg border border-gray-200 dark:border-gray-700 bg-white p-2" />
                : <div className="w-60 h-60 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-2 text-xs text-gray-500"><Spinner /> Preparando o QR Code…</div>}
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">A página atualiza sozinha quando conectar.</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

export const Grupos: React.FC = () => {
  const qc = useQueryClient()
  const [aba, setAba] = useAbaNaUrl('aba', 'mensagens', ABAS)
  const { user } = useAuth()
  const { pode } = useCapacidades()
  const temCampanhas = pode('grupos_campanhas')
  const canal = useQuery({
    queryKey: ['grupos', 'canal'], queryFn: gruposApi.canal, staleTime: 60_000,
    // Esperando o QR do chip de Grupos ser escaneado: confere a cada 3 s.
    refetchInterval: (q) => (q.state.data?.chipDeGrupos && !q.state.data.conectado ? 3000 : false),
  })
  const noQr = canal.data?.provedor === 'baileys'
  const lista = useQuery({ queryKey: ['grupos', 'lista'], queryFn: gruposApi.lista, enabled: noQr && !!canal.data?.conectado, staleTime: 5 * 60_000, retry: false })
  const mensagens = useQuery({ queryKey: ['grupos', 'mensagens'], queryFn: gruposApi.mensagens, enabled: noQr, refetchInterval: 30_000 })
  const boasVindas = useQuery({ queryKey: ['grupos', 'boas-vindas'], queryFn: gruposApi.boasVindas, enabled: noQr })

  const [modalMsg, setModalMsg] = useState<{ editando?: MensagemGrupo | null; pre?: string[] } | null>(null)
  const [modalBv, setModalBv] = useState<{ editando?: BoasVindas | null; grupo?: string } | null>(null)
  const [modalLead, setModalLead] = useState<{ regra?: RegraCrmGrupo } | null>(null)
  const [historico, setHistorico] = useState<MensagemGrupo | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroGrupos, setFiltroGrupos] = useState<'todos' | 'admin' | 'sem_bv' | 'com_bv' | 'crm'>('todos')
  const [buscaMsg, setBuscaMsg] = useState('')
  const [filtroMsg, setFiltroMsg] = useState<'todas' | 'programadas' | 'repetindo' | 'pausadas' | 'falhas'>('todas')

  const invalidar = () => qc.invalidateQueries({ queryKey: ['grupos'] })
  const acao = useMutation({
    mutationFn: (f: () => Promise<unknown>) => f(),
    onSuccess: invalidar,
    onError: (e) => toast.error(erroDe(e, 'Não foi possível concluir')),
  })

  const grupos = useMemo(() => lista.data || [], [lista.data])
  const comBoasVindas = useMemo(() => new Set((boasVindas.data || []).map(b => b.grupo_whatsapp_id)), [boasVindas.data])
  // Grupo que cria lead sem boas-vindas LIGADA: o card nasce e ninguém fala com a pessoa.
  // Foi assim que 150 leads do Clube do Livro ficaram sem contato (28/09–02/10/2026).
  const comBoasVindasAtiva = useMemo(() => new Set((boasVindas.data || []).filter(b => b.ativa).map(b => b.grupo_whatsapp_id)), [boasVindas.data])
  // Criar lead (093): regra por grupo e por chip. Quem administra a empresa recebe as de
  // todos os números (09/10/2026); o mapa por grupo, que vale para "Meus grupos" e para a
  // escolha de grupo novo, continua só com as do chip de quem está vendo.
  const meuId = user?.id ? Number(user.id) : undefined
  const regrasCrm = useQuery({ queryKey: ['grupos', 'crm'], queryFn: gruposApi.regrasCrm, enabled: noQr })
  const regraCrmDo = useMemo(() => new Map<string, RegraCrmGrupo>((regrasCrm.data || []).filter(r => r.dono_id === meuId).map(r => [r.grupo_id, r])), [regrasCrm.data, meuId])
  // Duas regras ligadas no mesmo grupo, em chips diferentes, disputam a mesma entrada.
  const regrasPorGrupo = useMemo(() => {
    const m = new Map<string, RegraCrmGrupo[]>()
    for (const r of regrasCrm.data || []) if (r.ativa) m.set(r.grupo_id, [...(m.get(r.grupo_id) || []), r])
    return m
  }, [regrasCrm.data])
  const gruposFiltrados = useMemo(() => grupos.filter(g => casa(g.nome, busca) && (
    filtroGrupos === 'todos' ? true
      : filtroGrupos === 'admin' ? g.souAdmin
      : filtroGrupos === 'com_bv' ? comBoasVindas.has(g.id)
      : filtroGrupos === 'crm' ? !!regraCrmDo.get(g.id)?.ativa
      : !comBoasVindas.has(g.id))), [grupos, busca, filtroGrupos, comBoasVindas, regraCrmDo])

  // Filtros da lista de mensagens: o que ainda vai sair, o que se repete, o que parou, o que falhou.
  const todasMsgs = mensagens.data || []
  const situacaoMsg = {
    programadas: (m: MensagemGrupo) => m.ativa && !!m.proxima_execucao,
    repetindo: (m: MensagemGrupo) => m.modo === 'recorrente',
    pausadas: (m: MensagemGrupo) => !m.ativa,
    falhas: (m: MensagemGrupo) => m.total_falhas > 0,
  }
  const contaMsg = (k: keyof typeof situacaoMsg) => todasMsgs.filter(situacaoMsg[k]).length
  const msgsFiltradas = todasMsgs.filter(m =>
    (casa(m.titulo, buscaMsg) || casa(m.texto, buscaMsg)) && (filtroMsg === 'todas' || situacaoMsg[filtroMsg](m)))

  if (canal.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (canal.data?.provedor === 'cloud_api') return <ConectarChipGrupos temChip={false} temQr={false} />
  if (canal.data?.chipDeGrupos && !canal.data.conectado) return <ConectarChipGrupos temChip temQr={!!canal.data.temQr} />
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
      <Cabecalho conectado numero={canal.data.numero} chip={!!canal.data.chipDeGrupos}
        onDesconectar={() => { if (confirm('Desconectar este WhatsApp dos grupos? As mensagens programadas param até você conectar outro.')) acao.mutate(gruposApi.desconectarChip) }} />

      <Tabs className="mb-5" active={aba} onChange={(k) => setAba(k as typeof ABAS[number])} tabs={[
        { key: 'mensagens', label: 'Mensagens', icon: <Send className="w-4 h-4" />, badge: mensagens.data?.filter(m => m.ativa && m.proxima_execucao).length || undefined },
        { key: 'boas-vindas', label: 'Boas-vindas', icon: <HandHeart className="w-4 h-4" /> },
        { key: 'criar-lead', label: 'Criar lead', icon: <UserPlus className="w-4 h-4" />, badge: regrasCrm.data?.filter(r => r.ativa).length || undefined },
        { key: 'horarios', label: 'Abrir e fechar', icon: <Clock className="w-4 h-4" /> },
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
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">Um aviso para vários grupos de uma vez — na hora, agendado ou repetindo toda semana.</p>
            <DicaVideo video="grupos-mensagem-boas-vindas" className="inline-flex shrink-0"><Button onClick={() => setModalMsg({})} disabled={!grupos.length} title={!grupos.length ? 'Nenhum grupo carregado do WhatsApp' : undefined} className="shrink-0"><Plus className="w-4 h-4 mr-1" /> Nova mensagem</Button></DicaVideo>
          </div>
          {todasMsgs.length > 2 && (
            <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="flex-1"><Input placeholder="Buscar pelo nome ou pelo texto" icon={<Search className="w-4 h-4" />} value={buscaMsg} onChange={e => setBuscaMsg(e.target.value)} /></div>
              <div className="overflow-x-auto">
                <Opcoes rotulo="Situação da mensagem" valor={filtroMsg} onChange={setFiltroMsg} opcoes={[
                  ['todas', `Todas (${todasMsgs.length})`],
                  ['programadas', `Programadas (${contaMsg('programadas')})`],
                  ['repetindo', `Repetindo (${contaMsg('repetindo')})`],
                  ['pausadas', `Pausadas (${contaMsg('pausadas')})`],
                  ...(contaMsg('falhas') ? [['falhas', `Com falha (${contaMsg('falhas')})`] as ['falhas', string]] : []),
                ]} />
              </div>
            </div>
          )}
          {mensagens.isLoading ? <Spinner /> : todasMsgs.length > 0 && !msgsFiltradas.length ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Nenhuma mensagem com esse filtro. <button type="button" className="font-medium text-primary-600 dark:text-primary-200 hover:underline" onClick={() => { setBuscaMsg(''); setFiltroMsg('todas') }}>Limpar filtro</button>
            </p>
          ) : !todasMsgs.length ? (
            <EstadoVazio avatar="duo" titulo="Nenhuma mensagem ainda"
              descricao="Mande um aviso para vários grupos de uma vez, agende para depois ou deixe repetindo — o lembrete da live toda quinta, por exemplo." />
          ) : (
            <ul className="space-y-3">
              {msgsFiltradas.map(m => (
                <li key={m.id}>
                  <Card>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{m.titulo}</h3>
                          {m.campanha_nome && <Badge variant="success">campanha · {m.campanha_nome}</Badge>}
                          {m.mencionar_todos && <Badge variant="info">marca todos</Badge>}
                          {m.botao_url && <Badge variant="info"><ExternalLink className="w-3 h-3 mr-1 inline" />botão: {m.botao_texto}</Badge>}
                          {!!m.mencoes?.length && <Badge variant="info"><AtSign className="w-3 h-3 mr-0.5 inline" />{m.mencoes.length === 1 ? m.mencoes[0].rotulo : `${m.mencoes.length} pessoas`}</Badge>}
                          {!m.ativa && <Badge variant="default">pausada</Badge>}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                          {m.modo === 'recorrente' ? <Repeat className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden="true" /> : m.modo === 'agendada' ? <CalendarClock className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden="true" /> : null}
                          {descreverQuando(m)} · {m.campanha_id ? 'todos os grupos da campanha' : `${m.grupos.length} grupo(s) · pelo chip de ${m.usuario_nome}`}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {m.ativa && m.proxima_execucao ? <>Próximo envio: <strong className="text-gray-800 dark:text-gray-200">{dataHora(m.proxima_execucao)}</strong></> : m.ultima_execucao ? `Último envio: ${dataHora(m.ultima_execucao)}` : 'Sem envio marcado'}
                          {' · '}{m.total_enviados} enviada(s){m.total_falhas ? <> · <button type="button" className="text-red-600 dark:text-red-400 underline decoration-dotted hover:decoration-solid" onClick={() => setHistorico(m)} title="Ver quais grupos falharam e por quê">{m.total_falhas} falha(s) — ver</button></> : null}
                        </p>
                        {m.texto && <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 line-clamp-2 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: previaWhatsApp(m.texto) }} />}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {m.modo !== 'agora' && (
                          <Switch checked={m.ativa} labels={{ on: 'Ativa', off: 'Pausada' }} aria-label={`Envio de "${m.titulo}"`}
                            onChange={(v) => acao.mutate(() => gruposApi.alternarMensagem(m.id, v))} title={m.ativa ? 'Pausar' : 'Retomar'} />
                        )}
                        <Button size="sm" variant="secondary" title="Enviar agora para os grupos"
                          onClick={() => { if (confirm(`Enviar "${m.titulo}" agora para ${m.campanha_id ? 'todos os grupos da campanha' : `${m.grupos.length} grupo(s)`}?`)) acao.mutate(async () => { await gruposApi.enviarAgora(m.id); toast.success('Na fila — sai em até 1 minuto') }) }}>
                          <Send className="w-4 h-4" /><span className="hidden sm:inline ml-1">Enviar agora</span><span className="sr-only sm:hidden">Enviar agora</span>
                        </Button>
                        <Button size="sm" variant="secondary" title="Onde já foi enviada" onClick={() => setHistorico(m)}>
                          <History className="w-4 h-4" /><span className="hidden sm:inline ml-1">Envios</span><span className="sr-only sm:hidden">Envios</span>
                        </Button>
                        <Button size="sm" variant="secondary" title="Editar" onClick={() => setModalMsg({ editando: m })}>
                          <Pencil className="w-4 h-4" /><span className="hidden sm:inline ml-1">Editar</span><span className="sr-only sm:hidden">Editar</span>
                        </Button>
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
            <p className="text-sm text-gray-600 dark:text-gray-400">Quando alguém entra no grupo, o chip dá as boas-vindas: no próprio grupo (quem entra junto recebe uma só) ou no privado de cada pessoa.</p>
            <DicaVideo video="grupos-mensagem-boas-vindas" className="inline-flex shrink-0"><Button onClick={() => setModalBv({})} disabled={!grupos.length} title={!grupos.length ? 'Nenhum grupo carregado do WhatsApp' : undefined} className="shrink-0"><Plus className="w-4 h-4 mr-1" /> Nova boas-vindas</Button></DicaVideo>
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
                          {b.destino === 'privado' ? (b.distribuir_entre?.length ? `No privado, dividido entre ${(b.distribuir_nomes || []).join(', ')}` : 'No privado') : 'No grupo'} · {b.delay_segundos ? `${Math.round(b.delay_segundos / 60)} min depois` : 'Na hora'} · recebida por {b.total_disparos} {b.total_disparos === 1 ? 'pessoa' : 'pessoas'}
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

      {aba === 'criar-lead' && (
        <section aria-label="Criar lead">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">Escolha o grupo e para onde vai quem entrar nele: cada pessoa nova vira lead no funil e na etapa que você definir, na hora em que entra.</p>
            <DicaVideo video="grupos-criar-lead" className="inline-flex shrink-0"><Button onClick={() => setModalLead({})} disabled={!grupos.length} title={!grupos.length ? 'Nenhum grupo carregado do WhatsApp' : undefined} className="shrink-0"><Plus className="w-4 h-4 mr-1" /> Nova regra</Button></DicaVideo>
          </div>
          {regrasCrm.isLoading ? <Spinner /> : !regrasCrm.data?.length ? (
            <EstadoVazio avatar="duo" titulo="Nenhum grupo criando lead" descricao="Crie uma regra para que quem entrar no grupo apareça no CRM sozinho, já no funil e na etapa certos." />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {regrasCrm.data.map(r => {
                const deOutro = r.dono_id !== meuId
                const outras = r.ativa ? (regrasPorGrupo.get(r.grupo_id) || []).filter(o => o.dono_id !== r.dono_id) : []
                return (
                <li key={`${r.dono_id}-${r.grupo_id}`}>
                  <Card className="h-full">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{r.grupo_nome || grupos.find(g => g.id === r.grupo_id)?.nome || 'Grupo'}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{deOutro ? `No número de ${r.dono_nome}` : 'No seu número'}</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                          → <span className="font-medium">{r.funil_nome}</span> · {r.estagio_nome || 'etapa de entrada'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Responsável: {r.distribuir_entre?.length ? `rodízio entre ${(r.distribuir_nomes || []).join(', ')}` : r.responsavel_nome || 'dono do número'} · Origem: {r.origem || r.grupo_nome || 'nome do grupo'}
                        </p>
                        {outras.length > 0 && (
                          <p role="alert" className="mt-2 flex gap-1.5 text-xs text-amber-800 bg-amber-50 dark:text-amber-200 dark:bg-amber-900/30 rounded-md px-2 py-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
                            <span>Este grupo também cria lead no número de {outras.map(o => o.dono_nome).join(', ')}. Só uma cria o card: a última que foi salva. Ao ligar ou salvar uma, a outra é desligada.</span>
                          </p>
                        )}
                        {/* A boas-vindas carregada aqui é a do chip de quem vê: para regra de outro número, o aviso seria falso. */}
                        {r.ativa && !deOutro && !boasVindas.isLoading && !comBoasVindasAtiva.has(r.grupo_id) && (
                          <p role="alert" className="mt-2 flex gap-1.5 text-xs text-amber-800 bg-amber-50 dark:text-amber-200 dark:bg-amber-900/30 rounded-md px-2 py-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
                            <span>Este grupo cria lead, mas não tem boas-vindas ligada. O card aparece no CRM e ninguém fala com a pessoa. Crie a boas-vindas na aba Boas-vindas, ou combine com a equipe quem faz o primeiro contato.</span>
                          </p>
                        )}
                      </div>
                      <Switch checked={r.ativa} labels={{ on: 'Ligada', off: 'Desligada' }} aria-label={`Criar lead de ${r.grupo_nome || 'grupo'}`} title={r.ativa ? 'Desligar' : 'Ligar'}
                        onChange={(v) => acao.mutate(() => gruposApi.salvarRegraCrm(r.grupo_id, r.grupo_nome, {
                          funil_id: r.funil_id, estagio_id: r.estagio_id, responsavel_id: r.responsavel_id,
                          distribuir_entre: r.distribuir_entre?.length ? r.distribuir_entre : null, origem: r.origem, ativa: v,
                        }, r.dono_id))} />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setModalLead({ regra: r })}><Pencil className="w-4 h-4 mr-1" /> Editar</Button>
                      <Button size="sm" variant="ghost" title="Excluir" onClick={() => { if (confirm('Excluir esta regra? Quem entrar no grupo deixa de virar lead.')) acao.mutate(() => gruposApi.salvarRegraCrm(r.grupo_id, null, null, r.dono_id)) }}>
                        <Trash2 className="w-4 h-4 text-red-600" /><span className="sr-only">Excluir</span>
                      </Button>
                    </div>
                  </Card>
                </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {aba === 'horarios' && <HorariosAba grupos={grupos} />}

      {aba === 'campanhas' && (temCampanhas ? (
        <CampanhasAba grupos={grupos} meuId={meuId} mensagens={mensagens.data || []} />
      ) : (
        <EstadoVazio avatar="duo" titulo="Campanhas de grupo são do plano Enterprise"
          descricao={`${CATALOGO.grupos_campanhas.motivo} Um link só para divulgar, grupos que abrem sozinhos quando enchem, o painel de quem entrou e saiu — e quem entra vira lead no CRM.`}
          acao={<Link to="/planos"><Button>Ver planos</Button></Link>} />
      ))}

      {aba === 'grupos' && (
        <section aria-label="Meus grupos">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1"><Input placeholder="Buscar grupo" icon={<Search className="w-4 h-4" />} value={busca} onChange={e => setBusca(e.target.value)} /></div>
            <div className="overflow-x-auto">
              <Opcoes rotulo="Filtrar grupos" valor={filtroGrupos} onChange={setFiltroGrupos} opcoes={[
                ['todos', `Todos (${grupos.length})`], ['admin', 'Sou admin'], ['com_bv', 'Com boas-vindas'], ['sem_bv', 'Sem boas-vindas'], ['crm', 'Criam lead'],
              ]} />
            </div>
            <Button variant="secondary" onClick={() => lista.refetch()} isLoading={lista.isFetching} className="shrink-0"><RefreshCw className="w-4 h-4 mr-1" /> Atualizar</Button>
          </div>
          {lista.isLoading ? <Spinner /> : erroLista && !grupos.length ? null : !grupos.length ? (
            <EstadoVazio avatar="duo" titulo="Este número não está em nenhum grupo" descricao="Os grupos aparecem aqui assim que o número conectado participar deles." />
          ) : (
            <Card className="p-0 overflow-hidden">
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {!gruposFiltrados.length && <li className="px-4 py-6 text-sm text-center text-gray-500 dark:text-gray-400">Nenhum grupo com esse filtro.</li>}
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
                          {comBoasVindas.has(g.id) && <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><HandHeart className="w-3.5 h-3.5" /> tem boas-vindas</span>}
                          {regraCrmDo.get(g.id) && (() => { const r = regraCrmDo.get(g.id)!; return (
                            <span className={`inline-flex items-center gap-1 ${r.ativa ? 'text-sky-700 dark:text-sky-300' : 'text-gray-400 dark:text-gray-500 line-through'}`}
                              title={r.ativa ? 'Quem entrar vira lead' : 'Regra desligada'}>
                              <UserPlus className="w-3.5 h-3.5" /> cria lead em {r.funil_nome}
                            </span>) })()}
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
      {modalLead && <CriarLeadModal grupos={grupos} regra={modalLead.regra} gruposComRegra={new Set(regraCrmDo.keys())} meuId={meuId} onFechar={() => setModalLead(null)} />}
      {historico && <HistoricoEnvios mensagem={historico} onFechar={() => setHistorico(null)} />}
    </div>
  )
}

const HistoricoEnvios: React.FC<{ mensagem: MensagemGrupo; onFechar: () => void }> = ({ mensagem, onFechar }) => {
  const q = useQuery({ queryKey: ['grupos', 'envios', mensagem.id], queryFn: () => gruposApi.envios(mensagem.id) })
  const [soFalhas, setSoFalhas] = useState(mensagem.total_falhas > 0)
  const falhas = (q.data || []).filter(e => e.status !== 'enviado').length
  const visiveis = (q.data || []).filter(e => !soFalhas || e.status !== 'enviado')
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
        <>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            <strong>{q.data.length - falhas}</strong> enviada(s){falhas ? <> · <strong className="text-red-600 dark:text-red-400">{falhas}</strong> com falha</> : null}
          </p>
          {falhas > 0 && (
            <Opcoes rotulo="Quais envios" valor={soFalhas ? 'falhas' : 'todos'} onChange={(v) => setSoFalhas(v === 'falhas')}
              opcoes={[['falhas', 'Só as falhas'], ['todos', 'Todos']]} />
          )}
        </div>
        <ul className="divide-y divide-gray-100 dark:divide-gray-700 max-h-[60vh] overflow-y-auto">
          {visiveis.map((e, i) => (
            <li key={i} className="py-2 text-sm flex items-start gap-3">
              <Badge variant={e.status === 'enviado' ? 'success' : 'danger'}>{e.status}</Badge>
              <div className="min-w-0">
                <p className="text-gray-900 dark:text-gray-100 truncate">{e.grupo_nome || e.grupo_id}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{dataHora(e.enviado_at)}{e.erro ? ` · ${e.erro}` : ''}</p>
              </div>
            </li>
          ))}
        </ul>
        </>
      )}
    </Modal>
  )
}
