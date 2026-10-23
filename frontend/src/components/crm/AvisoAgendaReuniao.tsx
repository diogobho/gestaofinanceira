import React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, CalendarPlus } from 'lucide-react'
import { agendaExternaApi } from '@/api/agendaExterna'

/** Durações oferecidas para reunião (104). */
export const DURACOES_REUNIAO: [number, string][] = [
  [15, '15 minutos'], [30, '30 minutos'], [45, '45 minutos'], [60, '1 hora'], [90, '1h30'], [120, '2 horas'],
]

/*
  No formulário de tarefa tipo Reunião: diz se ela vai para a agenda de quem marca
  (agenda externa, 103) — ou convida a conectar em Meu perfil.
*/
export const AvisoAgendaReuniao: React.FC = () => {
  const status = useQuery({ queryKey: ['agenda-externa'], queryFn: agendaExternaApi.status, staleTime: 5 * 60_000 })
  const conta = status.data?.conta
  if (status.isLoading) return null
  if (conta && !conta.erro) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
        <CalendarCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
        Vai para a sua agenda {conta.provedor === 'google' ? 'do Google, com link do Meet' : 'da Microsoft, com link do Teams'}
        {conta.email ? ` (${conta.email})` : ''}. O lead com e-mail recebe o convite.
      </p>
    )
  }
  return (
    <p className="flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
      <CalendarPlus className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>
        {conta?.erro ? 'A sua agenda precisa ser reconectada. ' : 'Quer esta reunião na sua agenda do Google ou da Microsoft, com link de vídeo? '}
        <Link to="/perfil" className="font-medium text-primary-600 hover:underline">Conectar em Meu perfil</Link>
      </span>
    </p>
  )
}
