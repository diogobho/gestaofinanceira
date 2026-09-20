import React, { useCallback, useEffect, useRef, useState } from 'react'
import { BadgeCheck, ArrowRight, Loader2, AlertTriangle } from 'lucide-react'
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
  const [ocupado, setOcupado] = useState(false)
  const sessao = useRef<{ waba_id?: string; phone_number_id?: string }>({})
  const { configurado, appId, configId, graphVersion } = oficial.embeddedSignup

  // A janela conversa com a página por postMessage. O listener fica montado o
  // tempo todo: ele precisa existir ANTES de a janela abrir.
  useEffect(() => {
    const aoReceber = (event: MessageEvent) => {
      if (!/(^|\.)facebook\.com$/.test(new URL(event.origin).hostname)) return
      try {
        const dados = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (dados?.type !== 'WA_EMBEDDED_SIGNUP') return
        if (dados.event === 'FINISH' || dados.event === 'FINISH_ONLY_WABA') {
          sessao.current = {
            waba_id: dados.data?.waba_id,
            phone_number_id: dados.data?.phone_number_id,
          }
        } else if (dados.event === 'CANCEL') {
          // Sair no meio não é erro: a pessoa fechou a janela.
          sessao.current = {}
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

  const conectar = useCallback(async () => {
    if (!configurado || !appId || !configId) return
    setOcupado(true)
    sessao.current = {}
    try {
      await carregarSdk(appId, graphVersion)
      const resposta: any = await new Promise((resolve) => {
        window.FB.login(resolve, {
          config_id: configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
        })
      })

      const code = resposta?.authResponse?.code
      const { waba_id, phone_number_id } = sessao.current
      if (!code) {
        // Fechou a janela ou não autorizou — sem aviso vermelho para isso.
        setOcupado(false)
        return
      }
      if (!waba_id || !phone_number_id) {
        toast.error('A Meta não informou qual número foi conectado. Refaça a conexão até o fim da janela.')
        setOcupado(false)
        return
      }

      await canalWhatsappApi.conectarOficial({ code, waba_id, phone_number_id, usuario_id: usuarioId })
      toast.success('Número oficial conectado!')
      onConectado?.()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Não foi possível conectar o número')
    } finally {
      setOcupado(false)
      sessao.current = {}
    }
  }, [configurado, appId, configId, graphVersion, usuarioId, onConectado])

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

  return (
    <Button className="mt-4" onClick={conectar} disabled={ocupado}>
      {ocupado ? (
        <>
          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Conectando…
        </>
      ) : (
        <>
          <BadgeCheck className="w-4 h-4 mr-1.5" /> Conectar meu número oficial <ArrowRight className="w-4 h-4 ml-1.5" />
        </>
      )}
    </Button>
  )
}
