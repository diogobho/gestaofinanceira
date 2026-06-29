import React, { useEffect, useState } from 'react'
import { Check, Zap, Crown, Star, Loader2, CreditCard, Lock } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { assinaturasApi, Plano, Assinatura } from '@/api/assinaturas'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '@/contexts/AuthContext'

const planIcons = [Zap, Star, Crown]
const planColors = [
  'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
  'text-primary-600 bg-primary-50 dark:bg-primary-900/20',
  'text-amber-600 bg-amber-50 dark:bg-amber-900/20',
]

function formatCardNumber(value: string) {
  return value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
}

function formatExpiry(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 6)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

export const Planos: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [planos, setPlanos] = useState<Plano[]>([])
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null)
  const [loading, setLoading] = useState(true)
  const [assinando, setAssinando] = useState<number | null>(null)
  const [billingType, setBillingType] = useState<'BOLETO' | 'PIX' | 'CREDIT_CARD'>('PIX')
  const [cpfCnpj, setCpfCnpj] = useState('')

  // Credit card fields
  const [cardHolder, setCardHolder] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvv, setCardCvv] = useState('')
  const [cardPhone, setCardPhone] = useState('')
  const [cardPostalCode, setCardPostalCode] = useState('')
  const [cardAddressNumber, setCardAddressNumber] = useState('')

  // PIX modal
  const [pixModal, setPixModal] = useState<{ qrCodeImage?: string; payload?: string; paymentUrl?: string } | null>(null)
  const [pixCopied, setPixCopied] = useState(false)

  useEffect(() => {
    Promise.all([
      assinaturasApi.getPlanos(),
      assinaturasApi.getMinhaAssinatura(),
    ]).then(([p, a]) => {
      setPlanos(p)
      setAssinatura(a)
    }).finally(() => setLoading(false))
  }, [])

  const handleAssinar = async (plano: Plano) => {
    if (!cpfCnpj) {
      toast.error('Informe seu CPF ou CNPJ para assinar')
      return
    }

    if (billingType === 'CREDIT_CARD') {
      if (!cardHolder || !cardNumber || !cardExpiry || !cardCvv) {
        toast.error('Preencha todos os dados do cartão')
        return
      }
      const expiryParts = cardExpiry.replace(/\D/g, '')
      if (expiryParts.length < 6) {
        toast.error('Data de validade inválida (MM/AAAA)')
        return
      }
    }

    setAssinando(plano.id)
    try {
      let creditCard: object | undefined
      let creditCardHolderInfo: object | undefined

      if (billingType === 'CREDIT_CARD') {
        const expiryDigits = cardExpiry.replace(/\D/g, '')
        creditCard = {
          holderName: cardHolder,
          number: cardNumber.replace(/\s/g, ''),
          expiryMonth: expiryDigits.slice(0, 2),
          expiryYear: expiryDigits.slice(2, 6),
          ccv: cardCvv,
        }
        creditCardHolderInfo = {
          name: cardHolder,
          email: user?.email || '',
          cpfCnpj,
          postalCode: cardPostalCode || undefined,
          addressNumber: cardAddressNumber || undefined,
          phone: cardPhone || undefined,
        }
      }

      const resultado = await assinaturasApi.assinar({
        plano_id: plano.id,
        billing_type: billingType,
        cpf_cnpj: cpfCnpj,
        credit_card: creditCard,
        credit_card_holder_info: creditCardHolderInfo,
      })

      if (billingType === 'PIX' && (resultado.pixQrCodeImage || resultado.pixQrCode)) {
        setPixModal({
          qrCodeImage: resultado.pixQrCodeImage,
          payload: resultado.pixQrCode,
          paymentUrl: resultado.paymentUrl,
        })
      } else if (resultado.paymentUrl) {
        toast.success(`Plano ${plano.nome} ativado! Abrindo página de pagamento...`)
        setTimeout(() => window.open(resultado.paymentUrl, '_blank'), 800)
        navigate('/minha-conta')
      } else {
        toast.success(`Plano ${plano.nome} ativado com sucesso!`)
        navigate('/minha-conta')
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao assinar plano')
    } finally {
      setAssinando(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  const planoAtualId = assinatura?.plano_id

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Planos e Preços</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Escolha o plano ideal para o seu negócio. Cancele a qualquer momento.
        </p>
      </div>

      {/* Método de pagamento */}
      <Card>
        <div className="p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 dark:text-gray-200">Forma de pagamento</h2>
          <div className="flex gap-3 flex-wrap">
            {([
              { value: 'PIX', label: '🔹 PIX (imediato)' },
              { value: 'CREDIT_CARD', label: '💳 Cartão de crédito' },
              { value: 'BOLETO', label: '📄 Boleto bancário' },
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setBillingType(value)}
                className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                  billingType === value
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-primary-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {billingType === 'CREDIT_CARD' && (
            <div className="space-y-4 border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50 dark:bg-gray-700/30">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <CreditCard className="w-4 h-4" />
                Dados do cartão
                <span className="ml-auto flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-normal">
                  <Lock className="w-3 h-3" /> Pagamento seguro
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {/* Card number */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Número do cartão</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cardNumber}
                    onChange={e => setCardNumber(formatCardNumber(e.target.value))}
                    placeholder="0000 0000 0000 0000"
                    maxLength={19}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                {/* Card holder */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nome no cartão</label>
                  <input
                    type="text"
                    value={cardHolder}
                    onChange={e => setCardHolder(e.target.value.toUpperCase())}
                    placeholder="NOME COMO ESTÁ NO CARTÃO"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Expiry */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Validade</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cardExpiry}
                      onChange={e => setCardExpiry(formatExpiry(e.target.value))}
                      placeholder="MM/AAAA"
                      maxLength={7}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  {/* CVV */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">CVV</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cardCvv}
                      onChange={e => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="123"
                      maxLength={4}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Postal Code */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      CEP <span className="text-gray-400">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cardPostalCode}
                      onChange={e => setCardPostalCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder="01310100"
                      maxLength={8}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  {/* Address Number */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Nº <span className="text-gray-400">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      value={cardAddressNumber}
                      onChange={e => setCardAddressNumber(e.target.value.slice(0, 20))}
                      placeholder="123"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                {/* Phone (optional) */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Telefone <span className="text-gray-400">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cardPhone}
                    onChange={e => setCardPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                    placeholder="11999999999"
                    maxLength={11}
                    className="w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              CPF / CNPJ (obrigatório para cobrança)
            </label>
            <input
              type="text"
              value={cpfCnpj}
              onChange={e => setCpfCnpj(e.target.value.replace(/\D/g, ''))}
              placeholder="Apenas números"
              maxLength={14}
              className="w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </Card>

      {/* Cards de planos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {planos.map((plano, idx) => {
          const Icon = planIcons[idx] || Zap
          const colorClass = planColors[idx] || planColors[0]
          const isCurrent = planoAtualId === plano.id
          const isDestaque = plano.destaque

          return (
            <div
              key={plano.id}
              className={`relative rounded-2xl border-2 flex flex-col ${
                isDestaque
                  ? 'border-primary-500 dark:border-primary-400 shadow-lg shadow-primary-100 dark:shadow-primary-900/20'
                  : 'border-gray-200 dark:border-gray-700'
              } bg-white dark:bg-gray-800`}
            >
              {isDestaque && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-primary-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                    MAIS POPULAR
                  </span>
                </div>
              )}

              <div className="p-6 flex flex-col flex-1">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${colorClass}`}>
                  <Icon className="w-5 h-5" />
                </div>

                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{plano.nome}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-4">{plano.descricao}</p>

                <div className="mb-6">
                  <span className="text-3xl font-bold text-gray-900 dark:text-white">
                    R$ {Number(plano.preco_mensal).toFixed(2).replace('.', ',')}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">/mês</span>
                </div>

                <ul className="space-y-2 mb-6 flex-1">
                  {(plano.features as string[]).map((feat, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      {feat}
                    </li>
                  ))}
                </ul>

                {isCurrent && assinatura?.status === 'ativa' ? (
                  <div className="text-center py-2 text-sm font-medium text-primary-600 dark:text-primary-400">
                    Plano atual
                  </div>
                ) : (
                  <Button
                    onClick={() => handleAssinar(plano)}
                    disabled={assinando !== null}
                    className={`w-full ${isDestaque ? '' : 'bg-gray-900 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600'}`}
                  >
                    {assinando === plano.id ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    {isCurrent ? 'Renovar plano' : 'Assinar agora'}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Banner sob medida */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-50 dark:bg-gray-800/50">
        <div>
          <p className="font-semibold text-gray-900 dark:text-white">Precisa de mais de 8 usuários?</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Criamos um plano sob medida para o seu negócio.</p>
        </div>
        <a
          href="https://wa.me/5524981213371?text=Olá! Tenho interesse em um plano personalizado para mais de 8 usuários."
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 px-5 py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Falar com consultor
        </a>
      </div>

      <p className="text-center text-xs text-gray-400 dark:text-gray-500">
        Pagamentos processados com segurança via Asaas. Cancele a qualquer momento sem multa.
      </p>

      {/* PIX Modal */}
      {pixModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <div className="text-center">
              <div className="text-2xl mb-1">🔹</div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Pague com PIX</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Escaneie o QR Code ou copie o código abaixo
              </p>
            </div>

            {pixModal.qrCodeImage && (
              <div className="flex justify-center">
                <img
                  src={`data:image/png;base64,${pixModal.qrCodeImage}`}
                  alt="QR Code PIX"
                  className="w-48 h-48 border border-gray-200 dark:border-gray-600 rounded-xl"
                />
              </div>
            )}

            {pixModal.payload && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Código PIX Copia e Cola</p>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2 text-xs text-gray-700 dark:text-gray-300 break-all font-mono">
                  {pixModal.payload.slice(0, 60)}...
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(pixModal.payload!)
                    setPixCopied(true)
                    setTimeout(() => setPixCopied(false), 3000)
                  }}
                  className="w-full py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
                >
                  {pixCopied ? '✓ Copiado!' : 'Copiar código PIX'}
                </button>
              </div>
            )}

            <div className="flex gap-2">
              {pixModal.paymentUrl && (
                <a
                  href={pixModal.paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-center text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Ver fatura
                </a>
              )}
              <button
                onClick={() => { setPixModal(null); navigate('/minha-conta') }}
                className="flex-1 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors"
              >
                Já paguei
              </button>
            </div>

            <p className="text-center text-xs text-gray-400 dark:text-gray-500">
              Após o pagamento, sua assinatura será ativada automaticamente.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
