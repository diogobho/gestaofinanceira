import { useMemo } from 'react'
import { FileText, AlertTriangle, RefreshCw } from 'lucide-react'
import type { ModeloWhatsApp, ModeloConfigurado } from '@/api/canalWhatsapp'
import { previaModelo } from '@/api/canalWhatsapp'

/**
 * Escolher um modelo aprovado da Meta e preencher as variáveis.
 *
 * Duas formas de uso:
 *  - `modo="literal"` (chat do card): cada variável recebe o texto que vai para o
 *    cliente, já pronto;
 *  - `modo="variaveis"` (disparo, cadência): cada variável recebe texto com as
 *    variáveis do CRM ([Nome], [PrimeiroNome]…), resolvidas lead a lead no envio.
 *
 * O texto do modelo não se edita aqui — é o que a Meta aprovou. Modelo com cabeçalho
 * de mídia ou botão de link com variável aparece desabilitado, com o motivo.
 */

export const VARIAVEIS_CRM = ['[PrimeiroNome]', '[Nome]', '[Empresa]', '[Responsavel]', '[PrimeiroNomeResponsavel]']

interface Props {
  modelos: ModeloWhatsApp[]
  carregando?: boolean
  valor: ModeloConfigurado | null
  onChange: (v: ModeloConfigurado | null) => void
  modo: 'literal' | 'variaveis'
  /** Valor sugerido para a 1ª variável quando o modelo é escolhido (ex.: primeiro nome). */
  sugestaoPrimeira?: string
  onRecarregar?: () => void
  permitirNenhum?: boolean
  rotuloNenhum?: string
}

export default function SeletorModeloWhatsApp({
  modelos,
  carregando,
  valor,
  onChange,
  modo,
  sugestaoPrimeira,
  onRecarregar,
  permitirNenhum,
  rotuloNenhum = 'Nenhum',
}: Props) {
  const modelo = useMemo(
    () => modelos.find((m) => m.nome === valor?.nome && (!valor?.idioma || m.idioma === valor.idioma)) ?? null,
    [modelos, valor?.nome, valor?.idioma]
  )

  const escolher = (chave: string) => {
    if (!chave) return onChange(null)
    const m = modelos.find((x) => `${x.nome}|${x.idioma}` === chave)
    if (!m) return
    onChange({
      nome: m.nome,
      idioma: m.idioma,
      variaveis: m.variaveis.map((_, i) => (i === 0 && sugestaoPrimeira ? sugestaoPrimeira : '')),
      cabecalho: m.variavelCabecalho ? '' : null,
    })
  }

  const setVar = (i: number, texto: string) => {
    if (!valor) return
    const variaveis = [...valor.variaveis]
    variaveis[i] = texto
    onChange({ ...valor, variaveis })
  }

  const inserir = (i: number | 'cab', v: string) => {
    if (!valor) return
    if (i === 'cab') onChange({ ...valor, cabecalho: `${valor.cabecalho || ''}${v}` })
    else setVar(i, `${valor.variaveis[i] || ''}${v}`)
  }

  const suportados = modelos.filter((m) => m.suportado)
  const naoSuportados = modelos.filter((m) => !m.suportado)

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Modelo aprovado pela Meta</label>
          {onRecarregar && (
            <button type="button" onClick={onRecarregar} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <RefreshCw size={11} /> atualizar lista
            </button>
          )}
        </div>
        <select
          value={modelo ? `${modelo.nome}|${modelo.idioma}` : ''}
          onChange={(e) => escolher(e.target.value)}
          disabled={carregando}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
        >
          <option value="">{carregando ? 'Carregando modelos…' : permitirNenhum ? rotuloNenhum : 'Escolha um modelo'}</option>
          {suportados.map((m) => (
            <option key={m.id} value={`${m.nome}|${m.idioma}`}>
              {m.nome} · {m.idioma} · {m.categoria === 'MARKETING' ? 'marketing' : m.categoria === 'UTILITY' ? 'utilidade' : m.categoria.toLowerCase()}
            </option>
          ))}
          {naoSuportados.length > 0 && (
            <optgroup label="Não disponíveis">
              {naoSuportados.map((m) => (
                <option key={m.id} value="" disabled>
                  {m.nome} — {m.motivoNaoSuportado}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {!carregando && suportados.length === 0 && (
          <p className="mt-1 text-xs text-amber-700 flex items-start gap-1">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            Nenhum modelo aprovado disponível. Modelos são criados e aprovados pela Meta (painel da Cloud API).
          </p>
        )}
      </div>

      {modelo && valor && (
        <>
          {modelo.variavelCabecalho && (
            <CampoVariavel
              rotulo={`Cabeçalho {{${modelo.variavelCabecalho}}}`}
              valor={valor.cabecalho || ''}
              onChange={(t) => onChange({ ...valor, cabecalho: t })}
              modo={modo}
              onInserir={(v) => inserir('cab', v)}
            />
          )}
          {modelo.variaveis.map((nome, i) => (
            <CampoVariavel
              key={nome}
              rotulo={`Variável {{${nome}}}`}
              valor={valor.variaveis[i] || ''}
              onChange={(t) => setVar(i, t)}
              modo={modo}
              onInserir={(v) => inserir(i, v)}
            />
          ))}

          <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/20 p-3">
            <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 mb-1 flex items-center gap-1">
              <FileText size={12} /> Como o cliente vai receber
            </p>
            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {previaModelo(modelo, valor.variaveis, valor.cabecalho)}
            </p>
            {modelo.botoes.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {modelo.botoes.map((b) => (
                  <span key={b} className="text-xs px-2 py-0.5 rounded border border-emerald-300 text-emerald-800 dark:text-emerald-300">
                    {b}
                  </span>
                ))}
              </div>
            )}
          </div>
          {modelo.categoria === 'MARKETING' && (
            <p className="text-[11px] text-gray-500">
              Modelo de marketing: a Meta cobra por mensagem entregue e pode segurar a entrega para quem recebe muitas mensagens de empresas.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function CampoVariavel({
  rotulo,
  valor,
  onChange,
  modo,
  onInserir,
}: {
  rotulo: string
  valor: string
  onChange: (t: string) => void
  modo: 'literal' | 'variaveis'
  onInserir: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{rotulo}</label>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={modo === 'variaveis' ? 'ex.: [PrimeiroNome]' : 'texto que entra no lugar da variável'}
        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
      />
      {modo === 'variaveis' && (
        <div className="mt-1 flex flex-wrap gap-1">
          {VARIAVEIS_CRM.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onInserir(v)}
              className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200"
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
