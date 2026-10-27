import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Coins, Loader2, ExternalLink, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { creditosDuoApi, CreditosDuo as Painel } from '@/api/agente'

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

const ROTULO_MOV: Record<string, string> = {
  teste: 'Crédito de teste',
  compra: 'Recarga',
  consumo: 'Uso do Duo',
  ajuste: 'Ajuste',
  indicacao: 'Indicação',
}

const ROTULO_COMPRA: Record<string, string> = {
  pendente: 'Aguardando pagamento',
  paga: 'Paga',
  cancelada: 'Cancelada',
}

/**
 * Créditos do Duo (111). O chat roda pela chave da DuoFuturo e cada mensagem
 * desconta do saldo da conta. A recarga gera uma fatura no Asaas, em que a pessoa
 * escolhe PIX, boleto ou cartão; o crédito entra sozinho quando o pagamento
 * confirma — por isso a tela tem "Atualizar", e não um "já paguei".
 */
export default function CreditosDuo() {
  const [painel, setPainel] = useState<Painel | null>(null)
  const [comprando, setComprando] = useState<number | null>(null)
  const [pedeDocumento, setPedeDocumento] = useState<number | null>(null)
  const [documento, setDocumento] = useState('')

  const carregar = useCallback(() => {
    creditosDuoApi.get().then(setPainel).catch(() => toast.error('Não foi possível carregar os créditos'))
  }, [])
  useEffect(carregar, [carregar])

  const comprar = async (valor: number, doc?: string) => {
    setComprando(valor)
    // Abre a aba já no clique: navegador bloqueia janela aberta depois de um await.
    const aba = window.open('', '_blank')
    try {
      const r = await creditosDuoApi.comprar(valor, doc)
      if (aba) aba.location.href = r.invoice_url
      else window.location.href = r.invoice_url
      setPedeDocumento(null)
      toast.success('Fatura aberta. Assim que o pagamento confirmar, o crédito entra aqui.')
      carregar()
    } catch (err: any) {
      aba?.close()
      if (err.response?.data?.code === 'PRECISA_DOCUMENTO') setPedeDocumento(valor)
      else toast.error(err.response?.data?.message || 'Não foi possível gerar a cobrança')
    } finally {
      setComprando(null)
    }
  }

  if (!painel) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6 px-4 py-4 sm:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <Coins className="h-6 w-6 text-primary-600" />
          Créditos do Duo
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Cada conversa com o <Link to="/agente-duo" className="underline">Duo</Link> usa um pouco do crédito da conta.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-6">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Saldo da conta</p>
            <p className={`mt-0.5 text-3xl font-bold ${painel.saldo > 0 ? 'text-gray-900 dark:text-white' : 'text-red-600 dark:text-red-400'}`}>
              {painel.sem_cobranca ? 'Sem cobrança' : brl(painel.saldo)}
            </p>
            {!painel.sem_cobranca && painel.saldo <= 0 && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">O crédito acabou. Recarregue para o Duo voltar a responder.</p>
            )}
          </div>
          <Button variant="outline" onClick={carregar}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Atualizar
          </Button>
        </div>
      </Card>

      {!painel.sem_cobranca && (
        <Card>
          <div className="space-y-4 p-6">
            <div>
              <h2 className="font-semibold text-gray-800 dark:text-gray-200">Recarregar</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Pague por PIX, boleto ou cartão. O crédito entra assim que o pagamento confirmar.
              </p>
            </div>
            {painel.pode_comprar ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {painel.pacotes.map(v => (
                  <button
                    key={v}
                    type="button"
                    disabled={comprando !== null}
                    onClick={() => comprar(v)}
                    className="flex flex-col items-center gap-1 rounded-xl border-2 border-gray-200 p-4 transition-colors hover:border-primary-500 disabled:opacity-50 dark:border-gray-700 dark:hover:border-primary-400"
                  >
                    {comprando === v
                      ? <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
                      : <span className="text-xl font-bold text-gray-900 dark:text-white">{brl(v)}</span>}
                    <span className="text-xs text-gray-500 dark:text-gray-400">em crédito</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                Quem administra a conta faz a recarga. Peça a essa pessoa para abrir esta tela.
              </p>
            )}

            {pedeDocumento !== null && (
              <form
                className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20"
                onSubmit={e => { e.preventDefault(); comprar(pedeDocumento, documento) }}
              >
                <label htmlFor="doc-recarga" className="block text-sm font-medium text-gray-800 dark:text-gray-100">
                  Para emitir a cobrança, informe o CPF ou CNPJ da conta
                </label>
                <div className="flex flex-wrap gap-2">
                  <input
                    id="doc-recarga"
                    inputMode="numeric"
                    value={documento}
                    onChange={e => setDocumento(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    placeholder="Somente números"
                  />
                  <Button type="submit" disabled={comprando !== null}>Gerar cobrança</Button>
                </div>
              </form>
            )}
          </div>
        </Card>
      )}

      {painel.compras.length > 0 && (
        <Card>
          <div className="p-6">
            <h2 className="mb-3 font-semibold text-gray-800 dark:text-gray-200">Recargas</h2>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {painel.compras.map(c => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="text-gray-700 dark:text-gray-200">
                    {new Date(c.created_at).toLocaleDateString('pt-BR')} · {brl(c.valor)}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={c.status === 'paga' ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}>
                      {ROTULO_COMPRA[c.status]}
                    </span>
                    {c.status === 'pendente' && c.invoice_url && (
                      <a href={c.invoice_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-600 underline dark:text-primary-400">
                        Pagar <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {painel.extrato.length > 0 && (
        <Card>
          <div className="p-6">
            <h2 className="mb-3 font-semibold text-gray-800 dark:text-gray-200">Extrato dos últimos 60 dias</h2>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {painel.extrato.map((m, i) => (
                <li key={i} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="text-gray-700 dark:text-gray-200">
                    {m.dia.slice(8, 10)}/{m.dia.slice(5, 7)} · {ROTULO_MOV[m.tipo] || m.tipo}
                    {m.tipo === 'consumo' && <span className="text-gray-400"> ({m.qtd} {m.qtd === 1 ? 'mensagem' : 'mensagens'})</span>}
                  </span>
                  <span className={m.valor < 0 ? 'text-gray-700 dark:text-gray-200' : 'text-green-600 dark:text-green-400'}>
                    {m.valor < 0 ? '−' : '+'} {brl(Math.abs(m.valor))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
    </div>
  )
}
