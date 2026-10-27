import React, { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { CalendarCheck, AlertTriangle } from 'lucide-react'
import { Badge, Button, Card, Spinner } from '@/components/ui'
import { agendaExternaApi, type ProvedorAgenda } from '@/api/agendaExterna'
import { LinkVideo } from '@/tutoriais/LinkVideo'

const NOME: Record<ProvedorAgenda, string> = { google: 'Google Agenda', microsoft: 'Microsoft 365 / Teams' }
const SALA: Record<ProvedorAgenda, string> = { google: 'Google Meet', microsoft: 'Microsoft Teams' }
const RETORNO: Record<string, [boolean, string]> = {
  ok: [true, 'Agenda conectada. As suas reuniões do CRM vão aparecer lá.'],
  cancelada: [false, 'Conexão cancelada.'],
  expirada: [false, 'O tempo para conectar acabou. Tente de novo.'],
  erro: [false, 'Não foi possível conectar a agenda. Tente de novo.'],
}

/*
  Agenda externa (103): cada pessoa conecta a PRÓPRIA agenda. As reuniões do CRM em que ela é a
  responsável viram eventos lá, com sala do Meet ou do Teams, e o lead com e-mail recebe o convite.
*/
export const AgendaExternaCard: React.FC = () => {
  const qc = useQueryClient()
  const status = useQuery({ queryKey: ['agenda-externa'], queryFn: agendaExternaApi.status })

  // Volta do login do Google/Microsoft: /configuracoes/email?agenda=ok|erro|…
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const r = q.get('agenda')
    if (!r) return
    const [ok, msg] = RETORNO[r] || RETORNO.erro
    if (ok) toast.success(msg); else toast.error(msg)
    q.delete('agenda')
    window.history.replaceState(null, '', `${window.location.pathname}${q.toString() ? `?${q}` : ''}`)
  }, [])

  const conectar = useMutation({
    mutationFn: agendaExternaApi.conectar,
    onSuccess: ({ url }) => { window.location.href = url },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Não foi possível iniciar a conexão'),
  })
  const desconectar = useMutation({
    mutationFn: agendaExternaApi.desconectar,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agenda-externa'] }); toast.success('Agenda desconectada') },
    onError: () => toast.error('Não foi possível desconectar'),
  })

  const conta = status.data?.conta
  return (
    <Card title="Agenda (Google ou Microsoft)">
      {status.isLoading ? <div className="flex justify-center py-6"><Spinner /></div> : (
        <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
          <p>
            As reuniões do CRM em que você é o responsável — marcadas por você, pela equipe ou pelo agente de IA — entram na sua agenda
            com a sala de vídeo pronta. Remarcar ou cancelar no Duo atualiza lá, e o lead com e-mail recebe o convite.
          </p>
          <LinkVideo video="conectar-agenda" />
          {conta ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <CalendarCheck className="w-5 h-5 text-emerald-600" aria-hidden="true" />
                <span className="font-medium text-gray-900 dark:text-gray-100">{NOME[conta.provedor]}</span>
                {conta.email && <span className="text-gray-500 dark:text-gray-400">· {conta.email}</span>}
                <Badge variant={conta.erro ? 'warning' : 'success'}>{conta.erro ? 'Precisa reconectar' : `Conectada · ${SALA[conta.provedor]}`}</Badge>
              </div>
              {conta.erro && (
                <p className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> {conta.erro}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {conta.erro && <Button size="sm" onClick={() => conectar.mutate(conta.provedor)} isLoading={conectar.isPending}>Reconectar</Button>}
                <Button size="sm" variant="secondary" isLoading={desconectar.isPending}
                  onClick={() => { if (confirm('Desconectar a agenda? As reuniões futuras que o Duo pôs lá serão apagadas.')) desconectar.mutate() }}>
                  Desconectar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(status.data?.provedores || []).map(p => (
                <Button key={p.provedor} variant="secondary" disabled={!p.configurado} isLoading={conectar.isPending && conectar.variables === p.provedor}
                  title={p.configurado ? undefined : 'Ainda não disponível'} onClick={() => conectar.mutate(p.provedor)}>
                  Conectar {NOME[p.provedor]}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
