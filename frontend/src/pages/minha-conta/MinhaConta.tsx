import React, { useEffect, useState } from 'react'
import { CreditCard, CheckCircle, AlertTriangle, XCircle, Loader2, ExternalLink, Clock } from 'lucide-react'
import { TourHelpButton } from '@/components/tour/TourHelpButton'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { assinaturasApi, Assinatura, calcularPreco } from '@/api/assinaturas'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  ativa: { label: 'Ativa', color: 'text-green-600 bg-green-50 dark:bg-green-900/20', icon: CheckCircle },
  aguardando_pagamento: { label: 'Aguardando Pagamento', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20', icon: Clock },
  suspensa: { label: 'Suspensa', color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20', icon: AlertTriangle },
  cancelada: { label: 'Cancelada', color: 'text-red-600 bg-red-50 dark:bg-red-900/20', icon: XCircle },
  expirada: { label: 'Expirada', color: 'text-red-600 bg-red-50 dark:bg-red-900/20', icon: XCircle },
}

/**
 * Ajuste da quantidade de usuários contratados (planos Profissional e Enterprise).
 * Cada usuário é também um número de WhatsApp próprio — por isso a contagem é uma só.
 * O valor só é enviado ao confirmar: assim o cliente vê o preço antes de cobrar.
 */
const GerenciarUsuarios: React.FC<{ assinatura: Assinatura; onAlterado: () => Promise<void> }> = ({
  assinatura, onAlterado,
}) => {
  const plano = assinatura.plano!
  const contratado = assinatura.usuarios_contratados ?? plano.usuarios_base ?? 0
  const emUso = assinatura.usuarios_em_uso ?? 0
  const cortesia = assinatura.usuarios_cortesia ?? 0

  const [qtd, setQtd] = useState(contratado)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => setQtd(contratado), [contratado])

  // Não dá para reduzir abaixo de quem já existe: o sistema não teria critério
  // para escolher qual conta desativar.
  const minimo = Math.max(plano.usuarios_base ?? 1, emUso)
  const maximo = plano.usuarios_max ?? minimo
  const precoAtual = calcularPreco(plano, contratado, cortesia)
  const precoNovo = calcularPreco(plano, qtd, cortesia)
  const mudou = qtd !== contratado

  const salvar = async () => {
    setSalvando(true)
    try {
      await assinaturasApi.alterarUsuarios(qtd)
      await onAlterado()
      toast.success(`Plano atualizado para ${qtd} usuários`)
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao alterar a quantidade de usuários')
      setQtd(contratado)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Quantidade de usuários</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {plano.usuarios_base} inclusos no plano · até {maximo} · R${' '}
            {Number(plano.preco_usuario_adicional).toFixed(2).replace('.', ',')} por adicional
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            aria-label="Remover usuário"
            onClick={() => setQtd(q => Math.max(minimo, q - 1))}
            disabled={qtd <= minimo || salvando}
            className="h-9 w-9 rounded-lg border border-gray-300 text-lg leading-none text-gray-700 disabled:opacity-40 dark:border-gray-600 dark:text-gray-200"
          >
            −
          </button>
          <span className="w-10 text-center text-lg font-semibold text-gray-900 dark:text-white">{qtd}</span>
          <button
            type="button"
            aria-label="Adicionar usuário"
            onClick={() => setQtd(q => Math.min(maximo, q + 1))}
            disabled={qtd >= maximo || salvando}
            className="h-9 w-9 rounded-lg border border-gray-300 text-lg leading-none text-gray-700 disabled:opacity-40 dark:border-gray-600 dark:text-gray-200"
          >
            +
          </button>
        </div>
      </div>

      {cortesia > 0 && (
        <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
          {cortesia} usuário{cortesia > 1 ? 's' : ''} de cortesia na sua conta — não {cortesia > 1 ? 'são cobrados' : 'é cobrado'}.
        </p>
      )}

      {qtd >= maximo && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Limite do plano {plano.nome}. Para mais usuários, fale com o suporte.
        </p>
      )}

      {emUso > (plano.usuarios_base ?? 0) && qtd === minimo && minimo === emUso && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Você tem {emUso} usuários ativos. Para reduzir, desative alguém antes.
        </p>
      )}

      {mudou && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-3 dark:border-gray-700">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            R$ {precoAtual.toFixed(2).replace('.', ',')}
            {' → '}
            <strong className="text-gray-900 dark:text-white">R$ {precoNovo.toFixed(2).replace('.', ',')}</strong>
            <span className="text-gray-500 dark:text-gray-400">/mês</span>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setQtd(contratado)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export const MinhaConta: React.FC = () => {
  const navigate = useNavigate()
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelando, setCancelando] = useState(false)

  const carregar = React.useCallback(
    () => assinaturasApi.getMinhaAssinatura().then(setAssinatura),
    []
  )

  useEffect(() => {
    carregar().finally(() => setLoading(false))
  }, [carregar])

  const handleCancelar = async () => {
    if (!confirm('Tem certeza que deseja cancelar sua assinatura? O acesso será bloqueado imediatamente.')) return
    setCancelando(true)
    try {
      await assinaturasApi.cancelar('Cancelamento solicitado pelo usuário')
      toast.success('Assinatura cancelada')
      const a = await assinaturasApi.getMinhaAssinatura()
      setAssinatura(a)
    } catch {
      toast.error('Erro ao cancelar assinatura')
    } finally {
      setCancelando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  const status = assinatura?.status || 'ativa'
  const cfg = statusConfig[status] || statusConfig.ativa
  const StatusIcon = cfg.icon

  return (
    <div className="space-y-6 max-w-2xl px-4 py-4 sm:px-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-primary-600" />
            Minha Conta
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Gerencie sua assinatura e plano</p>
        </div>
        <TourHelpButton tourId="minha-conta" />
      </div>

      <Card data-tour="conta-status">
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800 dark:text-gray-200">Status da Assinatura</h2>
            <span className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full ${cfg.color}`}>
              <StatusIcon className="w-4 h-4" />
              {cfg.label}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Plano atual</p>
              <p className="font-semibold text-gray-900 dark:text-white mt-0.5">
                {assinatura?.plano?.nome || '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Valor mensal</p>
              {/* preco_total já inclui os usuários adicionais; preco_mensal é só a base. */}
              <p className="font-semibold text-gray-900 dark:text-white mt-0.5">
                {assinatura?.preco_total != null
                  ? `R$ ${Number(assinatura.preco_total).toFixed(2).replace('.', ',')}`
                  : assinatura?.plano?.preco_mensal
                    ? `R$ ${Number(assinatura.plano.preco_mensal).toFixed(2).replace('.', ',')}`
                    : '—'}
              </p>
            </div>
            {assinatura?.plano_ativo_ate && (
              <div>
                <p className="text-gray-500 dark:text-gray-400">Próximo vencimento</p>
                <p className="font-semibold text-gray-900 dark:text-white mt-0.5">
                  {new Date(assinatura.plano_ativo_ate).toLocaleDateString('pt-BR')}
                </p>
              </div>
            )}
            {assinatura?.usuarios_contratados != null && (
              <div>
                <p className="text-gray-500 dark:text-gray-400">Usuários</p>
                <p className="font-semibold text-gray-900 dark:text-white mt-0.5">
                  {assinatura.usuarios_em_uso ?? 0} de {assinatura.usuarios_contratados}
                </p>
              </div>
            )}
          </div>

          {assinatura?.plano?.customizavel && assinatura.usuarios_contratados != null && (
            <GerenciarUsuarios assinatura={assinatura} onAlterado={carregar} />
          )}

          {/* Alertas */}
          {(status === 'suspensa') && (
            <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg text-sm text-orange-700 dark:text-orange-400">
              <AlertTriangle className="w-4 h-4 inline mr-1" />
              Sua assinatura está suspensa por falta de pagamento. Regularize para retomar o acesso.
            </div>
          )}
          {(status === 'expirada' || status === 'cancelada') && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-700 dark:text-red-400">
              <XCircle className="w-4 h-4 inline mr-1" />
              {status === 'cancelada' ? 'Sua assinatura foi cancelada.' : 'Sua assinatura expirou.'}
              {' '}Assine um plano para retomar o acesso.
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2" data-tour="conta-plano">
            <Button onClick={() => navigate('/planos')} className="flex items-center gap-2">
              {status === 'ativa' ? 'Trocar plano' : 'Ver planos'}
              <ExternalLink className="w-4 h-4" />
            </Button>

            {status === 'ativa' && (
              <Button
                variant="secondary"
                onClick={handleCancelar}
                disabled={cancelando}
                className="flex items-center gap-2 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
              >
                {cancelando && <Loader2 className="w-4 h-4 animate-spin" />}
                Cancelar assinatura
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Recursos do plano atual */}
      {assinatura?.plano?.features && (
        <Card>
          <div className="p-6 space-y-3">
            <h2 className="font-semibold text-gray-800 dark:text-gray-200" data-tour="conta-recursos">Recursos incluídos</h2>
            <ul className="space-y-2">
              {(assinatura.plano.features as string[]).map((feat, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  {feat}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
    </div>
  )
}
