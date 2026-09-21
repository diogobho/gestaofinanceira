import { useMemo } from 'react'
import {
  X, User, Layers, Smartphone, CalendarClock, Bot, MessageSquare,
  AlertTriangle, ArrowUpRight, ListTree, History,
} from 'lucide-react'
import { useFollowupsLead, useLeadHistoricoWhatsApp } from '@/hooks/useCRM'
import { descreverErroFollowup, esgotouTentativas } from '@/utils/followupErros'
import {
  resolverEstado, APRESENTACAO, descreverPlano, montarCicloVida,
} from '@/utils/followupStatus'
import type { Followup } from '@/api/crm'

/**
 * Detalhe de UM agendamento, num drawer lateral.
 *
 * Existe para responder, sem sair da tela: o que vai acontecer, quando, com quem, por
 * qual chip, o que já aconteceu com este registro e o que mais está previsto para o
 * mesmo lead.
 *
 * Reaproveita endpoints que já existiam — `GET /crm/leads/:id/followups` (todas as
 * ações do lead) e `GET /crm/leads/:id/historico-whatsapp` (última mensagem trocada).
 * Nenhum endpoint novo, nenhuma tabela nova: a informação já estava no banco, só não
 * chegava à tela.
 */

interface Props {
  followup: Followup | null
  onFechar: () => void
  onVerLead: (leadId: number) => void
  onCancelar: (f: Followup) => void
}

function dataHora(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  })
}

const TOM_MARCADOR: Record<string, string> = {
  neutro: 'bg-gray-300 dark:bg-gray-600',
  ok: 'bg-emerald-500',
  alerta: 'bg-amber-500',
  erro: 'bg-red-500',
}

function Campo({ icone: Icone, rotulo, children }: {
  icone: typeof User; rotulo: string; children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icone size={14} className="mt-0.5 shrink-0 text-gray-400" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-gray-400">{rotulo}</p>
        <div className="text-sm text-gray-800 dark:text-gray-100">{children}</div>
      </div>
    </div>
  )
}

