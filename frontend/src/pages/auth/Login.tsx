import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/contexts/AuthContext'
import { loginSchema } from '@/utils/validators'
import { Button, Input } from '@/components/ui'
import type { LoginRequest } from '@/types'

// Cena "O Escritório da DuoFuturo" (Lena + o Duo escondido atrás da poltrona).
// Arte em instituto_ser/duofuturo/avatar/propostas/ — aqui entra só a cópia servida.
// O recorte é feito pelo viewBox + preserveAspectRatio (ver o bloco da cena).
// ?v= e cache-busting: o SVG tem nome fixo e o nginx nao manda Cache-Control
// para /gestao/avatar/, entao sem isso o navegador reusa a cena antiga.
// Suba o numero sempre que a arte for republicada.
const CENA = '/gestao/avatar/cena-login.svg?v=8'

export const Login: React.FC = () => {
  const navigate = useNavigate()
  const { login, isLoading } = useAuth()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginRequest) => {
    try {
      await login(data)
      navigate('/dashboard')
    } catch (error) {
      // Erro já tratado no AuthContext
    }
  }

  return (
    /*
      `lg:h-screen`, não só `min-h-screen`. O SVG da cena tem proporção própria
      (557×706) e `h-full` só resolve contra altura DEFINIDA: com a linha do grid
      em `auto`, ele caía na proporção intrínseca e esticava a página — 1246px de
      conteúdo numa janela de 830, criando barra de rolagem e cortando a cena.
      Com altura fixa a partir de `lg`, o `slice` faz o recorte e nada rola.
      Abaixo de `lg` a cena não existe, então segue `min-h-screen` e a página
      cresce se precisar.

      Modo escuro: as classes com prefixo de breakpoint (`lg:bg-white`) NAO sao
      alcancadas pelo override global `html.dark .bg-white` do index.css — ele
      casa a classe `bg-white` literal. Sem `dark:lg:bg-gray-900` a coluna do
      formulario ficava BRANCA no escuro, com o cartao (esse sim `bg-white`)
      virando um retangulo cinza flutuando nela. O mesmo vale para as paradas
      do gradiente do mobile: `from-*`/`to-*` nao tem override nenhum.
    */
    <div className="min-h-screen lg:h-screen lg:overflow-hidden grid lg:grid-cols-[1fr_1.05fr] bg-gradient-to-br from-primary-50 to-primary-100 dark:from-gray-900 dark:to-gray-950 lg:bg-none lg:bg-white dark:lg:bg-gray-900">
      {/* Janela curta demais para o formulário: rola a COLUNA, não a página —
          assim a cena ao lado continua inteira no lugar. */}
      <div className="flex items-center justify-center p-4 sm:p-6 lg:overflow-y-auto">
        {/* A partir de `lg` o cartao nao tem moldura: e o proprio fundo da coluna.
            O fundo e declarado com `max-lg:` (so abaixo de lg) DE PROPOSITO: a
            classe literal `bg-white` seria capturada pelo override global
            `html.dark .bg-white` do index.css, que tem especificidade (0,2,1) e
            ganha de qualquer `dark:lg:bg-transparent` — o cartao voltava a ser
            um retangulo cinza no meio da coluna escura. Sem a classe literal,
            o override simplesmente nao casa. */}
        <div className="max-w-md w-full space-y-6 sm:space-y-8 p-6 sm:p-8 lg:p-0 max-lg:bg-white dark:max-lg:bg-gray-800 dark:max-lg:border dark:max-lg:border-gray-700 rounded-xl shadow-lg lg:shadow-none">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl font-bold text-primary-700 dark:text-white mb-2">
              Duo<span className="text-gold-700 dark:text-gold-300">Futuro</span>
            </h1>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300">Sistema de Gestão Financeira</p>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">Plataforma de Mentoria e Coaching</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-6">
            <div className="space-y-4">
              <Input
                label="Email"
                type="email"
                placeholder="seu@email.com"
                error={errors.email?.message}
                {...register('email')}
              />

              <Input
                label="Senha"
                type="password"
                placeholder="••••••••"
                error={errors.senha?.message}
                {...register('senha')}
              />
              <div className="text-right -mt-2">
                <Link to="/esqueci-senha" className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-200 dark:hover:text-white font-medium">
                  Esqueci minha senha
                </Link>
              </div>
            </div>

            {/* No escuro o navy-600 quase some no fundo gray-900 — sobe um tom. */}
            <Button
              type="submit"
              variant="primary"
              className="w-full dark:bg-primary-500 dark:hover:bg-primary-400"
              isLoading={isLoading}
            >
              Entrar
            </Button>
          </form>

          <div className="text-center text-sm text-gray-500 dark:text-gray-400 space-y-1">
            <p>
              Não tem uma conta?{' '}
              <a href="/gestao/register" className="text-primary-600 hover:text-primary-700 dark:text-primary-200 dark:hover:text-white font-medium">
                Criar conta
              </a>
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">&copy; {new Date().getFullYear()} DuoFuturo</p>
          </div>
        </div>
      </div>

      {/* Decoração pura: sai no celular para o botão Entrar não cair abaixo da dobra */}
      <div className="hidden lg:block relative overflow-hidden bg-[#F1E9DA] dark:bg-[#0b1220]">
        {/*
          Cena INTEIRA (0 0 1000 740) e ancorada no centro. A faixa vertical
          antiga (`205 16 557 706` + `YMax`) é bem mais retrato que a coluna:
          o `slice` cortava em cima e decepava a cabeça da Lena em qualquer
          janela baixa. Com a cena inteira a proporção fica perto da coluna,
          então sobra pouco para cortar — e o que sai é parede, nunca gente.
        */}
        {/* A cena e clara (parede creme) e no escuro ela vira um farol ao lado do
            formulario. Em vez de trocar a arte, ela e rebaixada por filtro e
            recebe um veu navy que costura a emenda com a coluna do formulario. */}
        <svg
          viewBox="0 0 1000 740"
          preserveAspectRatio="xMidYMid slice"
          className="w-full h-full dark:brightness-[0.62] dark:saturate-[0.8] dark:contrast-[1.05]"
          aria-hidden="true"
        >
          <image href={CENA} width="1000" height="740" />
        </svg>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden dark:block bg-gradient-to-r from-gray-900 via-gray-900/30 to-transparent"
        />
      </div>
    </div>
  )
}
