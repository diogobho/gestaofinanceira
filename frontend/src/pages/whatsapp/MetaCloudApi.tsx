import React, { useCallback, useEffect, useState } from 'react'
import {
  Cloud, Send, CheckCircle, XCircle, RefreshCw, FileText, Plus, AlertCircle,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import {
  metaWhatsappApi, MetaStatus, MetaTemplate, NovoTemplate,
} from '@/api/metaWhatsapp'

/**
 * Painel da API oficial do WhatsApp (Meta Cloud API).
 *
 * Existe por dois motivos, nesta ordem:
 *
 * 1. É a evidência de App Review. A Meta pede um vídeo mostrando "seu app
 *    enviando a mensagem" (`whatsapp_business_messaging`) e outro criando um
 *    modelo (`whatsapp_business_management`) — nenhuma tela do sistema chamava o
 *    Cloud API, então não havia o que gravar.
 * 2. É o banco de provas da migração Baileys → Cloud API, que não passa por
 *    QR Code nenhum: aqui o número vive no servidor da Meta e o que temos é um
 *    token.
 *
 * NÃO se conecta ao motor do CRM de propósito: o número e o token são os da
 * DuoFuturo, não os de uma empresa cliente. Quando a integração virar produto,
 * a credencial passa a ser por empresa (Embedded Signup) e este painel some.
 */

const cor = (q?: string) =>
  q === 'GREEN' ? 'text-emerald-600 dark:text-emerald-400'
  : q === 'YELLOW' ? 'text-amber-600 dark:text-amber-400'
  : q === 'RED' ? 'text-red-600 dark:text-red-400'
  : 'text-gray-500 dark:text-gray-400'

const corStatusTemplate = (s: string) =>
  s === 'APPROVED' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
  : s === 'REJECTED' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'

const Linha: React.FC<{ rotulo: string; children: React.ReactNode }> = ({ rotulo, children }) => (
  <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
    <span className="text-sm text-gray-500 dark:text-gray-400">{rotulo}</span>
    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 text-right">{children}</span>
  </div>
)

export const MetaCloudApi: React.FC = () => {
  const { user } = useAuth()
  // Quem barra de verdade e o backend (super_admin ou META_PAINEL_REVISORES).
  const temAcesso = user?.nivel === 'super_admin' || user?.acesso_cloud_api === true

  const [status, setStatus] = useState<MetaStatus | null>(null)
  const [carregando, setCarregando] = useState(true)

  // Envio
  const [numero, setNumero] = useState('')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [envio, setEnvio] = useState<{ ok: boolean; msg: string } | null>(null)

  // Modelos
  const [templates, setTemplates] = useState<MetaTemplate[]>([])
  const [erroTemplates, setErroTemplates] = useState<string | null>(null)
  const [carregandoTemplates, setCarregandoTemplates] = useState(false)
  const [novo, setNovo] = useState<NovoTemplate>({
    nome: '', categoria: 'UTILITY', idioma: 'pt_BR', corpo: '', exemplos: [],
  })
  const [criando, setCriando] = useState(false)
  const [criacao, setCriacao] = useState<{ ok: boolean; msg: string } | null>(null)

  const carregarStatus = useCallback(async () => {
    setCarregando(true)
    try {
      setStatus(await metaWhatsappApi.getStatus())
    } finally {
      setCarregando(false)
    }
  }, [])

  const carregarTemplates = useCallback(async () => {
    setCarregandoTemplates(true)
    setErroTemplates(null)
    try {
      setTemplates(await metaWhatsappApi.getTemplates())
    } catch (err: any) {
      setErroTemplates(err?.response?.data?.message || err.message)
    } finally {
      setCarregandoTemplates(false)
    }
  }, [])

  useEffect(() => {
    if (!temAcesso) return
    carregarStatus()
    carregarTemplates()
  }, [temAcesso, carregarStatus, carregarTemplates])

  // Um texto diferente a cada abertura: no vídeo é ele que prova que a mensagem
  // que chegou no celular é a que acabou de sair daqui.
  useEffect(() => {
    const agora = new Date()
    const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setTexto(`Mensagem de teste enviada pelo DuoFuturo CRM as ${hora}.`)
  }, [])

  // A quantidade de exemplos precisa acompanhar as variáveis do corpo — a Meta
  // recusa o modelo se sobrar ou faltar um.
  const variaveis = new Set((novo.corpo.match(/\{\{\s*\d+\s*\}\}/g) ?? []).map((v) => v.replace(/\D/g, '')))
  const qtdVariaveis = variaveis.size

  const enviar = async () => {
    setEnviando(true)
    setEnvio(null)
    try {
      const r = await metaWhatsappApi.enviarTexto(numero, texto)
      setEnvio({
        ok: true,
        msg: `Aceita pela Meta para ${r.destino ?? numero}. ID da mensagem: ${r.messageId ?? '—'}`,
      })
    } catch (err: any) {
      setEnvio({ ok: false, msg: err?.response?.data?.message || err.message })
    } finally {
      setEnviando(false)
    }
  }

  const criar = async () => {
    setCriando(true)
    setCriacao(null)
    try {
      const r = await metaWhatsappApi.criarTemplate({
        ...novo,
        exemplos: novo.exemplos.slice(0, qtdVariaveis),
      })
      setCriacao({
        ok: true,
        msg: `Modelo "${novo.nome}" criado. ID ${r.id ?? '—'} — status ${r.status ?? 'PENDING'}.`,
      })
      setNovo({ nome: '', categoria: 'UTILITY', idioma: 'pt_BR', corpo: '', exemplos: [] })
      carregarTemplates()
    } catch (err: any) {
      setCriacao({ ok: false, msg: err?.response?.data?.message || err.message })
    } finally {
      setCriando(false)
    }
  }

  if (!temAcesso) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Card className="text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Acesso restrito</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Este painel opera a conta oficial da DuoFuturo na Meta e e visivel apenas para a
            administracao da plataforma.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 sm:px-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Cloud className="w-8 h-8 text-blue-600" />
            WhatsApp Cloud API
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            API oficial da Meta — envio de mensagens e gestao de modelos.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={carregarStatus} className="flex items-center gap-2 shrink-0">
          <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* ── Situação da conexão ─────────────────────────────── */}
      <Card title="Conexao">
        {carregando ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : !status?.config.configurado ? (
          <div className="flex gap-3">
            <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-gray-900 dark:text-gray-100 font-medium">Credenciais incompletas</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Faltam no <code>api/.env</code>: {status?.config.faltando.join(', ')}
              </p>
            </div>
          </div>
        ) : status.erro ? (
          <div className="flex gap-3">
            <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-gray-900 dark:text-gray-100 font-medium">A Meta recusou a consulta</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{status.erro}</p>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              <span className="font-medium text-gray-900 dark:text-gray-100">Conectado</span>
            </div>
            <Linha rotulo="Numero">{status.numero?.display_phone_number}</Linha>
            <Linha rotulo="Nome verificado">{status.numero?.verified_name}</Linha>
            <Linha rotulo="Qualidade">
              <span className={cor(status.numero?.quality_rating)}>{status.numero?.quality_rating ?? '—'}</span>
            </Linha>
            <Linha rotulo="Verificacao">{status.numero?.code_verification_status ?? '—'}</Linha>
            <Linha rotulo="Capacidade de envio">{status.numero?.throughput?.level ?? '—'}</Linha>
            <Linha rotulo="Conta (WABA)">
              <code className="text-xs">{status.config.wabaId}</code>
            </Linha>
          </div>
        )}
      </Card>

      {/* ── Envio (whatsapp_business_messaging) ─────────────── */}
      <Card title="Enviar mensagem">
        <div className="space-y-4">
          <Input
            label="Numero de destino (DDD, ou + e DDI fora do Brasil)"
            placeholder="11940524435 ou +15551234567"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
          />
          <Textarea
            label="Mensagem"
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <Button onClick={enviar} disabled={enviando || !numero.trim() || !texto.trim()} className="flex items-center gap-2">
              {enviando ? <Spinner size="sm" /> : <Send className="w-4 h-4" />}
              Enviar pelo WhatsApp
            </Button>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Texto livre so chega dentro de 24h da ultima resposta do contato.
            </p>
          </div>

          {envio && (
            <div className={`flex gap-3 rounded-lg p-3 ${envio.ok
              ? 'bg-emerald-50 dark:bg-emerald-900/20'
              : 'bg-red-50 dark:bg-red-900/20'}`}>
              {envio.ok
                ? <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                : <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />}
              <p className={`text-sm ${envio.ok
                ? 'text-emerald-800 dark:text-emerald-300'
                : 'text-red-800 dark:text-red-300'}`}>{envio.msg}</p>
            </div>
          )}
        </div>
      </Card>

      {/* ── Modelos (whatsapp_business_management) ──────────── */}
      <Card
        title="Modelos de mensagem"
        action={
          <Button variant="outline" size="sm" onClick={carregarTemplates} className="flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${carregandoTemplates ? 'animate-spin' : ''}`} />
            Recarregar
          </Button>
        }
      >
        {erroTemplates ? (
          <div className="flex gap-3 rounded-lg bg-red-50 dark:bg-red-900/20 p-3 mb-4">
            <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-800 dark:text-red-300">{erroTemplates}</p>
          </div>
        ) : carregandoTemplates ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : templates.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Nenhum modelo cadastrado nesta conta ainda.
          </p>
        ) : (
          <div className="space-y-2 mb-6">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    {t.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {t.category} · {t.language}
                    {t.rejected_reason && t.rejected_reason !== 'NONE' ? ` · ${t.rejected_reason}` : ''}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded shrink-0 ${corStatusTemplate(t.status)}`}>
                  {t.status}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
          <h4 className="font-medium text-gray-900 dark:text-gray-100">Criar modelo</h4>

          <div className="grid sm:grid-cols-3 gap-3">
            <Input
              label="Nome"
              placeholder="boas_vindas_duofuturo"
              value={novo.nome}
              onChange={(e) => setNovo({ ...novo, nome: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
            />
            <Select
              label="Categoria"
              value={novo.categoria}
              onChange={(e) => setNovo({ ...novo, categoria: e.target.value as NovoTemplate['categoria'] })}
              options={[
                { value: 'UTILITY', label: 'Utilidade' },
                { value: 'MARKETING', label: 'Marketing' },
                { value: 'AUTHENTICATION', label: 'Autenticacao' },
              ]}
            />
            <Select
              label="Idioma"
              value={novo.idioma}
              onChange={(e) => setNovo({ ...novo, idioma: e.target.value })}
              options={[
                { value: 'pt_BR', label: 'Portugues (BR)' },
                { value: 'en_US', label: 'Ingles (US)' },
                { value: 'es_ES', label: 'Espanhol' },
              ]}
            />
          </div>

          <Textarea
            label="Corpo"
            rows={3}
            placeholder="Ola, {{1}}! Sua conta no DuoFuturo foi criada com sucesso."
            value={novo.corpo}
            onChange={(e) => setNovo({ ...novo, corpo: e.target.value })}
          />

          {qtdVariaveis > 0 && (
            <div className="grid sm:grid-cols-2 gap-3">
              {Array.from({ length: qtdVariaveis }, (_, i) => (
                <Input
                  key={i}
                  label={`Exemplo para {{${i + 1}}}`}
                  value={novo.exemplos[i] ?? ''}
                  onChange={(e) => {
                    const exemplos = [...novo.exemplos]
                    exemplos[i] = e.target.value
                    setNovo({ ...novo, exemplos })
                  }}
                />
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={criar}
              disabled={criando || !novo.nome.trim() || !novo.corpo.trim()}
              className="flex items-center gap-2"
            >
              {criando ? <Spinner size="sm" /> : <Plus className="w-4 h-4" />}
              Criar modelo
            </Button>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              A Meta analisa o modelo antes de liberar o envio.
            </p>
          </div>

          {criacao && (
            <div className={`flex gap-3 rounded-lg p-3 ${criacao.ok
              ? 'bg-emerald-50 dark:bg-emerald-900/20'
              : 'bg-red-50 dark:bg-red-900/20'}`}>
              {criacao.ok
                ? <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                : <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />}
              <p className={`text-sm ${criacao.ok
                ? 'text-emerald-800 dark:text-emerald-300'
                : 'text-red-800 dark:text-red-300'}`}>{criacao.msg}</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
