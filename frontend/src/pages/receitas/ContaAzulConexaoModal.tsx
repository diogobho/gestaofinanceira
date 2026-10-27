import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Modal, Button, Input, Spinner } from '@/components/ui'
import { RefreshCw, Unplug, AlertTriangle, CheckCircle, LogIn } from 'lucide-react'
import { contaazulFinanceiroApi, type ContaContaAzul } from '@/api/contaazulFinanceiro'
import { useAuth } from '@/contexts/AuthContext'
import { podeUsarContaAzul } from '@/utils/roles'
import { LinkVideo } from '@/tutoriais/LinkVideo'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** Página para onde o Conta Azul devolve a pessoa depois do login. */
  voltarPara: 'receitas' | 'despesas'
}

const inicioDoAno = () => `${new Date().getFullYear()}-01-01`
const formatCnpj = (d?: string | null) =>
  !d ? '' : d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
const dataBr = (iso?: string | null) => {
  if (!iso) return 'ainda não'
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}
const diaBr = (iso?: string | null) => iso?.split('-').reverse().join('/') || ''
const erroDe = (e: any) => e?.response?.data?.message || 'Não foi possível concluir agora. Tente de novo.'

/**
 * Volta do login do Conta Azul: `?contaazul=ok|erro` no endereço. Avisa, abre o modal e limpa o
 * endereço (um F5 depois não repete o aviso).
 */
