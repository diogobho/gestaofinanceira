import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Mail, Lock, CheckCircle2, AlertTriangle } from 'lucide-react'
import { authApi } from '@/api/auth'
import { Button, Input } from '@/components/ui'

/*
  Esqueci minha senha (migration 087). Duas telas soltas, fora do Layout, como o
  login: pedir o link e criar a senha nova. O fundo segue o do login no celular.

  O cartão usa `bg-[#fff]` e não `bg-white`: a classe literal seria
  repintada pelo override global `html.dark .bg-white` do index.css, que ganha de
  qualquer `dark:` (ver CLAUDE.md, "Modo escuro").
*/
const Moldura: React.FC<{ titulo: string; subtitulo?: string; children: React.ReactNode }> = ({ titulo, subtitulo, children }) => (
  <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-primary-50 to-primary-100 dark:from-gray-900 dark:to-gray-950">
    <div className="max-w-md w-full p-6 sm:p-8 bg-[#fff] dark:bg-gray-800 dark:border dark:border-gray-700 rounded-xl shadow-lg space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-primary-700 dark:text-white mb-4">
          Duo<span className="text-gold-700 dark:text-gold-300">Futuro</span>
        </h1>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{titulo}</h2>
        {subtitulo && <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{subtitulo}</p>}
      </div>
      {children}
      <p className="text-center text-sm">
        <Link to="/login" className="text-primary-600 hover:text-primary-700 dark:text-primary-200 dark:hover:text-white font-medium">
          Voltar para o login
        </Link>
      </p>
    </div>
  </div>
)

const mensagemDe = (e: unknown, padrao: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || padrao

export const EsqueciSenha: React.FC = () => {
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resposta, setResposta] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErro('Digite o e-mail que você usa para entrar.')
      return
    }
    setErro(null)
    setEnviando(true)
    try {
      const r = await authApi.esqueciSenha(email.trim())
      setResposta(r.message)
    } catch (e) {
      setErro(mensagemDe(e, 'Não conseguimos enviar agora. Tente de novo em instantes.'))
    } finally {
      setEnviando(false)
    }
  }

  if (resposta) {
    return (
      <Moldura titulo="Confira o seu e-mail">
        <div className="flex gap-3 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 text-sm">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <p>{resposta}</p>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          O link vale por 1 hora. Não chegou? Espere alguns minutos e{' '}
          <button type="button" onClick={() => setResposta(null)} className="text-primary-600 dark:text-primary-200 font-medium underline">
            peça de novo
          </button>
          .
        </p>
      </Moldura>
    )
  }

  return (
    <Moldura titulo="Esqueci minha senha" subtitulo="Digite o e-mail da sua conta e mandamos um link para você criar uma senha nova.">
      <form onSubmit={enviar} className="space-y-6" noValidate>
        <Input
          label="E-mail"
          type="email"
          autoComplete="email"
          autoFocus
          placeholder="seu@email.com"
          icon={<Mail className="w-4 h-4" />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={erro || undefined}
        />
        <Button type="submit" variant="primary" className="w-full dark:bg-primary-500 dark:hover:bg-primary-400" isLoading={enviando}>
          Enviar link
        </Button>
      </form>
    </Moldura>
  )
}

export const RedefinirSenha: React.FC = () => {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [estado, setEstado] = useState<'conferindo' | 'valido' | 'invalido' | 'pronto'>('conferindo')
  const [emailMascarado, setEmailMascarado] = useState<string>('')
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!token) { setEstado('invalido'); return }
    authApi.conferirLinkSenha(token)
      .then((r) => { setEmailMascarado(r.email || ''); setEstado(r.valido ? 'valido' : 'invalido') })
      .catch(() => setEstado('invalido'))
  }, [token])

  const salvar = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (senha.length < 8) { setErro('A senha precisa ter no mínimo 8 caracteres.'); return }
    if (senha !== confirma) { setErro('As duas senhas não são iguais.'); return }
    setErro(null)
    setSalvando(true)
    try {
      await authApi.redefinirSenha(token, senha)
      setEstado('pronto')
    } catch (e) {
      setErro(mensagemDe(e, 'Não conseguimos salvar agora. Tente de novo.'))
    } finally {
      setSalvando(false)
    }
  }

  if (estado === 'conferindo') {
    return <Moldura titulo="Conferindo o link…"><div className="h-10" /></Moldura>
  }

  if (estado === 'invalido') {
    return (
      <Moldura titulo="Este link não vale mais">
        <div className="flex gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <p>Ele já foi usado, passou de 1 hora, ou um link mais novo foi pedido depois dele. É só pedir outro.</p>
        </div>
        <Button variant="primary" className="w-full dark:bg-primary-500 dark:hover:bg-primary-400" onClick={() => navigate('/esqueci-senha')}>
          Pedir um link novo
        </Button>
      </Moldura>
    )
  }

  if (estado === 'pronto') {
    return (
      <Moldura titulo="Senha criada">
        <div className="flex gap-3 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 text-sm">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <p>Pronto! A sua senha nova já vale. Entre com ela no login.</p>
        </div>
        <Button variant="primary" className="w-full dark:bg-primary-500 dark:hover:bg-primary-400" onClick={() => navigate('/login')}>
          Ir para o login
        </Button>
      </Moldura>
    )
  }

  return (
    <Moldura titulo="Criar senha nova" subtitulo={emailMascarado ? `Conta ${emailMascarado}` : undefined}>
      <form onSubmit={salvar} className="space-y-4" noValidate>
        <Input
          label="Senha nova"
          type="password"
          autoComplete="new-password"
          autoFocus
          placeholder="Mínimo de 8 caracteres"
          icon={<Lock className="w-4 h-4" />}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
        <Input
          label="Repita a senha nova"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          icon={<Lock className="w-4 h-4" />}
          value={confirma}
          onChange={(e) => setConfirma(e.target.value)}
          error={erro || undefined}
        />
        <Button type="submit" variant="primary" className="w-full mt-2 dark:bg-primary-500 dark:hover:bg-primary-400" isLoading={salvando}>
          Salvar senha nova
        </Button>
      </form>
    </Moldura>
  )
}
