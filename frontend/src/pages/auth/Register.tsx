import React, { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Check, ChevronRight, Copy, ExternalLink, User, Building2, CreditCard, Sparkles } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { authApi } from '@/api/auth'
import { assinaturasApi } from '@/api/assinaturas'
import type { Plano } from '@/api/assinaturas'
import toast from 'react-hot-toast'

const schema = z.object({
  nome_empresa: z.string().min(2, 'Nome da empresa obrigatório'),
  nome_usuario: z.string().min(2, 'Seu nome é obrigatório'),
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(8, 'Mínimo 8 caracteres'),
  cpf_cnpj: z.string().min(11, 'CPF ou CNPJ obrigatório').max(14),
})

type FormData = z.infer<typeof schema>
type Step = 'dados' | 'plano' | 'pagamento' | 'confirmacao'
type BillingType = 'PIX' | 'CREDIT_CARD' | 'BOLETO'

const STEPS = [
  { id: 'dados', label: 'Dados', icon: User },
  { id: 'plano', label: 'Plano', icon: Sparkles },
  { id: 'pagamento', label: 'Pagamento', icon: CreditCard },
  { id: 'confirmacao', label: 'Confirmação', icon: Check },
] as const

const PAYMENT_OPTIONS: { value: BillingType; label: string; desc: string; icon: string }[] = [
  { value: 'PIX', label: 'PIX', desc: 'Aprovação imediata', icon: '⚡' },
  { value: 'CREDIT_CARD', label: 'Cartão de crédito', desc: 'Aprovação imediata', icon: '💳' },
  { value: 'BOLETO', label: 'Boleto bancário', desc: 'Vence em 3 dias úteis', icon: '📄' },
]

