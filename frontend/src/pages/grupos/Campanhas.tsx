import React, { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Megaphone, Plus, Pencil, Trash2, Copy, Link2, ArrowLeft, UsersRound, MousePointerClick, LogIn, LogOut, UserPlus,
  Send, History, RefreshCw, ShieldCheck, Check,
} from 'lucide-react'
import { Badge, Button, Card, EstadoVazio, Input, Modal, ModalFooter, Select, Spinner, Switch } from '@/components/ui'
import { funisApi, estagiosApi, usuariosEmpresaApi } from '@/api/crm'
import {
  gruposApi, linkDaCampanha, type Campanha, type CampanhaDetalhe, type EntradaCampanha, type GrupoWhatsApp, type MensagemGrupo,
} from '@/api/grupos'
import { MensagemGrupoModal } from './MensagemGrupoModal'
import { dataHora, descreverQuando } from './util'

/*
  Campanhas de grupo (migration 089, Enterprise) — o que o SendFlow faz, do nosso
  jeito: um link só que manda cada pessoa para o grupo com vaga e abre o próximo
  quando ele enche; o painel de cliques, entradas e saídas; mensagens para todos os
  grupos da campanha; e quem entra vira lead no funil.
*/

const erroDe = (e: unknown, padrao: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || padrao

const copiar = async (texto: string) => {
  try { await navigator.clipboard.writeText(texto); toast.success('Link copiado') }
  catch { toast.error('Não foi possível copiar — selecione e copie o link') }
}

/** O mesmo `nomeDoGrupo` da API: "Turma {{n}}" → "Turma 3". */
const proximoNome = (modelo: string, n: number) =>
  /\{\{\s*n\s*\}\}/i.test(modelo) ? modelo.replace(/\{\{\s*n\s*\}\}/gi, String(n)) : `${modelo} ${n}`

/** "2026-09-28" → "28/09", sem passar por Date (fuso). */
const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

const Numero: React.FC<{ icone: React.ReactNode; rotulo: string; valor: number | string; dica?: string }> = ({ icone, rotulo, valor, dica }) => (
  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3" title={dica}>
    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">{icone}{rotulo}</p>
    <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{valor}</p>
  </div>
)

export const CampanhasAba: React.FC<{ grupos: GrupoWhatsApp[]; meuId?: number; mensagens: MensagemGrupo[] }> = ({ grupos, meuId, mensagens }) => {
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const abertaId = Number(params.get('campanha')) || null
  const abrir = (id: number | null) => setParams(p => {
    const n = new URLSearchParams(p)
    if (id) n.set('campanha', String(id)); else n.delete('campanha')
    return n
  })
  const lista = useQuery({ queryKey: ['grupos', 'campanhas'], queryFn: gruposApi.campanhas, refetchInterval: 60_000 })
  const [modal, setModal] = useState<{ editando?: Campanha | null } | null>(null)

  const excluir = useMutation({
    mutationFn: (id: number) => gruposApi.excluirCampanha(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['grupos'] }); abrir(null); toast.success('Campanha excluída. Os grupos continuam no WhatsApp.') },
    onError: (e) => toast.error(erroDe(e, 'Não foi possível excluir')),
  })

  if (abertaId) {
    return <DetalheCampanha id={abertaId} voltar={() => abrir(null)} grupos={grupos} meuId={meuId}
      mensagens={mensagens.filter(m => m.campanha_id === abertaId)} editar={(c) => setModal({ editando: c })}
      excluir={(c) => { if (confirm(`Excluir a campanha "${c.nome}"? O link para de funcionar. Os grupos continuam existindo no WhatsApp.`)) excluir.mutate(c.id) }}
      modal={modal} fecharModal={() => setModal(null)} />
  }

  return (
    <section aria-label="Campanhas">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Um link só para divulgar: cada pessoa cai no grupo com vaga, e quando ele enche o próximo abre sozinho.
        </p>
        <Button onClick={() => setModal({})} className="shrink-0"><Plus className="w-4 h-4 mr-1" /> Nova campanha</Button>
      </div>
      {lista.isLoading ? <Spinner /> : !lista.data?.length ? (
        <EstadoVazio avatar="duo" titulo="Nenhuma campanha ainda"
          descricao="Crie uma campanha para um lançamento, uma turma ou um evento: você recebe um link para o anúncio e a bio, e o sistema cuida dos grupos." />
      ) : (
        <ul className="space-y-3">
          {lista.data.map(c => (
            <li key={c.id}>
              <Card>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <button type="button" className="min-w-0 text-left" onClick={() => abrir(c.id)}>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 hover:underline">{c.nome}</h3>
                      {!c.ativa && <Badge variant="default">pausada</Badge>}
                      {c.ativa && c.total_grupos === 0 && <Badge variant="warning">sem grupo — crie antes de divulgar</Badge>}
                      {c.criar_lead && <Badge variant="info">vira lead{c.funil_nome ? ` · ${c.funil_nome}` : ''}</Badge>}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 break-all">{linkDaCampanha(c.slug)}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 tabular-nums">
                      {c.total_grupos} grupo(s) · {c.total_participantes} pessoas · {c.total_cliques} clique(s) · {c.total_entradas} entrada(s) · {c.total_saidas} saída(s)
                    </p>
                  </button>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button size="sm" variant="secondary" onClick={() => copiar(linkDaCampanha(c.slug))}><Copy className="w-4 h-4 mr-1" /> Copiar link</Button>
                    <Button size="sm" onClick={() => abrir(c.id)}>Abrir</Button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {modal && <CampanhaModal editando={modal.editando} meuId={meuId} onFechar={() => setModal(null)} onCriada={(id) => abrir(id)} />}
    </section>
  )
}

const DetalheCampanha: React.FC<{
  id: number
  voltar: () => void
  grupos: GrupoWhatsApp[]
  meuId?: number
  mensagens: MensagemGrupo[]
  editar: (c: Campanha) => void
  excluir: (c: Campanha) => void
  modal: { editando?: Campanha | null } | null
  fecharModal: () => void
}> = ({ id, voltar, grupos, meuId, mensagens, editar, excluir, modal, fecharModal }) => {
  const qc = useQueryClient()
  const [dias, setDias] = useState(30)
  const c = useQuery({ queryKey: ['grupos', 'campanha', id], queryFn: () => gruposApi.campanha(id), refetchInterval: 30_000 })
  const painel = useQuery({ queryKey: ['grupos', 'campanha', id, 'painel', dias], queryFn: () => gruposApi.painelCampanha(id, dias), refetchInterval: 60_000 })
  const [adicionar, setAdicionar] = useState(false)
  const [novaMsg, setNovaMsg] = useState<{ editando?: MensagemGrupo | null } | null>(null)

  const acao = useMutation({
    mutationFn: (f: () => Promise<unknown>) => f(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grupos'] }),
    onError: (e) => toast.error(erroDe(e, 'Não foi possível concluir')),
  })

  if (c.isLoading) return <Spinner />
  if (!c.data) return <EstadoVazio avatar="duo" titulo="Campanha não encontrada" descricao="Ela pode ter sido excluída." acao={<Button onClick={voltar}>Voltar</Button>} />
  const cp: CampanhaDetalhe = c.data
  const link = linkDaCampanha(cp.slug)
  const ativos = cp.grupos.filter(g => g.ativo)
  const diasComMovimento = (painel.data?.porDia || []).filter(d => d.cliques || d.entradas || d.saidas).reverse()

  return (
    <section aria-label={`Campanha ${cp.nome}`}>
      <button type="button" onClick={voltar} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary-600 dark:text-primary-200 hover:underline">
        <ArrowLeft className="w-4 h-4" /> Todas as campanhas
      </button>

      <Card className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{cp.nome}</h2>
              {!cp.ativa && <Badge variant="default">pausada — o link mostra "encerrado"</Badge>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Link2 className="w-4 h-4 text-gray-400" aria-hidden="true" />
              <code className="text-sm text-gray-800 dark:text-gray-200 break-all">{link}</code>
              <Button size="sm" variant="secondary" onClick={() => copiar(link)}><Copy className="w-4 h-4 mr-1" /> Copiar</Button>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Para separar a origem no painel, acrescente <code>?utm_source=instagram</code> (ou anuncio, email, bio…) no fim do link.
            </p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Até {cp.limite_por_grupo} pessoas por grupo · {cp.criar_grupos ? `quando encher, abre sozinho o "${proximoNome(cp.nome_grupo_modelo, cp.grupos.length + 1)}"` : 'sem grupo novo automático'}
              {cp.criar_lead ? ` · quem entra vira lead em ${cp.funil_nome || 'um funil'}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Switch checked={cp.ativa} labels={{ on: 'Ativa', off: 'Pausada' }} aria-label={`Campanha ${cp.nome}`} title={cp.ativa ? 'Pausar campanha' : 'Ativar campanha'}
              onChange={(v) => acao.mutate(() => gruposApi.atualizarCampanha(cp.id, { ...cp, ativa: v }))} />
            <Button size="sm" variant="secondary" onClick={() => editar(cp)}><Pencil className="w-4 h-4 mr-1" /> Editar</Button>
            <Button size="sm" variant="ghost" title="Excluir campanha" onClick={() => excluir(cp)}><Trash2 className="w-4 h-4 text-red-600" /><span className="sr-only">Excluir</span></Button>
          </div>
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Numero icone={<UsersRound className="w-3.5 h-3.5" />} rotulo="Nos grupos" valor={cp.total_participantes} dica="Soma dos participantes dos grupos ativos" />
        <Numero icone={<Megaphone className="w-3.5 h-3.5" />} rotulo="Grupos" valor={ativos.length} />
        <Numero icone={<MousePointerClick className="w-3.5 h-3.5" />} rotulo="Cliques" valor={cp.total_cliques} dica="Pessoas que abriram o link (robôs de pré-visualização não contam)" />
        <Numero icone={<LogIn className="w-3.5 h-3.5" />} rotulo="Entradas" valor={cp.total_entradas} />
        <Numero icone={<LogOut className="w-3.5 h-3.5" />} rotulo="Saídas" valor={cp.total_saidas} />
        <Numero icone={<UserPlus className="w-3.5 h-3.5" />} rotulo="Leads" valor={painel.data?.leads ?? '—'} dica="Leads criados ou atualizados por entradas" />
      </div>

      {/* Grupos */}
      <Card className="mb-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Grupos da campanha</h3>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAdicionar(true)}>Usar um grupo que já existe</Button>
            <Button size="sm" isLoading={acao.isPending}
              onClick={() => {
                const nome = proximoNome(cp.nome_grupo_modelo, cp.grupos.length + 1)
                if (!confirm(`Criar agora o grupo "${nome}" no WhatsApp, por um dos números da campanha?`)) return
                acao.mutate(async () => { await gruposApi.criarGrupoCampanha(cp.id); toast.success(`Grupo "${nome}" criado`) })
              }}>
              <Plus className="w-4 h-4 mr-1" /> Criar grupo agora
            </Button>
          </div>
        </div>
        {!cp.grupos.length ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Nenhum grupo ainda. Crie o primeiro (ou use um que já existe) <strong>antes de divulgar o link</strong>
            {cp.criar_grupos ? ' — sem grupo, quem abrir primeiro espera alguns segundos enquanto ele é criado.' : ' — sem grupo, o link mostra "lotado".'}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {cp.grupos.map(g => {
              const pct = Math.min(100, Math.round((g.participantes / cp.limite_por_grupo) * 100))
              return (
                <li key={g.id} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {g.nome || g.grupo_id}
                      {!g.ativo && <span className="ml-2 text-xs font-normal text-gray-500">fora da rotação</span>}
                      {g.ativo && g.cheio && <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-400">cheio</span>}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 w-40 max-w-full rounded-full bg-gray-200 dark:bg-gray-700" role="progressbar" aria-valuenow={g.participantes} aria-valuemin={0} aria-valuemax={cp.limite_por_grupo} aria-label="Ocupação do grupo">
                        <div className={`h-1.5 rounded-full ${g.cheio ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-600 dark:text-gray-400 tabular-nums">{g.participantes}/{cp.limite_por_grupo}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      <ShieldCheck className="inline w-3.5 h-3.5 mr-0.5" /> {g.chip_nome}{g.criado_pela_campanha ? ' · criado pela campanha' : ''}
                      {g.participantes_em ? ` · contado ${dataHora(g.participantes_em)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {g.convite && (
                      <Button size="sm" variant="ghost" title="Copiar o convite direto deste grupo" onClick={() => copiar(`https://chat.whatsapp.com/${g.convite}`)}>
                        <Copy className="w-4 h-4" /><span className="sr-only">Copiar convite</span>
                      </Button>
                    )}
                    <Switch checked={g.ativo} labels={{ on: 'No link', off: 'Fora' }} aria-label={`${g.nome} no link da campanha`} title={g.ativo ? 'Tirar da rotação do link e das mensagens' : 'Voltar para a rotação'}
                      onChange={(v) => acao.mutate(() => gruposApi.alternarGrupoCampanha(cp.id, g.id, v))} />
                    <Button size="sm" variant="ghost" title="Tirar da campanha (o grupo continua no WhatsApp)"
                      onClick={() => { if (confirm('Tirar este grupo da campanha? Ele continua existindo no WhatsApp.')) acao.mutate(() => gruposApi.removerGrupoCampanha(cp.id, g.id)) }}>
                      <Trash2 className="w-4 h-4 text-red-600" /><span className="sr-only">Tirar da campanha</span>
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* Mensagens */}
      <Card className="mb-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Mensagens da campanha</h3>
          <Button size="sm" disabled={!ativos.length} onClick={() => setNovaMsg({})}><Send className="w-4 h-4 mr-1" /> Nova mensagem</Button>
        </div>
        {!mensagens.length ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Programe a sequência do lançamento — aquecimento, lembrete da live, abertura do carrinho. Cada mensagem vai para todos os grupos ativos da campanha.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {mensagens.map(m => (
              <li key={m.id} className="py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{m.titulo} {!m.ativa && <span className="text-xs font-normal text-gray-500">· pausada</span>}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {descreverQuando(m)} · {m.ativa && m.proxima_execucao ? `próximo ${dataHora(m.proxima_execucao)}` : m.ultima_execucao ? `último ${dataHora(m.ultima_execucao)}` : 'sem envio marcado'}
                    {' · '}{m.total_enviados} enviada(s){m.total_falhas ? ` · ${m.total_falhas} falha(s)` : ''}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="secondary" title="Editar" onClick={() => setNovaMsg({ editando: m })}><Pencil className="w-4 h-4" /><span className="sr-only">Editar</span></Button>
                  <Button size="sm" variant="ghost" title="Excluir"
                    onClick={() => { if (confirm(`Excluir "${m.titulo}"?`)) acao.mutate(() => gruposApi.excluirMensagem(m.id)) }}>
                    <Trash2 className="w-4 h-4 text-red-600" /><span className="sr-only">Excluir</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Painel */}
      <Card>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2"><History className="w-4 h-4" /> Movimento</h3>
          <div className="flex items-center gap-2">
            <select aria-label="Período" value={dias} onChange={e => setDias(Number(e.target.value))}
              className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
            </select>
            <Button size="sm" variant="ghost" onClick={() => painel.refetch()} title="Atualizar"><RefreshCw className="w-4 h-4" /><span className="sr-only">Atualizar</span></Button>
          </div>
        </div>
        {painel.isLoading ? <Spinner /> : (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Por dia</p>
              {!diasComMovimento.length ? <p className="text-sm text-gray-500 dark:text-gray-400">Sem movimento no período.</p> : (
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-500 dark:text-gray-400 text-left">
                      <tr><th className="py-1 font-medium">Dia</th><th className="py-1 font-medium text-right">Cliques</th><th className="py-1 font-medium text-right">Entradas</th><th className="py-1 font-medium text-right">Saídas</th><th className="py-1 font-medium text-right">Saldo</th></tr>
                    </thead>
                    <tbody className="tabular-nums text-gray-800 dark:text-gray-200">
                      {diasComMovimento.map(d => (
                        <tr key={d.dia} className="border-t border-gray-100 dark:border-gray-700">
                          <td className="py-1">{diaCurto(d.dia)}</td>
                          <td className="py-1 text-right">{d.cliques}</td>
                          <td className="py-1 text-right">{d.entradas}</td>
                          <td className="py-1 text-right">{d.saidas}</td>
                          <td className={`py-1 text-right font-medium ${d.entradas - d.saidas < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{d.entradas - d.saidas > 0 ? '+' : ''}{d.entradas - d.saidas}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="space-y-6">
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Cliques por origem (utm)</p>
                {!painel.data?.porUtm.length ? <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum clique ainda.</p> : (
                  <ul className="space-y-1 text-sm">
                    {painel.data.porUtm.map(u => (
                      <li key={u.origem} className="flex justify-between gap-2"><span className="truncate text-gray-700 dark:text-gray-300">{u.origem}</span><span className="tabular-nums text-gray-900 dark:text-gray-100">{u.cliques}</span></li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Por grupo (desde o início)</p>
                {!painel.data?.porGrupo.length ? <p className="text-sm text-gray-500 dark:text-gray-400">Sem grupos.</p> : (
                  <ul className="space-y-1 text-sm">
                    {painel.data.porGrupo.map(g => (
                      <li key={g.grupo_id} className="flex justify-between gap-2">
                        <span className="truncate text-gray-700 dark:text-gray-300">{g.nome || g.grupo_id}</span>
                        <span className="tabular-nums text-gray-900 dark:text-gray-100 shrink-0">+{g.entradas} / −{g.saidas}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      {adicionar && <AdicionarGrupoModal campanha={cp} grupos={grupos} meuId={meuId} onFechar={() => setAdicionar(false)} />}
      {novaMsg && (
        <MensagemGrupoModal aberto onFechar={() => setNovaMsg(null)} grupos={[]} editando={novaMsg.editando}
          campanha={{ id: cp.id, nome: cp.nome, grupos: ativos.length }} />
      )}
      {modal && <CampanhaModal editando={modal.editando} onFechar={fecharModal} />}
    </section>
  )
}

const AdicionarGrupoModal: React.FC<{ campanha: CampanhaDetalhe; grupos: GrupoWhatsApp[]; meuId?: number; onFechar: () => void }> = ({ campanha, grupos, meuId, onFechar }) => {
  const qc = useQueryClient()
  const ja = useMemo(() => new Set(campanha.grupos.map(g => g.grupo_id)), [campanha.grupos])
  const candidatos = grupos.filter(g => !ja.has(g.id))
  const adicionar = useMutation({
    mutationFn: (g: GrupoWhatsApp) => gruposApi.adicionarGrupoCampanha(campanha.id, meuId!, g.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['grupos'] }); toast.success('Grupo adicionado à campanha') },
    onError: (e) => toast.error(erroDe(e, 'Não foi possível adicionar')),
  })
  return (
    <Modal isOpen onClose={onFechar} title="Usar um grupo que já existe" size="lg">
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
        Grupos do seu WhatsApp. Só dá para usar grupo em que você é administrador — é o admin que gera o link de convite.
      </p>
      {!candidatos.length ? <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum grupo disponível.</p> : (
        <ul className="max-h-[55vh] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
          {candidatos.map(g => (
            <li key={g.id} className="py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{g.nome}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{g.participantes} pessoas{g.souAdmin ? ' · você é admin' : ' · você não é admin'}</p>
              </div>
              <Button size="sm" variant="secondary" disabled={!g.souAdmin || !meuId} isLoading={adicionar.isPending && adicionar.variables?.id === g.id}
                onClick={() => adicionar.mutate(g)}>Usar</Button>
            </li>
          ))}
        </ul>
      )}
      <ModalFooter><Button variant="secondary" onClick={onFechar}>Fechar</Button></ModalFooter>
    </Modal>
  )
}

const CampanhaModal: React.FC<{ editando?: Campanha | null; onFechar: () => void; onCriada?: (id: number) => void; meuId?: number }> = ({ editando, onFechar, onCriada, meuId }) => {
  const qc = useQueryClient()
  const chips = useQuery({ queryKey: ['grupos', 'chips'], queryFn: gruposApi.chips })
  const funis = useQuery({ queryKey: ['crm', 'funis'], queryFn: funisApi.list })
  const usuarios = useQuery({ queryKey: ['crm', 'usuarios'], queryFn: usuariosEmpresaApi.list })
  const [f, setF] = useState<EntradaCampanha>({
    nome: editando?.nome || '',
    slug: editando?.slug || '',
    limite_por_grupo: editando?.limite_por_grupo || 900,
    chips: editando?.chips || (meuId ? [meuId] : []),
    criar_grupos: editando?.criar_grupos ?? true,
    nome_grupo_modelo: editando?.nome_grupo_modelo || '',
    descricao_grupo: editando?.descricao_grupo || '',
    so_admins_enviam: editando?.so_admins_enviam ?? true,
    criar_lead: editando?.criar_lead ?? false,
    funil_id: editando?.funil_id || null,
    estagio_id: editando?.estagio_id || null,
    responsavel_id: editando?.responsavel_id || null,
    origem: editando?.origem || '',
    ativa: editando?.ativa ?? true,
  })
  const estagios = useQuery({
    queryKey: ['crm', 'estagios', f.funil_id], queryFn: () => estagiosApi.listByFunil(f.funil_id!), enabled: !!f.funil_id,
  })
  const set = <K extends keyof EntradaCampanha>(k: K, v: EntradaCampanha[K]) => setF(x => ({ ...x, [k]: v }))
  const slugSugerido = (f.nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)

  const salvar = useMutation({
    mutationFn: () => {
      const d = { ...f, slug: f.slug || slugSugerido, nome_grupo_modelo: f.nome_grupo_modelo || `${f.nome} {{n}}` }
      return editando ? gruposApi.atualizarCampanha(editando.id, d).then(() => ({ id: editando.id })) : gruposApi.criarCampanha(d)
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['grupos'] })
      toast.success(editando ? 'Campanha salva' : 'Campanha criada — copie o link e divulgue')
      onFechar()
      if (!editando && r?.id) onCriada?.(r.id)
    },
    onError: (e) => toast.error(erroDe(e, 'Não foi possível salvar')),
  })

  return (
    <Modal isOpen onClose={onFechar} title={editando ? 'Editar campanha' : 'Nova campanha de grupo'} size="xl">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nome da campanha" placeholder="Ex.: Lançamento Outubro" value={f.nome} onChange={e => set('nome', e.target.value)} />
          <div>
            <Input label="Endereço do link" placeholder={slugSugerido || 'lancamento-outubro'} value={f.slug}
              onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 break-all">{linkDaCampanha(f.slug || slugSugerido || '…')}</p>
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">WhatsApps da campanha</legend>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            Quem cria os grupos novos (um de cada vez, alternando) e entra neles como administrador. Mais de um divide o volume e o risco de bloqueio.
          </p>
          {chips.isLoading ? <Spinner /> : !chips.data?.length ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">Ninguém da empresa está com o WhatsApp conectado por QR Code.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {chips.data.map(ch => {
                const on = f.chips.includes(ch.id)
                return (
                  <button key={ch.id} type="button" aria-pressed={on}
                    onClick={() => set('chips', on ? f.chips.filter(x => x !== ch.id) : [...f.chips, ch.id])}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${on ? 'border-primary-600 bg-primary-600 text-white dark:border-primary-400 dark:bg-primary-500' : 'border-dashed border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-primary-400'}`}>
                    {on ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Plus className="w-3.5 h-3.5" aria-hidden="true" />}
                    {ch.nome}
                  </button>
                )
              })}
            </div>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input type="number" min={5} max={1024} label="Pessoas por grupo" value={f.limite_por_grupo}
            onChange={e => set('limite_por_grupo', Number(e.target.value))} />
          <Input label="Nome dos grupos" placeholder={`${f.nome || 'Lançamento'} {{n}}`} value={f.nome_grupo_modelo}
            onChange={e => set('nome_grupo_modelo', e.target.value)} />
        </div>
        <p className="-mt-3 text-xs text-gray-500 dark:text-gray-400">
          O WhatsApp aceita até 1024. <code>{'{{n}}'}</code> vira o número do grupo: "Turma 1", "Turma 2"…
        </p>

        <div>
          <label htmlFor="desc-grupo" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição dos grupos novos</label>
          <textarea id="desc-grupo" rows={3} value={f.descricao_grupo || ''} onChange={e => set('descricao_grupo', e.target.value)}
            placeholder="As regras do grupo, o link dos termos, o que vai acontecer aqui…"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 outline-none" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600" checked={f.criar_grupos} onChange={e => set('criar_grupos', e.target.checked)} />
            <span className="text-sm"><span className="font-medium text-gray-900 dark:text-gray-100">Abrir grupo novo sozinho</span>
              <span className="block text-xs text-gray-600 dark:text-gray-400 mt-0.5">Quando os grupos estiverem quase cheios. No máximo 10 por WhatsApp por dia.</span></span>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600" checked={f.so_admins_enviam} onChange={e => set('so_admins_enviam', e.target.checked)} />
            <span className="text-sm"><span className="font-medium text-gray-900 dark:text-gray-100">Só administradores enviam</span>
              <span className="block text-xs text-gray-600 dark:text-gray-400 mt-0.5">Nos grupos novos. Bom para lançamento: o grupo vira canal de avisos.</span></span>
          </label>
        </div>

        <fieldset className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600" checked={f.criar_lead} onChange={e => set('criar_lead', e.target.checked)} />
            <span className="text-sm"><span className="font-medium text-gray-900 dark:text-gray-100">Quem entrar vira lead no CRM</span>
              <span className="block text-xs text-gray-600 dark:text-gray-400 mt-0.5">Quem já está no funil ganha uma anotação, sem card duplicado e sem mudar de etapa.</span></span>
          </label>
          {f.criar_lead && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Select label="Funil" value={f.funil_id ? String(f.funil_id) : ''} onChange={e => setF(x => ({ ...x, funil_id: Number(e.target.value) || null, estagio_id: null }))}>
                <option value="">Escolha…</option>
                {(funis.data || []).map(fn => <option key={fn.id} value={fn.id}>{fn.nome}</option>)}
              </Select>
              <Select label="Etapa" value={f.estagio_id ? String(f.estagio_id) : ''} onChange={e => set('estagio_id', Number(e.target.value) || null)} disabled={!f.funil_id}>
                <option value="">A de entrada do funil</option>
                {(estagios.data || []).map(es => <option key={es.id} value={es.id}>{es.nome}</option>)}
              </Select>
              <Select label="Responsável" value={f.responsavel_id ? String(f.responsavel_id) : ''} onChange={e => set('responsavel_id', Number(e.target.value) || null)}>
                <option value="">Quem criou a campanha</option>
                {(usuarios.data || []).map(us => <option key={us.id} value={us.id}>{us.nome}</option>)}
              </Select>
              <Input label="Origem no card" placeholder={f.nome || 'Nome da campanha'} maxLength={50} value={f.origem || ''} onChange={e => set('origem', e.target.value)} />
            </div>
          )}
        </fieldset>
      </div>
      <ModalFooter>
        <Button variant="secondary" onClick={onFechar}>Cancelar</Button>
        <Button onClick={() => salvar.mutate()} isLoading={salvar.isPending} disabled={!f.nome.trim() || !f.chips.length}>
          {editando ? 'Salvar' : 'Criar campanha'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
