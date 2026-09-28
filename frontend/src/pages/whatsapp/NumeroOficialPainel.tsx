import React from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { BadgeCheck, CheckCircle, AlertCircle, Clock, RefreshCw, Cloud, ShieldCheck, MessageSquare, Unlink } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
import { useAuth } from '@/contexts/AuthContext'
import { useCanalWhatsApp } from '@/hooks/useCanalWhatsApp'
import { useAbaNaUrl } from '@/hooks/useEstadoNaUrl'
import { canalWhatsappApi, formatarNumeroBR, type CanalWhatsApp } from '@/api/canalWhatsapp'
import { SaudeNumero } from './oficial/SaudeNumero'
import { ModelosOficiais } from './oficial/ModelosOficiais'
import { PerfilComercial } from './oficial/PerfilComercial'

/**
 * /gestao/whatsapp para quem fala pelo número oficial (WhatsApp Cloud API da Meta).
 *
 * Não há QR Code nem chip: o número vive nos servidores da Meta. Três abas:
 *  - **Visão geral** — status, saúde na Meta (limite, pendências) e as regras novas
 *    (janela de 24h, modelo aprovado);
 *  - **Modelos** — criar, acompanhar a análise e excluir;
 *  - **Perfil** — foto, recado e dados que o cliente vê.
 *
 * "Desconectar" desvincula o número do CRM e devolve o usuário ao QR Code — não
 * apaga nada na Meta. O número da empresa inteira (conta institucional) não tem o
 * botão: desligá-lo tira o canal de todo mundo, e isso é só da DuoFuturo.
 */

const ABAS = ['visao', 'modelos', 'perfil'] as const
type Aba = (typeof ABAS)[number]

const QUALIDADE: Record<string, { texto: string; classe: string; dica: string }> = {
  GREEN: { texto: 'Alta', classe: 'bg-emerald-100 text-emerald-800', dica: 'Pouca denúncia e bloqueio: o número pode crescer o limite de envio.' },
  YELLOW: { texto: 'Média', classe: 'bg-amber-100 text-amber-800', dica: 'Clientes estão bloqueando ou denunciando. Reveja o conteúdo e a frequência dos disparos.' },
  RED: { texto: 'Baixa', classe: 'bg-red-100 text-red-800', dica: 'Risco de restrição pela Meta. Pare os disparos de marketing e fale com a DuoFuturo.' },
}

