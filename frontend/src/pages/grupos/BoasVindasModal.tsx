import React, { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Button, Modal, ModalFooter, Switch, WhatsAppFormatToolbar } from '@/components/ui'
import { gruposApi, type BoasVindas, type EntradaBoasVindas, type GrupoWhatsApp } from '@/api/grupos'
import { previaWhatsApp } from './util'

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
  const [mensagem, setMensagem] = useState(editando?.mensagem || PADRAO)
  const [atraso, setAtraso] = useState(editando?.delay_segundos ?? 60)
  const [mencionar, setMencionar] = useState(editando?.mencionar ?? true)
  const [ativa, setAtiva] = useState(editando?.ativa ?? true)

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
    .replace(/\{\{\s*primeiro_nome\s*\}\}/gi, 'Ana e Bruno')
    .replace(/\{\{\s*nome\s*\}\}/gi, 'Ana Souza e Bruno Lima')
    .replace(/\{\{\s*nome_grupo\s*\}\}/gi, grupos.find(g => g.id === grupoId)?.nome || editando?.grupo_nome || 'grupo')
    .replace(/\{\{\s*mencoes\s*\}\}/gi, '@Ana @Bruno')

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
            <select id="bv-grupo" value={grupoId} onChange={e => setGrupoId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
              {livres.map(g => <option key={g.id} value={g.id}>{g.nome} · {g.participantes} pessoas</option>)}
            </select>
          )}
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Mensagem no grupo</span>
          <WhatsAppFormatToolbar textareaRef={ref} value={mensagem} onChange={setMensagem} />
          <textarea ref={ref} rows={5} value={mensagem} onChange={e => setMensagem(e.target.value)}
            className="mt-2 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 outline-none" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {VARIAVEIS.map(([v, rotulo]) => (
              <button key={v} type="button" onClick={() => inserir(v)}
                className="rounded-full border border-gray-300 dark:border-gray-600 px-2.5 py-0.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                + {rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-[#efeae2] dark:bg-[#0b141a] p-4">
          <p className="mb-2 text-xs text-gray-600 dark:text-gray-400">Exemplo com duas pessoas entrando juntas:</p>
          <div className="max-w-[340px] rounded-lg rounded-tl-none bg-white dark:bg-[#202c33] p-2.5 text-sm text-gray-900 dark:text-gray-100 shadow-sm">
            {mencionar && !/\{\{\s*mencoes\s*\}\}/i.test(mensagem) && <p className="text-sky-700 dark:text-sky-300">@Ana @Bruno</p>}
            <p className="whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: previaWhatsApp(exemplo) }} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="bv-atraso" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Quando enviar</label>
            <select id="bv-atraso" value={atraso} onChange={e => setAtraso(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
              {ATRASOS.map(([s, r]) => <option key={s} value={s}>{r}</option>)}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Quem entrar nesse intervalo recebe a mesma mensagem, uma só.</p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-700 dark:text-gray-300">Marcar quem entrou</span>
              <Switch checked={mencionar} onChange={setMencionar} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-700 dark:text-gray-300">Ligada</span>
              <Switch checked={ativa} onChange={setAtiva} />
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          A boas-vindas sai dentro do grupo, não no privado: mensagem particular para quem acabou de entrar é primeiro contato, e pelo QR Code é o que mais leva a bloqueio.
        </p>
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={onFechar}>Cancelar</Button>
        <Button isLoading={salvar.isPending} disabled={!editando && !grupoId}
          onClick={() => salvar.mutate({
            grupo_id: grupoId,
            grupo_nome: grupos.find(g => g.id === grupoId)?.nome,
            mensagem, delay_segundos: atraso, mencionar, ativa,
          })}>
          Salvar
        </Button>
      </ModalFooter>
    </Modal>
  )
}
