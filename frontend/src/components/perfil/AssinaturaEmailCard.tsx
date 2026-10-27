import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { PenLine, RotateCcw } from 'lucide-react'
import { Card, Button, Spinner } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { authApi } from '@/api'
import { gerarAssinaturaPadrao } from '@/utils/assinaturaEmail'

/**
 * Assinatura de e-mail do usuário (cada um tem a sua). Morava em Meu perfil; desde
 * 23/10/2026 fica em Configurações de E-mail, junto da agenda externa (pedido do dono).
 */
export const AssinaturaEmailCard: React.FC = () => {
  const { user, updateUser } = useAuth()
  const empresaNome = user?.empresa?.nome || ''

  const assinaturaPadrao = useMemo(
    () => gerarAssinaturaPadrao({
      nomeUsuario: user?.nome,
      emailUsuario: user?.email,
      empresa: user?.empresa,
    }),
    [user?.nome, user?.email, user?.empresa]
  )
  const [assinatura, setAssinatura] = useState<string>(user?.assinatura_email || assinaturaPadrao)
  const [assinaturaTocada, setAssinaturaTocada] = useState(false)
  const [isUpdatingAssinatura, setIsUpdatingAssinatura] = useState(false)

  // O user do contexto chega do localStorage e só depois é revalidado pelo /auth/me;
  // enquanto o usuário não editar nada, acompanha o valor que vier do servidor.
  useEffect(() => {
    if (assinaturaTocada) return
    setAssinatura(user?.assinatura_email || assinaturaPadrao)
  }, [user?.assinatura_email, assinaturaPadrao, assinaturaTocada])

  const onSalvarAssinatura = async () => {
    setIsUpdatingAssinatura(true)
    try {
      const updated = await authApi.updatePerfil({ assinatura_email: assinatura })
      updateUser({ assinatura_email: (updated as any).assinatura_email ?? null })
      setAssinaturaTocada(false)
      toast.success('Assinatura de e-mail salva!')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Erro ao salvar assinatura')
    } finally {
      setIsUpdatingAssinatura(false)
    }
  }

  return (
    <Card title="Assinatura de E-mail" data-tour="perfil-assinatura">
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Anexada ao final dos e-mails que você envia pelo CRM. É <strong>sua</strong> — cada usuário
          tem a sua própria. Deixe em branco e salve para voltar ao padrão gerado com os dados de{' '}
          <strong>{empresaNome || 'sua empresa'}</strong>.
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            HTML da assinatura
          </label>
          <textarea
            value={assinatura}
            onChange={(e) => { setAssinatura(e.target.value); setAssinaturaTocada(true) }}
            rows={12}
            spellCheck={false}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-mono text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Cole aqui o HTML da sua assinatura"
          />
        </div>

        {assinatura.trim() && (
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Preview:</p>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white overflow-x-auto">
              <div dangerouslySetInnerHTML={{ __html: assinatura }} />
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => { setAssinatura(assinaturaPadrao); setAssinaturaTocada(true) }}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Usar padrão da empresa
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onSalvarAssinatura}
            disabled={isUpdatingAssinatura}
          >
            {isUpdatingAssinatura ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Salvando...
              </>
            ) : (
              <>
                <PenLine className="w-4 h-4 mr-2" />
                Salvar Assinatura
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  )
}
