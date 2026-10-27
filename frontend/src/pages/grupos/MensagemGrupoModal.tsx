import React, { useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Paperclip, Search, X, AtSign, Lock, ExternalLink, AlertTriangle, BarChart3, Plus } from 'lucide-react'
import { Button, Input, Modal, ModalFooter, WhatsAppFormatToolbar } from '@/components/ui'
import { followupsApi } from '@/api/crm'
import { gruposApi, type EntradaMensagemGrupo, type GrupoWhatsApp, type MensagemGrupo, type ModoEnvio } from '@/api/grupos'
import { ListaMencao, MarcadasMencao, destacarMencoes, useMencoes } from './MencaoPessoas'
import { DIAS_CURTOS, previaWhatsApp, paraInputLocal } from './util'

const erroDe = (e: unknown, padrao: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || padrao

const INTERVALOS = [10, 20, 30, 60, 120]

/** Limite do texto do botão — o mesmo da API (`MAX_TEXTO_BOTAO`). */
const MAX_TEXTO_BOTAO = 20

/** Limite de opções da enquete — o mesmo da API (`MAX_OPCOES_ENQUETE`) e do WhatsApp. */
const MAX_OPCOES_ENQUETE = 12

export const MensagemGrupoModal: React.FC<{
  aberto: boolean
  onFechar: () => void
  grupos: GrupoWhatsApp[]
  editando?: MensagemGrupo | null
  preSelecionados?: string[]
  /** Mensagem de campanha (089): vai para todos os grupos ativos dela, sem escolher. */
  campanha?: { id: number; nome: string; grupos: number } | null
}> = ({ aberto, onFechar, grupos, editando, preSelecionados, campanha }) => {
  const campanhaId = campanha?.id ?? editando?.campanha_id ?? null
  const nomeCampanha = campanha?.nome ?? editando?.campanha_nome ?? ''
  const qc = useQueryClient()
  const textoRef = useRef<HTMLTextAreaElement>(null)
  const [titulo, setTitulo] = useState(editando?.titulo || '')
  const [texto, setTexto] = useState(editando?.texto || '')
  const [midia, setMidia] = useState<{ url: string; mimetype: string; nome: string } | null>(
    editando?.media_url ? { url: editando.media_url, mimetype: editando.media_mimetype || '', nome: editando.media_filename || 'arquivo' } : null
  )
  const [enviandoArquivo, setEnviandoArquivo] = useState(false)
  const [mencionar, setMencionar] = useState(editando?.mencionar_todos || false)
  const [selecionados, setSelecionados] = useState<Set<string>>(
    new Set(editando?.grupos.map(g => g.id) || preSelecionados || [])
  )
  const [busca, setBusca] = useState('')
  const [modo, setModo] = useState<ModoEnvio>(editando?.modo === 'agora' ? 'agendada' : editando?.modo || 'agora')
  const [quando, setQuando] = useState(paraInputLocal(editando?.agendado_para || null))
  const [dias, setDias] = useState<number[]>(editando?.recorrencia?.dias || [1])
  const [hora, setHora] = useState(editando?.recorrencia?.hora || '09:00')
  const [intervalo, setIntervalo] = useState(editando?.intervalo_segundos || 20)
  const [comBotao, setComBotao] = useState(!!editando?.botao_url)
  const [botaoTexto, setBotaoTexto] = useState(editando?.botao_texto || '')
  const [botaoUrl, setBotaoUrl] = useState(editando?.botao_url || '')
  const [comEnquete, setComEnquete] = useState(!!editando?.enquete_pergunta)
  const [pergunta, setPergunta] = useState(editando?.enquete_pergunta || '')
  const [opcoes, setOpcoes] = useState<string[]>(editando?.enquete_opcoes?.length ? editando.enquete_opcoes : ['', ''])
  const mencao = useMencoes(texto, setTexto, textoRef, editando?.mencoes)

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return b ? grupos.filter(g => g.nome.toLowerCase().includes(b)) : grupos
  }, [grupos, busca])

  const bloqueado = (g: GrupoWhatsApp) => g.soAdminsEnviam && !g.souAdmin

  const alternar = (id: string) => setSelecionados(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const anexar = async (arquivo?: File | null) => {
    if (!arquivo) return
    setEnviandoArquivo(true)
    try {
      const r = await followupsApi.uploadMedia(arquivo)
      setMidia({ url: r.media_url, mimetype: r.media_mimetype, nome: r.media_filename })
    } catch (e) {
      toast.error(erroDe(e, 'Não foi possível anexar o arquivo'))
    } finally {
      setEnviandoArquivo(false)
    }
  }

  const salvar = useMutation({
    mutationFn: (d: EntradaMensagemGrupo) => editando ? gruposApi.atualizarMensagem(editando.id, d) : gruposApi.criarMensagem(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grupos'] })
      toast.success(modo === 'agora' ? 'Mensagem na fila — sai em até 1 minuto' : 'Mensagem salva')
      onFechar()
    },
    onError: (e) => toast.error(erroDe(e, 'Não foi possível salvar')),
  })

  const enviar = () => {
    const escolhidos = grupos.filter(g => selecionados.has(g.id))
    // Grupo que saiu da lista (o chip saiu dele) continua na edição com o nome guardado.
    const fora = (editando?.grupos || []).filter(g => selecionados.has(g.id) && !escolhidos.some(e => e.id === g.id))
    salvar.mutate({
      campanha_id: campanhaId,
      titulo, texto, mencionar_todos: mencionar, intervalo_segundos: intervalo, modo,
      media_url: midia?.url || null, media_mimetype: midia?.mimetype || null, media_filename: midia?.nome || null,
      grupos: campanhaId ? [] : [...escolhidos.map(g => ({ id: g.id, nome: g.nome })), ...fora],
      agendado_para: modo === 'agendada' && quando ? new Date(quando).toISOString() : null,
      recorrencia: modo === 'recorrente' ? { dias, hora } : null,
      botao: comBotao ? { texto: botaoTexto.trim(), url: botaoUrl.trim() } : null,
      mencoes: mencao.ativas,
      enquete: comEnquete ? { pergunta: pergunta.trim(), opcoes: opcoes.map(o => o.trim()).filter(Boolean) } : null,
    })
  }

  const legenda = midia && comBotao
    ? 'Com botão, o arquivo sai primeiro e o texto vai logo depois, junto com o botão.'
    : midia && !/^(image|video)\//.test(midia.mimetype)
      ? 'Áudio e documento não têm legenda: o texto vai numa mensagem logo depois do arquivo.'
      : null

  return (
    <Modal isOpen={aberto} onClose={onFechar} title={editando ? 'Editar mensagem para grupos' : 'Nova mensagem para grupos'} size="xl">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5 min-w-0">
          <Input label="Nome (só para você achar depois)" placeholder="Ex.: Aviso da live de quinta" value={titulo} onChange={e => setTitulo(e.target.value)} />

          {campanhaId ? (
            <div className="rounded-lg border border-primary-200 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/30 p-3 text-sm text-gray-700 dark:text-gray-200">
              Vai para <strong>todos os grupos ativos da campanha {nomeCampanha}</strong>
              {campanha ? ` (hoje, ${campanha.grupos})` : ''} — inclusive os que abrirem até a hora do envio. Cada grupo recebe
              pelo WhatsApp que o administra.
            </div>
          ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Grupos · {selecionados.size} escolhido(s)</span>
              {filtrados.length > 0 && (
                <button type="button" className="text-xs font-medium text-primary-600 dark:text-primary-200 hover:underline"
                  onClick={() => setSelecionados(new Set(filtrados.filter(g => !bloqueado(g)).map(g => g.id)))}>
                  Marcar os {filtrados.filter(g => !bloqueado(g)).length} da lista
                </button>
              )}
            </div>
            <Input placeholder="Buscar grupo" icon={<Search className="w-4 h-4" />} value={busca} onChange={e => setBusca(e.target.value)} />
            <ul className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
              {filtrados.length === 0 && <li className="p-3 text-sm text-gray-500 dark:text-gray-400">Nenhum grupo encontrado.</li>}
              {filtrados.map(g => (
                <li key={g.id}>
                  <label className={`flex items-center gap-3 px-3 py-2 text-sm ${bloqueado(g) ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                    title={bloqueado(g) ? 'Neste grupo só administradores enviam, e o seu número não é administrador.' : undefined}>
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary-600"
                      checked={selecionados.has(g.id)} disabled={bloqueado(g)} onChange={() => alternar(g.id)} />
                    <span className="flex-1 truncate text-gray-900 dark:text-gray-100">{g.nome}</span>
                    {bloqueado(g) && <Lock className="w-3.5 h-3.5 text-gray-400" aria-label="Só administradores enviam" />}
                    <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{g.participantes} pessoas</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          )}

          <div>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Mensagem</span>
            <WhatsAppFormatToolbar textareaRef={textoRef} value={texto} onChange={setTexto} />
            <div className="relative">
              <textarea ref={textoRef} rows={6} value={texto}
                onChange={e => { setTexto(e.target.value); mencao.lerCursor(e.target) }}
                {...mencao.textarea}
                placeholder="Escreva como escreveria no grupo. *negrito*, _itálico_ e ~riscado~ funcionam. Digite @ para marcar alguém."
                className="mt-2 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 outline-none" />
              <ListaMencao aberta={!!mencao.consulta} termo={mencao.consulta?.termo || ''}
                grupos={[...selecionados]} campanhaId={campanhaId}
                destacado={mencao.destacado} onDestacar={mencao.setDestacado} onEscolher={mencao.escolher} onFiltrados={mencao.aoFiltrar} />
            </div>
            <MarcadasMencao mencoes={mencao.ativas} onTirar={mencao.tirar} />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Dica: <code className="rounded bg-gray-100 dark:bg-gray-700 px-1">{'{Oi|Olá|E aí}'}</code> sorteia uma das opções em cada grupo,
              para a mesma mensagem não cair idêntica em todos.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button type="button" onClick={mencao.iniciar}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 dark:text-primary-200 hover:underline">
                <AtSign className="w-4 h-4" /> Marcar pessoa
              </button>
              {midia ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 dark:bg-gray-700 px-3 py-1 text-xs text-gray-700 dark:text-gray-200">
                  <Paperclip className="w-3.5 h-3.5" /> <span className="max-w-[220px] truncate">{midia.nome}</span>
                  <button type="button" onClick={() => setMidia(null)} aria-label="Remover anexo"><X className="w-3.5 h-3.5" /></button>
                </span>
              ) : (
                <label className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 dark:text-primary-200 cursor-pointer hover:underline">
                  <Paperclip className="w-4 h-4" /> {enviandoArquivo ? 'Enviando arquivo…' : 'Anexar imagem, vídeo, áudio ou PDF'}
                  <input type="file" className="sr-only" disabled={enviandoArquivo}
                    accept="image/*,video/mp4,audio/*,application/pdf" onChange={e => anexar(e.target.files?.[0])} />
                </label>
              )}
            </div>
            {legenda && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{legenda}</p>}
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600" checked={comBotao} onChange={e => setComBotao(e.target.checked)} />
              <span className="text-sm">
                <span className="font-medium text-gray-900 dark:text-gray-100 inline-flex items-center gap-1"><ExternalLink className="w-4 h-4" /> Botão com link</span>
                <span className="block text-gray-600 dark:text-gray-400 text-xs mt-0.5">Um botão embaixo da mensagem que abre o link (inscrição, página de vendas, aula).</span>
              </span>
            </label>
            {comBotao && (
              <div className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                  <Input label={`Texto do botão (${botaoTexto.length}/${MAX_TEXTO_BOTAO})`} placeholder="Ex.: Quero participar" maxLength={MAX_TEXTO_BOTAO}
                    value={botaoTexto} onChange={e => setBotaoTexto(e.target.value)} />
                  <Input label="Link" placeholder="https://…" type="url" value={botaoUrl} onChange={e => setBotaoUrl(e.target.value)} />
                </div>
                <p className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                  <span>
                    Botão pelo QR Code não é recurso oficial do WhatsApp: em alguns celulares ele pode não aparecer. Por isso o link
                    vai também no fim do texto — quem não vir o botão clica no link. Faça um teste num grupo seu antes de mandar para todos.
                  </span>
                </p>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600" checked={comEnquete} onChange={e => setComEnquete(e.target.checked)} />
              <span className="text-sm">
                <span className="font-medium text-gray-900 dark:text-gray-100 inline-flex items-center gap-1"><BarChart3 className="w-4 h-4" /> Enquete</span>
                <span className="block text-gray-600 dark:text-gray-400 text-xs mt-0.5">
                  Uma pergunta com opções para o grupo votar. Se tiver texto ou anexo, a enquete sai logo depois deles.
                </span>
              </span>
            </label>
            {comEnquete && (
              <div className="mt-3 space-y-2">
                <Input label="Pergunta" placeholder="Ex.: Qual o melhor dia para a live?" maxLength={255}
                  value={pergunta} onChange={e => setPergunta(e.target.value)} />
                {opcoes.map((o, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <Input label={i === 0 ? 'Opções (cada pessoa escolhe uma)' : undefined} placeholder={`Opção ${i + 1}`} maxLength={100}
                      value={o} onChange={e => setOpcoes(os => os.map((x, j) => (j === i ? e.target.value : x)))} />
                    {opcoes.length > 2 && (
                      <button type="button" onClick={() => setOpcoes(os => os.filter((_, j) => j !== i))}
                        className="mb-2 text-gray-400 hover:text-red-600" aria-label={`Remover opção ${i + 1}`}>
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                {opcoes.length < MAX_OPCOES_ENQUETE && (
                  <button type="button" onClick={() => setOpcoes(os => [...os, ''])}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 dark:text-primary-200 hover:underline">
                    <Plus className="w-4 h-4" /> Adicionar opção
                  </button>
                )}
              </div>
            )}
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600" checked={mencionar} onChange={e => setMencionar(e.target.checked)} />
            <span className="text-sm">
              <span className="font-medium text-gray-900 dark:text-gray-100 inline-flex items-center gap-1"><AtSign className="w-4 h-4" /> Marcar todos os participantes</span>
              <span className="block text-gray-600 dark:text-gray-400 text-xs mt-0.5">
                Todo mundo recebe notificação, mesmo quem silenciou o grupo. Use nos avisos que importam — em toda mensagem, as pessoas saem do grupo.
              </span>
            </span>
          </label>

          <fieldset>
            <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Quando enviar</legend>
            <div className="grid grid-cols-3 gap-2">
              {([['agora', 'Agora'], ['agendada', 'Agendar'], ['recorrente', 'Repetir']] as const).map(([k, rotulo]) => (
                <button key={k} type="button" onClick={() => setModo(k)} aria-pressed={modo === k}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${modo === k
                    ? 'border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-100 dark:border-primary-400'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}>
                  {rotulo}
                </button>
              ))}
            </div>
            {modo === 'agendada' && (
              <Input className="mt-3" type="datetime-local" label="Data e hora (horário de Brasília)" value={quando} onChange={e => setQuando(e.target.value)} />
            )}
            {modo === 'recorrente' && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dias da semana">
                  {DIAS_CURTOS.map((d, i) => (
                    <button key={d} type="button" aria-pressed={dias.includes(i)}
                      onClick={() => setDias(ds => ds.includes(i) ? ds.filter(x => x !== i) : [...ds, i])}
                      className={`w-11 rounded-md border py-1.5 text-xs font-medium ${dias.includes(i)
                        ? 'border-primary-600 bg-primary-600 text-white'
                        : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}>
                      {d}
                    </button>
                  ))}
                </div>
                <Input type="time" label="Horário (Brasília)" value={hora} onChange={e => setHora(e.target.value)} />
              </div>
            )}
          </fieldset>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2" htmlFor="intervalo-grupos">Intervalo entre um grupo e outro</label>
            <select id="intervalo-grupos" value={intervalo} onChange={e => setIntervalo(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
              {INTERVALOS.map(s => <option key={s} value={s}>{s < 60 ? `${s} segundos` : `${s / 60} minuto(s)`}</option>)}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              A mesma mensagem caindo em vários grupos no mesmo segundo é o que chama atenção do WhatsApp. Com {(campanhaId ? campanha?.grupos : selecionados.size) || 1} grupo(s), a rodada leva uns {Math.max(0, (((campanhaId ? campanha?.grupos : selecionados.size) || 1) - 1) * intervalo / 60).toFixed(0)} min.
            </p>
          </div>
        </div>

        <aside className="lg:sticky lg:top-0 self-start">
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Prévia</span>
          <div className="rounded-xl bg-[#efeae2] dark:bg-[#0b141a] p-4 min-h-[180px]">
            <div className="ml-auto max-w-[260px] rounded-lg rounded-tr-none bg-[#d9fdd3] dark:bg-[#005c4b] p-2.5 text-sm text-gray-900 dark:text-gray-100 shadow-sm">
              {midia && (
                <div className="mb-1.5 flex items-center gap-2 rounded bg-black/5 dark:bg-white/10 px-2 py-1.5 text-xs">
                  <Paperclip className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{midia.nome}</span>
                </div>
              )}
              {mencionar && <p className="text-xs text-sky-700 dark:text-sky-300 mb-1">@todos os participantes</p>}
              {texto.trim()
                ? <p className="whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: destacarMencoes(previaWhatsApp(texto), mencao.ativas) }} />
                : !comEnquete && <p className="text-gray-500 dark:text-gray-400 italic">A mensagem aparece aqui.</p>}
              {comBotao && botaoUrl.trim() && !texto.includes(botaoUrl.trim()) && (
                <p className="mt-2 break-all text-sky-700 dark:text-sky-300">👉 {botaoUrl.trim()}</p>
              )}
              {comBotao && (
                <div className="mt-2 -mx-2.5 -mb-2.5 border-t border-black/10 dark:border-white/10 py-2 text-center text-sm font-medium text-sky-700 dark:text-sky-300 inline-flex w-[calc(100%+1.25rem)] items-center justify-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" /> {botaoTexto.trim() || 'Texto do botão'}
                </div>
              )}
            </div>
            {comEnquete && (
              <div className="ml-auto mt-2 max-w-[260px] rounded-lg rounded-tr-none bg-[#d9fdd3] dark:bg-[#005c4b] p-2.5 text-sm text-gray-900 dark:text-gray-100 shadow-sm">
                <p className="font-medium break-words">{pergunta.trim() || 'Pergunta da enquete'}</p>
                <p className="text-xs text-gray-600 dark:text-gray-300 mb-1.5">Selecione uma opção</p>
                <ul className="space-y-1.5">
                  {opcoes.filter(o => o.trim()).map((o, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="h-4 w-4 shrink-0 rounded-full border-2 border-gray-400 dark:border-gray-300" aria-hidden="true" />
                      <span className="break-words">{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={onFechar}>Cancelar</Button>
        <Button onClick={enviar} isLoading={salvar.isPending} disabled={enviandoArquivo || (!campanhaId && selecionados.size === 0)}>
          {modo === 'agora' ? (campanhaId ? 'Enviar para os grupos da campanha' : `Enviar para ${selecionados.size} grupo(s)`) : 'Salvar'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
