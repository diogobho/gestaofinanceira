import React from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, CheckCircle, AlertCircle, Clock, FileText, RefreshCw, Cloud, ShieldCheck, MessageSquare } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/contexts/AuthContext'
import { useCanalWhatsApp, useModelosWhatsApp } from '@/hooks/useCanalWhatsApp'
import { formatarNumeroBR, type CanalWhatsApp } from '@/api/canalWhatsapp'

/**
 * /gestao/whatsapp para empresa no número oficial (WhatsApp Cloud API da Meta).
 *
 * Não há QR Code, chip nem "desconectar": o número vive nos servidores da Meta e
 * todos os usuários da empresa enviam e recebem por ele. O que o operador precisa
 * entender aqui são as duas regras novas — janela de 24h e modelo aprovado — e ver
 * a saúde do número (qualidade atribuída pela Meta).
 */

const QUALIDADE: Record<string, { texto: string; classe: string; dica: string }> = {
  GREEN: { texto: 'Alta', classe: 'bg-emerald-100 text-emerald-800', dica: 'Pouca denúncia e bloqueio: o número pode crescer o limite de envio.' },
  YELLOW: { texto: 'Média', classe: 'bg-amber-100 text-amber-800', dica: 'Clientes estão bloqueando ou denunciando. Reveja o conteúdo e a frequência dos disparos.' },
  RED: { texto: 'Baixa', classe: 'bg-red-100 text-red-800', dica: 'Risco de restrição pela Meta. Pare os disparos de marketing e fale com a DuoFuturo.' },
}

export const NumeroOficialPainel: React.FC<{ canal: CanalWhatsApp }> = ({ canal }) => {
  const { user } = useAuth()
  const { refetch, isFetching } = useCanalWhatsApp()
  const { data: modelos = [], isLoading: carregandoModelos, refetch: refetchModelos, isFetching: buscandoModelos } =
    useModelosWhatsApp(true)
  const qualidade = canal.qualidade ? QUALIDADE[canal.qualidade] : null
  const aprovados = modelos.filter((m) => m.status === 'APPROVED')
  const outros = modelos.filter((m) => m.status !== 'APPROVED')

  return (
    <div className="max-w-5xl mx-auto px-4 py-4 sm:px-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-8 h-8 text-green-600" />
            WhatsApp da Empresa
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
              {canal.conectado
                ? 'Conectado na Meta. Todos os usuários da empresa enviam e recebem por este número.'
                : `A Meta não respondeu sobre o número${canal.erro ? `: ${canal.erro}` : ''}. Fale com a DuoFuturo.`}
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
          </div>
        </div>
        {qualidade && canal.qualidade !== 'GREEN' && (
          <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">{qualidade.dica}</p>
        )}
      </Card>

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

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600" /> Modelos aprovados
          </h2>
          <button onClick={() => refetchModelos()} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <RefreshCw size={12} className={buscandoModelos ? 'animate-spin' : ''} /> atualizar
          </button>
        </div>
        {carregandoModelos ? (
          <div className="py-6 flex justify-center"><Spinner /></div>
        ) : aprovados.length === 0 ? (
          <p className="text-sm text-gray-600">Nenhum modelo aprovado ainda. Sem modelo, só dá para responder quem escreveu nas últimas 24h.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {aprovados.map((m) => (
              <div key={m.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono text-sm text-gray-900 truncate">{m.nome}</span>
                  <span className="text-[11px] text-gray-500 shrink-0">
                    {m.idioma} · {m.categoria === 'MARKETING' ? 'marketing' : m.categoria === 'UTILITY' ? 'utilidade' : m.categoria.toLowerCase()}
                  </span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">{m.corpo}</p>
                {!m.suportado && <p className="text-[11px] text-amber-700 mt-1">{m.motivoNaoSuportado}</p>}
              </div>
            ))}
          </div>
        )}
        {outros.length > 0 && (
          <p className="mt-3 text-xs text-gray-500">
            Em análise ou recusados pela Meta: {outros.map((m) => `${m.nome} (${m.status.toLowerCase()})`).join(', ')}
          </p>
        )}
        <p className="mt-3 text-xs text-gray-500">
          Modelos novos são criados e enviados para aprovação da Meta{user?.nivel === 'super_admin' ? ' no painel da Cloud API' : ' pela DuoFuturo'}.
        </p>
      </Card>
    </div>
  )
}
