import React, { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Store, Camera } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/Spinner'
import { canalWhatsappApi, type PerfilComercial as Perfil } from '@/api/canalWhatsapp'

/**
 * O perfil que o cliente vê ao tocar no nome do número no WhatsApp: foto, recado,
 * descrição, endereço, e-mail, sites e categoria. Vai direto para a Meta — nada é
 * guardado no CRM.
 */

const CATEGORIAS = [
  ['EDU', 'Educação'],
  ['PROF_SERVICES', 'Serviços profissionais'],
  ['FINANCE', 'Finanças e bancos'],
  ['HEALTH', 'Saúde'],
  ['BEAUTY', 'Beleza, estética e cuidados pessoais'],
  ['RETAIL', 'Varejo'],
  ['APPAREL', 'Vestuário'],
  ['RESTAURANT', 'Restaurante'],
  ['GROCERY', 'Mercado'],
  ['EVENT_PLAN', 'Eventos'],
  ['ENTERTAIN', 'Entretenimento'],
  ['TRAVEL', 'Viagem e turismo'],
  ['HOTEL', 'Hotelaria'],
  ['AUTO', 'Automotivo'],
  ['NONPROFIT', 'Sem fins lucrativos'],
  ['GOVT', 'Governo'],
  ['OTHER', 'Outro'],
].map(([value, label]) => ({ value, label }))

export const PerfilComercial: React.FC = () => {
  const queryClient = useQueryClient()
  const arquivo = useRef<HTMLInputElement>(null)
  const { data, isLoading, error } = useQuery({
    queryKey: ['whatsapp', 'oficial', 'perfil'],
    queryFn: canalWhatsappApi.getPerfil,
    staleTime: 5 * 60_000,
    retry: false,
  })
  const [f, setF] = useState<Perfil>({})

  useEffect(() => {
    if (data?.perfil) setF({ ...data.perfil, websites: data.perfil.websites ?? [] })
  }, [data])

  const salvar = useMutation({
    mutationFn: () =>
      canalWhatsappApi.salvarPerfil({
        about: f.about ?? '',
        description: f.description ?? '',
        address: f.address ?? '',
        email: f.email ?? '',
        websites: (f.websites ?? []).map((s) => s.trim()).filter(Boolean),
        vertical: f.vertical,
      }),
    onSuccess: () => {
      toast.success('Perfil atualizado no WhatsApp')
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'oficial', 'perfil'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'A Meta recusou o perfil'),
  })

  const foto = useMutation({
    mutationFn: (a: File) => canalWhatsappApi.trocarFoto(a),
    onSuccess: () => {
      toast.success('Foto enviada. O WhatsApp pode levar alguns minutos para mostrar.')
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'oficial', 'perfil'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'A Meta recusou a foto'),
  })

  const podeEditar = !!data?.podeEditar
  const sites = f.websites ?? []

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-1">
        <Store className="w-5 h-5 text-emerald-600" /> Perfil do WhatsApp
      </h2>
      <p className="text-sm text-gray-600 mb-4">O que o cliente vê ao tocar no nome do número.</p>

      {isLoading ? (
        <div className="py-6 flex justify-center"><Spinner /></div>
      ) : error ? (
        <p className="text-sm text-red-700">{(error as any)?.response?.data?.message || 'A Meta não devolveu o perfil.'}</p>
      ) : (
        <fieldset disabled={!podeEditar || salvar.isPending} className="space-y-4">
          {!podeEditar && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
              Só o dono do número ou um administrador da empresa altera o perfil.
            </p>
          )}
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
              {data?.perfil.profile_picture_url ? (
                <img src={data.perfil.profile_picture_url} alt="Foto do perfil" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-8 h-8 text-gray-400" />
              )}
            </div>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!podeEditar || foto.isPending}
                onClick={() => arquivo.current?.click()}
              >
                {foto.isPending ? 'Enviando…' : 'Trocar foto'}
              </Button>
              <p className="text-xs text-gray-500 mt-1">JPG ou PNG quadrado, 640×640, até 5 MB. Fundo transparente vira preto.</p>
              <input
                ref={arquivo}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={(e) => {
                  const a = e.target.files?.[0]
                  if (a) foto.mutate(a)
                  e.target.value = ''
                }}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="Recado (sobre)" value={f.about ?? ''} maxLength={139} onChange={(e) => setF({ ...f, about: e.target.value })} />
            <Select label="Categoria" value={f.vertical ?? ''} onChange={(e) => setF({ ...f, vertical: e.target.value })}>
              <option value="">—</option>
              {CATEGORIAS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descrição</label>
            <textarea
              value={f.description ?? ''}
              maxLength={512}
              rows={3}
              onChange={(e) => setF({ ...f, description: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="Endereço" value={f.address ?? ''} maxLength={256} onChange={(e) => setF({ ...f, address: e.target.value })} />
            <Input label="E-mail" type="email" value={f.email ?? ''} maxLength={128} onChange={(e) => setF({ ...f, email: e.target.value })} />
            {[0, 1].map((i) => (
              <Input
                key={i}
                label={`Site ${i + 1}`}
                placeholder="https://"
                value={sites[i] ?? ''}
                onChange={(e) => {
                  const novo = [...sites]
                  novo[i] = e.target.value
                  setF({ ...f, websites: novo })
                }}
              />
            ))}
          </div>
          {podeEditar && (
            <div className="flex justify-end">
              <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                {salvar.isPending ? 'Salvando…' : 'Salvar perfil'}
              </Button>
            </div>
          )}
        </fieldset>
      )}
    </Card>
  )
}