function StepIndicator({ current, onNavigate }: { current: Step; onNavigate: (step: Step) => void }) {
  const currentIdx = STEPS.findIndex(s => s.id === current)
  // Não permite voltar depois da confirmação (conta já criada)
  const canNavigateTo = (i: number) => i < currentIdx && current !== 'confirmacao'

  return (
    <div className="flex items-center justify-between w-full mb-8">
      {STEPS.map((step, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        const clickable = canNavigateTo(i)
        const Icon = step.icon
        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onNavigate(step.id as Step)}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  done ? 'bg-green-500 text-white' :
                  active ? 'bg-primary-600 text-white ring-4 ring-primary-100' :
                  'bg-gray-100 text-gray-400'
                } ${clickable ? 'cursor-pointer hover:opacity-80 hover:scale-105' : 'cursor-default'}`}
              >
                {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </button>
              <span className={`text-xs font-medium ${active ? 'text-primary-600' : done ? 'text-green-600' : 'text-gray-400'}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 mb-4 transition-all ${i < currentIdx ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export const Register: React.FC = () => {
  const [step, setStep] = useState<Step>('dados')
  const [planos, setPlanos] = useState<Plano[]>([])
  const [selectedPlano, setSelectedPlano] = useState<Plano | null>(null)
  const [billingType, setBillingType] = useState<BillingType>('PIX')
  const [loading, setLoading] = useState(false)
  const [loadingPlanos, setLoadingPlanos] = useState(true)
  const [erroPlanos, setErroPlanos] = useState(false)
  const [paymentUrl, setPaymentUrl] = useState<string | undefined>()
  const [pixQrCode, setPixQrCode] = useState<string | undefined>()

  const { register, handleSubmit, getValues, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const fetchPlanos = () => {
    setLoadingPlanos(true)
    setErroPlanos(false)
    assinaturasApi.getPlanos()
      .then(setPlanos)
      .catch(() => setErroPlanos(true))
      .finally(() => setLoadingPlanos(false))
  }

  useEffect(() => { fetchPlanos() }, [])

  const onDadosSubmit = handleSubmit(() => setStep('plano'))

  const handleSelecionarPlano = (plano: Plano) => {
    setSelectedPlano(plano)
    setStep('pagamento')
  }

  const handleRegistrar = async () => {
    if (!selectedPlano) return
    setLoading(true)
    try {
      const form = getValues()
      const result = await authApi.registrar({
        nome_empresa: form.nome_empresa,
        nome_usuario: form.nome_usuario,
        email: form.email,
        senha: form.senha,
        plano_id: selectedPlano.id,
        billing_type: billingType,
        cpf_cnpj: form.cpf_cnpj,
      })

      setPaymentUrl(result.paymentUrl)
      setPixQrCode(result.pixQrCode)
      setStep('confirmacao')

      if (result.paymentUrl && billingType === 'CREDIT_CARD') {
        setTimeout(() => window.open(result.paymentUrl, '_blank'), 600)
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao criar conta')
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (price: number | string) =>
    parseFloat(String(price)).toFixed(2).replace('.', ',')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-primary-50 p-4">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">DuoFuturo</h1>
          <p className="text-sm text-gray-500 mt-1">Criar nova conta</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <StepIndicator current={step} onNavigate={setStep} />

          {/* Step 1: Dados */}
          {step === 'dados' && (
            <form onSubmit={onDadosSubmit} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-800 mb-1">Sobre seu negócio</h2>
                <p className="text-sm text-gray-500 mb-4">Vamos configurar sua conta em menos de 2 minutos.</p>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div className="relative">
                  <Building2 className="absolute left-3 top-9 w-4 h-4 text-gray-400" />
                  <Input label="Nome da empresa / negócio" placeholder="Ex: Clínica Saúde Total"
                    className="pl-9" error={errors.nome_empresa?.message} {...register('nome_empresa')} />
                </div>
                <div className="relative">
                  <User className="absolute left-3 top-9 w-4 h-4 text-gray-400" />
                  <Input label="Seu nome" placeholder="Ex: Maria Silva"
                    className="pl-9" error={errors.nome_usuario?.message} {...register('nome_usuario')} />
                </div>
                <Input label="E-mail" type="email" placeholder="seu@email.com"
                  error={errors.email?.message} {...register('email')} />
                <Input label="Senha" type="password" placeholder="Mínimo 8 caracteres"
                  error={errors.senha?.message} {...register('senha')} />
                <Input label="CPF / CNPJ" placeholder="Apenas números" maxLength={14}
                  error={errors.cpf_cnpj?.message}
                  {...register('cpf_cnpj', { onChange: e => { e.target.value = e.target.value.replace(/\D/g, '') } })} />
              </div>
              <Button type="submit" variant="primary" className="w-full mt-2">
                Continuar <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
              <p className="text-center text-sm text-gray-500">
                Já tem conta?{' '}
                <a href="/gestao/login" className="text-primary-600 hover:text-primary-700 font-medium">Entrar</a>
              </p>
            </form>
          )}

          {/* Step 2: Plano */}
          {step === 'plano' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-800 mb-1">Escolha seu plano</h2>
                <p className="text-sm text-gray-500 mb-4">Sem fidelidade. Cancele quando quiser.</p>
              </div>
              {loadingPlanos ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                </div>
              ) : erroPlanos ? (
                <div className="text-center py-10">
                  <p className="text-sm text-gray-500 mb-3">Não foi possível carregar os planos.</p>
                  <button onClick={fetchPlanos} className="text-sm text-primary-600 hover:text-primary-700 font-medium underline">
                    Tentar novamente
                  </button>
                </div>
              ) : planos.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-gray-500">Nenhum plano disponível no momento.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {planos.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleSelecionarPlano(p)}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all hover:shadow-sm group ${
                        p.destaque
                          ? 'border-primary-500 bg-primary-50/40'
                          : 'border-gray-200 hover:border-primary-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-gray-900">{p.nome}</span>
                            {p.destaque && (
                              <span className="text-xs bg-primary-600 text-white px-2 py-0.5 rounded-full font-medium">
                                Mais popular
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">{p.descricao}</p>
                          {p.features?.length > 0 && (
                            <ul className="mt-2 space-y-0.5">
                              {p.features.slice(0, 3).map((f, i) => (
                                <li key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
                                  <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                                  {f}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-2xl font-bold text-gray-900">
                            R$ {formatPrice(p.preco_mensal)}
                          </div>
                          <div className="text-xs text-gray-500">/mês</div>
                          <ChevronRight className="w-4 h-4 text-gray-400 ml-auto mt-1 group-hover:text-primary-500 transition-colors" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setStep('dados')}
                className="text-sm text-gray-400 hover:text-gray-600 w-full text-center mt-2">
                ← Voltar
              </button>
            </div>
          )}

          {/* Step 3: Pagamento */}
          {step === 'pagamento' && selectedPlano && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-800 mb-1">Forma de pagamento</h2>
                <p className="text-sm text-gray-500">Escolha como prefere pagar.</p>
              </div>

              {/* Resumo do pedido */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Resumo</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-800">{selectedPlano.nome}</p>
                    <p className="text-xs text-gray-500">Cobrança mensal recorrente</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-gray-900">R$ {formatPrice(selectedPlano.preco_mensal)}</p>
                    <p className="text-xs text-gray-500">/mês</p>
                  </div>
                </div>
                <div className="border-t border-gray-200 mt-3 pt-3 flex justify-between text-sm">
                  <span className="text-gray-500">Total hoje</span>
                  <span className="font-bold text-gray-900">R$ {formatPrice(selectedPlano.preco_mensal)}</span>
                </div>
              </div>

              {/* Opções de pagamento */}
              <div className="space-y-2">
                {PAYMENT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setBillingType(opt.value)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                      billingType === opt.value
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-2xl">{opt.icon}</span>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${billingType === opt.value ? 'text-primary-700' : 'text-gray-700'}`}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-gray-500">{opt.desc}</p>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      billingType === opt.value ? 'border-primary-500' : 'border-gray-300'
                    }`}>
                      {billingType === opt.value && <div className="w-2 h-2 rounded-full bg-primary-500" />}
                    </div>
                  </button>
                ))}
              </div>

              <Button onClick={handleRegistrar} disabled={loading} variant="primary" className="w-full">
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Criando sua conta...</>
                  : 'Criar minha conta'
                }
              </Button>
              <p className="text-xs text-center text-gray-400">
                Ao criar sua conta você concorda com os termos de uso.
              </p>
              <button onClick={() => setStep('plano')}
                className="text-sm text-gray-400 hover:text-gray-600 w-full text-center">
                ← Voltar
              </button>
            </div>
          )}

          {/* Step 4: Confirmação */}
          {step === 'confirmacao' && (
            <div className="space-y-5 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-800">Conta criada com sucesso!</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {billingType === 'PIX'
                    ? 'Use o código abaixo para pagar e liberar seu acesso.'
                    : billingType === 'BOLETO'
                    ? 'Acesse o boleto e efetue o pagamento para liberar seu acesso.'
                    : 'Você será redirecionado para concluir o pagamento.'}
                </p>
              </div>

              {/* PIX */}
              {billingType === 'PIX' && pixQrCode && (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-left">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Código PIX copia e cola</p>
                  <div className="relative">
                    <textarea
                      readOnly
                      value={pixQrCode}
                      rows={3}
                      className="w-full text-xs text-gray-700 bg-white border border-gray-200 rounded-lg p-2.5 resize-none pr-10"
                      onClick={e => (e.target as HTMLTextAreaElement).select()}
                    />
                  </div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(pixQrCode); toast.success('Código copiado!') }}
                    className="mt-2 flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 font-medium"
                  >
                    <Copy className="w-3 h-3" /> Copiar código PIX
                  </button>
                </div>
              )}

              {/* Boleto / Cartão */}
              {paymentUrl && billingType !== 'PIX' && (
                <a
                  href={paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  {billingType === 'BOLETO' ? 'Abrir boleto' : 'Concluir pagamento'}
                </a>
              )}

              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs text-gray-400 mb-3">
                  Após confirmar o pagamento, seu acesso é liberado automaticamente.
                </p>
                <a href="/gestao/login"
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                  Ir para o login →
                </a>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">&copy; {new Date().getFullYear()} DuoFuturo</p>
      </div>
    </div>
  )
}
