import React, { useState, useEffect } from 'react'
import { Mail, Save, TestTube, Trash2, CheckCircle, Info } from 'lucide-react'
import { TourHelpButton } from '@/components/tour/TourHelpButton'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { configuracoesSmtpApi, SmtpConfig } from '@/api/configuracoes-smtp'
import toast from 'react-hot-toast'

const BREVO_GUIDE = [
  {
    step: 1,
    title: 'Crie uma conta gratuita no Brevo',
    desc: 'Acesse brevo.com e crie sua conta. O plano gratuito permite até 300 e-mails/dia.',
  },
  {
    step: 2,
    title: 'Vá em Configurações → Chaves de API SMTP',
    desc: 'No menu superior, clique em seu nome → Configurações SMTP & API → aba "SMTP".',
  },
  {
    step: 3,
    title: 'Copie as credenciais SMTP',
    desc: 'Copie o "Login" (smtp_user) e gere/copie a "Senha Master SMTP" ou chave de API.',
  },
  {
    step: 4,
    title: 'Configure o remetente verificado',
    desc: 'Em Remetentes, adicione e verifique o e-mail que aparecerá como remetente (email_from).',
  },
]

const DEFAULT_CONFIG: Partial<SmtpConfig> = {
  smtp_host: 'smtp-relay.brevo.com',
  smtp_port: 587,
  smtp_user: '',
  smtp_pass: '',
  email_from: '',
  email_from_name: 'Cobrança',
  ativo: true,
}

