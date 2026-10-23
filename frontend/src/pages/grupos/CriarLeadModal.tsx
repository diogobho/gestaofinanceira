import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Search } from 'lucide-react'
import { Button, Input, Modal, ModalFooter, Select, Switch } from '@/components/ui'
import { funisApi, estagiosApi, usuariosEmpresaApi } from '@/api/crm'
import { gruposApi, type GrupoWhatsApp, type RegraCrmGrupo } from '@/api/grupos'

const erroDe = (e: unknown, padrao: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || padrao
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Criar lead (093): quem entrar no grupo vira lead no funil e etapa escolhidos. Função
 * própria, sem relação com a boas-vindas. A regra é do chip de quem configura — é ele
 * que vê a entrada.
 */
export const CriarLeadModal: React.FC<{
  grupos: GrupoWhatsApp[]
  /** Editando: a regra existente. Nova: undefined. */
  regra?: RegraCrmGrupo | null
  /** Grupos que já têm regra — ficam fora da escolha de uma regra nova. */
  gruposComRegra: Set<string>
  /** Quem está vendo — a regra de outro número mostra o nome do dono. */
  meuId?: number
  onFechar: () => void
}> = ({ grupos, regra, gruposComRegra, meuId, onFechar }) => {
  const qc = useQueryClient()
  const livres = grupos.filter(g => !gruposComRegra.has(g.id))
  const [grupoId, setGrupoId] = useState(regra?.grupo_id || livres[0]?.id || '')
  const [buscaGrupo, setBuscaGrupo] = useState('')
  // O grupo escolhido fica na lista mesmo fora da busca: senão o select mostraria outro sem ele ter mudado.
  const livresFiltrados = livres.filter(g => g.id === grupoId || semAcento(g.nome).includes(semAcento(buscaGrupo.trim())))
  const grupoNome = grupos.find(g => g.id === grupoId)?.nome || regra?.grupo_nome || ''
  const [funilId, setFunilId] = useState<number | null>(regra?.funil_id ?? null)
  const [estagioId, setEstagioId] = useState<number | null>(regra?.estagio_id ?? null)
  const [responsavelId, setResponsavelId] = useState<number | null>(regra?.responsavel_id ?? null)
  // Rodízio: os leads se dividem por igual entre as pessoas marcadas.
  const [rodizio, setRodizio] = useState<number[]>(regra?.distribuir_entre ?? [])
  const [modoRodizio, setModoRodizio] = useState((regra?.distribuir_entre?.length ?? 0) > 0)
  const [origem, setOrigem] = useState(regra?.origem || '')
  const [ativa, setAtiva] = useState(regra?.ativa ?? true)
  const funis = useQuery({ queryKey: ['crm', 'funis'], queryFn: funisApi.list })
  const estagios = useQuery({ queryKey: ['crm', 'estagios', funilId], queryFn: () => estagiosApi.listByFunil(funilId!), enabled: !!funilId })
  const usuarios = useQuery({ queryKey: ['crm', 'usuarios'], queryFn: usuariosEmpresaApi.list })

  const salvar = useMutation({
    mutationFn: () => gruposApi.salvarRegraCrm(grupoId, grupoNome || null, {
      funil_id: funilId!, estagio_id: estagioId, responsavel_id: modoRodizio ? null : responsavelId,
      distribuir_entre: modoRodizio ? rodizio : null, origem: origem.trim() || null, ativa,
    }, regra?.dono_id),
    onSuccess: (r: { desligadas?: number }) => {
      qc.invalidateQueries({ queryKey: ['grupos', 'crm'] })
      toast.success(!ativa ? 'Regra salva, desligada'
        : r?.desligadas ? 'Pronto — quem entrar no grupo vira lead no CRM. A regra do outro número neste grupo foi desligada, para não criar card em dobro.'
        : 'Pronto — quem entrar no grupo vira lead no CRM')
      onFechar()
    },
    onError: (e) => toast.error(erroDe(e, 'Não foi possível salvar.')),
  })

  return (
    <Modal isOpen onClose={onFechar} title={regra ? `Criar lead · ${regra.grupo_nome || 'grupo'}${regra.dono_id !== meuId ? ` · número de ${regra.dono_nome}` : ''}` : 'Nova regra de criar lead'} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Quem entrar no grupo vira lead no funil e na etapa que você escolher, na hora em que entra.
          Quem já está no funil ganha só uma anotação — sem card duplicado e sem mudar de etapa.
        </p>

        {!regra && (
          livres.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Buscar grupo" icon={<Search className="w-4 h-4" />} value={buscaGrupo} onChange={e => setBuscaGrupo(e.target.value)} />
              <Select label="Grupo" value={grupoId} onChange={e => setGrupoId(e.target.value)}>
                {livresFiltrados.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
              </Select>
            </div>
          ) : (
            <p className="text-sm text-amber-700 dark:text-amber-300">Todos os grupos deste número já têm uma regra. Edite a que existe na lista.</p>
          )
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Funil" value={funilId ? String(funilId) : ''} onChange={e => { setFunilId(Number(e.target.value) || null); setEstagioId(null) }}>
            <option value="">Escolha…</option>
            {(funis.data || []).map(fn => <option key={fn.id} value={fn.id}>{fn.nome}</option>)}
          </Select>
          <Select label="Etapa" value={estagioId ? String(estagioId) : ''} onChange={e => setEstagioId(Number(e.target.value) || null)} disabled={!funilId}>
            <option value="">A de entrada do funil</option>
            {(estagios.data || []).map(es => <option key={es.id} value={es.id}>{es.nome}</option>)}
          </Select>
          <Select label="Responsável" value={modoRodizio ? 'rodizio' : responsavelId ? String(responsavelId) : ''}
            onChange={e => { const v = e.target.value; setModoRodizio(v === 'rodizio'); if (v !== 'rodizio') setResponsavelId(Number(v) || null) }}>
            <option value="">{regra && regra.dono_id !== meuId ? `${regra.dono_nome} (dono do número)` : 'Eu (dono deste número)'}</option>
            <option value="rodizio">Dividir entre pessoas da equipe</option>
            {(usuarios.data || []).map(us => <option key={us.id} value={us.id}>{us.nome}</option>)}
          </Select>
          <Input label="Origem no card" placeholder={grupoNome.slice(0, 50) || 'Nome do grupo'} maxLength={50} value={origem} onChange={e => setOrigem(e.target.value)} />
        </div>
        {modoRodizio && (
          <fieldset className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <legend className="px-1 text-sm font-medium text-gray-700 dark:text-gray-300">Dividir entre</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {(usuarios.data || []).map(us => (
                <label key={us.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary-600" checked={rodizio.includes(us.id)}
                    onChange={e => setRodizio(r => e.target.checked ? [...r, us.id] : r.filter(x => x !== us.id))} />
                  {us.nome}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Cada lead novo vai para o próximo da roda, só entre quem está marcado — uma, duas ou todas as pessoas da equipe.
            </p>
          </fieldset>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-gray-700 dark:text-gray-300">Situação</span>
          <Switch checked={ativa} onChange={setAtiva} labels={{ on: 'Ligada', off: 'Desligada' }} aria-label="Criar lead ligado" />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Vale para quem entrar daqui para frente. Quem entra sem o número visível (o WhatsApp esconde alguns) não vira lead.
        </p>
      </div>
      <ModalFooter>
        <Button variant="secondary" onClick={onFechar}>Cancelar</Button>
        <Button isLoading={salvar.isPending} disabled={!grupoId || !funilId || (modoRodizio && rodizio.length < 1)}
          title={!grupoId ? 'Escolha o grupo' : !funilId ? 'Escolha o funil dos leads' : modoRodizio && rodizio.length < 1 ? 'Marque ao menos uma pessoa' : undefined} onClick={() => salvar.mutate()}>
          Salvar
        </Button>
      </ModalFooter>
    </Modal>
  )
}