export default function AgendamentoDetalheDrawer({ followup, onFechar, onVerLead, onCancelar }: Props) {
  const aberto = !!followup
  // Só busca quando o drawer está aberto — a lista principal não carrega nada disto.
  const { data: doLead } = useFollowupsLead(aberto ? followup!.lead_id : undefined)
  const { data: historico } = useLeadHistoricoWhatsApp(aberto ? followup!.lead_id : undefined, aberto)

  const outrasAcoes = useMemo(
    () => (doLead || [])
      .filter((f) => f.id !== followup?.id && (f.status === 'pendente' || f.status === 'processando'))
      .sort((a, b) => a.agendado_para.localeCompare(b.agendado_para)),
    [doLead, followup?.id]
  )

  const ultimaMensagem = useMemo(() => {
    if (!historico?.length) return null
    return [...historico].sort((a, b) => b.enviado_at.localeCompare(a.enviado_at))[0]
  }, [historico])

  if (!followup) return null

  const estado = resolverEstado(followup)
  const ap = APRESENTACAO[estado]
  const ehIA = followup.tipo === 'agente_ia'
  const ciclo = montarCicloVida(followup)
  const desc = followup.status === 'falhou' || followup.erro_categoria
    ? descreverErroFollowup(followup.erro_categoria)
    : null

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
        onClick={onFechar}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label="Detalhe do agendamento"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white dark:bg-gray-800 shadow-2xl"
      >
        {/* Cabeçalho */}
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 p-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Agendamento #{followup.id}</p>
            <h3 className="truncate text-base font-semibold text-gray-900 dark:text-white">
              {followup.lead_nome ?? `Lead #${followup.lead_id}`}
            </h3>
            <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ap.badge}`}>
              {ap.rotulo}
            </span>
          </div>
          <button
            onClick={onFechar}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">{ap.significado}</p>

          {/* Cadência que não é mais a do estágio atual (item 12) */}
          {followup.cadencia_desatualizada && (
            <div className="rounded-lg border-[1px] border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                <AlertTriangle size={13} /> Pertence à etapa anterior
              </p>
              <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/90">
                O lead está em <strong>{followup.estagio_nome}</strong>, mas este passo foi
                criado pela cadência de outra etapa. Se ele sair, a mensagem vai seguir a
                instrução antiga — normalmente o certo é cancelar e deixar a cadência da
                etapa atual seguir.
              </p>
            </div>
          )}

          {followup.lead_arquivado && (
            <div className="rounded-lg border-[1px] border-slate-300 bg-slate-50 p-3 dark:border-slate-500/40 dark:bg-slate-500/10">
              <p className="text-xs text-slate-700 dark:text-slate-300">
                Este lead está <strong>arquivado</strong> — nenhuma mensagem sai para ele
                enquanto não for reativado.
              </p>
            </div>
          )}

          {/* Quem / onde / por qual chip */}
          <section className="space-y-3">
            <Campo icone={Layers} rotulo="Estágio atual">
              <span
                className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: followup.estagio_cor || '#6366f1' }}
              >
                {followup.estagio_nome || '—'}
              </span>
            </Campo>

            <Campo icone={Smartphone} rotulo="Responsável / chip">
              {followup.responsavel_nome || '—'}
              {followup.responsavel_porta && (
                <span className="ml-1.5 text-xs text-gray-400">porta {followup.responsavel_porta}</span>
              )}
              {followup.usuario_nome && followup.usuario_nome !== followup.responsavel_nome && (
                <p className="text-[11px] text-gray-400">agendado por {followup.usuario_nome}</p>
              )}
            </Campo>

            <Campo icone={ehIA ? Bot : MessageSquare} rotulo="Ação">
              {ehIA ? 'Follow-up do Agente IA' : 'Follow-up manual'}
              {followup.passo_ordem != null && (
                <span className="ml-1.5 text-xs text-gray-400">
                  passo {followup.passo_ordem + 1} da cadência
                </span>
              )}
              {ehIA && (
                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                  Segue a instrução do estágio <strong>{followup.estagio_nome}</strong>, considerando
                  o histórico da conversa.
                </p>
              )}
            </Campo>

            <Campo icone={CalendarClock} rotulo="Agendamento">
              <p>{ap.terminal ? 'Estava previsto para ' : 'Próximo envio: '}
                <strong>{dataHora(followup.agendado_para)}</strong></p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Regra: {descreverPlano(followup)}
              </p>
              <p className="text-[11px] text-gray-400">Criado em {dataHora(followup.created_at)}</p>
            </Campo>
          </section>

          {/* Conteúdo programado */}
          {(followup.mensagem || followup.instrucao_ia) && (
            <section>
              <h4 className="mb-1.5 text-[11px] uppercase tracking-wide text-gray-400">
                {ehIA ? 'Instrução deste passo' : 'Mensagem programada'}
              </h4>
              <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-2.5 text-xs text-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
                {followup.instrucao_ia || followup.mensagem}
              </p>
            </section>
          )}

          {/* Por que não foi enviado (item 7) */}
          {desc && (followup.status === 'falhou' || followup.status === 'cancelado') && (
            <section>
              <h4 className="mb-1.5 text-[11px] uppercase tracking-wide text-gray-400">Por que não foi enviado</h4>
              <div className={`rounded-lg p-3 ${ap.badge}`}>
                <p className="text-xs font-semibold">{desc.rotulo}</p>
                <p className="mt-1 text-xs opacity-90">{desc.explicacao}</p>
                {desc.acaoDoUsuario && (
                  <p className="mt-1.5 text-xs font-medium">→ {desc.acaoDoUsuario}</p>
                )}
                {esgotouTentativas(followup.erro) && (
                  <p className="mt-1.5 text-xs opacity-90">
                    O limite de tentativas foi atingido — o sistema parou de tentar sozinho.
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Ciclo de vida (item 3) */}
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-gray-400">
              <History size={12} /> Ciclo deste agendamento
            </h4>
            <ol className="space-y-2.5">
              {ciclo.map((ev, i) => (
                <li key={i} className="flex gap-2.5">
                  <div className="flex flex-col items-center">
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${TOM_MARCADOR[ev.tom]}`} />
                    {i < ciclo.length - 1 && <span className="mt-0.5 w-px flex-1 bg-gray-200 dark:bg-gray-700" />}
                  </div>
                  <div className="min-w-0 pb-0.5">
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-100">
                      {ev.rotulo}
                      {ev.quando && <span className="ml-1.5 font-normal text-gray-400">{dataHora(ev.quando)}</span>}
                    </p>
                    {ev.detalhe && <p className="text-[11px] text-gray-500 dark:text-gray-400">{ev.detalhe}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Última mensagem trocada */}
          {ultimaMensagem && (
            <section>
              <h4 className="mb-1.5 text-[11px] uppercase tracking-wide text-gray-400">Última mensagem trocada</h4>
              <div className="rounded-lg bg-gray-50 p-2.5 dark:bg-gray-900/40">
                <p className="text-[11px] text-gray-400">
                  {ultimaMensagem.direcao === 'entrada' ? 'O lead escreveu' : 'Nós escrevemos'} ·{' '}
                  {dataHora(ultimaMensagem.enviado_at)}
                </p>
                <p className="mt-0.5 line-clamp-3 text-xs text-gray-700 dark:text-gray-300">
                  {ultimaMensagem.conteudo || `[${ultimaMensagem.tipo}]`}
                </p>
              </div>
            </section>
          )}

          {/* Outras ações previstas para o lead (item 4) */}
          <section>
            <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-gray-400">
              <ListTree size={12} /> Próximas ações deste lead
            </h4>
            {outrasAcoes.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Nenhuma outra ação prevista além desta.
              </p>
            ) : (
              <>
                <p className="mb-1.5 text-xs text-gray-600 dark:text-gray-300">
                  Este lead tem mais {outrasAcoes.length} ação{outrasAcoes.length === 1 ? '' : 'ões'} prevista{outrasAcoes.length === 1 ? '' : 's'}:
                </p>
                <ul className="space-y-1">
                  {outrasAcoes.slice(0, 6).map((f) => (
                    <li key={f.id} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <span className="text-gray-400">#{f.id}</span>
                      <span>{dataHora(f.agendado_para)}</span>
                      <span className="text-gray-400">·</span>
                      <span>{f.tipo === 'agente_ia' ? 'Agente IA' : 'Manual'}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        {/* Ações */}
        <footer className="flex items-center gap-2 border-t border-gray-200 p-3">
          <button
            onClick={() => onVerLead(followup.lead_id)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <ArrowUpRight size={14} /> Ver lead
          </button>
          {!ap.terminal && (
            <button
              onClick={() => onCancelar(followup)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300"
            >
              <X size={14} /> Cancelar envio
            </button>
          )}
        </footer>
      </aside>
    </>
  )
}
