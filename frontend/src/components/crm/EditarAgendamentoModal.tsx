import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Calendar, Clock, ArrowRight, AlertCircle, Trash2, Users, Mail, MessageSquare, Send,
  Pen, ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal, ModalFooter, Button } from '@/components/ui'
import { WhatsAppFormatToolbar } from '@/components/ui/WhatsAppFormatToolbar'
import EmailEditor from './EmailEditor'
import { disparosAgendadosApi, type DisparoAgendado } from '@/api/crm'
import { useEstagios } from '@/hooks/useCRM'
import { montarEmailComAssinatura, separarAssinatura } from '@/utils/assinaturaEmail'

/**
 * Edição de um disparo já agendado, com o mesmo compositor da tela de criação.
 *
 * O que existia antes era um formulário de duas linhas — textarea e data — solto
 * dentro do card da lista: sem variáveis, sem formatação do WhatsApp, sem
 * pré-visualização e, no disparo de e-mail, **sem o assunto**, que ficava
 * impossível de corrigir depois de agendado.
 *
 * O que NÃO se edita aqui são os destinatários: eles foram congelados em
 * `disparo_leads` quando o disparo nasceu. Trocar o público é cancelar e criar
 * de novo — e o botão de excluir está aqui do lado, justamente para isso.
 */

const VARIAVEIS = [
  { label: '[Nome]', desc: 'Nome completo' },
  { label: '[PrimeiroNome]', desc: 'Primeiro nome' },
  { label: '[Empresa]', desc: 'Empresa do lead' },
  { label: '[Origem]', desc: 'Origem do lead' },
  { label: '[Responsavel]', desc: 'Nome do responsável pelo lead' },
]

/**
 * Substitui as variáveis por um lead de exemplo, para a prévia.
 * Os mesmos nomes que a criação usa — a prévia dos dois lugares precisa ler igual.
 */
function aplicarExemplo(texto: string): string {
  return texto
    .replace(/\[PrimeiroNome\]/gi, 'Maria')
    .replace(/\[Nome\]/gi, 'Maria Silva')
    .replace(/\[Empresa\]/gi, 'Empresa Exemplo')
    .replace(/\[Origem\]/gi, 'Instagram')
    .replace(/\[Responsavel\]/gi, 'João')
}

/** ISO → valor de `datetime-local` no fuso do navegador. */
function paraInputLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface Props {
  disparo: DisparoAgendado | null
  onClose: () => void
  /** Chamado depois de salvar ou excluir, para a lista recarregar. */
  onAlterado: () => void
}