export const EmailConfig: React.FC = () => {
  const [config, setConfig] = useState<Partial<SmtpConfig>>(DEFAULT_CONFIG)
  const [hasExisting, setHasExisting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const data = await configuracoesSmtpApi.get()
      if (data) {
        setConfig({ ...data, smtp_pass: '' }) // never pre-fill password
        setHasExisting(true)
      } else {
        setShowGuide(true)
      }
    } catch {
      // silently fail — form will show default
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!config.smtp_user || !config.email_from) {
      toast.error('Preencha ao menos o usuário SMTP e o e-mail remetente.')
      return
    }
    if (!hasExisting && !config.smtp_pass) {
      toast.error('A senha SMTP é obrigatória no primeiro cadastro.')
      return
    }
    setSaving(true)
    try {
      const saved = await configuracoesSmtpApi.save(config)
      setConfig({ ...saved, smtp_pass: '' })
      setHasExisting(true)
      toast.success('Configurações salvas com sucesso!')
    } catch {
      // error shown by axios interceptor
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!testEmail) {
      toast.error('Informe o e-mail de destino para o teste.')
      return
    }
    setTesting(true)
    try {
      const result = await configuracoesSmtpApi.testar(testEmail)
      toast.success(result.message)
    } catch {
      // error shown by axios interceptor
    } finally {
      setTesting(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja remover a configuração de e-mail desta empresa?')) return
    try {
      await configuracoesSmtpApi.delete()
      setConfig(DEFAULT_CONFIG)
      setHasExisting(false)
      setShowGuide(true)
      toast.success('Configuração removida.')
    } catch {
      // error shown by axios interceptor
    }
  }

  const field = (key: keyof SmtpConfig) => (
    (config[key] as string | number | boolean | undefined) ?? ''
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between ml-10 md:ml-0">
        <div className="flex items-center gap-3">
          <Mail className="w-6 h-6 text-primary-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Configuração de E-mail</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Configure suas credenciais SMTP (Brevo) para enviar cobranças por e-mail.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <TourHelpButton tourId="config-email" />
          <button
            onClick={() => setShowGuide(v => !v)}
            className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:underline"
          >
            <Info className="w-4 h-4" />
            {showGuide ? 'Ocultar' : 'Ver'} guia Brevo
          </button>
        </div>
      </div>

      {/* Brevo setup guide */}
      {showGuide && (
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40">
          <div className="p-5">
            <h2 className="font-semibold text-blue-800 dark:text-blue-300 mb-4">
              📧 Como criar sua conta Brevo e obter as credenciais SMTP
            </h2>
            <div className="space-y-4">
              {BREVO_GUIDE.map(({ step, title, desc }) => (
                <div key={step} className="flex gap-4">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
                    {step}
                  </div>
                  <div>
                    <p className="font-medium text-blue-900 dark:text-blue-200">{title}</p>
                    <p className="text-sm text-blue-700 dark:text-blue-400">{desc}</p>
                  </div>
                </div>
              ))}
              <div className="mt-4 p-3 bg-blue-100 dark:bg-blue-900/50 rounded-lg text-sm text-blue-800 dark:text-blue-300">
                <strong>Dados Brevo padrão:</strong> Host: <code>smtp-relay.brevo.com</code> · Porta: <code>587</code> · Criptografia: STARTTLS
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Status badge */}
      {hasExisting && config.testado_em && (
        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
          <CheckCircle className="w-4 h-4" />
          Último teste bem-sucedido: {new Date(config.testado_em).toLocaleString('pt-BR')}
        </div>
      )}

      {/* Form */}
      <Card data-tour="email-credenciais">
        <div className="p-6 space-y-5">
          <h2 className="font-semibold text-gray-800 dark:text-gray-200">Credenciais SMTP</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Host SMTP
              </label>
              <Input
                value={field('smtp_host') as string}
                onChange={e => setConfig(c => ({ ...c, smtp_host: e.target.value }))}
                placeholder="smtp-relay.brevo.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Porta
              </label>
              <Input
                type="number"
                value={field('smtp_port') as number}
                onChange={e => setConfig(c => ({ ...c, smtp_port: Number(e.target.value) }))}
                placeholder="587"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Usuário SMTP (login Brevo)
              </label>
              <Input
                value={field('smtp_user') as string}
                onChange={e => setConfig(c => ({ ...c, smtp_user: e.target.value }))}
                placeholder="seu@email.brevo.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Senha SMTP
                {hasExisting && (
                  <span className="ml-2 text-xs text-gray-400">(deixe em branco para manter a atual)</span>
                )}
              </label>
              <Input
                type="password"
                value={field('smtp_pass') as string}
                onChange={e => setConfig(c => ({ ...c, smtp_pass: e.target.value }))}
                placeholder={hasExisting ? '••••••••' : 'Chave SMTP do Brevo'}
              />
            </div>
          </div>

          <h2 className="font-semibold text-gray-800 dark:text-gray-200 pt-2">Remetente</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                E-mail remetente
              </label>
              <Input
                type="email"
                value={field('email_from') as string}
                onChange={e => setConfig(c => ({ ...c, email_from: e.target.value }))}
                placeholder="cobranca@suaempresa.com"
              />
              <p className="text-xs text-gray-400 mt-1">Deve estar verificado no Brevo.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nome remetente
              </label>
              <Input
                value={field('email_from_name') as string}
                onChange={e => setConfig(c => ({ ...c, email_from_name: e.target.value }))}
                placeholder="Cobrança"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="smtp-ativo"
              type="checkbox"
              checked={!!config.ativo}
              onChange={e => setConfig(c => ({ ...c, ativo: e.target.checked }))}
              className="rounded border-gray-300 text-primary-600"
            />
            <label htmlFor="smtp-ativo" className="text-sm text-gray-700 dark:text-gray-300">
              Configuração ativa (usar estas credenciais nos envios)
            </label>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2">
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Salvar configurações'}
            </Button>
            {hasExisting && (
              <Button
                variant="secondary"
                onClick={handleDelete}
                className="flex items-center gap-2 text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-950"
              >
                <Trash2 className="w-4 h-4" />
                Remover
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Test section */}
      {hasExisting && (
        <Card data-tour="email-teste">
          <div className="p-6 space-y-4">
            <h2 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <TestTube className="w-5 h-5 text-primary-600" />
              Enviar e-mail de teste
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Verifique se as configurações estão corretas enviando um e-mail de teste.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                type="email"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                placeholder="seuemail@exemplo.com"
                className="flex-1"
              />
              <Button onClick={handleTest} disabled={testing} className="flex items-center gap-2">
                <TestTube className="w-4 h-4" />
                {testing ? 'Enviando...' : 'Enviar teste'}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
