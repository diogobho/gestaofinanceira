import React, { useCallback, useEffect, useRef, useState } from 'react'
import { BadgeCheck, ArrowRight, Loader2, AlertTriangle, Smartphone, Building2, CreditCard } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { canalWhatsappApi, type CanalOficial } from '@/api/canalWhatsapp'

/**
 * Botão que abre o Embedded Signup da Meta — o cliente autoriza a PRÓPRIA conta
 * do WhatsApp e o número dele passa a ser o canal oficial dentro do CRM.
 *
 * ── Por que são duas fontes de dado, e não uma ──────────────────────────────
 * A janela devolve o resultado por DOIS caminhos, e os dois são necessários:
 *
 *  - `postMessage` da janela → `waba_id` e `phone_number_id` (qual conta, qual número);
 *  - callback do `FB.login`  → o `code` (a autorização em si).
 *
 * Eles chegam em ordem não garantida, então nada é enviado antes de os dois
 * existirem. Usar só o callback deixaria a gente sem saber QUAL número conectar;
 * usar só o postMessage deixaria sem autorização nenhuma.
 *
 * ── O `code` vive ~30 segundos ──────────────────────────────────────────────
 * Por isso ele vai direto para a API, na hora, e não passa por tela de
 * confirmação. Quem troca o code por token é o servidor: a troca exige o App
 * Secret, que não pode existir no navegador.
 *
 * ── Coexistência ────────────────────────────────────────────────────────────
 * Quem já usa o app WhatsApp Business no celular pode manter o app: o número fala
 * pelos dois. A janela é a mesma (na v4 a Meta reconhece sozinha o número que está no app),
 * e termina com outro evento (FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING) que traz só o
 * `waba_id` — o servidor procura o número na conta. Sem essa opção, o número que já
 * está no app é recusado pela Meta ("já está registado numa conta do WhatsApp").
 *
 * O SDK só é carregado quando o botão existe — e ele só existe quando a API diz
 * que o Embedded Signup está configurado. Página nenhuma carrega script da Meta
 * sem ter o que fazer com ele.
 */

declare global {
  interface Window {
    FB?: any
    fbAsyncInit?: () => void
  }
}

const ID_SCRIPT = 'facebook-jssdk'

function carregarSdk(appId: string, versao: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve()

    window.fbAsyncInit = () => {
      window.FB.init({ appId, cookie: true, xfbml: false, version: versao })
      resolve()
    }
    if (document.getElementById(ID_SCRIPT)) return // já está vindo; o init resolve

    const s = document.createElement('script')
    s.id = ID_SCRIPT
    s.async = true
    s.defer = true
    s.crossOrigin = 'anonymous'
    s.src = 'https://connect.facebook.net/en_US/sdk.js'
    s.onerror = () => reject(new Error('Não foi possível carregar a janela da Meta. Verifique a sua conexão.'))
    document.body.appendChild(s)
  })
}

interface Props {
  oficial: CanalOficial
  /** Conectar o número de outro usuário da equipe (administrador). */
  usuarioId?: number
  onConectado?: () => void
}

