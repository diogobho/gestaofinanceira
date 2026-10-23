import { useState } from 'react'
import toast from 'react-hot-toast'
import { Pencil, Send, X } from 'lucide-react'
import { canalWhatsappApi, type ModeloWhatsApp } from '@/api/canalWhatsapp'

/**
 * Os modelos oficiais de um passo do fluxo, com o texto inteiro e o status na Meta, e a
 * edição do texto (06/10/2026). O texto aparece com os campos do card por extenso
 * ("Oi [PrimeiroNome]!") — é como o dono lê e escreve. Salvar cria uma versão nova na
 * Meta (`abr_ger_v1` → `abr_ger_v2`: modelo em análise não se edita) e troca o nome no
 * passo; a versão antiga fica na conta até alguém excluir.
 */

const STATUS: Record<string, { texto: string; classe: string }> = {
  APPROVED: { texto: 'Aprovado', classe: 'bg-emerald-100 text-emerald-800' },
  PENDING: { texto: 'Em análise na Meta', classe: 'bg-sky-100 text-sky-800' },
  REJECTED: { texto: 'Recusado', classe: 'bg-red-100 text-red-800' },
  PAUSED: { texto: 'Pausado', classe: 'bg-amber-100 text-amber-800' },
  DISABLED: { texto: 'Desativado', classe: 'bg-gray-200 text-gray-700' },
}

function paraTexto(corpo: string, variaveis: string[]): string {
  return corpo.replace(/\{\{(\d+)\}\}/g, (m, n) => variaveis[Number(n) - 1] ?? m)
}

interface Entrada {
  chave: string
  rotulo: string
  nome: string
  variaveis: string[]
  /** por_origem: o texto novo tem de usar os mesmos campos (o passo guarda um mapa só). */
  camposFixos: boolean
  aplicar: (novo: { nome: string; variaveis: string[] }) => any
}

function entradasDo(modelo: any): Entrada[] {
  const clone = () => JSON.parse(JSON.stringify(modelo))
  const lista: Entrada[] = [{
    chave: 'a',
    rotulo: modelo.variante_b ? 'Versão A' : (modelo.por_origem?.length ? 'Mensagem geral' : 'Mensagem'),
    nome: modelo.nome,
    variaveis: modelo.variaveis ?? [],
    camposFixos: !!modelo.por_origem?.length,
    aplicar: (n) => ({ ...clone(), nome: n.nome, variaveis: n.variaveis }),
  }]
  if (modelo.variante_b?.nome) {
    lista.push({
      chave: 'b',
      rotulo: 'Versão B',
      nome: modelo.variante_b.nome,
      variaveis: modelo.variante_b.variaveis ?? modelo.variaveis ?? [],
      camposFixos: false,
      aplicar: (n) => { const c = clone(); c.variante_b = { ...c.variante_b, nome: n.nome, variaveis: n.variaveis }; return c },
    })
  }
  ;(modelo.por_origem ?? []).forEach((o: any, i: number) => {
    lista.push({
      chave: `o${i}`,
      rotulo: `Se a origem tiver "${o.contem}"`,
      nome: o.nome,
      variaveis: modelo.variaveis ?? [],
      camposFixos: true,
      aplicar: (n) => { const c = clone(); c.por_origem[i] = { ...c.por_origem[i], nome: n.nome }; return c },
    })
  })
  return lista
}

export default function ModelosDoPasso({
  modelo, modelos, onTrocar, salvando, avisoTroca = 'O fluxo já usa o texto novo.',
}: {
  modelo: any
  modelos: ModeloWhatsApp[]
  /** Recebe o `modelo_whatsapp` inteiro já com o nome novo, para salvar no estágio. */
  onTrocar: (novo: any) => Promise<void> | void
  salvando?: boolean
  /** Complemento do aviso de sucesso (no editor da etapa, falta salvar a etapa). */
  avisoTroca?: string
}) {
  const [editando, setEditando] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  const entradas = entradasDo(modelo)

  const enviar = async (e: Entrada) => {
    setEnviando(true)
    try {
      const r = await canalWhatsappApi.novaVersaoModelo({
        nome: e.nome,
        texto,
        campos: e.camposFixos ? e.variaveis : undefined,
      })
      await onTrocar(e.aplicar({ nome: r.nome, variaveis: r.variaveis }))
      toast.success(`Enviado para aprovação da Meta como ${r.nome}. ${avisoTroca}`)
      setEditando(null)
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Não foi possível mandar o texto para a Meta.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mt-1.5 space-y-2">
      {entradas.map((e) => {
        const m = modelos.find((x) => x.nome === e.nome)
        const st = m ? (STATUS[m.status] ?? { texto: m.status, classe: 'bg-gray-100 text-gray-700' }) : null
        const atual = m ? paraTexto(m.corpo, e.variaveis) : ''
        return (
          <section key={e.chave} aria-label={`${e.rotulo}, modelo ${e.nome}`}
            className="rounded-lg border border-emerald-200 bg-white px-2.5 py-2 dark:border-emerald-900 dark:bg-gray-900">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">{e.rotulo}</span>
              <span className="text-[10px] text-gray-400">{e.nome}</span>
              {st && <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${st.classe}`}>{st.texto}</span>}
              {!m && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">não encontrado na conta oficial</span>}
              {m && editando !== e.chave && (
                <button type="button" onClick={() => { setEditando(e.chave); setTexto(atual) }}
                  className="ml-auto inline-flex items-center gap-1 rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-600 hover:border-amber-400 hover:text-amber-700">
                  <Pencil className="h-3 w-3" /> Editar texto
                </button>
              )}
            </div>
            {m?.status === 'REJECTED' && m.motivoRecusa && (
              <p className="mt-1 text-[11px] text-red-700">Motivo da recusa: {m.motivoRecusa}</p>
            )}
            {editando === e.chave ? (
              <div className="mt-1.5 space-y-1.5">
                <label className="block text-[11px] text-gray-600">
                  Texto da mensagem. Os campos do card ficam entre colchetes, como [PrimeiroNome].
                  {e.camposFixos && ` Use estes campos, nesta ordem: ${e.variaveis.join(', ') || 'nenhum'}.`}
                  {' '}A mensagem não pode começar nem terminar com um campo.
                  <textarea value={texto} onChange={(ev) => setTexto(ev.target.value)} rows={7}
                    className="mt-1 w-full rounded border border-gray-300 p-2 text-xs dark:border-gray-700 dark:bg-gray-800" />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={enviando || salvando || !texto.trim() || texto.trim() === atual.trim()}
                    onClick={() => enviar(e)}
                    className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50">
                    <Send className="h-3 w-3" /> {enviando ? 'Enviando…' : 'Enviar para aprovação da Meta'}
                  </button>
                  <button type="button" onClick={() => setEditando(null)}
                    className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-600">
                    <X className="h-3 w-3" /> Cancelar
                  </button>
                </div>
              </div>
            ) : m ? (
              <>
                <p className="mt-1 whitespace-pre-wrap text-xs text-gray-700 dark:text-gray-200">{atual}</p>
                {(m.rodape || m.botoes.length > 0) && (
                  <p className="mt-1 text-[10px] text-gray-500">
                    {m.rodape ? `Rodapé: ${m.rodape}. ` : ''}
                    {m.botoes.length ? `Botões: ${m.botoes.join(' · ')}` : ''}
                  </p>
                )}
              </>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
