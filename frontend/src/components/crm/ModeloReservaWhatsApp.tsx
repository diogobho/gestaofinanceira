import SeletorModeloWhatsApp from '@/components/whatsapp/SeletorModeloWhatsApp'
import { useModelosWhatsApp } from '@/hooks/useCanalWhatsApp'
import type { ModeloConfigurado } from '@/api/canalWhatsapp'
import ModelosDoPasso from './ModelosDoPasso'

interface Props {
  valor: ModeloConfigurado | null
  onChange: (v: ModeloConfigurado | null) => void
  /** A mensagem é do agente de IA (muda só o texto de explicação). */
  ehIA?: boolean
}

/**
 * Modelo aprovado que sai no lugar da mensagem quando, no número oficial, o lead não
 * escreveu nas últimas 24h (fora da janela a Meta não entrega texto livre).
 * Usado no passo da cadência e no follow-up avulso do card — renderizar só no oficial.
 */
export default function ModeloReservaWhatsApp({ valor, onChange, ehIA }: Props) {
  const { data: modelos = [], isLoading, refetch } = useModelosWhatsApp(true)
  return (
    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
      <p className="text-xs font-semibold text-emerald-800">Modelo de reserva — janela de 24h fechada</p>
      <p className="text-[11px] text-gray-600">
        No WhatsApp oficial, se o lead não escreveu nas últimas 24h esta mensagem
        {ehIA ? ' (e a do agente de IA)' : ''} não é entregue. Com um modelo aqui, ele sai no lugar;
        sem modelo, o follow-up fica como falha com o motivo.
      </p>
      <SeletorModeloWhatsApp
        variaveisDoFollowup
        modelos={modelos}
        carregando={isLoading}
        valor={valor}
        onChange={onChange}
        modo="variaveis"
        sugestaoPrimeira="[PrimeiroNome]"
        onRecarregar={() => refetch()}
        permitirNenhum
        rotuloNenhum="Sem modelo de reserva"
      />
      {valor?.nome && (
        <ModelosDoPasso modelo={valor} modelos={modelos} onTrocar={(novo) => onChange(novo)}
          avisoTroca="Salve a etapa para o fluxo usar o texto novo." />
      )}
    </div>
  )
}