export const ConectarNumeroOficial: React.FC<Props> = ({ oficial, usuarioId, onConectado }) => {
  const [ocupado, setOcupado] = useState<false | 'oficial' | 'app'>(false)
  const sessao = useRef<{ waba_id?: string; phone_number_id?: string; app?: boolean }>({})
  const { configurado, appId, configId, graphVersion, versao = 'v4' } = oficial.embeddedSignup

  // A janela conversa com a página por postMessage. O listener fica montado o
  // tempo todo: ele precisa existir ANTES de a janela abrir.
  useEffect(() => {
    const aoReceber = (event: MessageEvent) => {
      if (!/(^|\.)facebook\.com$/.test(new URL(event.origin).hostname)) return
      try {
        const dados = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (dados?.type !== 'WA_EMBEDDED_SIGNUP') return
        if (dados.event === 'FINISH' || dados.event === 'FINISH_ONLY_WABA' || dados.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') {
          sessao.current = {
            waba_id: dados.data?.waba_id,
            phone_number_id: dados.data?.phone_number_id,
            // Na v4 é a Meta quem decide: número que está no app vira coexistência sozinho,
            // seja qual for o botão clicado.
            app: dados.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
          }
        } else if (dados.event === 'CANCEL') {
          // Sair no meio não é erro: a pessoa fechou a janela. Mas desde a v4 é também
          // por aqui que a Meta reporta erro (com `error_message`), e esse precisa aparecer.
          sessao.current = {}
          if (dados.data?.error_message) toast.error(`A Meta recusou a conexão: ${dados.data.error_message}`)
        } else if (dados.event === 'ERROR') {
          sessao.current = {}
          toast.error(dados.data?.error_message || 'A Meta recusou a conexão.')
        }
      } catch {
        /* mensagem que não é nossa */
      }
    }
    window.addEventListener('message', aoReceber)
    return () => window.removeEventListener('message', aoReceber)
  }, [])

  const conectar = useCallback(async (coexistencia: boolean) => {
    if (!configurado || !appId || !configId) return
    setOcupado(coexistencia ? 'app' : 'oficial')
    sessao.current = {}
    try {
      await carregarSdk(appId, graphVersion)
      // A configuração de login é a 1369736425237391 (v4, desde 14/10/2026); a versão do fluxo
      // sai do `extras` abaixo.
      const resposta: any = await new Promise((resolve) => {
        window.FB.login(resolve, {
          config_id: configId,
          response_type: 'code',
          override_default_response_type: true,
          // v5 (META_ES_VERSAO, desde 21/10/2026): a versão vai no extras e a coexistência já vem
          // ligada — a Meta mostra "conectar o app WhatsApp Business" na escolha da conta. Na v4 o
          // featureType é ignorado e a janela só oferece número novo (SMS → #2494064 para número do
          // app): foi o que travou a Hellen e a Jéssica de 13 a 21/10. v2/v3 morreram em 15/10/2026
          // (a Meta serve como v4), então o ramo do featureType só vale para histórico.
          extras:
            versao === 'v5'
              ? { version: 'v5' }
              : versao === 'v4'
                ? {}
                : { setup: {}, featureType: coexistencia ? 'whatsapp_business_app_onboarding' : '', sessionInfoVersion: '3' },
        })
      })

      const code = resposta?.authResponse?.code
      // O postMessage da janela e o callback do login chegam em ordem não garantida.
      // Com o code em mãos, espera até 3s pelos ids — o code vive ~30s, sobra tempo.
      for (let i = 0; code && !sessao.current.waba_id && i < 15; i++) {
        await new Promise((r) => setTimeout(r, 200))
      }
      const { waba_id, phone_number_id } = sessao.current
      const viaApp = coexistencia || !!sessao.current.app
      if (!code) {
        // Fechou a janela ou não autorizou — sem aviso vermelho para isso.
        setOcupado(false)
        return
      }
      if (!waba_id || (!phone_number_id && !viaApp)) {
        toast.error('A Meta não informou qual número foi conectado. Refaça a conexão até o fim da janela.')
        setOcupado(false)
        return
      }

      await canalWhatsappApi.conectarOficial({ code, waba_id, phone_number_id, usuario_id: usuarioId, coexistencia: viaApp })
      toast.success(
        viaApp
          ? 'Número conectado! O app do celular continua funcionando, e o histórico das conversas está chegando.'
          : 'Número oficial conectado!'
      )
      onConectado?.()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Não foi possível conectar o número')
    } finally {
      setOcupado(false)
      sessao.current = {}
    }
  }, [configurado, appId, configId, graphVersion, versao, usuarioId, onConectado])

  if (!configurado) {
    return (
      <div className="mt-4 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          A conexão automática ainda não está liberada nesta instalação. Peça a ativação pelo suporte que a
          DuoFuturo conecta o seu número.
        </span>
      </div>
    )
  }

  const { portfolio, podeDefinirPortfolio, donoDaConta } = oficial
  const nomePortfolio = portfolio?.nome || 'da empresa'

  // Sem portfólio da empresa, só o dono da conta conecta: é a conexão dele que cria a
  // referência (portfólio + conta do WhatsApp + cartão) onde entram os números da equipe.
  if (!portfolio && !podeDefinirPortfolio) {
    return (
      <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
        <Building2 className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          Primeiro o dono da conta{donoDaConta ? <> (<strong>{donoDaConta}</strong>)</> : ''} conecta o número
          oficial dele. É essa conexão que cria o portfólio da empresa na Meta, com o cartão de pagamento
          cadastrado uma vez só. Depois disso você conecta o seu aqui em um minuto, só com o código do SMS.
        </span>
      </div>
    )
  }

  const botaoApp = (
    <div>
      <Button variant="outline" onClick={() => conectar(true)} disabled={!!ocupado}>
        {ocupado === 'app' ? (
          <>
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Conectando…
          </>
        ) : (
          <>
            <Smartphone className="w-4 h-4 mr-1.5" /> Já uso o WhatsApp Business no celular
          </>
        )}
      </Button>
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        O número continua no app e passa a funcionar também aqui, com as conversas dos
        últimos 6 meses. Precisa ser o app <strong>WhatsApp Business</strong> (versão 2.24.17 ou
        mais nova), não o WhatsApp comum. Grupos e listas de transmissão ficam só no celular.
        Tenha o celular em mãos: durante a conexão chega uma mensagem no app pedindo para ler
        o QR Code que aparece na janela da Meta.
      </p>
    </div>
  )

  // Primeira conexão — o dono da conta define a referência da empresa.
  if (!portfolio) {
    return (
      <div className="mt-4 space-y-3">
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100">
          <Building2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>Esta é a conexão da empresa.</strong> Na janela da Meta, escolha o portfólio com o
            nome da sua empresa (ou crie um). Todos os números da equipe vão entrar nele, e o cartão de
            pagamento é cadastrado uma vez só. Depois, cada pessoa conecta o próprio número com o código do SMS.
          </span>
        </div>
        <div>
          <Button onClick={() => conectar(false)} disabled={!!ocupado}>
            {ocupado === 'oficial' ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Conectando…
              </>
            ) : (
              <>
                <BadgeCheck className="w-4 h-4 mr-1.5" /> Conectar meu número oficial <ArrowRight className="w-4 h-4 ml-1.5" />
              </>
            )}
          </Button>
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            Para um número que não está em nenhum WhatsApp do celular.
          </p>
        </div>
        {botaoApp}
      </div>
    )
  }

  // Oficial próprio, desligado, conectado num portfólio que não é o da empresa (a Jéssica, 02/10):
  // a Meta recusa o número até ele ser solto no celular. Só vale para a própria pessoa — quem
  // conecta por outro recebe aqui o canal DELE, não o da pessoa.
  const numeroPreso = !usuarioId && oficial.conta?.meu && oficial.conta.foraDoPortfolio && !oficial.conta.ativo

  // Portfólio definido — o número da pessoa entra na conta da empresa. Quase sempre a equipe já
  // usa o app WhatsApp Business no celular, então a coexistência vem primeiro e com o passo a passo
  // na tela: na janela da Meta, o Facebook errado e a conta do WhatsApp que já existe (a do dono
  // aparece na lista para quem tem Controle total) são os dois tropeços de verdade (15/10/2026).
  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300">
        <Building2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
        <span>
          Conta da empresa na Meta: <strong>{nomePortfolio}</strong>. O seu número entra nela, com o
          mesmo cartão de pagamento.
        </span>
      </div>
      {numeroPreso && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            O seu número{oficial.conta?.numero ? <> ({oficial.conta.numero})</> : ''} já foi conectado antes, fora
            da conta da empresa. Antes de conectar de novo, solte ele no celular: no WhatsApp Business, abra
            Configurações, depois Conta, depois Plataforma Business, e toque em Desconectar. Não apague a
            conta: as conversas continuam no celular.
          </span>
        </div>
      )}
      <div className="rounded-lg border border-gray-200 p-3 text-xs text-gray-700 dark:border-gray-700 dark:text-gray-200">
        <p className="font-semibold text-gray-800 dark:text-gray-100">Se o seu número já está no WhatsApp Business do celular:</p>
        <ol className="mt-1.5 list-decimal space-y-1 pl-4">
          <li>Clique no botão abaixo. Abre a janela da Meta.</li>
          <li>
            Confira o nome que aparece em "Continuar como". Ele tem que ser o do Facebook que recebeu o convite
            para o portfólio. Se for outro, clique em "Não é você?" e entre com o certo.
          </li>
          <li>
            Escolha a opção de <strong>conectar o app WhatsApp Business</strong> que você já usa e digite o número
            que está nele. Se a janela pedir código por mensagem de texto ou chamada, volte: esse é o caminho de
            número novo e a Meta recusa número que está no app. Se o seu número aparecer como "Não elegível" ou a Meta disser que
            a conta "não suporta a partilha de parceiros", ele ainda está ligado a uma conexão antiga: solte no
            celular (aviso amarelo acima, ou o passo a passo) e tente de novo depois de uns 5 minutos.
          </li>
          <li>
            Escolha o portfólio <strong>{nomePortfolio}</strong>. Não crie um novo. Se pedir a conta do WhatsApp,
            escolha <strong>criar uma nova conta</strong>, nunca uma que já existe, nem a do dono da empresa.
          </li>
          <li>Leia o QR Code com o celular e aceite compartilhar o histórico.</li>
        </ol>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          O portfólio <strong>{nomePortfolio}</strong> não aparece? Ou o Facebook usado não está nele, ou o convite
          ainda não foi aceito. Feche a janela sem concluir e peça para alguém que já está no portfólio da
          empresa na Meta conectar por você, com você ao lado para ler o QR Code.{' '}
          <a href="/gestao/guia-equipe-no-oficial.pdf" download="passo-a-passo-equipe-no-oficial.pdf" className="underline font-medium">
            Baixar o passo a passo
          </a>
        </p>
      </div>
      {botaoApp}
      {portfolio.pagamentoPendente && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <CreditCard className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            A Meta acusa problema na forma de pagamento da empresa. Enquanto isso, disparos e cadências
            não saem. O dono da conta resolve no{' '}
            <a
              href={`https://business.facebook.com/wa/manage/home/?waba_id=${portfolio.wabaId}&business_id=${portfolio.businessId}`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              WhatsApp Manager
            </a>
            , em Configurações de pagamento.
          </span>
        </div>
      )}
      <NumeroNovo nomePadrao={portfolio.nome || ''} usuarioId={usuarioId} onConectado={onConectado} secundario />
    </div>
  )
}

