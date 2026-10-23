import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Modal, Button, Input, Spinner } from '@/components/ui'
import { RefreshCw, Unplug, AlertTriangle, CheckCircle } from 'lucide-react'
import { asaasReceitasApi } from '@/api/asaasReceitas'
import { useAuth } from '@/contexts/AuthContext'
import { isAdminEmpresa } from '@/utils/roles'
import { LinkVideo } from '@/tutoriais/LinkVideo'

interface Props {
  isOpen: boolean
  onClose: () => void
}

const inicioDoAno = () => `${new Date().getFullYear()}-01-01`
const formatCnpj = (d?: string | null) =>
  !d ? '' : d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
const brl = (v?: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBr = (iso?: string | null) => {
  if (!iso) return 'ainda não'
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}
const erroDe = (e: any) => e?.response?.data?.message || 'Não foi possível concluir agora. Tente de novo.'

export const AsaasConexaoModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { user } = useAuth()
  const podeAdministrar = isAdminEmpresa(user as any)
  const qc = useQueryClient()
  const [chave, setChave] = useState('')
  const [desde, setDesde] = useState(inicioDoAno())
  const [confirmarSaida, setConfirmarSaida] = useState(false)

  const { data: st, isLoading } = useQuery({
    queryKey: ['asaas-receitas-status'],
    queryFn: asaasReceitasApi.status,
    enabled: isOpen,
    refetchInterval: isOpen ? 15000 : false,
  })
  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ['asaas-receitas-status'] })
    qc.invalidateQueries({ queryKey: ['revenues-list'] })
  }

  const conectar = useMutation({
    mutationFn: () => asaasReceitasApi.conectar(chave, desde),
    onSuccess: () => { setChave(''); toast.success('Asaas conectado. As cobranças estão sendo importadas.'); atualizar() },
    onError: (e) => toast.error(erroDe(e)),
  })
  const sincronizar = useMutation({
    mutationFn: asaasReceitasApi.sincronizar,
    onSuccess: (r: any) => { toast.success(`Pronto: ${r?.criada ?? 0} novas e ${r?.atualizada ?? 0} atualizadas.`); atualizar() },
    onError: (e) => toast.error(erroDe(e)),
  })
  const desconectar = useMutation({
    mutationFn: asaasReceitasApi.desconectar,
    onSuccess: () => { setConfirmarSaida(false); toast.success('Asaas desconectado. As receitas importadas continuam aqui.'); atualizar() },
    onError: (e) => toast.error(erroDe(e)),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Receitas do Asaas" size="lg">
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : st?.conectado ? (
        <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" aria-hidden />
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">Conectado a {st.conta_nome || 'conta do Asaas'}</p>
              {st.conta_cnpj && <p>CNPJ {formatCnpj(st.conta_cnpj)}</p>}
            </div>
          </div>
          <p>
            Cada cobrança com vencimento desde {st.importar_desde?.split('-').reverse().join('/')} entra como receita,
            com a categoria Asaas. Quando o cliente paga, a receita muda para recebida na hora.
          </p>
          <p>
            Até agora: {st.receitas ?? 0} receitas, {st.receitas_pagas ?? 0} já recebidas, somando {brl(st.valor_pago)} recebidos.
            Última conferência completa: {dataBr(st.ultima_sync_em)}.
          </p>
          {st.erro && (
            <p role="alert" className="flex gap-2 p-3 rounded-lg bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden /> {st.erro}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="secondary" disabled={sincronizar.isPending} onClick={() => sincronizar.mutate()}>
              <RefreshCw className={`w-4 h-4 mr-2 ${sincronizar.isPending ? 'animate-spin' : ''}`} aria-hidden />
              {sincronizar.isPending ? 'Conferindo…' : 'Conferir agora'}
            </Button>
            {podeAdministrar && !confirmarSaida && (
              <Button variant="ghost" onClick={() => setConfirmarSaida(true)}>
                <Unplug className="w-4 h-4 mr-2 text-red-500" aria-hidden /> Desconectar
              </Button>
            )}
          </div>
          {confirmarSaida && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 space-y-2">
              <p>Desconectar o Asaas? As receitas já importadas ficam. As cobranças novas param de entrar, e a chave é apagada daqui.</p>
              <div className="flex gap-2">
                <Button variant="danger" size="sm" disabled={desconectar.isPending} onClick={() => desconectar.mutate()}>Desconectar</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmarSaida(false)}>Cancelar</Button>
              </div>
            </div>
          )}
        </div>
      ) : !podeAdministrar ? (
        <p className="text-sm text-gray-600 dark:text-gray-300 py-6">
          O Asaas ainda não está conectado. Peça a quem administra a conta para conectar aqui em Receitas.
        </p>
      ) : (
        <form
          className="space-y-4 text-sm text-gray-700 dark:text-gray-300"
          onSubmit={(e) => { e.preventDefault(); conectar.mutate() }}
        >
          <p>Com o Asaas conectado, cada cobrança vira uma receita aqui, e o pagamento é marcado sozinho. <LinkVideo video="asaas-receitas" className="ml-1" /></p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>No Asaas, abra o menu Integrações e entre em Chaves de API.</li>
            <li>Gere uma chave nova e copie. Ela começa com $aact_.</li>
            <li>Cole a chave abaixo e escolha a partir de quando importar.</li>
          </ol>
          <Input
            label="Chave de API do Asaas"
            type="password"
            autoComplete="off"
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            placeholder="$aact_..."
            required
          />
          <Input
            label="Importar cobranças com vencimento a partir de"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            required
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            O Duo só lê as suas cobranças. A única coisa que ele cria no Asaas é o aviso automático de pagamento,
            e esse aviso é apagado quando você desconecta. A chave fica guardada criptografada.
          </p>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={!chave.trim() || conectar.isPending}>
              {conectar.isPending ? 'Conectando…' : 'Conectar Asaas'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
