import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Unplug } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { mcpApi, ConexoesMcp } from '@/api/agente'
import { LinkVideo } from '@/tutoriais/LinkVideo'

/**
 * Duo dentro do Claude (MCP, 112). A pessoa cola o endereço como conector no Claude
 * e entra com o próprio login do Duo; o Claude passa a ver e fazer só o que ela pode.
 * Por esse caminho não se gasta crédito do Duo — a conversa roda na conta Claude dela.
 */
export default function DuoNoClaude() {
  const [d, setD] = useState<ConexoesMcp | null>(null)
  const carregar = useCallback(() => { mcpApi.get().then(setD).catch(() => {}) }, [])
  useEffect(carregar, [carregar])
  if (!d) return null

  const copiar = async () => {
    try { await navigator.clipboard.writeText(d.url); toast.success('Endereço copiado') }
    catch { toast.error('Não deu para copiar. Selecione o endereço e copie.') }
  }
  const revogar = async (id: number) => {
    if (!confirm('Desconectar este aplicativo do seu Duo?')) return
    try { await mcpApi.revogar(id); toast.success('Desconectado'); carregar() }
    catch { toast.error('Não foi possível desconectar') }
  }

  return (
    <Card>
      <div className="space-y-4 p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-gray-800 dark:text-gray-200">Usar o Duo dentro do Claude</h2>
            <LinkVideo video="duo-conectar-claude" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Conecte o Duo ao seu Claude e peça por lá: consultar o financeiro, ver leads, criar tarefas, ler conversas e preparar disparos. Por esse caminho não se gasta crédito do Duo.
          </p>
          <p className="mt-1 flex flex-wrap gap-x-4 text-sm">
            <Link to="/comandos-duo" className="font-medium text-primary-700 hover:underline dark:text-primary-300">Comandos sugeridos</Link>
            <a href="/assets/manuais/manual-duo.pdf" target="_blank" rel="noreferrer" className="font-medium text-primary-700 hover:underline dark:text-primary-300">Manual do Duo (PDF)</a>
          </p>
        </div>
        <input
          readOnly
          value={d.url}
          onFocus={e => e.currentTarget.select()}
          aria-label="Endereço do conector do Duo"
          className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <Button variant="outline" onClick={copiar}><Copy className="mr-1.5 h-4 w-4" /> Copiar endereço</Button>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-600 dark:text-gray-300">
          <li>No Claude, abra Configurações e depois Conectores.</li>
          <li>Escolha adicionar um conector personalizado e cole o endereço acima.</li>
          <li>Em Autenticação deixe "Entrar agora" e em Cliente OAuth "Registrar automaticamente". Cabeçalhos ficam em branco.</li>
          <li>Entre com o seu e-mail e senha do Duo e autorize.</li>
          <li>Numa conversa nova do Claude, confira se "Duo" está ligado nas ferramentas e peça em português normal.</li>
        </ol>
        {d.conexoes.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium text-gray-800 dark:text-gray-200">Conectados à sua conta</h3>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {d.conexoes.map(c => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="text-gray-700 dark:text-gray-200">
                    {c.aplicativo} · {c.ultimo_uso_em ? `usado em ${new Date(c.ultimo_uso_em).toLocaleDateString('pt-BR')}` : `desde ${new Date(c.created_at).toLocaleDateString('pt-BR')}`}
                  </span>
                  <button type="button" onClick={() => revogar(c.id)} className="inline-flex items-center gap-1 text-red-600 hover:underline dark:text-red-400">
                    <Unplug className="h-3.5 w-3.5" /> Desconectar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  )
}
