import { useQuery } from '@tanstack/react-query'
import { assinaturasApi } from '@/api/assinaturas'
import { useAuth } from '@/contexts/AuthContext'
import type { Capacidade } from '@/utils/capacidades'

/**
 * O que o plano desta empresa permite.
 *
 * Em react-query e não no padrão do `useAssinatura` (useState + useEffect) por um
 * motivo concreto: a pergunta é feita em várias telas ao mesmo tempo — barra do
 * CRM, página de WhatsApp, menu — e cada `useEffect` daqueles é um GET próprio.
 * Com uma queryKey só, são todas a mesma resposta em cache.
 *
 * `super_admin` recebe tudo: ele não pertence a uma empresa no sentido comercial
 * e é quem atende o suporte de todas elas — é a mesma decisão do guard da API.
 *
 * Enquanto carrega, `pode()` devolve **true**. Um botão que nasce desabilitado e
 * habilita meio segundo depois é pior do que o contrário: quem clica no intervalo
 * acha que o sistema travou. E negar de verdade é trabalho do backend, que
 * responde 403 com o motivo pronto.
 */
export function useCapacidades() {
  const { user, isAuthenticated } = useAuth()
  const ehSuperAdmin = user?.nivel === 'super_admin'

  const { data, isLoading } = useQuery({
    queryKey: ['capacidades', user?.empresa_id],
    queryFn: () => assinaturasApi.getMinhaAssinaturaComCapacidades(),
    enabled: isAuthenticated && !!user?.empresa_id && !ehSuperAdmin,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const lista = data?.capacidades ?? []
  const carregou = ehSuperAdmin || (!isLoading && !!data)

  const pode = (cap: Capacidade): boolean =>
    ehSuperAdmin || !carregou || lista.includes(cap)

  return {
    capacidades: lista,
    carregou,
    pode,
    plano: data?.assinatura?.plano?.nome ?? null,
  }
}
