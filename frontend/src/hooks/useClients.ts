import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { clientsApi } from '@/api'
import type { CreateClientRequest, UpdateClientRequest } from '@/types'

export const useClients = () => {
  return useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsApi.list(),
  })
}

export const useClient = (id: string) => {
  return useQuery({
    queryKey: ['clients', id],
    queryFn: () => clientsApi.getById(id),
    enabled: !!id,
  })
}

export const useCreateClient = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (client: CreateClientRequest) => clientsApi.create(client),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Cliente criado com sucesso!')
    },
    onError: () => {
      toast.error('Erro ao criar cliente')
    },
  })
}

export const useUpdateClient = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateClientRequest }) =>
      clientsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Cliente atualizado com sucesso!')
    },
    onError: () => {
      toast.error('Erro ao atualizar cliente')
    },
  })
}

export const useDeleteClient = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => clientsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Cliente deletado com sucesso!')
    },
    onError: () => {
      toast.error('Erro ao deletar cliente')
    },
  })
}
