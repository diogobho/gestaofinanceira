import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Radar, Plus, Pencil, Trash2, RefreshCw, Send, ExternalLink } from 'lucide-react'
import { Badge, Button, Card, EstadoVazio, Input, Modal, Spinner, Switch, Textarea } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { EMAILS_MONITOR, monitorSitesApi, type EntradaMonitor, type MonitorSite } from '@/api/monitorSites'

/*
  Monitoramento de sites (102). Lê a página de tempos em tempos: enquanto aparecer algum dos
  textos de "sem vaga", está fechado; sumiram todos, abriu — e o aviso sai no WhatsApp pelo
  número oficial 11 94052-4435. Só a conta master@gestao.com vê (o backend também barra).
*/

const erroDe = (e: unknown, padrao: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || padrao

const quando = (iso: string | null) => {
  if (!iso) return '—'
  // O banco grava sem fuso, em UTC.
  const d = new Date(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const telefone = (n: string) => n.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '+55 $1 $2-$3')

const VAZIO: EntradaMonitor = { nome: '', url: 'https://', textos_fechado: [], destino: '5524988344048', intervalo_min: 3, avisar_fechamento: true, ativo: true }

const FormMonitor: React.FC<{ editando: MonitorSite | null; onFechar: () => void }> = ({ editando, onFechar }) => {
  const qc = useQueryClient()
  const [d, setD] = useState<EntradaMonitor>(editando ? {
    nome: editando.nome, url: editando.url, textos_fechado: editando.textos_fechado, destino: editando.destino,
    intervalo_min: editando.intervalo_min, avisar_fechamento: editando.avisar_fechamento, ativo: editando.ativo,
  } : VAZIO)
  const [textos, setTextos] = useState(d.textos_fechado.join('\n'))
  const salvar = useMutation({
    mutationFn: () => {
      const corpo = { ...d, textos_fechado: textos.split('\n').map(t => t.trim()).filter(Boolean) }
      return editando ? monitorSitesApi.atualizar(editando.id, corpo) : monitorSitesApi.criar(corpo)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['monitor-sites'] }); toast.success('Salvo'); onFechar() },
    onError: (e) => toast.error(erroDe(e, 'Não foi possível salvar')),
  })
  return (
    <Modal isOpen onClose={onFechar} title={editando ? 'Editar monitoramento' : 'Novo monitoramento'} size="lg">
      <div className="space-y-4">
        <Input label="Nome" value={d.nome} maxLength={120} onChange={e => setD({ ...d, nome: e.target.value })} placeholder="Agenda CadÚnico Caucaia" />
        <Input label="Endereço do site" value={d.url} onChange={e => setD({ ...d, url: e.target.value })} />
        <div>
          <Textarea label="Textos que aparecem quando NÃO há vaga (um por linha)" rows={3} value={textos} onChange={e => setTextos(e.target.value)} />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Enquanto algum deles estiver na página, está fechado. Sumiram todos = abriu, e o aviso sai. Acento e maiúsculas não importam.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Avisar no WhatsApp (com DDI e DDD)" value={d.destino} onChange={e => setD({ ...d, destino: e.target.value })} />
          <Input label="Verificar a cada (minutos)" type="number" min={1} max={1440} value={String(d.intervalo_min)} onChange={e => setD({ ...d, intervalo_min: Number(e.target.value) })} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-gray-700 dark:text-gray-300">Avisar também quando as vagas fecharem</span>
          <Switch checked={d.avisar_fechamento} onChange={v => setD({ ...d, avisar_fechamento: v })} aria-label="Avisar quando fechar" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-gray-700 dark:text-gray-300">Situação</span>
          <Switch checked={d.ativo} onChange={v => setD({ ...d, ativo: v })} labels={{ on: 'Ligado', off: 'Desligado' }} aria-label="Monitoramento ligado" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onFechar}>Cancelar</Button>
          <Button isLoading={salvar.isPending} onClick={() => salvar.mutate()}>Salvar</Button>
        </div>
      </div>
    </Modal>
  )
}

