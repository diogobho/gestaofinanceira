import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { canalWhatsappApi } from '@/api/canalWhatsapp'

/** Canal da empresa. Muda raramente (a DuoFuturo liga/desliga o oficial): 5 min de cache. */
export const useCanalWhatsApp = () =>
  useQuery({
    queryKey: ['whatsapp', 'canal'],
    queryFn: canalWhatsappApi.getCanal,
    staleTime: 5 * 60_000,
  })

export const useModelosWhatsApp = (habilitado = true) =>
  useQuery({
    queryKey: ['whatsapp', 'modelos'],
    queryFn: () => canalWhatsappApi.getModelos(),
    enabled: habilitado,
    staleTime: 5 * 60_000,
  })

/**
 * Janela de 24h do lead. Reconsulta a cada minuto e junto com o histórico — uma
 * mensagem nova do cliente reabre a janela, e o chat precisa perceber sozinho.
 */
export const useJanelaWhatsApp = (leadId: number | undefined, habilitado = true) =>
  useQuery({
    queryKey: ['whatsapp', 'janela', leadId],
    queryFn: () => canalWhatsappApi.getJanela({ lead_id: leadId }),
    enabled: !!leadId && habilitado,
    refetchInterval: 60_000,
  })

export const useEnviarModeloLead = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (p: { leadId: number; nome: string; idioma?: string; corpo: string[]; cabecalho?: string | null }) =>
      canalWhatsappApi.enviarModeloLead(p.leadId, {
        nome: p.nome,
        idioma: p.idioma,
        valores: { corpo: p.corpo, cabecalho: p.cabecalho ?? null },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'historico'] })
      queryClient.invalidateQueries({ queryKey: ['crm', 'lead-historico'] })
      toast.success('Modelo enviado!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao enviar o modelo')
    },
  })
}
