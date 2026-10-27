import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Mail, MessageCircle, RefreshCw, Send, Eye, Save, AlertCircle, CheckCircle2, Clock,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  onboardingApi, EnvioOnboarding, ResumoOnboarding, MensagemOnboarding, ModeloOnboarding,
} from '@/api/onboarding'

/**
 * Boas-vindas de conta nova — acompanhamento e modelos.
 *
 * Responde duas perguntas que antes não tinham resposta nenhuma: **o que cada
 * conta nova recebeu** (e o motivo, quando não recebeu) e **o que exatamente
 * sai** por e-mail e pelo WhatsApp oficial, em texto editável sem deploy.
 *
 * Quem barra de verdade é o backend (`super_admin`); a página usa o perfil só
 * para não piscar conteúdo antes do 403.
 */

const ROTULO_EMAIL: Record<string, { texto: string; classe: string }> = {
  enviado: { texto: 'Enviado', classe: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  falhou: { texto: 'Falhou', classe: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  pendente: { texto: 'Pendente', classe: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
}

const ROTULO_WA: Record<string, { texto: string; classe: string }> = {
  nao_solicitado: { texto: 'Não pediu', classe: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  aguardando_contato: { texto: 'Aguardando a mensagem', classe: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  contato_recebido: { texto: 'Mensagem recebida', classe: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  enviado: { texto: 'Material enviado', classe: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  falhou: { texto: 'Falhou', classe: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
}

const Etiqueta: React.FC<{ mapa: Record<string, { texto: string; classe: string }>; valor: string }> = ({ mapa, valor }) => {
  const item = mapa[valor] || { texto: valor, classe: 'bg-gray-100 text-gray-600' }
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${item.classe}`}>{item.texto}</span>
}

const dataHora = (v: string | null) =>
  v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

const Cartao: React.FC<{ titulo: string; valor: number | string; tom?: string; icone: React.ReactNode }> = ({ titulo, valor, tom, icone }) => (
  <Card className="p-4">
    <div className="flex items-center gap-3">
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tom || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
        {icone}
      </span>
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{titulo}</p>
        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{valor}</p>
      </div>
    </div>
  </Card>
)

export const OnboardingPainel: React.FC = () => {
  const { user } = useAuth()
  const temAcesso = user?.nivel === 'super_admin'

  const [aba, setAba] = useState<'envios' | 'modelos'>('envios')

  const [envios, setEnvios] = useState<EnvioOnboarding[]>([])
  const [resumo, setResumo] = useState<ResumoOnboarding | null>(null)
  const [mensagens, setMensagens] = useState<MensagemOnboarding[]>([])
  const [carregando, setCarregando] = useState(true)
  const [agindo, setAgindo] = useState<number | null>(null)

  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  const [modelos, setModelos] = useState<ModeloOnboarding[]>([])
  const [emEdicao, setEmEdicao] = useState<ModeloOnboarding | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [previa, setPrevia] = useState<{ assunto: string; html: string; anexo: string | null } | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [dados, msgs] = await Promise.all([
        onboardingApi.getEnvios({
          busca: busca.trim() || undefined,
          status: status || undefined,
          data_inicio: dataInicio || undefined,
          data_fim: dataFim || undefined,
        }),
        onboardingApi.getMensagens(),
      ])
      setEnvios(dados.envios)
      setResumo(dados.resumo)
      setMensagens(msgs)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Não foi possível carregar os envios')
    } finally {
      setCarregando(false)
    }
  }, [busca, status, dataInicio, dataFim])

  useEffect(() => { if (temAcesso) carregar() }, [temAcesso, carregar])

  useEffect(() => {
    if (!temAcesso) return
    onboardingApi.getModelos().then(setModelos).catch(() => {})
  }, [temAcesso])

  const reenviar = async (id: number) => {
    setAgindo(id)
    try {
      const r = await onboardingApi.reenviarEmail(id)
      toast[r.success ? 'success' : 'error'](r.success ? 'E-mail reenviado' : 'O envio falhou de novo — veja o motivo na linha')
      await carregar()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Falha ao reenviar')
    } finally {
      setAgindo(null)
    }
  }

  const mandarWhatsApp = async (id: number) => {
    setAgindo(id)
    try {
      const r = await onboardingApi.enviarWhatsApp(id)
      toast[r.success ? 'success' : 'error'](
        r.success ? 'Material enviado' :
        r.desfecho === 'ja_enviado' ? 'Este material já havia sido enviado' :
        'Não foi possível enviar — veja o motivo na linha'
      )
      await carregar()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Falha ao enviar')
    } finally {
      setAgindo(null)
    }
  }

  const salvarModelo = async () => {
    if (!emEdicao) return
    setSalvando(true)
    try {
      const salvo = await onboardingApi.salvarModelo(emEdicao.plano_id, {
        email_assunto: emEdicao.email_assunto,
        email_corpo: emEdicao.email_corpo,
        whatsapp_texto: emEdicao.whatsapp_texto,
        pdf_arquivo: emEdicao.pdf_arquivo,
      })
      setModelos(lista => lista.map(m => (m.plano_id === salvo.plano_id ? salvo : m)))
      setEmEdicao(salvo)
      toast.success('Modelo salvo')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Não foi possível salvar')
    } finally {
      setSalvando(false)
    }
  }

  const verPrevia = async (planoId: number) => {
    try {
      setPrevia(await onboardingApi.previa(planoId))
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Não foi possível montar a prévia')
    }
  }

  const enviarTeste = async (planoId: number) => {
    const destino = user?.email
    if (!destino) return
    try {
      await onboardingApi.enviarTeste(planoId, destino)
      toast.success(`Teste enviado para ${destino}`)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Não foi possível enviar o teste')
    }
  }

  const mensagensSemConta = useMemo(() => mensagens.filter(m => m.desfecho === 'sem_conta'), [mensagens])

  if (!temAcesso) {
    return (
      <div className="p-6">
        <Card className="p-6 max-w-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Acesso restrito</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Esta tela é da administração da DuoFuturo: ela mostra as contas novas de todas as
                empresas e define o que sai pelo nosso remetente e pelo nosso número oficial.
              </p>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="shrink-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Boas-vindas</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            O que cada conta nova recebeu — e o que exatamente é enviado.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={aba === 'envios' ? 'primary' : 'secondary'} onClick={() => setAba('envios')}>Acompanhamento</Button>
          <Button variant={aba === 'modelos' ? 'primary' : 'secondary'} onClick={() => setAba('modelos')}>Modelos</Button>
          {aba === 'envios' && (
            <Button variant="secondary" onClick={carregar} disabled={carregando}>
              <RefreshCw className={`w-4 h-4 mr-2 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
          )}
        </div>
      </div>

      {aba === 'envios' ? (
        <>
          {resumo && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Cartao titulo="Contas novas" valor={resumo.total} icone={<CheckCircle2 className="w-4 h-4" />} />
              <Cartao titulo="E-mail enviado" valor={resumo.email_ok} tom="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" icone={<Mail className="w-4 h-4" />} />
              <Cartao titulo="E-mail falhou" valor={resumo.email_falhou} tom="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" icone={<AlertCircle className="w-4 h-4" />} />
              <Cartao titulo="Pediram WhatsApp" valor={resumo.optin} tom="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" icone={<MessageCircle className="w-4 h-4" />} />
              <Cartao titulo="Material entregue" valor={resumo.whatsapp_ok} tom="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" icone={<Send className="w-4 h-4" />} />
            </div>
          )}

          <Card className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Input label="Buscar" placeholder="empresa, pessoa ou e-mail" value={busca} onChange={e => setBusca(e.target.value)} />
              <Select label="Situação" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="">Todas</option>
                <option value="email_enviado">E-mail enviado</option>
                <option value="email_falhou">E-mail falhou</option>
                <option value="aguardando_optin">Aguardando a mensagem</option>
                <option value="whatsapp_enviado">Material entregue</option>
                <option value="whatsapp_falhou">WhatsApp falhou</option>
              </Select>
              <Input label="De" type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
              <Input label="Até" type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            {carregando ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : envios.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-12">
                Nenhuma conta nova no recorte escolhido.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="text-left font-medium px-4 py-2.5">Conta</th>
                      <th className="text-left font-medium px-4 py-2.5">Plano</th>
                      <th className="text-left font-medium px-4 py-2.5">E-mail</th>
                      <th className="text-left font-medium px-4 py-2.5">WhatsApp</th>
                      <th className="text-left font-medium px-4 py-2.5">Criada</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {envios.map(e => (
                      <tr key={e.id} className="align-top">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 dark:text-gray-100">{e.nome_empresa}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{e.nome_usuario} · {e.email}</p>
                          <p className="text-xs text-gray-400 mt-0.5">código {e.codigo}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-gray-700 dark:text-gray-200">{e.plano_nome || '—'}</p>
                          <p className="text-xs text-gray-400">{e.assinatura_status === 'trial' ? 'teste' : 'assinou'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Etiqueta mapa={ROTULO_EMAIL} valor={e.email_status} />
                          <p className="text-xs text-gray-400 mt-1">{dataHora(e.email_em)}</p>
                          {e.email_erro && <p className="text-xs text-red-600 dark:text-red-400 mt-1 max-w-xs">{e.email_erro}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <Etiqueta mapa={ROTULO_WA} valor={e.whatsapp_status} />
                          <p className="text-xs text-gray-400 mt-1">{dataHora(e.whatsapp_em || e.contato_em)}</p>
                          {e.whatsapp_erro && <p className="text-xs text-red-600 dark:text-red-400 mt-1 max-w-xs">{e.whatsapp_erro}</p>}
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{dataHora(e.criado_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1.5">
                            <button
                              onClick={() => reenviar(e.id)}
                              disabled={agindo === e.id}
                              className="text-xs text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50"
                            >
                              Reenviar e-mail
                            </button>
                            {/*
                              Só aparece depois que a pessoa escreveu: fora da
                              janela de 24h a Meta recusa texto livre, e o botão
                              prometeria o que não acontece.
                            */}
                            {(e.whatsapp_status === 'contato_recebido' || e.whatsapp_status === 'falhou') && (
                              <button
                                onClick={() => mandarWhatsApp(e.id)}
                                disabled={agindo === e.id}
                                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium disabled:opacity-50"
                              >
                                Enviar material
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Mensagens no número oficial</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Quem escreveu para o +55 11 94052-4435. As que não batem com nenhuma conta nova
              ficam aqui esperando resposta de gente — nada é respondido automaticamente.
            </p>
            {mensagens.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-4">Nenhuma mensagem recebida ainda.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {mensagens.map(m => (
                  <li key={m.id} className="py-2.5 flex items-start gap-3">
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      m.desfecho === 'material_enviado'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                    }`}>
                      {m.desfecho === 'material_enviado' ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{m.texto || `(${m.tipo})`}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {m.de_numero} · {dataHora(m.recebida_em)}
                        {m.nome_empresa ? ` · ${m.nome_empresa}` : ' · sem conta identificada'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {mensagensSemConta.length > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-3">
                {mensagensSemConta.length} mensagem(ns) sem conta identificada — vale responder à mão.
              </p>
            )}
          </Card>
        </>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)] gap-4 items-start">
          <Card className="p-4">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Um modelo por plano</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              O molde (cabeçalho, assinatura e rodapé) é o mesmo para todos; aqui se edita o
              miolo. Variáveis: [PrimeiroNome], [Nome], [Empresa], [Plano] e [Abertura].
            </p>
            <ul className="space-y-1.5">
              {modelos.map(m => (
                <li key={m.plano_id}>
                  <button
                    onClick={() => { setEmEdicao(m); setPrevia(null) }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      emEdicao?.plano_id === m.plano_id
                        ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200 font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {m.plano_nome}
                    <span className="block text-xs text-gray-400">{m.pdf_arquivo}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {emEdicao ? (
            <Card className="p-4 space-y-4">
              <Input
                label="Assunto do e-mail"
                value={emEdicao.email_assunto}
                onChange={e => setEmEdicao({ ...emEdicao, email_assunto: e.target.value })}
              />
              <Textarea
                label="Corpo do e-mail (HTML do miolo)"
                rows={14}
                value={emEdicao.email_corpo}
                onChange={e => setEmEdicao({ ...emEdicao, email_corpo: e.target.value })}
              />
              <Textarea
                label="Texto do WhatsApp"
                rows={8}
                value={emEdicao.whatsapp_texto}
                onChange={e => setEmEdicao({ ...emEdicao, whatsapp_texto: e.target.value })}
              />
              <Input
                label="PDF anexado (arquivo em landing/onboarding/)"
                value={emEdicao.pdf_arquivo}
                onChange={e => setEmEdicao({ ...emEdicao, pdf_arquivo: e.target.value })}
              />

              <div className="flex flex-wrap gap-2">
                <Button onClick={salvarModelo} disabled={salvando}>
                  <Save className="w-4 h-4 mr-2" /> {salvando ? 'Salvando...' : 'Salvar'}
                </Button>
                <Button variant="secondary" onClick={() => verPrevia(emEdicao.plano_id)}>
                  <Eye className="w-4 h-4 mr-2" /> Prévia
                </Button>
                <Button variant="secondary" onClick={() => enviarTeste(emEdicao.plano_id)}>
                  <Send className="w-4 h-4 mr-2" /> Enviar teste para mim
                </Button>
              </div>

              {previa && (
                <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{previa.assunto}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Anexo: {previa.anexo || 'nenhum — o PDF do plano não foi encontrado'}
                  </p>
                  {/*
                    A prévia vai num iframe COM sandbox: é HTML de e-mail montado
                    pelo servidor, e renderizar direto na página deixaria o CSS
                    dele (tabelas de 600px, fontes) vazar para o app.
                  */}
                  <iframe
                    title="Prévia do e-mail"
                    sandbox=""
                    srcDoc={previa.html}
                    className="w-full h-[26rem] rounded-lg border border-gray-200 dark:border-gray-700 bg-white"
                  />
                </div>
              )}
            </Card>
          ) : (
            <Card className="p-8">
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                Escolha um plano ao lado para editar o que ele recebe.
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

export default OnboardingPainel
