import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '@/api'

export const useDashboard = () => {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => reportsApi.getDashboard(),
    staleTime: 2 * 60 * 1000,
  })
}
