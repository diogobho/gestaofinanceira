import React, { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { AtSign, Search } from 'lucide-react'
import { Button, Input, Modal, ModalFooter, Switch, WhatsAppFormatToolbar } from '@/components/ui'
import { gruposApi, type BoasVindas, type EntradaBoasVindas, type GrupoWhatsApp } from '@/api/grupos'
import { previaWhatsApp } from './util'
import { ListaMencao, MarcadasMencao, destacarMencoes, useMencoes } from './MencaoPessoas'

const erroDe = (e: unknown, padrao: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || padrao

const ATRASOS: [number, string][] = [[0, 'Na hora'], [60, '1 minuto depois'], [300, '5 minutos depois'], [900, '15 minutos depois'], [3600, '1 hora depois']]

const VARIAVEIS: [string, string][] = [
  ['{{primeiro_nome}}', 'primeiro nome'],
  ['{{nome}}', 'nome completo'],
  ['{{nome_grupo}}', 'nome do grupo'],
  ['{{mencoes}}', '@ de quem entrou'],
]

const PADRAO = 'Seja bem-vindo(a) ao *{{nome_grupo}}*, {{primeiro_nome}}! 👋\n\nAqui você recebe os avisos e materiais em primeira mão. Fique à vontade para se apresentar.'

export const BoasVindasModal: React.FC<{
  aberto: boolean
  onFechar: () => void
  grupos: GrupoWhatsApp[]
  editando?: BoasVindas | null
  grupoInicial?: string
  gruposComBoasVindas: Set<string>
}> = ({ aberto, onFechar, grupos, editando, grupoInicial, gruposComBoasVindas }) => {
  const qc = useQueryClient()
  const ref = useRef<HTMLTextAreaElement>(null)
  const livres = grupos.filter(g => !gruposComBoasVindas.has(g.id) && !(g.soAdminsEnviam && !g.souAdmin))
  const [grupoId, setGrupoId] = useState(editando?.grupo_whatsapp_id || grupoInicial || livres[0]?.id || '')
  const [buscaGrupo, setBuscaGrupo] = useState('')
  const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  // O grupo escolhido fica na lista mesmo fora da busca: senão o select mostraria outro sem ele ter mudado.
  const livresFiltrados = livres.filter(g => g.id === grupoId || semAcento(g.nome).includes(semAcento(buscaGrupo.trim())))
  const [mensagem, setMensagem] = useState(editando?.mensagem || PADRAO)
  const [atraso, setAtraso] = useState(editando?.delay_segundos ?? 60)
  const [mencionar, setMencionar] = useState(editando?.mencionar ?? true)
  const [ativa, setAtiva] = useState(editando?.ativa ?? true)
  const [destino, setDestino] = useState<'grupo' | 'privado'>(editando?.destino ?? 'grupo')
  const privado = destino === 'privado'
  // Dividir o envio no privado entre números da equipe conectados por QR (07/10/2026).
  const [dividir, setDividir] = useState((editando?.distribuir_entre?.length ?? 0) > 0)
  const [divididos, setDivididos] = useState<number[]>(editando?.distribuir_entre ?? [])
  const chips = useQuery({ queryKey: ['grupos', 'boas-vindas', 'chips'], queryFn: gruposApi.chipsBoasVindas, enabled: aberto && privado })
  const mencao = useMencoes(mensagem, setMensagem, ref, editando?.mencoes)
  const grupoDaMensagem = editando?.grupo_whatsapp_id || grupoId

  const salvar = useMutation({
    mutationFn: (d: EntradaBoasVindas) => editando ? gruposApi.atualizarBoasVindas(editando.id, d) : gruposApi.criarBoasVindas(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grupos', 'boas-vindas'] })
      toast.success('Boas-vindas salva')
      onFechar()
    },
    onError: (e) => toast.error(erroDe(e, 'Não foi possível salvar')),
  })

  const inserir = (v: string) => {
    const el = ref.current
    const ini = el?.selectionStart ?? mensagem.length
    const fim = el?.selectionEnd ?? mensagem.length
    setMensagem(mensagem.slice(0, ini) + v + mensagem.slice(fim))
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(ini + v.length, ini + v.length) })
  }

  const exemplo = mensagem
    .replace(/\{\{\s*primeiro_nome\s*\}\}/gi, privado ? 'Ana' : 'Ana e Bruno')
    .replace(/\{\{\s*nome\s*\}\}/gi, privado ? 'Ana Souza' : 'Ana Souza e Bruno Lima')
    .replace(/\{\{\s*nome_grupo\s*\}\}/gi, grupos.find(g => g.id === grupoId)?.nome || editando?.grupo_nome || 'grupo')
    .replace(/\{\{\s*mencoes\s*\}\}/gi, privado ? '' : '@Ana @Bruno')

  return (
    <Modal isOpen={aberto} onClose={onFechar} title={editando ? 'Editar boas-vindas' : 'Nova boas-vindas'} size="lg">
      <div className="space-y-5">
        <div>
          <label htmlFor="bv-grupo" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Grupo</label>
          {editando ? (
            <p className="text-sm text-gray-900 dark:text-gray-100">{editando.grupo_nome || editando.grupo_whatsapp_id}</p>
          ) : livres.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">Todos os grupos em que você pode enviar já têm boas-vindas.</p>
          ) : (
            <div className="space-y-2">
              {livres.length > 5 && (
                <Input placeholder="Buscar grupo" icon={<Search className="w-4 h-4" />} value={buscaGrupo}
                  onChange={e => {
                    setBuscaGrupo(e.target.value)
                    const b = semAcento(e.target.value.trim())
                    const primeiro = livres.find(g => semAcento(g.nome).includes(b))
                    if (b && primeiro) setGrupoId(primeiro.id)
                  }} />
              )}
              <select id="bv-grupo" value={grupoId} onChange={e => setGrupoId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                {livresFiltrados.map(g => <option key={g.id} value={g.id}>{g.nome} · {g.participantes} pessoas</option>)}
              </select>
            </div>
          )}
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Onde enviar</span>
          <div role="radiogroup" aria-label="Onde enviar" className="grid grid-cols-2 gap-2">
            {([['grupo', 'No grupo', 'Uma mensagem marcando quem entrou'], ['privado', 'No privado', 'Uma mensagem para cada pessoa']] as const).map(([v, titulo, desc]) => (
              <button key={v} type="button" role="radio" aria-checked={destino === v} onClick={() => setDestino(v)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${destino === v
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 ring-1 ring-primary-500'
                  : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">{titulo}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">{desc}</span>
              </button>
            ))}
          </div>
          {privado && (
            <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 space-y-1">
              <p><strong>Risco de bloqueio.</strong> Quem entra no grupo nunca conversou com o seu número, e mensagem no privado para desconhecido é o que a Meta pune no QR Code. Para reduzir o risco:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>cada mensagem sai 1 a 5 minutos depois (sorteado), uma por minuto no máximo;</li>
                <li>só das 8h às 21h — quem entrar de madrugada recebe de manhã;</li>
                <li>no máximo 40 por dia por número; passou disso, quem entrar recebe no grupo;</li>
                <li>quem não tiver o número visível no grupo também recebe no grupo.</li>
              </ul>
            </div>
          )}
          {privado && (
            <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Dividir o envio entre números da equipe</span>
                <Switch checked={dividir} onChange={setDividir} labels={{ on: 'Sim', off: 'Não' }} aria-label="Dividir o envio entre números da equipe" />
              </div>
              {dividir && (chips.isLoading ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">Carregando os números…</p>
              ) : !(chips.data || []).length ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">Ninguém da equipe tem WhatsApp conectado por QR Code.</p>
              ) : (
                <>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {(chips.data || []).map(c => (
                      <label key={c.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                        <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary-600" checked={divididos.includes(c.id)}
                          onChange={e => setDivididos(d => e.target.checked ? [...d, c.id] : d.filter(x => x !== c.id))} />
                        {c.nome}
                        {!c.conectado && <span className="text-xs text-amber-700 dark:text-amber-300">(desconectado agora)</span>}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Cada mensagem sai pelo próximo número marcado, e o limite de 40 por dia vale para cada um. Se a pessoa já tem card
                    com alguém marcado, sai pelo número dessa pessoa. O card fica com quem enviou, e a resposta chega no WhatsApp dela.
                    Número desconectado ou no limite do dia fica de fora até voltar.
                  </p>
                </>
              ))}
            </div>
          )}
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{privado ? 'Mensagem no privado' : 'Mensagem no grupo'}</span>
          <WhatsAppFormatToolbar textareaRef={ref} value={mensagem} onChange={setMensagem} />
          <div className="relative">
            <textarea ref={ref} rows={5} value={mensagem}
              onChange={e => { setMensagem(e.target.value); mencao.lerCursor(e.target) }}
              {...mencao.textarea}
              placeholder="Digite @ para marcar alguém do grupo."
              className="mt-2 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 outline-none" />
            <ListaMencao aberta={!!mencao.consulta} termo={mencao.consulta?.termo || ''}
              grupos={grupoDaMensagem ? [grupoDaMensagem] : []} campanhaId={null}
              destacado={mencao.destacado} onDestacar={mencao.setDestacado} onEscolher={mencao.escolher} onFiltrados={mencao.aoFiltrar} />
          </div>
          <MarcadasMencao mencoes={mencao.ativas} onTirar={mencao.tirar} />
          {privado && mencao.ativas.length > 0 && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">No privado o WhatsApp não marca ninguém: quem você marcou aparece só pelo nome.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" onClick={mencao.iniciar}
              className="inline-flex items-center gap-1 rounded-full border border-primary-300 dark:border-primary-600 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-200 hover:bg-primary-50 dark:hover:bg-primary-900/30">
              <AtSign className="w-3 h-3" /> Marcar pessoa do grupo
            </button>
            {VARIAVEIS.filter(([v]) => !(privado && v === '{{mencoes}}')).map(([v, rotulo]) => (
              <button key={v} type="button" onClick={() => inserir(v)}
                className="rounded-full border border-gray-300 dark:border-gray-600 px-2.5 py-0.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                + {rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-[#efeae2] dark:bg-[#0b141a] p-4">
          <p className="mb-2 text-xs text-gray-600 dark:text-gray-400">{privado ? 'Exemplo do que a Ana recebe no privado:' : 'Exemplo com duas pessoas entrando juntas:'}</p>
          <div className="max-w-[340px] rounded-lg rounded-tl-none bg-white dark:bg-[#202c33] p-2.5 text-sm text-gray-900 dark:text-gray-100 shadow-sm">
            {!privado && mencionar && !/\{\{\s*mencoes\s*\}\}/i.test(mensagem) && <p className="text-sky-700 dark:text-sky-300">@Ana @Bruno</p>}
            <p className="whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: privado ? previaWhatsApp(exemplo.split('@').join('')) : destacarMencoes(previaWhatsApp(exemplo), mencao.ativas) }} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="bv-atraso" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Quando enviar</label>
            <select id="bv-atraso" value={atraso} onChange={e => setAtraso(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
              {ATRASOS.map(([s, r]) => <option key={s} value={s}>{r}</option>)}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {privado ? 'Mais 1 a 5 minutos sorteados, para as mensagens não saírem juntas.' : 'Quem entrar nesse intervalo recebe a mesma mensagem, uma só.'}
            </p>
          </div>
          <div className="space-y-3">
            <div className={`flex items-center justify-between gap-3 ${privado ? 'hidden' : ''}`}>
              <span className="text-sm text-gray-700 dark:text-gray-300">Marcar quem entrou</span>
              <Switch checked={mencionar} onChange={setMencionar} labels={{ on: 'Sim', off: 'Não' }} aria-label="Marcar quem entrou" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-700 dark:text-gray-300">Situação</span>
              <Switch checked={ativa} onChange={setAtiva} labels={{ on: 'Ligada', off: 'Desligada' }} aria-label="Boas-vindas ligada" />
            </div>
          </div>
        </div>

      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={onFechar}>Cancelar</Button>
        <Button isLoading={salvar.isPending} disabled={(!editando && !grupoId) || (privado && dividir && divididos.length < 1)}
          title={privado && dividir && divididos.length < 1 ? 'Marque ao menos um número' : undefined}
          onClick={() => salvar.mutate({
            grupo_id: grupoId,
            grupo_nome: grupos.find(g => g.id === grupoId)?.nome,
            mensagem, delay_segundos: atraso, mencionar, ativa, destino, mencoes: mencao.ativas,
            distribuir_entre: privado && dividir ? divididos : null,
          })}>
          Salvar
        </Button>
      </ModalFooter>
    </Modal>
  )
}
