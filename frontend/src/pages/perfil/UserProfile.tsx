import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Header } from '@/components/layout'
import { Card, Button, Input, Spinner, ImageUpload } from '@/components/ui'
import { User, Mail, Building, Shield, Lock, Save } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useUserPhoto } from '@/hooks/useUserPhoto'
import { authApi } from '@/api'

const profileSchema = z.object({
  nome: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().email('Email inválido'),
  empresa: z.string().optional(),
})

const passwordSchema = z.object({
  senhaAtual: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  novaSenha: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  confirmarSenha: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
}).refine((data) => data.novaSenha === data.confirmarSenha, {
  message: 'As senhas não coincidem',
  path: ['confirmarSenha'],
})

type ProfileFormData = z.infer<typeof profileSchema>
type PasswordFormData = z.infer<typeof passwordSchema>

export const UserProfile: React.FC = () => {
  const { user, updateUser } = useAuth()
  const { userPhoto, updateUserPhoto } = useUserPhoto()
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [_profileImage, setProfileImage] = useState<File | null>(null)
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(userPhoto)

  const empresaNome = user?.empresa?.nome || ''

  const {
    register: registerProfile,
    handleSubmit: handleSubmitProfile,
    formState: { errors: profileErrors },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      nome: user?.nome || '',
      email: user?.email || '',
      empresa: empresaNome,
    },
  })

  const {
    register: registerPassword,
    handleSubmit: handleSubmitPassword,
    formState: { errors: passwordErrors },
    reset: resetPassword,
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  })

  const onSubmitProfile = async (data: ProfileFormData) => {
    setIsUpdatingProfile(true)
    try {
      const updated = await authApi.updatePerfil({
        nome: data.nome,
        email: data.email,
        foto_perfil: profileImagePreview,
      })
      updateUser({ nome: updated.nome, email: updated.email })
      updateUserPhoto(profileImagePreview)
      toast.success('Perfil atualizado com sucesso!')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao atualizar perfil')
    } finally {
      setIsUpdatingProfile(false)
    }
  }

  const handleImageChange = (file: File | null, preview: string | null) => {
    setProfileImage(file)
    setProfileImagePreview(preview)
  }

  const onSubmitPassword = async (data: PasswordFormData) => {
    setIsUpdatingPassword(true)
    try {
      await authApi.updateSenha({ senhaAtual: data.senhaAtual, novaSenha: data.novaSenha })
      toast.success('Senha alterada com sucesso!')
      resetPassword()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao alterar senha. Verifique sua senha atual.')
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  const getNivelLabel = (nivel?: string) => {
    if ((user as any)?.tipo_usuario === 'master') return 'Master'
    const labels: Record<string, string> = {
      super_admin: 'Super Administrador',
      admin_empresa: 'Administrador da Empresa',
      admin: 'Administrador',
      master: 'Master',
      usuario: 'Usuário',
    }
    return labels[nivel || ''] || nivel || '-'
  }

  return (
    <div>
      <Header
        title="Meu Perfil"
        subtitle="Gerencie suas informações pessoais"
        tourId="perfil"
      />

      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
        {/* Informações Básicas */}
        <Card data-tour="perfil-info">
          <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-primary-100 flex items-center justify-center border-4 border-white shadow-lg">
              {profileImagePreview ? (
                <img
                  src={profileImagePreview}
                  alt={user?.nome}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-2xl font-bold text-primary-600">
                  {user?.nome?.substring(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="text-center sm:text-left">
              <h2 className="text-xl font-bold text-gray-900">{user?.nome}</h2>
              <p className="text-sm text-gray-500">{user?.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Building className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Empresa</p>
                <p className="text-sm font-medium text-gray-900">{empresaNome || '-'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Nível de Acesso</p>
                <p className="text-sm font-medium text-gray-900">{getNivelLabel(user?.nivel)}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Editar Perfil */}
        <Card title="Editar Informações" data-tour="perfil-editar">
          <form onSubmit={handleSubmitProfile(onSubmitProfile)} className="space-y-6">
            {/* Upload de Foto */}
            <ImageUpload
              currentImage={profileImagePreview || undefined}
              onImageChange={handleImageChange}
              label="Foto de Perfil"
              maxSize={5}
            />

            <div className="border-t border-gray-200 pt-6" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nome Completo"
                type="text"
                placeholder="Seu nome"
                error={profileErrors.nome?.message}
                icon={<User className="w-5 h-5" />}
                {...registerProfile('nome')}
              />

              <Input
                label="Email"
                type="email"
                placeholder="seu@email.com"
                error={profileErrors.email?.message}
                icon={<Mail className="w-5 h-5" />}
                {...registerProfile('email')}
              />
            </div>

            <Input
              label="Empresa"
              type="text"
              placeholder="Nome da empresa"
              error={profileErrors.empresa?.message}
              icon={<Building className="w-5 h-5" />}
              {...registerProfile('empresa')}
            />

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                disabled={isUpdatingProfile}
              >
                {isUpdatingProfile ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Salvar Alterações
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>

        {/* Alterar Senha */}
        <Card title="Alterar Senha">
          <form onSubmit={handleSubmitPassword(onSubmitPassword)} className="space-y-4">
            <Input
              label="Senha Atual"
              type="password"
              placeholder="••••••••"
              error={passwordErrors.senhaAtual?.message}
              icon={<Lock className="w-5 h-5" />}
              {...registerPassword('senhaAtual')}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nova Senha"
                type="password"
                placeholder="••••••••"
                error={passwordErrors.novaSenha?.message}
                icon={<Lock className="w-5 h-5" />}
                {...registerPassword('novaSenha')}
              />

              <Input
                label="Confirmar Nova Senha"
                type="password"
                placeholder="••••••••"
                error={passwordErrors.confirmarSenha?.message}
                icon={<Lock className="w-5 h-5" />}
                {...registerPassword('confirmarSenha')}
              />
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                disabled={isUpdatingPassword}
              >
                {isUpdatingPassword ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Alterando...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 mr-2" />
                    Alterar Senha
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>

        {/* Informações Adicionais */}
        <Card title="Informações da Conta">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-600">ID do Usuário</span>
              <span className="font-medium text-gray-900">
                #{(user as any)?.userId || (user as any)?.id || '-'}
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-gray-600">Status da Conta</span>
              <span className="font-medium text-green-600">Ativa</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
