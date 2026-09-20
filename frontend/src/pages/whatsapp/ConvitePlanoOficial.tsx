import React from 'react'
import { BadgeCheck, ArrowRight, ShieldCheck, Send, FileCheck2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, Button } from '@/components/ui'
import { useCapacidades } from '@/hooks/useCapacidades'
import { canalWhatsappApi } from '@/api/canalWhatsapp'
import { ConectarNumeroOficial } from './ConectarNumeroOficial'

/**
 * Faixa que aparece para quem TEM direito ao número oficial e ainda está no QR.
 *
 * Ela existe porque a assinatura e o canal são coisas diferentes: assinar o
 * Enterprise dá o DIREITO ao número oficial, e o número em si só passa a existir
 * depois de o cliente autorizar a conta dele na Meta. Entre uma coisa e outra há
 * o Embedded Signup — e é esse botão.
 *
 * Ela NÃO substitui a tela de QR: o Enterprise continua podendo operar por QR, e
 * vai continuar, para grupos e sincronização de contatos, que não existem na
 * Cloud API. A migração é por usuário, um número de cada vez.
 *
 * Quando o Embedded Signup não está configurado nesta instalação (falta o app da
 * Meta no `.env`), o caminho volta a ser o chamado de suporte — um botão que
 * promete autoatendimento e entrega erro é pior do que um caminho honesto e
 * manual. Quem decide qual dos dois aparece é a API, não a tela.
 */
export const ConvitePlanoOficial: React.FC = () => {
  const { pode } = useCapacidades()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const temDireito = pode('whatsapp_oficial')

  const { data: oficial } = useQuery({
    queryKey: ['whatsapp', 'canal', 'oficial'],
    queryFn: canalWhatsappApi.getOficial,
    enabled: temDireito,
    staleTime: 60_000,
    retry: false,
  })

  if (!temDireito) return null
  // Já está no oficial: quem manda na tela é o painel do número, não este convite.
  if (oficial?.conta?.ativo) return null

  const configurado = !!oficial?.embeddedSignup?.configurado

  return (
    <Card className="mb-4 border-emerald-300 dark:border-emerald-700">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
            <BadgeCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-gray-800 dark:text-gray-100">
              O seu plano inclui o WhatsApp Oficial da Meta
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              É o canal que pode <b>iniciar conversa</b> sem expor o seu número a bloqueio.
              A conexão é feita por você, na janela da própria Meta: ela pede o cadastro da
              sua empresa, a verificação do número e uma forma de pagamento na conta dela —
              as mensagens iniciadas por você são cobradas pela Meta, direto.
            </p>

            <ul className="mt-3 grid sm:grid-cols-3 gap-2 text-xs text-gray-600 dark:text-gray-300">
              <li className="flex items-start gap-1.5">
                <Send className="w-3.5 h-3.5 mt-0.5 text-emerald-600 shrink-0" />
                Disparo em massa liberado
              </li>
              <li className="flex items-start gap-1.5">
                <FileCheck2 className="w-3.5 h-3.5 mt-0.5 text-emerald-600 shrink-0" />
                Modelos aprovados pela Meta
              </li>
              <li className="flex items-start gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-emerald-600 shrink-0" />
                Sem QR Code e sem sessão caindo
              </li>
            </ul>

            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              O QR Code continua funcionando. A troca é por usuário, um número de cada vez,
              e o histórico das conversas fica no mesmo lugar. Grupos e sincronização de
              contatos só existem no QR Code.
            </p>

            {oficial && (
              <ConectarNumeroOficial
                oficial={oficial}
                onConectado={() => {
                  queryClient.invalidateQueries({ queryKey: ['whatsapp'] })
                }}
              />
            )}

            {!configurado && (
              <Button
                variant="outline"
                className="mt-3"
                onClick={() =>
                  navigate('/suporte?assunto=' + encodeURIComponent('Ativar o WhatsApp Oficial da Meta'))
                }
              >
                Solicitar ativação <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
