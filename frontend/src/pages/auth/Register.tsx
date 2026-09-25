import React, { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Check, Copy, ExternalLink, User, Building2, Phone, MessageCircle } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { authApi } from '@/api/auth'
import { assinaturasApi, cicloDe, cicloReferencia, ciclosDisponiveis, calcularCobranca, economiaAnual, ROTULO_CICLO, COMPROMISSO_CICLO } from '@/api/assinaturas'
import type { Plano, Ciclo } from '@/api/assinaturas'
import toast from 'react-hot-toast'

const schema = z.object({
  nome_empresa: z.string().min(2, 'Nome da empresa obrigatório'),
  nome_usuario: z.string().min(2, 'Seu nome é obrigatório'),
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(8, 'Mínimo 8 caracteres'),
  cpf_cnpj: z.string().min(11, 'CPF ou CNPJ obrigatório').max(14),
  // Obrigatório porque é por ele que sai a mensagem de boas-vindas com o guia
  // de primeiros passos. 10 dígitos = fixo com DDD; 11 = celular com o 9.
  telefone: z.string()
    .transform(v => v.replace(/\D/g, ''))
    .refine(v => v.length === 10 || v.length === 11, 'Informe DDD + número (ex: 11988887777)'),
})


type FormData = z.infer<typeof schema>
type BillingType = 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'TRIAL'

const PAYMENT_OPTIONS: { value: Exclude<BillingType, 'TRIAL'>; label: string; desc: string; icon: string }[] = [
  { value: 'PIX', label: 'PIX', desc: 'Aprovação na hora', icon: '⚡' },
  { value: 'CREDIT_CARD', label: 'Cartão', desc: 'Aprovação na hora', icon: '💳' },
  { value: 'BOLETO', label: 'Boleto', desc: 'Vence em 3 dias úteis', icon: '📄' },
]

/** O botão diz o que vai acontecer quando for clicado — não um "Continuar" genérico. */
const ROTULO_ACAO: Record<BillingType, string> = {
  TRIAL: 'Começar meu teste grátis',
  PIX: 'Criar conta e gerar o PIX',
  CREDIT_CARD: 'Criar conta e pagar com cartão',
  BOLETO: 'Criar conta e gerar o boleto',
}