/**
 * Número novo na conta da empresa, sem janela da Meta: o Duo cria o número na conta do
 * WhatsApp da empresa e a pessoa só confirma o código que chega por SMS ou ligação.
 */
const NumeroNovo: React.FC<{ nomePadrao: string; usuarioId?: number; onConectado?: () => void; secundario?: boolean }> = ({
  nomePadrao,
  usuarioId,
  onConectado,
  secundario,
}) => {
  const [aberto, setAberto] = useState(false)
  const [numero, setNumero] = useState('')
  const [nome, setNome] = useState(nomePadrao)
  const [metodo, setMetodo] = useState<'SMS' | 'VOICE'>('SMS')
  const [phoneId, setPhoneId] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const pedir = async () => {
    setOcupado(true)
    try {
      const r = await canalWhatsappApi.pedirCodigoNumero({ numero, nome_exibicao: nome, metodo, usuario_id: usuarioId })
      setPhoneId(r.phone_number_id)
      toast.success(metodo === 'SMS' ? 'Código enviado por SMS.' : 'Você vai receber uma ligação com o código.')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'A Meta não aceitou o número.')
    } finally {
      setOcupado(false)
    }
  }

  const confirmar = async () => {
    if (!phoneId) return
    setOcupado(true)
    try {
      await canalWhatsappApi.verificarNumero({ phone_number_id: phoneId, codigo, usuario_id: usuarioId })
      toast.success('Número oficial conectado!')
      onConectado?.()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Não foi possível confirmar o código.')
    } finally {
      setOcupado(false)
    }
  }

  if (!aberto) {
    return (
      <div>
        <Button variant={secundario ? 'outline' : undefined} onClick={() => setAberto(true)}>
          <BadgeCheck className="w-4 h-4 mr-1.5" /> Conectar um número novo <ArrowRight className="w-4 h-4 ml-1.5" />
        </Button>
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Para um chip que não está em nenhum WhatsApp do celular. Sem login no Facebook: só o código do SMS.
        </p>
      </div>
    )
  }

  const campo =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white'

  return (
    <div className="rounded-lg border border-gray-200 p-3 space-y-3 dark:border-gray-700">
      {!phoneId ? (
        <>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
            Número com DDD
            <input className={`${campo} mt-1`} inputMode="tel" placeholder="11 91234-5678" value={numero} onChange={(e) => setNumero(e.target.value)} />
          </label>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
            Nome que os clientes vão ver
            <input className={`${campo} mt-1`} value={nome} onChange={(e) => setNome(e.target.value)} />
            <span className="mt-1 block font-normal text-gray-500 dark:text-gray-400">
              A Meta analisa o nome. Use o da empresa, ou "Nome — Empresa".
            </span>
          </label>
          <div className="flex gap-4 text-xs text-gray-700 dark:text-gray-300">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={metodo === 'SMS'} onChange={() => setMetodo('SMS')} /> Código por SMS
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={metodo === 'VOICE'} onChange={() => setMetodo('VOICE')} /> Por ligação
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={pedir} disabled={ocupado || numero.replace(/\D/g, '').length < 10 || nome.trim().length < 3}>
              {ocupado ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null} Enviar código
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAberto(false)} disabled={ocupado}>
              Cancelar
            </Button>
          </div>
        </>
      ) : (
        <>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
            Código de 6 números que chegou no {numero}
            <input
              className={`${campo} mt-1 tracking-widest`}
              inputMode="numeric"
              maxLength={7}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={confirmar} disabled={ocupado || codigo.replace(/\D/g, '').length !== 6}>
              {ocupado ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null} Confirmar
            </Button>
            <Button size="sm" variant="outline" onClick={pedir} disabled={ocupado}>
              Enviar de novo
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setPhoneId(null); setCodigo('') }} disabled={ocupado}>
              Trocar número
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
