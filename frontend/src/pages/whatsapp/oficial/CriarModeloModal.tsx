import React, { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Trash2, Phone, ExternalLink, Reply, Sparkles, Check } from 'lucide-react'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { canalWhatsappApi, type BotaoModelo, type NovoModelo } from '@/api/canalWhatsapp'
import { MODELOS_PRONTOS, type ModeloPronto } from './modelosProntos'

/**
 * Cria um modelo na conta do WhatsApp do cliente e manda para aprovação da Meta.
 *
 * O que dá para criar é o que o CRM consegue ENVIAR depois: cabeçalho de texto,
 * corpo com `{{1}}`, `{{2}}`…, rodapé e botões de resposta rápida, link fixo ou
 * ligação. Cabeçalho de imagem e link com variável ficam de fora de propósito —
 * aprovados, apareceriam como "não suportado" no disparo.
 */

function variaveisDe(texto: string): string[] {
  const vistas: string[] = []
  for (const m of texto.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) if (!vistas.includes(m[1])) vistas.push(m[1])
  return vistas.sort((a, b) => Number(a) - Number(b))
}

function trocar(texto: string, exemplos: Record<string, string>): string {
  return texto.replace(/\{\{\s*(\d+)\s*\}\}/g, (inteiro, n) => exemplos[n]?.trim() || inteiro)
}

const vazio = {
  nome: '',
  categoria: 'MARKETING' as NovoModelo['categoria'],
  idioma: 'pt_BR',
  cabecalho: '',
  exemploCabecalho: '',
  corpo: '',
  rodape: '',
}

interface Props {
  aberto: boolean
  onFechar: () => void
  /** Nomes que já existem na conta — o modelo pronto com o mesmo nome aparece como criado. */
  existentes?: string[]
}