// pt-BR com milhar: o total do anual passa de mil ("R$ 2.028,00", não "2028,00").
const formatPrice = (price: number | string) =>
  Number(price).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Secao({ numero, titulo, descricao, children }: {
  numero: number
  titulo: string
  descricao?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6">
      <div className="flex items-start gap-3 mb-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-600 text-xs font-semibold text-white">
          {numero}
        </span>
        <div>
          <h2 className="text-base font-semibold text-gray-800">{titulo}</h2>
          {descricao && <p className="text-sm text-gray-500">{descricao}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

export const Register: React.FC = () => {
  const [concluido, setConcluido] = useState(false)
  const [planos, setPlanos] = useState<Plano[]>([])
  const [selectedPlano, setSelectedPlano] = useState<Plano | null>(null)
  // Teste grátis vem marcado: é o caminho principal, sem cartão e sem compromisso.
  const [billingType, setBillingType] = useState<BillingType>('TRIAL')
  const [loading, setLoading] = useState(false)
  const [loadingPlanos, setLoadingPlanos] = useState(true)
  const [erroPlanos, setErroPlanos] = useState(false)
  const [paymentUrl, setPaymentUrl] = useState<string | undefined>()
  const [pixQrCode, setPixQrCode] = useState<string | undefined>()
  const [aceiteTermos, setAceiteTermos] = useState(false)
  /**
   * Opt-in do material por WhatsApp — desmarcado por padrão (LGPD: consentimento
   * é ato, não omissão). Até 13/09/2026 a mensagem saía sem ninguém pedir, por
   * uma instância não oficial.
   */
  const [optinWhatsapp, setOptinWhatsapp] = useState(false)
  const [whatsappUrl, setWhatsappUrl] = useState<string | undefined>()
  const [erroTermos, setErroTermos] = useState(false)
  const [cicloEscolhido, setCiclo] = useState<Ciclo | null>(null)
  const termosRef = useRef<HTMLLabelElement>(null)

  /**
   * O selo de "−23%" sai do plano em destaque (o Profissional), não do primeiro
   * da lista: é o plano que a landing usa como vitrine, e calcular pelo Starter
   * dava percentuais diferentes nos dois lugares para a mesma fidelidade.
   */
  const planoReferencia = planos.find(p => p.destaque) || planos[0]
  // Os compromissos vêm da API (só os à venda, desde 21/09/2026 semestral e
  // anual). Sem escolha, vale o de menor prazo.
  const CICLOS = ciclosDisponiveis(planoReferencia)
  const ciclo: Ciclo = cicloEscolhido && CICLOS.includes(cicloEscolhido) ? cicloEscolhido : (CICLOS[0] ?? 'semestral')
  const descontoDoCiclo = (c: Ciclo) => {
    if (!planoReferencia) return 0
    const alvo = cicloDe(planoReferencia, c)
    return Math.round((1 - Number(alvo.preco_mensal) / Number(cicloReferencia(planoReferencia).preco_mensal)) * 100)
  }

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const fetchPlanos = () => {
    setLoadingPlanos(true)
    setErroPlanos(false)
    assinaturasApi.getPlanos()
      .then(lista => {
        setPlanos(lista)
        // Com tudo numa página só, o resumo ao lado precisa de um plano desde o
        // início — o em destaque, que é o que a landing oferece como vitrine.
        setSelectedPlano(atual => atual ?? lista.find(p => p.destaque) ?? lista[0] ?? null)
      })
      .catch(() => setErroPlanos(true))
      .finally(() => setLoadingPlanos(false))
  }

  useEffect(() => { fetchPlanos() }, [])

  const criarConta = handleSubmit(async (form) => {
    if (!selectedPlano) {
      toast.error('Escolha um plano')
      return
    }
    if (!aceiteTermos) {
      setErroTermos(true)
      termosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      toast.error('É necessário aceitar os Termos de Uso e a Política de Privacidade')
      return
    }
    setLoading(true)
    try {
      const result = await authApi.registrar({
        nome_empresa: form.nome_empresa,
        nome_usuario: form.nome_usuario,
        email: form.email,
        senha: form.senha,
        plano_id: selectedPlano.id,
        billing_type: billingType,
        cpf_cnpj: form.cpf_cnpj,
        telefone: form.telefone,
        // Trial não tem cobrança: mandar ciclo aqui só confundiria o registro.
        ciclo: billingType === 'TRIAL' ? undefined : ciclo,
        aceite_termos: aceiteTermos,
        whatsapp_optin: optinWhatsapp,
      })

      setWhatsappUrl(result.whatsappUrl)
      setPaymentUrl(result.paymentUrl)
      setPixQrCode(result.pixQrCode)
      setConcluido(true)
      window.scrollTo({ top: 0 })

      // Analytics: conversão do funil (Umami — sem dados pessoais)
      ;(window as any).umami?.track(
        billingType === 'TRIAL' ? 'conta-criada-trial' : 'conta-criada-pagamento',
        { plano: selectedPlano.nome, forma: billingType, ciclo: billingType === 'TRIAL' ? 'trial' : ciclo }
      )

      if (result.paymentUrl && billingType === 'CREDIT_CARD') {
        setTimeout(() => window.open(result.paymentUrl, '_blank'), 600)
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erro ao criar conta')
    } finally {
      setLoading(false)
    }
  }, () => toast.error('Confira os campos destacados em "Seus dados"'))

  const cobranca = selectedPlano
    ? calcularCobranca(selectedPlano, cicloDe(selectedPlano, ciclo), selectedPlano.usuarios_base ?? 1)
    : null

  return (
    /* As paradas do gradiente (`from-*`/`to-*`) nao tem override no dark do
       index.css: sem as versoes `dark:` a pagina inteira ficava CLARA no modo
       escuro, com o "DuoFuturo" (text-gray-900 -> branco pelo override) sumindo
       no fundo branco. */
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-primary-50 dark:from-gray-900 dark:to-gray-950 px-4 py-8">
      {concluido ? (
        <div className="mx-auto w-full max-w-lg">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">DuoFuturo</h1>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 space-y-5 text-center">
            {/*
              O único momento de comemoração do fluxo — é onde um mascote rende
              mais (o high-five do Freddie no Mailchimp é o caso clássico). O
              check verde continua ali como selo: quem paga por PIX ou boleto
              ainda precisa ler "deu certo" sem depender da ilustração.
            */}
            <div className="relative mx-auto w-fit">
              <img
                src="/gestao/avatar/duo-anim.svg"
                alt=""
                aria-hidden="true"
                className="h-24 w-auto sm:h-28"
              />
              <span className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-green-100">
                <Check className="h-5 w-5 text-green-600" />
              </span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">Conta criada com sucesso!</h2>
              <p className="text-sm text-gray-500 mt-1">
                {billingType === 'TRIAL'
                  ? 'Seus 7 dias de teste grátis já estão liberados — é só entrar e começar. 🎉'
                  : billingType === 'PIX'
                  ? 'Use o código abaixo para pagar e liberar seu acesso.'
                  : billingType === 'BOLETO'
                  ? 'Acesse o boleto e efetue o pagamento para liberar seu acesso.'
                  : 'Você será redirecionado para concluir o pagamento.'}
              </p>
              <p className="text-xs text-gray-400 mt-2">
                O guia do plano {selectedPlano?.nome} está indo para o seu e-mail — pode levar
                alguns minutos para chegar.
              </p>
            </div>

            {/*
              WhatsApp: quem manda a primeira mensagem é a PESSOA. Pela API
              oficial, nós não podemos iniciar a conversa sem um modelo aprovado
              pela Meta — mas a mensagem dela abre uma janela de 24h em que o
              número oficial responde com o texto e o PDF do plano.
            */}
            {whatsappUrl && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-left">
                <p className="text-sm font-semibold text-emerald-900">Seu material pelo WhatsApp</p>
                <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                  Toque no botão e envie a mensagem que já vai escrita. Nosso número oficial
                  responde com o guia em seguida.
                </p>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  Receber no WhatsApp
                </a>
              </div>
            )}

            {/* PIX */}
            {billingType === 'PIX' && pixQrCode && (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-left">
                <p className="text-xs font-semibold text-gray-600 mb-2">Código PIX copia e cola</p>
                <textarea
                  readOnly
                  value={pixQrCode}
                  rows={3}
                  className="w-full text-xs text-gray-700 bg-white border border-gray-200 rounded-lg p-2.5 resize-none"
                  onClick={e => (e.target as HTMLTextAreaElement).select()}
                />
                <button
                  type="button"
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
                {billingType === 'TRIAL'
                  ? 'Ao final do teste, você escolhe se quer assinar — seus dados ficam guardados.'
                  : 'Após confirmar o pagamento, seu acesso é liberado automaticamente.'}
              </p>
              <a href="/gestao/login"
                className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                {billingType === 'TRIAL' ? 'Entrar e começar agora →' : 'Ir para o login →'}
              </a>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={criarConta} noValidate className="mx-auto w-full max-w-5xl">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">DuoFuturo</h1>
            <p className="text-sm text-gray-500 mt-1">
              Crie sua conta em menos de 2 minutos · Já tem conta?{' '}
              <a href="/gestao/login" className="text-primary-600 hover:text-primary-700 font-medium">Entrar</a>
            </p>
          </div>

          {/*
            Tudo numa página: dados e plano à esquerda, o pedido à direita. No
            desktop a coluna do pedido fica presa na tela enquanto a pessoa preenche
            — o preço e o botão estão sempre à vista. No celular empilha na ordem de
            leitura: dados → plano → pagamento.
          */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
            <div className="space-y-5 min-w-0">
              <Secao numero={1} titulo="Seus dados" descricao="Quem vai usar o sistema e em nome de qual negócio.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Ícone pela prop `icon`: posicionado por fora do Input, ele ficava
                      atrás do campo (o wrapper `relative` do Input pinta por cima). */}
                  <Input label="Nome da empresa / negócio" placeholder="Ex: Clínica Saúde Total"
                    icon={<Building2 className="w-4 h-4" />}
                    error={errors.nome_empresa?.message} {...register('nome_empresa')} />
                  <Input label="Seu nome" placeholder="Ex: Maria Silva" autoComplete="name"
                    icon={<User className="w-4 h-4" />}
                    error={errors.nome_usuario?.message} {...register('nome_usuario')} />
                  <Input label="E-mail" type="email" placeholder="seu@email.com" autoComplete="email"
                    error={errors.email?.message} {...register('email')} />
                  <div>
                    <Input label="WhatsApp (com DDD)" type="tel" inputMode="numeric" autoComplete="tel-national"
                      placeholder="11988887777" maxLength={11}
                      icon={<Phone className="w-4 h-4" />}
                      error={errors.telefone?.message}
                      {...register('telefone', { onChange: e => { e.target.value = e.target.value.replace(/\D/g, '') } })} />
                    <p className="mt-1 text-xs text-gray-400">
                      É o contato da conta — e, se você quiser, por onde mandamos o guia.
                    </p>
                  </div>
                  <Input label="Senha" type="password" placeholder="Mínimo 8 caracteres" autoComplete="new-password"
                    error={errors.senha?.message} {...register('senha')} />
                  <Input label="CPF / CNPJ" placeholder="Apenas números" maxLength={14} inputMode="numeric"
                    error={errors.cpf_cnpj?.message}
                    {...register('cpf_cnpj', { onChange: e => { e.target.value = e.target.value.replace(/\D/g, '') } })} />
                </div>
              </Secao>

              <Secao numero={2} titulo="Plano" descricao="Compromisso de 6 ou 12 meses. Quanto maior o compromisso, menor a mensalidade.">
                {/*
                  Seletor de fidelidade. Fica ACIMA dos planos porque muda o preço de
                  todos eles ao mesmo tempo — dentro de cada card, o cliente teria de
                  escolher três vezes. As abas saem da API (só os ciclos à venda).
                */}
                <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-gray-100 p-1 mb-4" role="radiogroup" aria-label="Compromisso de fidelidade">
                  {CICLOS.map(c => {
                    const ativo = ciclo === c
                    const desconto = descontoDoCiclo(c)
                    return (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={ativo}
                        onClick={() => setCiclo(c)}
                        className={`rounded-lg px-2 py-2 text-xs font-medium transition-all ${
                          ativo ? 'bg-white text-primary-700 shadow-sm ring-1 ring-primary-200' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {ROTULO_CICLO[c]}
                        {desconto > 0 && (
                          <span className={`ml-1 rounded px-1 py-0.5 text-[10px] font-semibold ${
                            ativo ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
                          }`}>
                            −{desconto}%
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {loadingPlanos ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                  </div>
                ) : erroPlanos ? (
                  <div className="text-center py-10">
                    <p className="text-sm text-gray-500 mb-3">Não foi possível carregar os planos.</p>
                    <button type="button" onClick={fetchPlanos} className="text-sm text-primary-600 hover:text-primary-700 font-medium underline">
                      Tentar novamente
                    </button>
                  </div>
                ) : planos.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-sm text-gray-500">Nenhum plano disponível no momento.</p>
                  </div>
                ) : (
                  <div className="space-y-3" role="radiogroup" aria-label="Plano">
                    {planos.map(p => {
                      const ativo = selectedPlano?.id === p.id
                      return (
                        <button
                          key={p.id}
                          type="button"
                          role="radio"
                          aria-checked={ativo}
                          onClick={() => setSelectedPlano(p)}
                          className={`w-full text-left p-4 rounded-xl border-2 transition-all hover:shadow-sm ${
                            ativo
                              ? 'border-primary-500 bg-primary-50'
                              : 'border-gray-200 hover:border-primary-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                                ativo ? 'border-primary-500 bg-primary-600' : 'border-gray-300'
                              }`}>
                                {ativo && <Check className="h-3 w-3 text-white" />}
                              </span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <span className="font-semibold text-gray-900">{p.nome}</span>
                                  {p.destaque && (
                                    <span className="text-xs bg-primary-600 text-white px-2 py-0.5 rounded-full font-medium">
                                      Mais popular
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500">{p.descricao}</p>
                                {/* Usuários inclusos e adicionais — o card mostrava só os 3
                                    primeiros recursos e nunca dizia para quantas pessoas o
                                    plano serve, que é a primeira pergunta de quem assina. */}
                                <p className="mt-1.5 text-xs font-medium text-gray-700">
                                  {p.usuarios_base ?? 1} {(p.usuarios_base ?? 1) === 1 ? 'usuário incluso' : 'usuários inclusos'}
                                  {p.customizavel && p.usuarios_max && p.usuarios_max > (p.usuarios_base ?? 0) && (
                                    <span className="font-normal text-gray-500">
                                      {' '}· adicionais R$ {Number(p.preco_usuario_adicional).toFixed(0)}/mês (até {p.usuarios_max})
                                    </span>
                                  )}
                                </p>
                                {p.features?.length > 0 && (
                                  <ul className="mt-2 space-y-0.5">
                                    {/* Só cabem 3 linhas aqui. "Tudo do Starter" é a menos
                                        distintiva das features e roubaria a vaga justamente
                                        da linha que separa os planos — o canal do WhatsApp. */}
                                    {p.features.filter((f) => !/^Tudo do /.test(f)).slice(0, 3).map((f, i) => (
                                      <li key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
                                        <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                                        {f}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              {/* No compromisso, o preço de tabela fica riscado ao lado:
                                  sem a âncora, "R$ 169" não se lê como desconto. */}
                              {economiaAnual(p, cicloDe(p, ciclo)) > 0 && (
                                <div className="text-xs text-gray-400 line-through">
                                  R$ {formatPrice(cicloReferencia(p).preco_mensal)}
                                </div>
                              )}
                              <div className="text-2xl font-bold text-gray-900">
                                R$ {formatPrice(cicloDe(p, ciclo).preco_mensal)}
                              </div>
                              <div className="text-xs text-gray-500">/mês</div>
                              {economiaAnual(p, cicloDe(p, ciclo)) > 0 && (
                                <div className="mt-0.5 text-[11px] font-medium text-green-600">
                                  economia de R$ {formatPrice(economiaAnual(p, cicloDe(p, ciclo)))}/ano
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </Secao>
            </div>

            <aside className="lg:sticky lg:top-6">
              <Secao numero={3} titulo="Como quer começar">
                {/* Resumo do pedido */}
                {selectedPlano && cobranca ? (
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 mb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800">
                          {selectedPlano.nome}
                          {billingType !== 'TRIAL' && <> · {ROTULO_CICLO[ciclo]}</>}
                        </p>
                        <p className="text-xs text-gray-500">
                          {billingType === 'TRIAL' ? '7 dias grátis, sem cartão' : COMPROMISSO_CICLO[ciclo]}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-bold text-gray-900">R$ {formatPrice(cobranca.mensal)}</p>
                        <p className="text-xs text-gray-500">/mês</p>
                      </div>
                    </div>
                    {/*
                      No compromisso, "total hoje" é o ciclo inteiro — 12x de uma vez
                      no anual. Deixar só o mensal aqui seria esconder o valor que
                      vai de fato aparecer na fatura.
                    */}
                    <div className="border-t border-gray-200 mt-3 pt-3 flex justify-between text-sm">
                      <span className="text-gray-500">
                        {billingType === 'TRIAL'
                          ? 'Total hoje'
                          : cobranca.meses > 1 ? `Total hoje (${cobranca.meses} meses)` : 'Total hoje'}
                      </span>
                      <span className="font-bold text-gray-900">
                        R$ {billingType === 'TRIAL' ? '0,00' : formatPrice(cobranca.total)}
                      </span>
                    </div>
                    {billingType === 'TRIAL' ? (
                      <p className="mt-1 text-xs text-gray-400">
                        Ao fim do teste você escolhe se quer assinar — nada é cobrado sozinho.
                      </p>
                    ) : cobranca.meses > 1 && (
                      <div className="mt-1 flex justify-between text-xs">
                        <span className="text-gray-400">Depois, a cada {cobranca.meses} meses</span>
                        <span className="text-gray-500">R$ {formatPrice(cobranca.total)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="bg-gray-50 rounded-xl p-4 border border-gray-100 mb-4 text-sm text-gray-500">
                    Escolha um plano para ver o resumo.
                  </p>
                )}

                {/*
                  Teste grátis e forma de pagamento são UMA escolha só: um botão de
                  ação, cujo texto acompanha o que foi marcado. Dois botões (um
                  para o teste, outro para assinar) dividiam o aceite dos termos
                  entre eles e um ficava desabilitado sem dizer por quê.
                */}
                <div role="radiogroup" aria-label="Forma de começar" className="space-y-3">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={billingType === 'TRIAL'}
                    onClick={() => setBillingType('TRIAL')}
                    className={`w-full rounded-xl border-2 p-3.5 text-left transition-all ${
                      billingType === 'TRIAL'
                        ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-900/20'
                        : 'border-gray-200 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl leading-none">🎁</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Testar grátis por 7 dias</p>
                        <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5 leading-relaxed">
                          Acesso completo ao plano{selectedPlano ? ` ${selectedPlano.nome}` : ''}, sem cartão e sem compromisso.
                        </p>
                      </div>
                      <span className={`mt-0.5 w-4 h-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                        billingType === 'TRIAL' ? 'border-emerald-500' : 'border-gray-300'
                      }`}>
                        {billingType === 'TRIAL' && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
                      </span>
                    </div>
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 border-t border-gray-200" />
                    <span className="text-xs text-gray-400">ou assine agora</span>
                    <div className="flex-1 border-t border-gray-200" />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_OPTIONS.map(opt => {
                      const ativo = billingType === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="radio"
                          aria-checked={ativo}
                          onClick={() => setBillingType(opt.value)}
                          className={`flex flex-col items-center gap-0.5 rounded-xl border-2 px-1.5 py-2.5 text-center transition-all ${
                            ativo ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <span className="text-xl leading-none">{opt.icon}</span>
                          <span className={`text-sm font-medium ${ativo ? 'text-primary-700' : 'text-gray-700'}`}>{opt.label}</span>
                          <span className="text-[11px] leading-tight text-gray-500">{opt.desc}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <label ref={termosRef} className="mt-4 flex items-start gap-2.5 text-left cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={aceiteTermos}
                    onChange={(e) => { setAceiteTermos(e.target.checked); if (e.target.checked) setErroTermos(false) }}
                    aria-invalid={erroTermos}
                    className={`mt-0.5 w-4 h-4 rounded text-primary-600 focus:ring-primary-500 shrink-0 ${
                      erroTermos ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  <span className="text-xs text-gray-600 leading-relaxed">
                    Li e aceito os{' '}
                    <a href="https://duofuturo.tech/termos.html" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline font-medium">Termos de Uso</a>
                    {' '}e a{' '}
                    <a href="https://duofuturo.tech/privacidade.html" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline font-medium">Política de Privacidade</a>,
                    e autorizo o tratamento dos meus dados conforme a LGPD.
                  </span>
                </label>
                {erroTermos && (
                  <p className="mt-1 ml-6 text-xs text-red-600">Marque para continuar.</p>
                )}

                {/*
                  Opt-in do WhatsApp. Desmarcado por padrão e separado do aceite
                  dos termos de propósito: são consentimentos diferentes, e juntar
                  os dois numa caixa só não é consentimento de nada.
                */}
                <label className="mt-3 flex items-start gap-2.5 text-left cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={optinWhatsapp}
                    onChange={(e) => setOptinWhatsapp(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 shrink-0"
                  />
                  <span className="text-xs text-gray-600 leading-relaxed">
                    Quero receber o material de boas-vindas <strong>também pelo WhatsApp</strong>,
                    no número que informei. O guia chega por e-mail de qualquer forma.
                  </span>
                </label>

                <Button type="submit" disabled={loading || !selectedPlano} variant="primary" className="w-full mt-4">
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Criando sua conta...</>
                    : ROTULO_ACAO[billingType]
                  }
                </Button>
                <p className="mt-2 text-center text-[11px] text-gray-400">
                  Você recebe por e-mail o guia de primeiros passos do seu plano.
                </p>
              </Secao>
            </aside>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">&copy; {new Date().getFullYear()} DuoFuturo</p>
        </form>
      )}
    </div>
  )
}
