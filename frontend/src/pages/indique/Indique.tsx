import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Gift, Copy, Loader2, MessageCircle, Coins, Receipt } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { afiliadosApi, PainelAfiliado } from '@/api/afiliados'
import { useAuth } from '@/contexts/AuthContext'
import { isAdminEmpresa } from '@/utils/roles'

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

const SITUACAO: Record<string, string> = {
  trial: 'Testando',
  ativa: 'Assinante',
  aguardando_pagamento: 'Aguardando pagamento',
  suspensa: 'Suspensa',
  cancelada: 'Cancelada',
}

const RECOMPENSA_STATUS: Record<string, string> = {
  credito_duo: 'virou crédito do Duo',
  desconto_pendente: 'será abatida na próxima cobrança',
  descontado: 'abatida na cobrança',
  cancelada: 'cancelada',
}

/**
 * Indique o Duo (111, regra de 113). O link é da conta e só aparece com a conta paga e
 * ativa. Cada indicada que assina rende R$ 20 depois do pagamento confirmado; quem
 * administra a conta escolhe: crédito do Duo agora ou abater na próxima cobrança.
 */
export default function Indique() {
  const { user } = useAuth()
  const [p, setP] = useState<PainelAfiliado | null>(null)
  const [usando, setUsando] = useState<number | null>(null)

  const carregar = () => {
    afiliadosApi.meu().then(setP).catch(() => toast.error('Não foi possível carregar suas indicações'))
  }
  useEffect(carregar, [])

  const escolher = async (id: number, destino: 'credito_duo' | 'desconto') => {
    setUsando(id)
    try {
      const r = await afiliadosApi.escolher(id, destino)
      toast.success(destino === 'credito_duo'
        ? 'Pronto! O valor já está no saldo do Duo.'
        : r.ja_abatido ? 'Pronto! O valor já foi abatido na sua próxima cobrança.' : 'Combinado! O valor será abatido na sua próxima cobrança.')
      carregar()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Não foi possível usar a recompensa')
    } finally {
      setUsando(null)
    }
  }

  if (!p) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    )
  }

  const copiar = async () => {
    if (!p.link) return
    try {
      await navigator.clipboard.writeText(p.link)
      toast.success('Link copiado')
    } catch {
      toast.error('Não deu para copiar. Selecione o link e copie.')
    }
  }
  const textoWhats = p.link
    ? `Estou usando o Duo para organizar meus clientes e o financeiro num lugar só, com IA. Dá para testar 7 dias grátis por aqui: ${p.link}`
    : ''

  return (
    <div className="max-w-2xl space-y-6 px-4 py-4 sm:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <Gift className="h-6 w-6 text-primary-600" />
          Indique o Duo
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Cada pessoa que criar conta pelo seu link e assinar rende R$ {p.recompensa} para você usar como crédito do Duo ou abater na sua mensalidade.
        </p>
      </div>

      <Card>
        <div className="space-y-4 p-6">
          {p.pode_indicar && p.link ? (
            <>
              <h2 className="font-semibold text-gray-800 dark:text-gray-200">Seu link</h2>
              <input
                readOnly
                value={p.link}
                onFocus={e => e.currentTarget.select()}
                aria-label="Seu link de indicação"
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={copiar}><Copy className="mr-1.5 h-4 w-4" /> Copiar link</Button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(textoWhats)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <MessageCircle className="mr-1.5 h-4 w-4" /> Mandar pelo WhatsApp
                </a>
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-600 dark:text-gray-300">
                <li>A pessoa cria a conta pelo seu link e testa 7 dias grátis.</li>
                <li>Quando ela assina e o pagamento confirma, os R$ {p.recompensa} aparecem aqui.</li>
                <li>Você escolhe: usar como crédito do Duo ou abater na sua próxima cobrança.</li>
              </ol>
            </>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              O link de indicação é para quem já é assinante. Assim que a sua assinatura estiver ativa, ele aparece aqui.{' '}
              <Link to="/planos" className="text-primary-600 underline dark:text-primary-400">Ver planos</Link>
            </p>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card><div className="p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Para usar</p>
          <p className="mt-0.5 text-xl font-bold text-gray-900 dark:text-white">{brl(p.disponivel)}</p>
        </div></Card>
        <Card><div className="p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Já usado</p>
          <p className="mt-0.5 text-xl font-bold text-gray-900 dark:text-white">{brl(p.em_credito + p.a_abater + p.abatido)}</p>
        </div></Card>
      </div>

      <Card>
        <div className="p-6">
          <h2 className="mb-3 font-semibold text-gray-800 dark:text-gray-200">Suas indicações</h2>
          {p.indicadas.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Ninguém criou conta pelo seu link ainda.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {p.indicadas.map((i, k) => (
                <li key={k} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="text-gray-700 dark:text-gray-200">
                    {i.nome} · desde {new Date(i.created_at).toLocaleDateString('pt-BR')}
                  </span>
                  {i.recompensa_id != null && i.recompensa_status === 'disponivel' ? (
                    isAdminEmpresa(user) ? (
                      <span className="flex flex-wrap gap-2">
                        <Button variant="outline" disabled={usando !== null} onClick={() => escolher(i.recompensa_id!, 'credito_duo')}>
                          <Coins className="mr-1.5 h-4 w-4" /> {brl(i.valor ?? 0)} em crédito do Duo
                        </Button>
                        {p.pode_abater && (
                          <Button variant="outline" disabled={usando !== null} onClick={() => escolher(i.recompensa_id!, 'desconto')}>
                            <Receipt className="mr-1.5 h-4 w-4" /> Abater {brl(i.valor ?? 0)} na mensalidade
                          </Button>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400">{brl(i.valor ?? 0)} para quem administra a conta usar</span>
                    )
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400">
                      {i.recompensa_id != null
                        ? `${brl(i.valor ?? 0)} · ${RECOMPENSA_STATUS[i.recompensa_status || ''] || ''}`
                        : SITUACAO[i.situacao] || i.situacao}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}
