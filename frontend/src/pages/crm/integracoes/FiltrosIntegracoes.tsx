import React from 'react'
import { Search, X } from 'lucide-react'
import { DateRangePresets } from '@/components/ui/DateRangePresets'
import type { CampoDisponivel, DefinicaoIntegracao, LeadIntegracao } from '@/api/integracoes'
import type { Filtros, Situacao } from './agregacoes'
import { FILTROS_VAZIOS, camposFiltraveis, distribuicaoDeCampo } from './agregacoes'

interface Props {
  filtros: Filtros
  onChange: (f: Filtros) => void
  catalogo: DefinicaoIntegracao[]
  /** Conjunto INTEIRO, não o recorte: é dele que saem as opções de cada filtro. */
  leads: LeadIntegracao[]
  camposDisponiveis: CampoDisponivel[]
  cores: Map<string, string>
}

const SITUACOES: { valor: Situacao; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'abertos', rotulo: 'Em aberto' },
  { valor: 'ganhos', rotulo: 'Ganhos' },
  { valor: 'perdidos', rotulo: 'Perdidos' },
]

const selectClasse =
  'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 ' +
  'focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 ' +
  'dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100'

/**
 * Barra de filtros.
 *
 * Ela **quebra em linhas** (`flex-wrap`), não rola na horizontal: foi o defeito
 * corrigido na barra de ações do CRM, em que 476px de botões ficavam fora do
 * alcance atrás de uma barra de rolagem escondida por CSS.
 */
export const FiltrosIntegracoes: React.FC<Props> = ({
  filtros,
  onChange,
  catalogo,
  leads,
  camposDisponiveis,
  cores,
}) => {
  const set = (parcial: Partial<Filtros>) => onChange({ ...filtros, ...parcial })

  const presentes = React.useMemo(() => {
    const ids = new Set<string>()
    for (const l of leads) l.integracoes.forEach((i) => ids.add(i))
    return catalogo.filter((d) => ids.has(d.id))
  }, [catalogo, leads])

  const funis = React.useMemo(() => {
    const mapa = new Map<number, string>()
    for (const l of leads) if (l.funil_id) mapa.set(l.funil_id, l.funil_nome || `Funil ${l.funil_id}`)
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [leads])

  const responsaveis = React.useMemo(() => {
    const mapa = new Map<number, string>()
    for (const l of leads) if (l.responsavel_id) mapa.set(l.responsavel_id, l.responsavel_nome || `#${l.responsavel_id}`)
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [leads])

  // Campos que aceitam filtro, e o nome da integração junto: "Grupo" sozinho não
  // diz se é o do SendFlow ou o da importação quando os dois estão na tela.
  const campos = React.useMemo(
    () => camposFiltraveis(leads, camposDisponiveis),
    [leads, camposDisponiveis]
  )
  const nomeIntegracao = React.useMemo(
    () => new Map(catalogo.map((d) => [d.id, d.nome])),
    [catalogo]
  )

  // Os valores saem dos leads que TÊM esse campo, sem o filtro de valor aplicado.
  const valores = React.useMemo(
    () => (filtros.campoChave ? distribuicaoDeCampo(leads, filtros.campoChave) : []),
    [leads, filtros.campoChave]
  )

  const alternarIntegracao = (id: string) => {
    const atual = filtros.integracoes
    set({ integracoes: atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id] })
  }

  const sujo =
    filtros.integracoes.length > 0 ||
    filtros.funis.length > 0 ||
    filtros.responsaveis.length > 0 ||
    !!filtros.dataInicio ||
    !!filtros.dataFim ||
    filtros.situacao !== 'todos' ||
    filtros.incluirArquivados ||
    !!filtros.campoChave ||
    !!filtros.busca

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      {/* Integrações — o filtro principal, por isso em botões e não escondido num select */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Integração
        </span>
        {presentes.map((d) => {
          const ativo = filtros.integracoes.includes(d.id)
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => alternarIntegracao(d.id)}
              title={d.descricao}
              aria-pressed={ativo}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                ativo
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300'
              }`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: cores.get(d.id) || '#9ca3af' }}
                aria-hidden
              />
              {d.nome}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <DateRangePresets
          dataInicio={filtros.dataInicio}
          dataFim={filtros.dataFim}
          onChange={(dataInicio, dataFim) => set({ dataInicio, dataFim })}
          onClear={() => set({ dataInicio: '', dataFim: '' })}
          label="Período de entrada"
        />

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Funil</span>
          <select
            className={selectClasse}
            value={filtros.funis[0] ?? ''}
            onChange={(e) => set({ funis: e.target.value ? [Number(e.target.value)] : [] })}
          >
            <option value="">Todos os funis</option>
            {funis.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Proprietário</span>
          <select
            className={selectClasse}
            value={filtros.responsaveis[0] ?? ''}
            onChange={(e) => set({ responsaveis: e.target.value ? [Number(e.target.value)] : [] })}
          >
            <option value="">Todos</option>
            {responsaveis.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Situação</span>
          <select
            className={selectClasse}
            value={filtros.situacao}
            onChange={(e) => set({ situacao: e.target.value as Situacao })}
          >
            {SITUACOES.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Resposta em</span>
          <select
            className={selectClasse}
            value={filtros.campoChave}
            onChange={(e) => set({ campoChave: e.target.value, campoValor: '' })}
          >
            <option value="">Qualquer campo</option>
            {campos.map((c) => (
              <option key={c.chave} value={c.chave}>
                {c.rotulo} · {nomeIntegracao.get(c.integracao) ?? c.integracao}
              </option>
            ))}
          </select>
        </label>

        {filtros.campoChave && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Valor</span>
            <select
              className={selectClasse}
              value={filtros.campoValor}
              onChange={(e) => set({ campoValor: e.target.value })}
            >
              <option value="">Todos os valores</option>
              {valores.map((v) => (
                <option key={v.valor} value={v.valor}>
                  {v.valor} ({v.leads})
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Buscar</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={filtros.busca}
              onChange={(e) => set({ busca: e.target.value })}
              placeholder="nome, telefone, resposta..."
              className={`${selectClasse} w-56 pl-8`}
            />
          </span>
        </label>

        <label className="flex items-center gap-2 pb-2 text-sm text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={filtros.incluirArquivados}
            onChange={(e) => set({ incluirArquivados: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          Incluir arquivados
        </label>

        {sujo && (
          <button
            type="button"
            onClick={() => onChange({ ...FILTROS_VAZIOS })}
            className="mb-1 inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <X className="h-4 w-4" />
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  )
}
