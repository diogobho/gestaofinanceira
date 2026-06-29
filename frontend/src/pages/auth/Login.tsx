import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/contexts/AuthContext'
import { loginSchema } from '@/utils/validators'
import { Button, Input } from '@/components/ui'
import type { LoginRequest } from '@/types'

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 p-4">
      <div className="max-w-md w-full space-y-6 sm:space-y-8 p-6 sm:p-8 bg-white rounded-xl shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-primary-600 mb-2">DuoFuturo</h1>
          <p className="text-sm sm:text-base text-gray-600">Sistema de Gestão Financeira</p>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Plataforma de Mentoria e Coaching</p>
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
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            isLoading={isLoading}
          >
            Entrar
          </Button>
        </form>

        <div className="text-center text-sm text-gray-500 space-y-1">
          <p>
            Não tem uma conta?{' '}
            <a href="/gestao/register" className="text-primary-600 hover:text-primary-700 font-medium">
              Criar conta
            </a>
          </p>
          <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} DuoFuturo</p>
        </div>
      </div>
    </div>
  )
}