export const NumeroOficialPainel: React.FC<{ canal: CanalWhatsApp }> = ({ canal }) => {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { refetch, isFetching } = useCanalWhatsApp()
  const [aba, setAba] = useAbaNaUrl<Aba>('aba', 'visao', ABAS)
  const { data: oficial } = useQuery({
    queryKey: ['whatsapp', 'canal', 'oficial'],
    queryFn: canalWhatsappApi.getOficial,
    staleTime: 60_000,
    retry: false,
  })
  const conta = oficial?.conta
  const qualidade = canal.qualidade ? QUALIDADE[canal.qualidade] : null

  const desconectar = useMutation({
    mutationFn: () => canalWhatsappApi.desconectarOficial(),
    onSuccess: () => {
      toast.success('Número desvinculado do CRM')
      queryClient.invalidateQueries({ queryKey: ['whatsapp'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Não foi possível desconectar'),
  })

  const confirmarDesconexao = () => {
    if (
      window.confirm(
        'Desvincular este número do CRM?\n\n' +
          '• Mensagens para ele deixam de chegar no CRM, e disparos e cadências param de sair por ele.\n' +
          '• Nada é apagado na Meta: o número continua na sua conta do WhatsApp e pode ser conectado de novo.\n' +
          '• Você volta para a tela de conexão (QR Code ou número oficial).'
      )
    ) {
      desconectar.mutate()
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-4 sm:px-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-8 h-8 text-green-600" />
            WhatsApp oficial
          </h1>
          <p className="text-gray-600 mt-1">Número oficial da Meta (WhatsApp Business API) — sem QR Code, sem celular ligado.</p>
        </div>
        <div className="flex items-center gap-2">
          {user?.nivel === 'super_admin' && (
            <Link to="/whatsapp/meta">
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <Cloud className="w-4 h-4" /> Cloud API
              </Button>
            </Link>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} className="flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {canal.conectado ? (
            <CheckCircle className="w-12 h-12 text-green-500 shrink-0" />
          ) : (
            <AlertCircle className="w-12 h-12 text-red-500 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 flex items-center gap-1.5">
              {canal.nomeExibicao || 'Número oficial'}
              <BadgeCheck className="w-4 h-4 text-emerald-600" aria-label="Número oficial" />
            </p>
            <p className="text-lg font-mono text-gray-800">{formatarNumeroBR(canal.numero)}</p>
            <p className="text-sm text-gray-600 mt-1">
              {!canal.conectado
                ? `A Meta não respondeu sobre o número${canal.erro ? `: ${canal.erro}` : ''}. Fale com a DuoFuturo.`
                : conta?.daEmpresa
                  ? 'Conectado na Meta. Todos os usuários da empresa enviam e recebem por este número.'
                  : 'Conectado na Meta. Suas conversas, disparos e cadências saem por este número.'}
            </p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2">
            <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${canal.conectado ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {canal.conectado ? 'Online' : 'Com problema'}
            </span>
            {qualidade && (
              <span className={`px-2 py-1 rounded text-xs font-medium ${qualidade.classe}`} title={qualidade.dica}>
                Qualidade na Meta: {qualidade.texto}
              </span>
            )}
            {conta?.meu && (
              <button
                onClick={confirmarDesconexao}
                disabled={desconectar.isPending}
                className="text-xs text-gray-500 hover:text-red-600 flex items-center gap-1"
              >
                <Unlink size={12} /> {desconectar.isPending ? 'Desconectando…' : 'Desconectar do CRM'}
              </button>
            )}
          </div>
        </div>
        {qualidade && canal.qualidade !== 'GREEN' && (
          <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">{qualidade.dica}</p>
        )}
      </Card>

      <Tabs
        active={aba}
        onChange={(k) => setAba(k as Aba)}
        tabs={[
          { key: 'visao', label: 'Visão geral' },
          { key: 'modelos', label: 'Modelos de mensagem' },
          { key: 'perfil', label: 'Perfil do WhatsApp' },
        ]}
      />

      {aba === 'visao' && (
        <>
          <SaudeNumero />
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-5">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-emerald-600" /> Janela de 24 horas
              </h2>
              <ul className="text-sm text-gray-700 space-y-2">
                <li>Quando o cliente escreve, abre uma janela de <strong>24h</strong>. Cada nova mensagem dele reinicia o relógio.</li>
                <li>Dentro da janela vale tudo: texto, áudio, foto, documento, resposta do agente de IA.</li>
                <li>Fora dela a Meta só entrega <strong>modelo aprovado</strong>. O chat do card avisa e mostra o botão “Enviar modelo”.</li>
                <li>Follow-up com a janela fechada sai pelo <strong>modelo de reserva</strong> do passo da cadência; sem ele, fica marcado como falha com o motivo.</li>
              </ul>
            </Card>
            <Card className="p-5">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" /> O que muda em relação ao QR Code
              </h2>
              <ul className="text-sm text-gray-700 space-y-2">
                <li>Sem risco de o chip cair ou ser banido por uso de aparelho não oficial.</li>
                <li>Você vê quando a mensagem foi <strong>entregue</strong> (✓✓) e <strong>lida</strong> (✓✓ azul), e o motivo quando não é entregue.</li>
                <li>Quem escreve pela primeira vez vira contato na hora — não depende da agenda de um celular.</li>
                <li>Não envia para grupos, e o disparo para quem não escreveu nas últimas 24h usa modelo aprovado (cobrado pela Meta por mensagem).</li>
              </ul>
            </Card>
          </div>
        </>
      )}
      {aba === 'modelos' && <ModelosOficiais />}
      {aba === 'perfil' && <PerfilComercial />}
    </div>
  )
}