export function EditarAgendamentoModal({ disparo, onClose, onAlterado }: Props) {
  const ehEmail = disparo?.tipo === 'email'
  const { data: estagios } = useEstagios(disparo?.funil_id ?? undefined)

  const [template, setTemplate] = useState('')
  // A assinatura fica FORA do editor de texto rico de propósito — ver o
  // `useEffect` de carga abaixo. Guardada crua, ela volta intacta ao salvar.
  const [assinatura, setAssinatura] = useState('')
  const [mostrarAssinatura, setMostrarAssinatura] = useState(false)
  const [assunto, setAssunto] = useState('')
  const [agendadoPara, setAgendadoPara] = useState('')
  const [estagioPos, setEstagioPos] = useState<number | null>(null)
  const [intervaloMin, setIntervaloMin] = useState(30)
  const [intervaloMax, setIntervaloMax] = useState(90)
  const [salvando, setSalvando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // O EmailEditor (TipTap) publica a própria função de inserção: no e-mail o corpo é
  // HTML e não existe `selectionStart` para calcular a posição do cursor.
  const inserirNoEmailRef = useRef<((v: string) => void) | null>(null)

  // Recarrega os campos toda vez que outro disparo é aberto — sem isso o modal
  // mostraria o texto do disparo anterior.
  useEffect(() => {
    if (!disparo) return
    const cfg = (disparo.configuracao_json || {}) as Record<string, number>
    // O template gravado é `corpo + separador + assinatura`. A assinatura é HTML
    // de e-mail (tabelas com `<td>` lado a lado) e o EmailEditor é TipTap SEM nó
    // de tabela: recebendo o template inteiro ele descarta `<table>/<tr>/<td>`,
    // promove cada filho a bloco e devolve isso no `onUpdate` — que era salvo por
    // cima do original. Os ícones sociais perdiam alinhamento e os `<a href>` em
    // volta deles sumiam (ticket #57). Só o CORPO entra no editor.
    const { corpo, assinatura: rodape } = separarAssinatura(disparo.template ?? '')
    setTemplate(corpo)
    setAssinatura(rodape)
    setMostrarAssinatura(false)
    setAssunto(disparo.assunto ?? '')
    setAgendadoPara(paraInputLocal(disparo.agendado_para))
    setEstagioPos(disparo.estagio_pos_disparo_id ?? null)
    setIntervaloMin(Number(cfg.intervalo_min ?? 30))
    setIntervaloMax(Number(cfg.intervalo_max ?? 90))
  }, [disparo])

  const inserirVariavel = (variavel: string) => {
    if (ehEmail) {
      if (inserirNoEmailRef.current) inserirNoEmailRef.current(variavel)
      else setTemplate(t => t + variavel)
      return
    }
    const el = textareaRef.current
    if (!el) { setTemplate(t => t + variavel); return }
    const inicio = el.selectionStart ?? template.length
    const fim = el.selectionEnd ?? template.length
    const novo = template.slice(0, inicio) + variavel + template.slice(fim)
    setTemplate(novo)
    // Devolve o cursor para depois da variável: sem isso ele volta para o começo
    // e a próxima digitação entra no lugar errado.
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(inicio + variavel.length, inicio + variavel.length)
    })
  }

  const minimoDatetime = useMemo(() => new Date(Date.now() + 60000).toISOString().slice(0, 16), [])

  const salvar = async () => {
    if (!disparo) return
    if (!template.trim()) { toast.error('A mensagem não pode ficar vazia'); return }
    if (ehEmail && !assunto.trim()) { toast.error('O e-mail precisa de um assunto'); return }
    if (!agendadoPara) { toast.error('Escolha a data e a hora do envio'); return }
    if (new Date(agendadoPara) <= new Date()) {
      toast.error('A data do envio precisa ser no futuro')
      return
    }
    if (intervaloMax < intervaloMin) { toast.error('O intervalo máximo não pode ser menor que o mínimo'); return }

    setSalvando(true)
    try {
      await disparosAgendadosApi.editar(disparo.id, {
        template: montarEmailComAssinatura(template.trim(), assinatura),
        agendado_para: new Date(agendadoPara).toISOString(),
        ...(ehEmail ? { assunto: assunto.trim() } : { intervalo_min: intervaloMin, intervalo_max: intervaloMax }),
        estagio_pos_disparo_id: estagioPos,
      })
      toast.success('Agendamento atualizado')
      onAlterado()
      onClose()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao salvar as alterações')
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async () => {
    if (!disparo) return
    if (!confirm(`Excluir o disparo agendado para ${disparo.total} contato(s)? Ele não será enviado.`)) return
    setExcluindo(true)
    try {
      await disparosAgendadosApi.cancelar(disparo.id)
      toast.success('Disparo excluído')
      onAlterado()
      onClose()
    } catch {
      toast.error('Erro ao excluir o disparo')
    } finally {
      setExcluindo(false)
    }
  }

  if (!disparo) return null

  const Icone = ehEmail ? Mail : MessageSquare

  return (
    <Modal
      isOpen={!!disparo}
      onClose={onClose}
      title={ehEmail ? 'Editar e-mail agendado' : 'Editar disparo agendado'}
      size="lg"
    >
      <div className="space-y-4">
        {/* Destinatários: aqui é informação, não escolha. */}
        <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
          <Users size={15} className="mt-0.5 shrink-0 text-primary-500" />
          <div className="text-xs text-gray-600 dark:text-gray-300">
            <p>
              <strong>{disparo.total}</strong> destinatário(s)
              {disparo.funil_nome && <> · funil <strong>{disparo.funil_nome}</strong></>}
              {' '}· criado por {disparo.criado_por}
            </p>
            <p className="mt-0.5 text-gray-500 dark:text-gray-400">
              A lista de contatos foi fixada quando o disparo foi agendado e não muda aqui.
              Para outro público, exclua este e crie um novo.
            </p>
          </div>
        </div>

        {/* Data e hora */}
        <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-primary-500" />
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Data e hora do envio</label>
          </div>
          <input
            type="datetime-local"
            value={agendadoPara}
            onChange={e => setAgendadoPara(e.target.value)}
            min={minimoDatetime}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>

        {/* Estágio pós-disparo */}
        <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <ArrowRight size={15} className="text-primary-500" />
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Após o envio, mover lead para</label>
            <span className="text-xs text-gray-400">(opcional)</span>
          </div>
          <select
            value={estagioPos ?? ''}
            onChange={e => setEstagioPos(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          >
            <option value="">— Não mover —</option>
            {(estagios ?? []).map(e => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </select>
        </div>

        {/* Intervalo anti-ban — só WhatsApp: e-mail não tem risco de bloqueio por ritmo. */}
        {!ehEmail && (
          <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-primary-500" />
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Intervalo entre envios</label>
              <span className="text-xs text-gray-400">(anti-bloqueio)</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-gray-500 dark:text-gray-400">de</span>
              <input
                type="number" min={10} max={600} value={intervaloMin}
                onChange={e => setIntervaloMin(Number(e.target.value))}
                className="w-20 rounded-lg border px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
              <span className="text-gray-500 dark:text-gray-400">a</span>
              <input
                type="number" min={10} max={600} value={intervaloMax}
                onChange={e => setIntervaloMax(Number(e.target.value))}
                className="w-20 rounded-lg border px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
              <span className="text-gray-500 dark:text-gray-400">segundos</span>
            </div>
          </div>
        )}

        {/* Assunto — só e-mail */}
        {ehEmail && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200">
              Assunto <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={assunto}
              onChange={e => setAssunto(e.target.value)}
              placeholder="Assunto do e-mail"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
        )}

        {/* Variáveis */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Inserir variável
          </p>
          <div className="flex flex-wrap gap-2">
            {VARIAVEIS.map(v => (
              <button
                key={v.label}
                type="button"
                onClick={() => inserirVariavel(v.label)}
                title={v.desc}
                className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 font-mono text-sm text-primary-700 transition-colors hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-300"
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mensagem */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              {ehEmail ? 'Corpo do e-mail' : 'Mensagem'} <span className="text-red-500">*</span>
            </label>
            {/* A barra de formatação é do WhatsApp (*negrito*, _itálico_) — no
                e-mail ela marcaria o texto com asteriscos à vista. */}
            {!ehEmail && (
              <WhatsAppFormatToolbar textareaRef={textareaRef} value={template} onChange={setTemplate} />
            )}
          </div>
          {/* O corpo de um disparo de e-mail é HTML — o mesmo que a criação produz
              pelo EmailEditor. Num textarea ele aparecia como código cru: o operador
              via `<p><strong>` e a URL inteira da imagem em vez do e-mail. Aqui é o
              MESMO editor da criação (que tem modo HTML embutido para quem quiser
              mexer na marcação). O WhatsApp segue em textarea: lá o corpo é texto
              puro e a barra de formatação usa *asteriscos*. */}
          {ehEmail ? (
            <EmailEditor
              value={template}
              onChange={setTemplate}
              onInsertVariable={fn => { inserirNoEmailRef.current = fn }}
              minHeight={260}
            />
          ) : (
            <textarea
              ref={textareaRef}
              value={template}
              onChange={e => setTemplate(e.target.value)}
              rows={6}
              className="w-full resize-none rounded-lg border px-3 py-2.5 font-sans text-sm focus:border-green-500 focus:ring-2 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          )}
          {/* No e-mail o tamanho é de HTML, não de texto lido — contar caractere ali
              não diz nada ao operador (12 mil "caracteres" eram quase todos marcação). */}
          {!ehEmail && <p className="mt-1 text-xs text-gray-400">{template.length} caracteres</p>}
        </div>

        {/* Assinatura / rodapé — HTML cru, igual à criação. Fica FORA do editor de
            texto rico porque é onde vive a tabela que ele não sabe representar; e
            fica editável porque "como corrigimos o rodapé dentro da edição?" era
            exatamente a pergunta que não tinha resposta antes. */}
        {ehEmail && assinatura.trim() && (
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setMostrarAssinatura(p => !p)}
              className="flex w-full items-center justify-between bg-gray-50 px-4 py-2.5 transition-colors hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <Pen size={14} className="text-gray-500 dark:text-gray-400" />
                Assinatura / Rodapé
              </div>
              <ChevronRight
                size={16}
                className={`text-gray-400 transition-transform ${mostrarAssinatura ? 'rotate-90' : ''}`}
              />
            </button>

            {mostrarAssinatura && (
              <div className="space-y-3 border-t border-gray-200 p-3 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Vai ao final deste e-mail. Editar aqui vale só para este agendamento —
                  a sua assinatura padrão continua em Meu Perfil.
                </p>
                <textarea
                  value={assinatura}
                  onChange={e => setAssinatura(e.target.value)}
                  rows={6}
                  className="w-full resize-y rounded border border-gray-200 p-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-green-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
                {/* Mesma razão da prévia do e-mail: superfície sempre clara, e
                    `bg-[#ffffff]` em vez de `bg-white` por causa do override
                    `html.dark .bg-white` do index.css. */}
                <div>
                  <p className="mb-1 text-xs text-gray-400">Prévia:</p>
                  <div
                    className="overflow-x-auto rounded border border-gray-100 bg-[#ffffff] p-3 text-[#1f2937] [&_a]:text-[#2563eb] [&_img]:h-auto [&_img]:max-w-full [&_table]:max-w-full"
                    dangerouslySetInnerHTML={{ __html: assinatura }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mesmo aviso da criação: mensagem idêntica para muita gente é risco de bloqueio. */}
        {!ehEmail && template.trim().length > 0 && !/\[Nome\]|\[PrimeiroNome\]/i.test(template) && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>
              <strong>Mensagem sem nome personalizado.</strong> Mensagens idênticas para muitos
              contatos aumentam o risco de bloqueio. Use{' '}
              <span className="rounded bg-amber-100 px-1 font-mono dark:bg-amber-900/40">[PrimeiroNome]</span>.
            </span>
          </div>
        )}

        {/* Prévia com o primeiro nome de exemplo — mesma leitura da criação. */}
        {template.trim() && (
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <Icone size={13} /> Prévia
            </p>
            {ehEmail ? (
              /* Prévia de e-mail: superfície SEMPRE clara, em qualquer tema. O que
                 se mostra aqui é o que o destinatário vai ver na caixa dele, e o HTML
                 do template traz as próprias cores (texto escuro sobre fundo branco) —
                 pintá-lo sobre o cinza do modo escuro mentiria sobre o resultado.
                 `bg-[#ffffff]` e não `bg-white`: `index.css` tem
                 `html.dark .bg-white` fora de @layer, que venceria a classe literal. */
              <div className="overflow-x-auto rounded-lg bg-[#ffffff] p-3 text-sm text-[#1f2937]">
                {assunto.trim() && (
                  <p className="mb-3 border-b border-[#e5e7eb] pb-2 font-semibold">
                    {aplicarExemplo(assunto)}
                  </p>
                )}
                <div
                  className="[&_a]:text-[#2563eb] [&_img]:h-auto [&_img]:max-w-full [&_table]:max-w-full"
                  dangerouslySetInnerHTML={{
                    __html: aplicarExemplo(montarEmailComAssinatura(template, assinatura)),
                  }}
                />
              </div>
            ) : (
              <div className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-800 dark:bg-gray-800 dark:text-gray-100">
                {aplicarExemplo(template)}
              </div>
            )}
          </div>
        )}
      </div>

      <ModalFooter>
        {/* Excluir fica à esquerda, longe do botão de salvar. */}
        <button
          type="button"
          onClick={excluir}
          disabled={excluindo || salvando}
          className="mr-auto inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          <Trash2 size={14} /> {excluindo ? 'Excluindo…' : 'Excluir disparo'}
        </button>
        <Button variant="secondary" onClick={onClose} disabled={salvando}>Cancelar</Button>
        <Button variant="primary" onClick={salvar} isLoading={salvando}>
          <Send className="mr-2 h-4 w-4" /> Salvar alterações
        </Button>
      </ModalFooter>
    </Modal>
  )
}