export function useRetornoContaAzul(abrir: () => void) {
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    const r = params.get('contaazul')
    if (!r) return
    if (r === 'ok') {
      const conta = params.get('conta')
      toast.success(`Conta Azul conectado${conta ? `: ${conta}` : ''}. Os lançamentos estão sendo importados.`, { duration: 6000 })
    } else {
      toast.error(params.get('motivo') || 'O Conta Azul não completou a conexão. Tente de novo.', { duration: 8000 })
    }
    abrir()
    const resto = new URLSearchParams(params)
    ;['contaazul', 'conta', 'motivo'].forEach((k) => resto.delete(k))
    setParams(resto, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

export const ContaAzulConexaoModal: React.FC<Props> = ({ isOpen, onClose, voltarPara }) => {
  const { user } = useAuth()
  const podeAdministrar = podeUsarContaAzul(user as any)
  const qc = useQueryClient()
  const [desde, setDesde] = useState(inicioDoAno())
  const [saindo, setSaindo] = useState<number | null>(null)
  const [indo, setIndo] = useState(false)

  const { data: st, isLoading } = useQuery({
    queryKey: ['contaazul-financeiro-status'],
    queryFn: contaazulFinanceiroApi.status,
    enabled: isOpen,
    refetchInterval: isOpen ? 15000 : false,
  })
  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ['contaazul-financeiro-status'] })
    qc.invalidateQueries({ queryKey: ['revenues-list'] })
    qc.invalidateQueries({ queryKey: ['expenses-list'] })
  }

  // O login acontece no site do Conta Azul: a página sai daqui e volta pelo endereço.
  const entrar = async (substituir?: number) => {
    setIndo(true)
    try {
      const { url } = await contaazulFinanceiroApi.conectar(desde, voltarPara, substituir)
      window.location.assign(url)
    } catch (e) {
      toast.error(erroDe(e))
      setIndo(false)
    }
  }
  const ligar = useMutation({
    mutationFn: (id: number) => contaazulFinanceiroApi.ligarImportacao(id, desde),
    onSuccess: () => { toast.success('Importação ligada. Os lançamentos estão entrando.'); atualizar() },
    onError: (e) => toast.error(erroDe(e)),
  })
  const conferir = useMutation({
    mutationFn: contaazulFinanceiroApi.conferir,
    onSuccess: (r) => {
      toast.success(r.carregando && !r.criada && !r.atualizada
        ? 'A primeira importação ainda está em andamento. Volte em alguns minutos.'
        : `Pronto: ${r.criada} novos e ${r.atualizada} atualizados.`)
      atualizar()
    },
    onError: (e) => toast.error(erroDe(e)),
  })
  const desconectar = useMutation({
    mutationFn: (id: number) => contaazulFinanceiroApi.desconectar(id),
    onSuccess: () => { setSaindo(null); toast.success('Conta desconectada. Os lançamentos já importados continuam aqui.'); atualizar() },
    onError: (e) => toast.error(erroDe(e)),
  })

  const contas = st?.contas || []
  const algumaImportando = contas.some((c) => c.importando)

  const campoData = (
    <Input
      label="Importar lançamentos com vencimento a partir de"
      type="date"
      value={desde}
      onChange={(e) => setDesde(e.target.value)}
      required
    />
  )

  const conta = (c: ContaContaAzul) => (
    <li key={c.conexao_id} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
      <div className="flex items-start gap-3">
        {c.precisa_reconectar
          ? <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" aria-hidden />
          : <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" aria-hidden />}
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">{c.nome}</p>
          {c.documento && <p>CNPJ {formatCnpj(c.documento)}</p>}
        </div>
      </div>
      {c.precisa_reconectar ? (
        <p role="alert" className="p-3 rounded-lg bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          O Conta Azul parou de aceitar esta conta. Para voltar a importar, clique em Reconectar e entre de novo na mesma conta.
        </p>
      ) : c.importando ? (
        <p>
          Importando lançamentos com vencimento desde {diaBr(c.importar_desde)}{c.importar_ate ? ` até ${diaBr(c.importar_ate)}` : ''}: {c.receitas} receitas e {c.despesas} despesas até agora.
          {c.ja_no_asaas > 0 && ` ${c.ja_no_asaas} contas a receber já estavam no Asaas e não entraram em dobro.`}
          {' '}Última conferência: {dataBr(c.ultima_alteracao_em || c.ultima_sync_em)}.
        </p>
      ) : (
        <p>Esta conta alimenta só a aba Conta Azul do Dashboard. Os lançamentos dela ainda não entram em Receitas e Despesas.</p>
      )}
      {c.erro && !c.precisa_reconectar && c.importando && (
        <p className="text-xs text-amber-700 dark:text-amber-300">Último aviso do Conta Azul: {c.erro}</p>
      )}
      {podeAdministrar && (
        <div className="flex flex-wrap gap-2">
          {c.precisa_reconectar && (
            <Button variant="secondary" size="sm" disabled={indo} onClick={() => entrar(c.conexao_id)}>
              <LogIn className="w-4 h-4 mr-2" aria-hidden /> Reconectar
            </Button>
          )}
          {!c.precisa_reconectar && !c.importando && (
            <Button variant="secondary" size="sm" disabled={ligar.isPending} onClick={() => ligar.mutate(c.conexao_id)}>
              Importar desde {diaBr(desde)}
            </Button>
          )}
          {saindo !== c.conexao_id && (
            <Button variant="ghost" size="sm" onClick={() => setSaindo(c.conexao_id)}>
              <Unplug className="w-4 h-4 mr-2 text-red-500" aria-hidden /> Desconectar
            </Button>
          )}
        </div>
      )}
      {saindo === c.conexao_id && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 space-y-2">
          <p>Desconectar {c.nome}? Os lançamentos já importados ficam. Os novos param de entrar, e a aba Conta Azul do Dashboard deixa de mostrar esta conta.</p>
          <div className="flex gap-2">
            <Button variant="danger" size="sm" disabled={desconectar.isPending} onClick={() => desconectar.mutate(c.conexao_id)}>Desconectar</Button>
            <Button variant="ghost" size="sm" onClick={() => setSaindo(null)}>Cancelar</Button>
          </div>
        </div>
      )}
    </li>
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Conta Azul" size="lg">
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
          <p>
            Com o Conta Azul conectado, as contas a receber viram receitas e as contas a pagar viram despesas.
            Quando algo é pago no Conta Azul, o Duo marca aqui na próxima conferência, que acontece a cada 15 minutos.
            <LinkVideo video="contaazul-receitas" className="ml-1" />
          </p>
          <p>
            Pode usar junto com o Asaas. Se a mesma cobrança estiver nos dois, com o mesmo cliente, o mesmo valor e o
            mesmo vencimento, ela entra uma vez só, pelo Asaas.
          </p>

          {contas.length > 0 && <ul className="space-y-3">{contas.map(conta)}</ul>}

          {algumaImportando && (
            <Button variant="secondary" disabled={conferir.isPending} onClick={() => conferir.mutate()}>
              <RefreshCw className={`w-4 h-4 mr-2 ${conferir.isPending ? 'animate-spin' : ''}`} aria-hidden />
              {conferir.isPending ? 'Conferindo…' : 'Conferir agora'}
            </Button>
          )}

          {!podeAdministrar ? (
            contas.length === 0 && (
              <p className="py-2">O Conta Azul ainda não está conectado. Peça a quem administra a conta para conectar aqui.</p>
            )
          ) : st && !st.disponivel ? (
            <p role="alert" className="p-3 rounded-lg bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              A conexão com o Conta Azul não está disponível agora. Fale com o suporte.
            </p>
          ) : (
            <form
              className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700"
              onSubmit={(e) => { e.preventDefault(); entrar() }}
            >
              <p className="font-medium text-gray-900 dark:text-gray-100 pt-3">
                {contas.length ? 'Conectar outra conta do Conta Azul' : 'Conectar o Conta Azul'}
              </p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Escolha a partir de quando importar.</li>
                <li>Clique em Entrar no Conta Azul. Abre a página de login do Conta Azul.</li>
                <li>Entre com o e-mail e a senha da conta e autorize o Duo. Você volta para cá sozinho.</li>
              </ol>
              {campoData}
              <p className="text-xs text-gray-500 dark:text-gray-400">
                O Duo só lê os seus lançamentos. Ele não cria nem altera nada no Conta Azul, e o seu login fica só no
                Conta Azul.
              </p>
              <div className="flex justify-end">
                <Button type="submit" variant="primary" disabled={indo}>
                  <LogIn className="w-4 h-4 mr-2" aria-hidden />
                  {indo ? 'Abrindo o Conta Azul…' : 'Entrar no Conta Azul'}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </Modal>
  )
}
