import React, { useState } from 'react'
import { QrCode, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { whatsappApi } from '@/api/whatsapp'
import { canalWhatsappApi } from '@/api/canalWhatsapp'
import { ConectarNumeroOficial } from './ConectarNumeroOficial'

/**
 * Os dois caminhos de quem tem direito ao número oficial e ainda não tem canal.
 *
 * Esta tela existe por uma decisão do provisionamento: conta com `whatsapp_oficial`
 * **não ganha instância Baileys sozinha** (`whatsapp-provision.service.ts`). Antes,
 * todo usuário sem porta recebia uma instância e um QR Code — o que, para quem
 * assinou o Enterprise, é entregar exatamente o canal que o plano dele existe para
 * não usar, e ainda deixa um processo de ~400 MB parado num QR que ninguém vai ler.
 *
 * Então em vez de um canal escolhido por omissão, dois botões e a diferença entre
 * eles escrita. O QR continua ali de propósito: grupos e sincronização de contatos
 * não existem na Cloud API.
 */
export const EscolhaDeCanal: React.FC<{
  /** Quando um administrador escolhe pelo operador. Ausente = para mim. */
  usuarioId?: number
  onMudou?: () => void
  compacto?: boolean
}> = ({ usuarioId, onMudou, compacto }) => {
  const [ativandoQr, setAtivandoQr] = useState(false)

  const { data: oficial } = useQuery({
    queryKey: ['whatsapp', 'canal', 'oficial'],
    queryFn: canalWhatsappApi.getOficial,
    staleTime: 60_000,
    retry: false,
  })

  const ativarQr = async () => {
    setAtivandoQr(true)
    try {
      await (usuarioId ? whatsappApi.ativarQrUsuario(usuarioId) : whatsappApi.ativarQr())
      toast.success('Preparando o QR Code — ele aparece em alguns segundos.')
      onMudou?.()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Não foi possível preparar o QR Code')
    } finally {
      setAtivandoQr(false)
    }
  }

  return (
    <div className={compacto ? 'py-3 space-y-2' : 'py-4 space-y-3'}>
      {!compacto && (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Escolha por onde este WhatsApp vai falar. Dá para mudar depois.
        </p>
      )}

      {oficial && (
        <ConectarNumeroOficial oficial={oficial} usuarioId={usuarioId} onConectado={onMudou} />
      )}

      <div>
        <Button variant="outline" size={compacto ? 'sm' : undefined} onClick={ativarQr} disabled={ativandoQr}>
          {ativandoQr ? (
            <>
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Preparando…
            </>
          ) : (
            <>
              <QrCode className="w-4 h-4 mr-1.5" /> Usar QR Code
            </>
          )}
        </Button>
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Conecta o seu celular lendo um código. É o único canal com grupos e agenda do
          aparelho — e o único que a Meta pode bloquear por conversa fria.
        </p>
      </div>
    </div>
  )
}
