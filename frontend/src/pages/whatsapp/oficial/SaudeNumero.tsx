import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { canalWhatsappApi } from '@/api/canalWhatsapp'

/**
 * O que limita o envio, dito pela própria Meta (`health_status`).
 *
 * Número recém-conectado nasce com teto de 250 contatos novos por dia, e o motivo
 * quase sempre está fora do CRM: nome de exibição em análise, portfólio sem
 * verificação, falta de forma de pagamento. A tela mostra o motivo que a Meta dá e
 * aponta para o WhatsApp Manager, onde cada um se resolve.
 */

const LIMITE: Record<string, string> = {
  TIER_50: '50 contatos novos por dia',
  TIER_250: '250 contatos novos por dia',
  TIER_1K: '1.000 contatos novos por dia',
  TIER_2K: '2.000 contatos novos por dia',
  TIER_10K: '10.000 contatos novos por dia',
  TIER_100K: '100.000 contatos novos por dia',
  TIER_UNLIMITED: 'Sem limite de contatos novos',
}

const PODE_ENVIAR: Record<string, { texto: string; classe: string }> = {
  AVAILABLE: { texto: 'Liberado', classe: 'bg-emerald-100 text-emerald-800' },
  LIMITED: { texto: 'Com limite', classe: 'bg-amber-100 text-amber-800' },
  BLOCKED: { texto: 'Bloqueado', classe: 'bg-red-100 text-red-800' },
}

const NOME: Record<string, string> = {
  APPROVED: 'aprovado',
  AVAILABLE_WITHOUT_REVIEW: 'em uso, aguardando análise da Meta',
  PENDING_REVIEW: 'em análise',
  DECLINED: 'recusado',
  NONE: '—',
}

/** A Meta responde em inglês; as frases mais comuns vão traduzidas, o resto segue como veio. */
function traduzir(texto: string): string {
  const mapa: [RegExp, string][] = [
    [/display name has not been approved yet/i, 'O nome de exibição ainda não foi aprovado. O limite de envio sobe depois da aprovação.'],
    [/has not passed business verification/i, 'O portfólio da empresa ainda não passou pela verificação do negócio.'],
    [/start or resolve the business verification/i, 'Abra Configurações do negócio → Central de segurança e inicie a verificação.'],
    [/payment method/i, 'Falta cadastrar a forma de pagamento da conta do WhatsApp.'],
  ]
  for (const [re, pt] of mapa) if (re.test(texto)) return pt
  return texto
}

export const SaudeNumero: React.FC = () => {
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['whatsapp', 'oficial', 'saude'],
    queryFn: canalWhatsappApi.getSaude,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const saude = data?.saude
  const pode = saude?.podeEnviar ? PODE_ENVIAR[saude.podeEnviar] : null
  const manager = data?.wabaId
    ? `https://business.facebook.com/wa/manage/home/?waba_id=${data.wabaId}`
    : 'https://business.facebook.com/wa/manage/home/'

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-600" /> Saúde do número na Meta
        </h2>
        <button onClick={() => refetch()} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} /> atualizar
        </button>
      </div>

      {isLoading ? (
        <div className="py-6 flex justify-center"><Spinner /></div>
      ) : error || !saude ? (
        <p className="text-sm text-red-700">
          {(error as any)?.response?.data?.message || 'A Meta não respondeu sobre o número.'}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="border rounded-lg p-3">
              <dt className="text-gray-500 text-xs">Envio</dt>
              <dd className="mt-1">
                {pode ? <span className={`px-2 py-0.5 rounded text-xs font-medium ${pode.classe}`}>{pode.texto}</span> : '—'}
              </dd>
            </div>
            <div className="border rounded-lg p-3">
              <dt className="text-gray-500 text-xs">Limite atual</dt>
              <dd className="mt-1 font-medium text-gray-900">{(saude.limite && LIMITE[saude.limite]) || saude.limite || '—'}</dd>
            </div>
            <div className="border rounded-lg p-3">
              <dt className="text-gray-500 text-xs">Nome de exibição</dt>
              <dd className="mt-1 font-medium text-gray-900 truncate" title={saude.nomeExibido ?? ''}>
                {saude.nomeExibido || '—'}
              </dd>
              <dd className="text-xs text-gray-500">{NOME[saude.statusNome ?? ''] ?? saude.statusNome}</dd>
              {saude.nomeNovo && saude.statusNomeNovo && saude.statusNomeNovo !== 'NONE' && (
                <dd className="text-xs text-gray-500">
                  Novo nome “{saude.nomeNovo}”: {NOME[saude.statusNomeNovo] ?? saude.statusNomeNovo}
                </dd>
              )}
            </div>
          </dl>

          {saude.pendencias.length > 0 && (
            <ul className="mt-4 space-y-2">
              {saude.pendencias.map((p, i) => (
                <li key={i} className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-900">
                      <span className="font-medium">{p.nivel}:</span> {traduzir(p.motivo)}
                    </p>
                    {p.solucao && <p className="text-amber-800 text-xs mt-0.5">{traduzir(p.solucao)}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-xs text-gray-500">
            Nome de exibição, verificação do negócio e forma de pagamento se resolvem no{' '}
            <a href={manager} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline inline-flex items-center gap-0.5">
              WhatsApp Manager <ExternalLink size={11} />
            </a>
            . Sem forma de pagamento, a Meta recusa as conversas que a empresa inicia (disparos e cadências).
          </p>
        </>
      )}
    </Card>
  )
}