export const MonitorSites: React.FC = () => {
  const { user } = useAuth()
  const permitido = !!user?.email && EMAILS_MONITOR.includes(user.email.toLowerCase())
  const qc = useQueryClient()
  const lista = useQuery({ queryKey: ['monitor-sites'], queryFn: monitorSitesApi.listar, enabled: permitido, refetchInterval: 30_000 })
  const [form, setForm] = useState<{ editando: MonitorSite | null } | null>(null)
  const acao = useMutation({
    mutationFn: (f: () => Promise<unknown>) => f(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['monitor-sites'] }),
    onError: (e) => toast.error(erroDe(e, 'Não foi possível concluir')),
  })

  if (!permitido) return <div className="max-w-3xl mx-auto px-4 py-16"><EstadoVazio titulo="Acesso restrito" descricao="Esta página é só da conta administradora da DuoFuturo." /></div>

  return (
    <div className="max-w-5xl mx-auto px-4 pt-4 pb-24 sm:px-6 sm:pb-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Radar className="w-8 h-8 text-primary-600" aria-hidden="true" /> Monitoramento de sites
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Avisa no WhatsApp, pelo número oficial 11 94052-4435, quando um site abre vaga.</p>
        </div>
        <Button onClick={() => setForm({ editando: null })} className="shrink-0"><Plus className="w-4 h-4 mr-1" /> Novo monitoramento</Button>
      </div>

      {lista.isLoading ? <div className="flex justify-center py-20"><Spinner /></div>
        : !lista.data?.length ? <EstadoVazio titulo="Nenhum site monitorado" descricao="Cadastre um site e os textos que aparecem quando não há vaga." />
        : (
          <div className="space-y-4">
            {lista.data.map(m => (
              <Card key={m.id}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{m.nome}</h2>
                      {!m.ativo ? <Badge variant="default">Desligado</Badge>
                        : m.estado === 'aberto' ? <Badge variant="success">Vagas abertas</Badge>
                        : m.estado === 'fechado' ? <Badge variant="warning">Sem vagas</Badge>
                        : <Badge variant="info">Aguardando a 1ª leitura</Badge>}
                    </div>
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-300 hover:underline break-all">
                      {m.url} <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    </a>
                    <p>Verifica a cada {m.intervalo_min} min · avisa {telefone(m.destino)}{m.avisar_fechamento ? ' ao abrir e ao fechar' : ' ao abrir'}</p>
                    <p className="text-gray-500 dark:text-gray-400">
                      Última leitura: {quando(m.ultimo_check_at)}{m.estado_desde ? ` · neste estado desde ${quando(m.estado_desde)}` : ''}
                      {m.ultimo_aviso_at ? ` · último aviso: ${quando(m.ultimo_aviso_at)}` : ''}
                    </p>
                    {m.ultimo_erro && <p className="text-amber-700 dark:text-amber-300">Não consegui ler o site ({m.erros_seguidos}× seguidas): {m.ultimo_erro}</p>}
                    {m.ultimo_aviso_erro && <p className="text-red-600 dark:text-red-400">O último aviso não saiu: {m.ultimo_aviso_erro}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button size="sm" variant="secondary" isLoading={acao.isPending} onClick={() => acao.mutate(async () => {
                      const r = await monitorSitesApi.verificar(m.id)
                      if (r.erro) toast.error(r.erro); else toast.success(r.estado === 'aberto' ? 'Vagas abertas agora!' : 'Sem vagas no momento')
                    })}><RefreshCw className="w-4 h-4 mr-1" /> Verificar agora</Button>
                    <Button size="sm" variant="secondary" onClick={() => { if (confirm(`Mandar uma mensagem de teste para ${telefone(m.destino)}?`)) acao.mutate(async () => { await monitorSitesApi.testarAviso(m.id); toast.success('Teste enviado') }) }}>
                      <Send className="w-4 h-4 mr-1" /> Testar aviso
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setForm({ editando: m })} aria-label="Editar"><Pencil className="w-4 h-4" /></Button>
                    <Button size="sm" variant="secondary" onClick={() => { if (confirm(`Excluir "${m.nome}"?`)) acao.mutate(() => monitorSitesApi.excluir(m.id)) }} aria-label="Excluir"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      <p className="mt-6 text-xs text-gray-500 dark:text-gray-400">
        Fora da janela de 24h, o número oficial só entrega modelo aprovado — o aviso sai pelo modelo <code>aviso_monitoramento_site</code>. Responder qualquer aviso abre a janela por 24h.
      </p>
      {form && <FormMonitor editando={form.editando} onFechar={() => setForm(null)} />}
    </div>
  )
}