export const CriarModeloModal: React.FC<Props> = ({ aberto, onFechar, existentes = [] }) => {
  const queryClient = useQueryClient()
  const [f, setF] = useState(vazio)
  const [exemplos, setExemplos] = useState<Record<string, string>>({})
  const [botoes, setBotoes] = useState<BotaoModelo[]>([])

  const usarPronto = ({ modelo }: ModeloPronto) => {
    setF({ ...vazio, nome: modelo.nome, categoria: modelo.categoria, corpo: modelo.corpo })
    setExemplos(Object.fromEntries(modelo.exemplos.map((e, i) => [String(i + 1), e])))
    setBotoes([])
  }

  const vars = useMemo(() => variaveisDe(f.corpo), [f.corpo])
  const cabecalhoTemVariavel = /\{\{\s*\d+\s*\}\}/.test(f.cabecalho)
  const nomeNormalizado = f.nome.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_]+/g, '_')

  const criar = useMutation({
    mutationFn: () =>
      canalWhatsappApi.criarModelo({
        nome: nomeNormalizado,
        categoria: f.categoria,
        idioma: f.idioma,
        corpo: f.corpo.trim(),
        exemplos: vars.map((v) => exemplos[v] ?? ''),
        cabecalho: f.cabecalho.trim() || undefined,
        exemploCabecalho: cabecalhoTemVariavel ? f.exemploCabecalho.trim() : undefined,
        rodape: f.rodape.trim() || undefined,
        botoes,
      }),
    onSuccess: () => {
      toast.success('Modelo enviado para aprovação da Meta')
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'modelos'] })
      setF(vazio)
      setExemplos({})
      setBotoes([])
      onFechar()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'A Meta recusou o modelo'),
  })

  const addBotao = (tipo: BotaoModelo['tipo']) =>
    setBotoes((b) => [...b, { tipo, texto: tipo === 'QUICK_REPLY' && f.categoria === 'MARKETING' && !b.length ? 'Parar promoções' : '' }])
  const setBotao = (i: number, campo: keyof BotaoModelo, valor: string) =>
    setBotoes((b) => b.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)))

  const faltaExemplo = vars.some((v) => !exemplos[v]?.trim()) || (cabecalhoTemVariavel && !f.exemploCabecalho.trim())
  const podeEnviar = !!nomeNormalizado && !!f.corpo.trim() && !faltaExemplo && !criar.isPending

  return (
    <Modal isOpen={aberto} onClose={onFechar} title="Criar modelo de mensagem" size="xl">
      <div className="mb-5">
        <p className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
          <Sparkles size={15} className="text-amber-500" /> Começar de um modelo pronto
        </p>
        <p className="text-xs text-gray-500 mb-2">
          Textos no formato que a Meta costuma aprovar: dizem de onde a pessoa veio logo na primeira linha. Escolha um e ajuste à sua voz antes de enviar.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {MODELOS_PRONTOS.map((p) => {
            const jaExiste = existentes.includes(p.modelo.nome)
            const escolhido = f.nome === p.modelo.nome
            return (
              <button
                key={p.modelo.nome}
                type="button"
                onClick={() => usarPronto(p)}
                className={`text-left rounded-lg border p-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                  escolhido
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                    : 'border-gray-200 dark:border-gray-600 hover:border-primary-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{p.titulo}</span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      p.modelo.categoria === 'MARKETING'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                        : 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300'
                    }`}
                  >
                    {p.modelo.categoria === 'MARKETING' ? 'Marketing' : 'Utilidade'}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{p.quando}</span>
                {jaExiste && (
                  <span className="mt-1 flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                    <Check size={12} /> Já existe na sua conta — mude o nome para criar outro
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-3">
              <Input
                label="Nome do modelo"
                placeholder="ex.: promocao_setembro"
                value={f.nome}
                onChange={(e) => setF({ ...f, nome: e.target.value })}
                maxLength={100}
              />
              {f.nome && nomeNormalizado !== f.nome && (
                <p className="text-xs text-gray-500 mt-1">Vai como <span className="font-mono">{nomeNormalizado}</span></p>
              )}
            </div>
            <div className="sm:col-span-2">
            <Select
              label="Categoria"
              value={f.categoria}
              onChange={(e) => setF({ ...f, categoria: e.target.value as NovoModelo['categoria'] })}
              options={[
                { value: 'MARKETING', label: 'Marketing — promoção, convite, novidade' },
                { value: 'UTILITY', label: 'Utilidade — lembrete, confirmação, retomada' },
              ]}
            />
            </div>
            <Select
              label="Idioma"
              value={f.idioma}
              onChange={(e) => setF({ ...f, idioma: e.target.value })}
              options={[
                { value: 'pt_BR', label: 'Português (BR)' },
                { value: 'en_US', label: 'Inglês (EUA)' },
                { value: 'es', label: 'Espanhol' },
              ]}
            />
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            {f.categoria === 'MARKETING'
              ? 'Marketing é cobrado pela Meta por mensagem e o cliente pode pedir para parar — um botão “Parar promoções” ajuda a manter a qualidade do número.'
              : 'Utilidade é para algo que o cliente já espera (agendamento, pagamento, retomada). Se o texto soar como promoção, a Meta muda a categoria para marketing.'}
          </p>

          <div>
            <Input
              label="Cabeçalho (opcional)"
              placeholder="ex.: Novidade para você, {{1}}"
              value={f.cabecalho}
              onChange={(e) => setF({ ...f, cabecalho: e.target.value })}
              maxLength={60}
            />
            {cabecalhoTemVariavel && (
              <Input
                className="mt-2"
                placeholder="Exemplo para {{1}} do cabeçalho — ex.: Maria"
                value={f.exemploCabecalho}
                onChange={(e) => setF({ ...f, exemploCabecalho: e.target.value })}
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Mensagem</label>
            <textarea
              value={f.corpo}
              onChange={(e) => setF({ ...f, corpo: e.target.value })}
              rows={6}
              maxLength={1024}
              placeholder={'Olá {{1}}! Temos uma novidade para você…\n\nUse {{1}}, {{2}}… onde entra o nome ou outro dado do lead.'}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>*negrito*, _itálico_ e ~riscado~ valem como no WhatsApp. A mensagem não pode começar nem terminar com variável.</span>
              <span>{f.corpo.length}/1024</span>
            </div>
          </div>

          {vars.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2">
              <p className="text-xs text-gray-600 dark:text-gray-300">
                A Meta exige um exemplo de cada variável para analisar o modelo. No envio, o CRM preenche com os dados do lead.
              </p>
              {vars.map((v) => (
                <Input
                  key={v}
                  placeholder={`Exemplo para {{${v}}}`}
                  value={exemplos[v] ?? ''}
                  onChange={(e) => setExemplos({ ...exemplos, [v]: e.target.value })}
                />
              ))}
            </div>
          )}

          <Input
            label="Rodapé (opcional)"
            placeholder="ex.: Equipe DuoFuturo"
            value={f.rodape}
            onChange={(e) => setF({ ...f, rodape: e.target.value })}
            maxLength={60}
          />

          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-auto">Botões (opcional)</span>
              <Button type="button" variant="outline" size="sm" onClick={() => addBotao('QUICK_REPLY')} disabled={botoes.length >= 10}>
                <Reply size={14} className="mr-1" /> Resposta rápida
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addBotao('URL')}
                disabled={botoes.filter((b) => b.tipo === 'URL').length >= 2 || botoes.length >= 10}
              >
                <ExternalLink size={14} className="mr-1" /> Link
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addBotao('PHONE_NUMBER')}
                disabled={botoes.some((b) => b.tipo === 'PHONE_NUMBER') || botoes.length >= 10}
              >
                <Phone size={14} className="mr-1" /> Ligar
              </Button>
            </div>
            <div className="space-y-2">
              {botoes.map((b, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                  <span className="text-xs text-gray-500 w-24 shrink-0">
                    {b.tipo === 'QUICK_REPLY' ? 'Resposta' : b.tipo === 'URL' ? 'Link' : 'Ligar'}
                  </span>
                  <Input placeholder="Texto do botão" value={b.texto} maxLength={25} onChange={(e) => setBotao(i, 'texto', e.target.value)} />
                  {b.tipo === 'URL' && (
                    <Input placeholder="https://…" value={b.url ?? ''} onChange={(e) => setBotao(i, 'url', e.target.value)} />
                  )}
                  {b.tipo === 'PHONE_NUMBER' && (
                    <Input placeholder="+5511999999999" value={b.telefone ?? ''} onChange={(e) => setBotao(i, 'telefone', e.target.value)} />
                  )}
                  <button
                    type="button"
                    onClick={() => setBotoes((x) => x.filter((_, j) => j !== i))}
                    className="text-gray-400 hover:text-red-600 p-2 self-end sm:self-auto"
                    aria-label="Remover botão"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Prévia</p>
          <div className="rounded-xl bg-[#e5ddd5] p-3 min-h-[200px]">
            <div className="bg-white rounded-lg shadow-sm p-3 text-sm text-gray-900 max-w-full">
              {f.cabecalho.trim() && (
                <p className="font-semibold mb-1 break-words">
                  {trocar(f.cabecalho, { '1': f.exemploCabecalho })}
                </p>
              )}
              <p className="whitespace-pre-wrap break-words">{trocar(f.corpo, exemplos) || 'Sua mensagem aparece aqui.'}</p>
              {f.rodape.trim() && <p className="text-xs text-gray-500 mt-2">{f.rodape}</p>}
            </div>
            {botoes.map((b, i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm mt-1 py-2 text-center text-sm text-sky-600 flex items-center justify-center gap-1">
                {b.tipo === 'URL' ? <ExternalLink size={13} /> : b.tipo === 'PHONE_NUMBER' ? <Phone size={13} /> : <Reply size={13} />}
                {b.texto || 'Botão'}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            A aprovação é da Meta e costuma levar de minutos a algumas horas. Aprovado, o modelo aparece no disparo em massa, na cadência e no chat do card.
          </p>
        </div>
      </div>

      <ModalFooter>
        <Button variant="outline" onClick={onFechar}>Cancelar</Button>
        <Button onClick={() => criar.mutate()} disabled={!podeEnviar}>
          <Plus size={16} className="mr-1" /> {criar.isPending ? 'Enviando…' : 'Enviar para aprovação'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
