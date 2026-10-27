import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Lightbulb, Copy, MessageCircle, FileText, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { FRENTES_DUO } from '@/utils/comandosDuo'
import { LinkVideo } from '@/tutoriais/LinkVideo'
import { preencherDuo } from '@/components/DuoWidget'

const MANUAL_PDF = '/assets/manuais/manual-duo.pdf'

/**
 * Comandos sugeridos do Duo (pedido do dono, 23/10/2026), por frente do sistema.
 * "Usar no Duo" abre o chat do canto com o texto pronto para editar; "Copiar" é para
 * colar no Claude, onde o conector tem as mesmas ferramentas.
 */
export default function ComandosDuo() {
  const [frente, setFrente] = useState(FRENTES_DUO[0].id)
  const atual = FRENTES_DUO.find(f => f.id === frente) ?? FRENTES_DUO[0]

  const copiar = async (texto: string) => {
    try { await navigator.clipboard.writeText(texto); toast.success('Comando copiado') }
    catch { toast.error('Não deu para copiar. Selecione o texto e copie.') }
  }

  return (
    <div className="max-w-4xl space-y-6 px-4 py-4 sm:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <Lightbulb className="h-6 w-6 text-primary-600" />
          Comandos do Duo
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Ideias do que pedir ao Duo, no chat do canto da tela ou no Claude com o conector. Troque o que está entre colchetes e mande.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <a href={MANUAL_PDF} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-primary-700 hover:underline dark:text-primary-300">
            <FileText className="h-4 w-4" /> Manual do Duo (PDF)
          </a>
          <Link to="/agente-duo?aba=configurar" className="font-medium text-primary-700 hover:underline dark:text-primary-300">
            Conectar o Duo ao Claude
          </Link>
          <LinkVideo video="duo-no-sistema" />
          <LinkVideo video="duo-comandos" />
          <LinkVideo video="duo-conectar-claude" />
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          O Duo só vê e faz o que você já pode no sistema e nunca exclui nada. Nos comandos marcados com
          "pede confirmação", ele mostra o que vai fazer (e as mensagens, no caso do WhatsApp) e só grava ou envia depois do seu "sim".
        </p>
      </div>

      <div role="tablist" aria-label="Frentes do sistema" className="flex flex-wrap gap-2">
        {FRENTES_DUO.map(f => (
          <button
            key={f.id}
            role="tab"
            type="button"
            aria-selected={f.id === frente}
            onClick={() => setFrente(f.id)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              f.id === frente
                ? 'border-primary-600 bg-primary-600 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:border-primary-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
            }`}
          >
            {f.titulo}
          </button>
        ))}
      </div>

      <section role="tabpanel" aria-label={atual.titulo} className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-300">{atual.descricao}</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {atual.comandos.map(c => (
            <li key={c.titulo}>
              <Card className="h-full">
                <div className="flex h-full flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-gray-800 dark:text-gray-100">{c.titulo}</h2>
                    {c.pedeConfirmacao && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                        pede confirmação
                      </span>
                    )}
                  </div>
                  <p className="flex-1 text-sm text-gray-600 dark:text-gray-300">{c.texto}</p>
                  {c.observacao && <p className="text-xs text-gray-500 dark:text-gray-400">{c.observacao}</p>}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => preencherDuo(c.texto)}
                      aria-label={`Usar no Duo: ${c.titulo}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> Usar no Duo
                    </button>
                    <button
                      type="button"
                      onClick={() => copiar(c.texto)}
                      aria-label={`Copiar: ${c.titulo}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copiar
                    </button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
