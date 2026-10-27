import React, { useMemo, useState } from 'react'
import { Cake, Mail, MessageCircle } from 'lucide-react'
import { Card } from '@/components/ui'
import type { Client } from '@/types'

const DIA = 24 * 60 * 60 * 1000

export interface Aniversariante {
  client: Client
  /** Dias até o próximo aniversário: 0 = hoje. */
  dias: number
  diaMes: string
  /** Idade que a pessoa faz; null quando o ano não é confiável. */
  idade: number | null
}

/**
 * Próximos aniversários a partir de `hoje`, em ordem. `aniversario` é DATE: os 10 primeiros
 * caracteres (sem passar pelo fuso). Quem nasceu em 29/02 comemora em 28/02 no ano não bissexto.
 */
export function proximosAniversarios(clients: Client[], dentroDeDias: number, hoje = new Date()): Aniversariante[] {
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const lista: Aniversariante[] = []
  for (const client of clients) {
    const iso = String(client.aniversario ?? '').slice(0, 10)
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
    if (!m) continue
    const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
    const naData = (a: number) => {
      const bissexto = (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0
      return new Date(a, mes - 1, mes === 2 && dia === 29 && !bissexto ? 28 : dia)
    }
    let proximo = naData(base.getFullYear())
    if (proximo < base) proximo = naData(base.getFullYear() + 1)
    const dias = Math.round((proximo.getTime() - base.getTime()) / DIA)
    if (dias > dentroDeDias) continue
    const idade = ano > 1900 && ano < proximo.getFullYear() ? proximo.getFullYear() - ano : null
    lista.push({ client, dias, diaMes: `${m[3]}/${m[2]}`, idade })
  }
  return lista.sort((a, b) => a.dias - b.dias || a.client.nome.localeCompare(b.client.nome))
}

const quando = (dias: number) => dias === 0 ? 'Hoje' : dias === 1 ? 'Amanhã' : `Em ${dias} dias`

/** Link do WhatsApp com o número do cadastro; DDD sem 55 ganha o 55. */
function linkWhatsApp(telefone?: string | null, nome?: string) {
  let n = String(telefone || '').replace(/\D/g, '')
  if (n.length === 10 || n.length === 11) n = `55${n}`
  if (n.length < 12) return null
  const primeiro = (nome || '').split(' ')[0]
  return `https://wa.me/${n}?text=${encodeURIComponent(`Feliz aniversário, ${primeiro}! 🎉`)}`
}

const PERIODOS = [7, 30, 90]

interface Props {
  clients: Client[]
  onEmail: (client: Client) => void
}

export const AniversariantesProximos: React.FC<Props> = ({ clients, onEmail }) => {
  const [periodo, setPeriodo] = useState(30)
  const lista = useMemo(() => proximosAniversarios(clients, periodo), [clients, periodo])
  const comData = clients.filter(c => c.aniversario).length

  return (
    <Card className="mb-4 sm:mb-6" data-tour="clientes-aniversariantes">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Cake className="w-5 h-5 text-gold-600" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Próximos aniversariantes</h3>
        </div>
        <div className="flex gap-1" role="group" aria-label="Período">
          {PERIODOS.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriodo(p)}
              aria-pressed={periodo === p}
              className={`px-3 py-1 text-xs rounded-full border ${periodo === p
                ? 'bg-primary-600 text-white border-primary-600'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'}`}
            >
              {p} dias
            </button>
          ))}
        </div>
      </div>

      {lista.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {comData === 0
            ? 'Nenhum cadastro tem data de aniversário. Preencha o campo Aniversário ao editar.'
            : `Ninguém faz aniversário nos próximos ${periodo} dias.`}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {lista.map(({ client, dias, diaMes, idade }) => {
            const whats = linkWhatsApp(client.telefone, client.nome)
            return (
              <li key={client.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${dias === 0
                  ? 'bg-gold-100 text-gold-800 dark:bg-gold-900/30 dark:text-gold-300'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                  {quando(dias)}
                </span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{client.nome}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {diaMes}{idade ? ` · faz ${idade} anos` : ''}
                </span>
                <span className="ml-auto flex gap-1">
                  {whats && (
                    <a href={whats} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                      title="Mandar parabéns pelo WhatsApp" aria-label={`Mandar parabéns para ${client.nome} pelo WhatsApp`}>
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  )}
                  {client.email && (
                    <button type="button" onClick={() => onEmail(client)}
                      className="p-1.5 rounded text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      title="Mandar parabéns por e-mail" aria-label={`Mandar parabéns para ${client.nome} por e-mail`}>
                      <Mail className="w-4 h-4" />
                    </button>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

export default AniversariantesProximos
