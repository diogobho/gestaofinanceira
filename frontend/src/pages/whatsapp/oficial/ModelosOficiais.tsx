import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FileText, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { BotaoDoPlano } from '@/components/plano/BotaoDoPlano'
import { useModelosWhatsApp } from '@/hooks/useCanalWhatsApp'
import { canalWhatsappApi, type ModeloWhatsApp } from '@/api/canalWhatsapp'
import { CriarModeloModal } from './CriarModeloModal'

const STATUS: Record<string, { texto: string; classe: string }> = {
  APPROVED: { texto: 'Aprovado', classe: 'bg-emerald-100 text-emerald-800' },
  PENDING: { texto: 'Em análise', classe: 'bg-sky-100 text-sky-800' },
  REJECTED: { texto: 'Recusado', classe: 'bg-red-100 text-red-800' },
  PAUSED: { texto: 'Pausado', classe: 'bg-amber-100 text-amber-800' },
  DISABLED: { texto: 'Desativado', classe: 'bg-gray-200 text-gray-700' },
}

const CATEGORIA: Record<string, string> = { MARKETING: 'marketing', UTILITY: 'utilidade', AUTHENTICATION: 'autenticação' }

/** Motivos de recusa que a Meta devolve em código. */
const RECUSA: Record<string, string> = {
  INVALID_FORMAT: 'formato inválido (variável no começo/fim, variáveis demais para o tamanho do texto)',
  PROMOTIONAL: 'conteúdo promocional numa categoria que não é marketing',
  TAG_CONTENT_MISMATCH: 'o texto não combina com a categoria escolhida',
  SCAM: 'parece golpe ou engano',
  ABUSIVE_CONTENT: 'conteúdo que viola as políticas do WhatsApp',
  INCORRECT_CATEGORY: 'categoria incorreta',
}

export const ModelosOficiais: React.FC = () => {
  const queryClient = useQueryClient()
  const [criando, setCriando] = useState(false)
  const { data: modelos = [], isLoading, isFetching, refetch } = useModelosWhatsApp(true)

  const excluir = useMutation({
    mutationFn: (m: ModeloWhatsApp) => canalWhatsappApi.excluirModelo(m.nome, m.id),
    onSuccess: () => {
      toast.success('Modelo excluído')
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'modelos'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'A Meta não excluiu o modelo'),
  })

  const confirmarExclusao = (m: ModeloWhatsApp) => {
    if (
      window.confirm(
        `Excluir o modelo "${m.nome}"?\n\nDisparos e cadências que usam este modelo vão falhar, e a Meta não deixa ` +
          'criar outro com o mesmo nome por 30 dias.'
      )
    ) {
      excluir.mutate(m)
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mr-auto">
          <FileText className="w-5 h-5 text-emerald-600" /> Modelos de mensagem
        </h2>
        <button onClick={() => refetch()} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} /> atualizar
        </button>
        <BotaoDoPlano capacidade="modelos_meta">
          <Button size="sm" onClick={() => setCriando(true)} className="flex items-center gap-1">
            <Plus size={14} /> Criar modelo
          </Button>
        </BotaoDoPlano>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Fora da janela de 24h a Meta só entrega modelo aprovado — é com ele que sai o disparo em massa, a cadência e a
        primeira mensagem para quem nunca falou com você.
      </p>

      {isLoading ? (
        <div className="py-6 flex justify-center"><Spinner /></div>
      ) : modelos.length === 0 ? (
        <p className="text-sm text-gray-600">Nenhum modelo ainda. Sem modelo aprovado, o número só responde quem escreveu primeiro — em “Criar modelo” há seis prontos para começar (abordagem, reativação, lembrete de reunião…).</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {modelos.map((m) => {
            const st = STATUS[m.status] ?? { texto: m.status.toLowerCase(), classe: 'bg-gray-100 text-gray-700' }
            return (
              <div key={m.id} className="border rounded-lg p-3 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-mono text-sm text-gray-900 break-all">{m.nome}</span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-medium shrink-0 ${st.classe}`}>{st.texto}</span>
                </div>
                <p className="text-[11px] text-gray-500 mb-2">
                  {m.idioma} · {CATEGORIA[m.categoria] ?? m.categoria.toLowerCase()}
                </p>
                {m.cabecalho && <p className="text-sm font-semibold text-gray-800">{m.cabecalho}</p>}
                <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-5">{m.corpo}</p>
                {m.rodape && <p className="text-xs text-gray-500 mt-1">{m.rodape}</p>}
                {m.botoes.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {m.botoes.map((b, i) => (
                      <span key={i} className="text-[11px] border rounded px-1.5 py-0.5 text-sky-700">{b}</span>
                    ))}
                  </div>
                )}
                {m.status === 'REJECTED' && m.motivoRecusa && (
                  <p className="text-xs text-red-700 mt-2">Motivo: {RECUSA[m.motivoRecusa] ?? m.motivoRecusa}</p>
                )}
                {m.status === 'APPROVED' && !m.suportado && m.motivoNaoSuportado && (
                  <p className="text-[11px] text-amber-700 mt-2">{m.motivoNaoSuportado}</p>
                )}
                <div className="mt-auto pt-2 flex justify-end">
                  <button
                    onClick={() => confirmarExclusao(m)}
                    disabled={excluir.isPending}
                    className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1"
                  >
                    <Trash2 size={12} /> excluir
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <CriarModeloModal aberto={criando} onFechar={() => setCriando(false)} existentes={modelos.map((m) => m.nome)} />
    </Card>
  )
}
