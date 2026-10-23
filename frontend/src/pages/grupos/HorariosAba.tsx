import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, History, Search, Lock, LockOpen, AlertTriangle } from 'lucide-react'
import { Badge, Button, Card, EstadoVazio, Input, Modal, ModalFooter, Spinner, Switch } from '@/components/ui'
import { gruposApi, type GrupoWhatsApp, type HorarioDia, type HorarioGrupo } from '@/api/grupos'
import { DIAS_CURTOS, dataHora } from './util'
import { casa } from './Campanhas'

/*
  Abrir e fechar grupo por horário (migration 109, chamado #420). O que a equipe fazia no
  SendFlow: sábado às 18h fecha (só administradores enviam), segunda às 9h abre. Sai pelo
  chip de quem cria a regra, que precisa ser administrador dos grupos.
*/

const erroDe = (e: unknown, padrao: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || padrao

const DIAS_LONGOS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

function descreverDias(dias: number[], hora: string): string {
  const nomes = dias.length === 7 ? 'todo dia' : dias.map(i => DIAS_LONGOS[i]).join(', ')
  return `${nomes} às ${hora}`
}

const SeletorDias: React.FC<{ rotulo: string; valor: HorarioDia; onChange: (v: HorarioDia) => void }> = ({ rotulo, valor, onChange }) => (
  <div className="space-y-2">
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Dias para ${rotulo}`}>
      {DIAS_CURTOS.map((d, i) => (
        <button key={d} type="button" aria-pressed={valor.dias.includes(i)} aria-label={`${DIAS_LONGOS[i]}`}
          onClick={() => onChange({ ...valor, dias: valor.dias.includes(i) ? valor.dias.filter(x => x !== i) : [...valor.dias, i] })}
          className={`w-11 rounded-md border py-1.5 text-xs font-medium ${valor.dias.includes(i)
            ? 'border-primary-600 bg-primary-600 text-white'
            : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}>
          {d}
        </button>
      ))}
    </div>
    <Input type="time" label={`Horário de ${rotulo} (Brasília)`} value={valor.hora} onChange={e => onChange({ ...valor, hora: e.target.value })} />
  </div>
)

const HorarioModal: React.FC<{ grupos: GrupoWhatsApp[]; editando?: HorarioGrupo | null; onFechar: () => void }> = ({ grupos, editando, onFechar }) => {
  const qc = useQueryClient()
  const [titulo, setTitulo] = useState(editando?.titulo || 'Fim de semana')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set(editando?.grupos.map(g => g.id) || []))
  const [busca, setBusca] = useState('')
  // Padrão = o pedido do #420: fecha sábado às 18h, abre segunda às 9h.
  const [fechar, setFechar] = useState<HorarioDia>({ dias: editando?.fechar_dias || [6], hora: editando?.fechar_hora || '18:00' })
  const [abrir, setAbrir] = useState<HorarioDia>({ dias: editando?.abrir_dias || [1], hora: editando?.abrir_hora || '09:00' })

  const filtrados = useMemo(() => grupos.filter(g => casa(g.nome, busca)), [grupos, busca])
  const podeMexer = (g: GrupoWhatsApp) => g.souAdmin
  const alternar = (id: string) => setSelecionados(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const salvar = useMutation({
    mutationFn: () => {
      const escolhidos = grupos.filter(g => selecionados.has(g.id)).map(g => ({ id: g.id, nome: g.nome }))
      // Grupo que sumiu da lista (o chip saiu dele) continua na edição com o nome guardado.
      const fora = (editando?.grupos || []).filter(g => selecionados.has(g.id) && !escolhidos.some(e => e.id === g.id))
      const d = { titulo, grupos: [...escolhidos, ...fora], fechar, abrir, ativa: editando?.ativa ?? true }
      return editando ? gruposApi.atualizarHorario(editando.id, d) : gruposApi.criarHorario(d)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grupos', 'horarios'] })
      toast.success('Horário salvo')
      onFechar()
    },
    onError: (e) => toast.error(erroDe(e, 'Não foi possível salvar')),
  })

  return (
    <Modal isOpen onClose={onFechar} title={editando ? 'Editar horário dos grupos' : 'Novo horário de abrir e fechar'} size="lg">
      <div className="space-y-5">
        <Input label="Nome (só para você achar depois)" value={titulo} onChange={e => setTitulo(e.target.value)} />

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Grupos · {selecionados.size} escolhido(s)</span>
            {filtrados.some(podeMexer) && (
              <button type="button" className="text-xs font-medium text-primary-600 dark:text-primary-200 hover:underline"
                onClick={() => setSelecionados(new Set(filtrados.filter(podeMexer).map(g => g.id)))}>
                Marcar os {filtrados.filter(podeMexer).length} da lista
              </button>
            )}
          </div>
          <Input placeholder="Buscar grupo" icon={<Search className="w-4 h-4" />} value={busca} onChange={e => setBusca(e.target.value)} />
          <ul className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
            {filtrados.length === 0 && <li className="p-3 text-sm text-gray-500 dark:text-gray-400">Nenhum grupo encontrado.</li>}
            {filtrados.map(g => (
              <li key={g.id}>
                <label className={`flex items-center gap-3 px-3 py-2 text-sm ${podeMexer(g) ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50' : 'opacity-60 cursor-not-allowed'}`}
                  title={podeMexer(g) ? undefined : 'Só o administrador do grupo pode abrir e fechar. O seu número não é administrador.'}>
                  <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary-600"
                    checked={selecionados.has(g.id)} disabled={!podeMexer(g)} onChange={() => alternar(g.id)} />
                  <span className="flex-1 truncate text-gray-900 dark:text-gray-100">{g.nome}</span>
                  {!podeMexer(g) && <span className="text-xs text-gray-500 dark:text-gray-400">não é admin</span>}
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{g.participantes} pessoas</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Só aparecem liberados os grupos em que o seu número é administrador.</p>
        </div>

        <fieldset className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          <legend className="px-1 text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5"><Lock className="w-4 h-4" aria-hidden="true" /> Fechar</legend>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Fechado, só os administradores mandam mensagem no grupo.</p>
          <SeletorDias rotulo="fechar" valor={fechar} onChange={setFechar} />
        </fieldset>

        <fieldset className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          <legend className="px-1 text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5"><LockOpen className="w-4 h-4" aria-hidden="true" /> Abrir</legend>
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Aberto, todo mundo do grupo volta a mandar mensagem.</p>
          <SeletorDias rotulo="abrir" valor={abrir} onChange={setAbrir} />
        </fieldset>
      </div>
      <ModalFooter>
        <Button variant="secondary" onClick={onFechar}>Cancelar</Button>
        <Button onClick={() => salvar.mutate()} isLoading={salvar.isPending}
          disabled={!selecionados.size || !titulo.trim() || !fechar.dias.length || !abrir.dias.length}>
          Salvar
        </Button>
      </ModalFooter>
    </Modal>
  )
}

const ExecucoesModal: React.FC<{ regra: HorarioGrupo; onFechar: () => void }> = ({ regra, onFechar }) => {
  const q = useQuery({ queryKey: ['grupos', 'horarios', regra.id, 'execucoes'], queryFn: () => gruposApi.execucoesHorario(regra.id) })
  return (
    <Modal isOpen onClose={onFechar} title={`Histórico · ${regra.titulo}`} size="lg">
      {q.isLoading ? <Spinner /> : !q.data?.length ? (
        <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">Ainda não abriu nem fechou nenhum grupo.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700 text-sm">
          {q.data.map((e, i) => (
            <li key={i} className="py-2 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-gray-900 dark:text-gray-100">
                {e.acao === 'fechar' ? 'Fechou' : 'Abriu'} · {e.grupo_nome || e.grupo_id}
              </span>
              <span className={e.status === 'feito' ? 'text-gray-500 dark:text-gray-400' : 'text-red-600 dark:text-red-400'}>
                {dataHora(e.executado_em)}{e.status === 'falhou' ? ` · falhou: ${e.erro || 'sem motivo'}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      <ModalFooter><Button variant="secondary" onClick={onFechar}>Fechar</Button></ModalFooter>
    </Modal>
  )
}

export const HorariosAba: React.FC<{ grupos: GrupoWhatsApp[] }> = ({ grupos }) => {
  const qc = useQueryClient()
  const horarios = useQuery({ queryKey: ['grupos', 'horarios'], queryFn: gruposApi.horarios, refetchInterval: 60_000 })
  const [modal, setModal] = useState<{ editando?: HorarioGrupo | null } | null>(null)
  const [historico, setHistorico] = useState<HorarioGrupo | null>(null)
  const acao = useMutation({
    mutationFn: (f: () => Promise<unknown>) => f(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grupos', 'horarios'] }),
    onError: (e) => toast.error(erroDe(e, 'Não foi possível concluir')),
  })
  const agora = (h: HorarioGrupo, a: 'fechar' | 'abrir') => {
    if (!confirm(`${a === 'fechar' ? 'Fechar' : 'Abrir'} agora os ${h.grupos.length} grupo(s) de "${h.titulo}"? Os horários marcados continuam valendo.`)) return
    acao.mutate(async () => {
      const r = await gruposApi.horarioAgora(h.id, a)
      if (r.falhas) toast.error(`${r.feitos} grupo(s) ${a === 'fechar' ? 'fechado(s)' : 'aberto(s)'}, ${r.falhas} com falha — veja no histórico`)
      else toast.success(`${r.feitos} grupo(s) ${a === 'fechar' ? 'fechado(s)' : 'aberto(s)'}`)
    })
  }

  return (
    <section aria-label="Abrir e fechar grupos">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">Feche os grupos em um horário (só administradores mandam mensagem) e abra de novo em outro — o fim de semana, por exemplo.</p>
        <Button onClick={() => setModal({})} disabled={!grupos.length} title={!grupos.length ? 'Nenhum grupo carregado do WhatsApp' : undefined} className="shrink-0">
          <Plus className="w-4 h-4 mr-1" /> Novo horário
        </Button>
      </div>
      {horarios.isLoading ? <Spinner /> : !horarios.data?.length ? (
        <EstadoVazio avatar="duo" titulo="Nenhum horário configurado"
          descricao="Por exemplo: fechar os grupos no sábado às 18h e abrir na segunda às 9h, toda semana." />
      ) : (
        <ul className="space-y-3">
          {horarios.data.map(h => (
            <li key={h.id}>
              <Card>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">{h.titulo}</h3>
                      {!h.ativa && <Badge variant="default">desligado</Badge>}
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                      <Lock className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden="true" />Fecha {descreverDias(h.fechar_dias, h.fechar_hora)}
                      {' · '}
                      <LockOpen className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden="true" />abre {descreverDias(h.abrir_dias, h.abrir_hora)}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      {h.grupos.length} grupo(s) · pelo chip de {h.usuario_nome}
                      {h.ativa && h.proximo_fechar && h.proximo_abrir && (
                        <> · Próximo: <strong className="text-gray-800 dark:text-gray-200">
                          {new Date(h.proximo_fechar) < new Date(h.proximo_abrir) ? `fechar ${dataHora(h.proximo_fechar)}` : `abrir ${dataHora(h.proximo_abrir)}`}
                        </strong></>
                      )}
                    </p>
                    {h.ultima && (
                      <p className={`mt-1 text-xs ${h.ultima.falhas ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                        {h.ultima.falhas > 0 && <AlertTriangle className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden="true" />}
                        Última vez: {h.ultima.acao === 'fechar' ? 'fechou' : 'abriu'} {h.ultima.feitos} grupo(s) em {dataHora(h.ultima.executado_em)}
                        {h.ultima.falhas ? ` · ${h.ultima.falhas} com falha: ${h.ultima.erro || ''}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Switch checked={h.ativa} labels={{ on: 'Ligado', off: 'Desligado' }} aria-label={`Horário "${h.titulo}"`}
                      title={h.ativa ? 'Desligar' : 'Ligar'} onChange={(v) => acao.mutate(() => gruposApi.alternarHorario(h.id, v))} />
                    <Button size="sm" variant="secondary" title="Fechar os grupos agora" onClick={() => agora(h, 'fechar')} disabled={acao.isPending}>
                      <Lock className="w-4 h-4" /><span className="ml-1">Fechar agora</span>
                    </Button>
                    <Button size="sm" variant="secondary" title="Abrir os grupos agora" onClick={() => agora(h, 'abrir')} disabled={acao.isPending}>
                      <LockOpen className="w-4 h-4" /><span className="ml-1">Abrir agora</span>
                    </Button>
                    <Button size="sm" variant="secondary" title="Quando abriu e fechou" onClick={() => setHistorico(h)}>
                      <History className="w-4 h-4" /><span className="hidden sm:inline ml-1">Histórico</span><span className="sr-only sm:hidden">Histórico</span>
                    </Button>
                    <Button size="sm" variant="secondary" title="Editar" onClick={() => setModal({ editando: h })}>
                      <Pencil className="w-4 h-4" /><span className="hidden sm:inline ml-1">Editar</span><span className="sr-only sm:hidden">Editar</span>
                    </Button>
                    <Button size="sm" variant="ghost" title="Excluir"
                      onClick={() => { if (confirm(`Excluir "${h.titulo}"? Os grupos ficam como estão agora.`)) acao.mutate(() => gruposApi.excluirHorario(h.id)) }}>
                      <Trash2 className="w-4 h-4 text-red-600" /><span className="sr-only">Excluir</span>
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {modal && <HorarioModal grupos={grupos} editando={modal.editando} onFechar={() => setModal(null)} />}
      {historico && <ExecucoesModal regra={historico} onFechar={() => setHistorico(null)} />}
    </section>
  )
}
