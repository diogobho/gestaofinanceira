import { useRef, useState } from 'react'
import { X, Upload, FileSpreadsheet, AlertCircle, CheckCircle, Loader2, Download } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useTermoCliente } from '@/hooks/useTermoCliente'
import { clientsApi, type MapeamentoClientes, type PreviewPlanilha, type ResultadoImportacaoClientes } from '@/api/clients'

/**
 * Importar clientes de planilha — o mesmo fluxo do "Importar Leads" (ImportLeadsModal):
 * arquivo → mapeamento das colunas → resultado. As regras são as do cadastro manual:
 * nome e CPF/CNPJ obrigatórios, e CPF/CNPJ já cadastrado não entra de novo.
 */

type Etapa = 'upload' | 'mapeamento' | 'importando' | 'resultado'
type Campo = keyof MapeamentoClientes

// `apelidos`: como a coluna costuma vir escrita nas planilhas (sem acento, minúsculas).
const CAMPOS: { key: Campo; label: string; obrigatorio?: boolean; apelidos: string[]; dica?: string }[] = [
  { key: 'nome', label: 'Nome', obrigatorio: true, apelidos: ['nome', 'cliente', 'razao social', 'nome completo'] },
  { key: 'cpf_cnpj', label: 'CPF / CNPJ', obrigatorio: true, apelidos: ['cpf', 'cnpj', 'cpf_cnpj', 'cpf/cnpj', 'documento'], dica: 'com ou sem pontuação' },
  { key: 'email', label: 'E-mail', apelidos: ['email', 'e-mail'] },
  { key: 'telefone', label: 'Telefone', apelidos: ['telefone', 'celular', 'whatsapp', 'fone'], dica: 'com DDD' },
  { key: 'aniversario', label: 'Aniversário', apelidos: ['aniversario', 'nascimento', 'data de nascimento'], dica: 'dd/mm/aaaa' },
  { key: 'servico', label: 'Serviço', apelidos: ['servico', 'produto', 'plano'] },
  { key: 'endereco_rua', label: 'Rua', apelidos: ['rua', 'endereco', 'logradouro'] },
  { key: 'endereco_numero', label: 'Número', apelidos: ['numero', 'nº', 'n'] },
  { key: 'endereco_complemento', label: 'Complemento', apelidos: ['complemento'] },
  { key: 'endereco_bairro', label: 'Bairro', apelidos: ['bairro'] },
  { key: 'endereco_cidade', label: 'Cidade', apelidos: ['cidade', 'municipio'] },
  { key: 'endereco_estado', label: 'Estado (UF)', apelidos: ['estado', 'uf'], dica: 'sigla, ex.: SP' },
  { key: 'endereco_cep', label: 'CEP', apelidos: ['cep'] },
]

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

function autoMapear(colunas: string[]): MapeamentoClientes {
  const m: Record<string, string> = {}
  const usadas = new Set<string>()
  for (const campo of CAMPOS) {
    const col = colunas.find((c) => !usadas.has(c) && campo.apelidos.includes(semAcento(c)))
    if (col) { m[campo.key] = col; usadas.add(col) }
  }
  return { nome: '', cpf_cnpj: '', ...m } as MapeamentoClientes
}

const erroDe = (err: unknown, padrao: string) => {
  const e = err as { response?: { data?: { message?: string } }; message?: string }
  return e?.response?.data?.message || e?.message || padrao
}

export default function ImportClientesModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { Cliente, Clientes, cliente, clientes } = useTermoCliente()
  const [etapa, setEtapa] = useState<Etapa>('upload')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewPlanilha | null>(null)
  const [mapeamento, setMapeamento] = useState<MapeamentoClientes>({ nome: '', cpf_cnpj: '' })
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoImportacaoClientes | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  if (!isOpen) return null

  const baixarModelo = () => {
    const cab = ['nome', 'cpf_cnpj', 'email', 'telefone', 'aniversario', 'servico', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep']
    const ex = ['Maria Silva', '123.456.789-01', 'maria@email.com', '11999990000', '05/10/1985', 'Mentoria', 'Rua das Flores', '120', 'Sala 3', 'Centro', 'São Paulo', 'SP', '01310-100']
    const blob = new Blob(['﻿' + [cab.join(','), ex.join(',')].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo_importacao_clientes.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const escolherArquivo = async (f?: File) => {
    if (!f) return
    setArquivo(f)
    setErro(null)
    setCarregando(true)
    try {
      const p = await clientsApi.importacaoPreview(f)
      setPreview(p)
      setMapeamento(autoMapear(p.colunas))
      setEtapa('mapeamento')
    } catch (err) {
      setErro(erroDe(err, 'Erro ao ler a planilha'))
    } finally {
      setCarregando(false)
    }
  }

  const importar = async () => {
    if (!arquivo || !mapeamento.nome || !mapeamento.cpf_cnpj) return
    setCarregando(true)
    setErro(null)
    setEtapa('importando')
    try {
      setResultado(await clientsApi.importar(arquivo, mapeamento))
      setEtapa('resultado')
      queryClient.invalidateQueries({ queryKey: ['clients-list'] })
    } catch (err) {
      setErro(erroDe(err, `Erro ao importar ${clientes}`))
      setEtapa('mapeamento')
    } finally {
      setCarregando(false)
    }
  }

  const fechar = () => {
    setEtapa('upload'); setArquivo(null); setPreview(null)
    setMapeamento({ nome: '', cpf_cnpj: '' }); setResultado(null); setErro(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Importar {Clientes}</h2>
          <button onClick={fechar} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" aria-label="Fechar">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {erro && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle size={18} className="shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {etapa === 'upload' && (
            <div className="space-y-4">
              <div
                onDrop={(e) => { e.preventDefault(); escolherArquivo(e.dataTransfer.files[0]) }}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-primary-400 transition-colors"
              >
                <FileSpreadsheet size={40} className="mx-auto text-gray-400 mb-3" />
                <p className="text-gray-600 dark:text-gray-300 mb-1">Arraste um arquivo CSV ou Excel aqui</p>
                <p className="text-xs text-gray-400 mb-4">Formatos aceitos: .csv · .xlsx · .xls</p>
                <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                  onChange={(e) => escolherArquivo(e.target.files?.[0])} />
                <button
                  onClick={() => inputRef.current?.click()}
                  disabled={carregando}
                  className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
                >
                  {carregando
                    ? <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" />Processando...</span>
                    : <span className="flex items-center gap-2"><Upload size={16} />Selecionar Arquivo</span>}
                </button>
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-900/40 px-4 py-2.5 flex items-center justify-between border-b dark:border-gray-700">
                  <span className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                    <FileSpreadsheet size={16} className="text-primary-600" /> Formato da Planilha
                  </span>
                  <button onClick={baixarModelo} className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-800 font-medium">
                    <Download size={13} /> Baixar Modelo CSV
                  </button>
                </div>
                <div className="p-4 space-y-3 text-sm">
                  <p className="text-gray-600 dark:text-gray-300">
                    <strong className="text-red-600">Obrigatórios:</strong> nome e CPF/CNPJ. Os demais são opcionais:
                    e-mail, telefone, aniversário, serviço e endereço (rua, número, complemento, bairro, cidade, UF e CEP).
                  </p>
                  <p className="text-xs text-gray-400">
                    💡 A 1ª linha deve ser o cabeçalho. Na próxima etapa você associa as colunas do seu arquivo aos campos do {cliente}.
                    {Cliente} com CPF/CNPJ já cadastrado não é duplicado.
                  </p>
                </div>
              </div>
            </div>
          )}

          {etapa === 'mapeamento' && preview && (
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-900/40 p-3 rounded-lg text-sm text-gray-600 dark:text-gray-300">
                <p><strong>Arquivo:</strong> {arquivo?.name}</p>
                <p><strong>Linhas encontradas:</strong> {preview.totalLinhas}</p>
              </div>

              <div>
                <h3 className="font-medium text-gray-800 dark:text-gray-100 mb-1">Mapeamento de Colunas</h3>
                <p className="text-sm text-gray-500 mb-3">Associe as colunas do arquivo aos campos do {cliente}</p>
                <div className="space-y-2">
                  {CAMPOS.map((c) => (
                    <div key={c.key} className="flex items-center gap-3">
                      <label className="w-36 shrink-0 text-sm text-gray-700 dark:text-gray-300">
                        {c.label}{c.obrigatorio && <span className="text-red-500 ml-1">*</span>}
                        {c.dica && <span className="block text-[11px] text-gray-400">{c.dica}</span>}
                      </label>
                      <select
                        value={mapeamento[c.key] || ''}
                        onChange={(e) => setMapeamento((m) => ({ ...m, [c.key]: e.target.value || undefined }) as MapeamentoClientes)}
                        className="flex-1 min-w-0 px-3 py-1.5 text-sm border rounded bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">-- Ignorar --</option>
                        {preview.colunas.map((col) => <option key={col} value={col}>{col}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-medium text-gray-800 dark:text-gray-100 mb-2">Prévia (primeiras linhas)</h3>
                <div className="overflow-x-auto border dark:border-gray-700 rounded-lg">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/40">
                      <tr>{preview.colunas.map((col) => <th key={col} className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">{col}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y dark:divide-gray-700">
                      {preview.linhas.slice(0, 5).map((l, i) => (
                        <tr key={i}>{preview.colunas.map((col) => <td key={col} className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300">{l[col] || '-'}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {etapa === 'importando' && (
            <div className="py-12 text-center">
              <Loader2 size={48} className="mx-auto text-primary-500 animate-spin mb-4" />
              <p className="text-lg text-gray-700 dark:text-gray-200">Importando {clientes}...</p>
              <p className="text-sm text-gray-500">Isso pode demorar alguns segundos</p>
            </div>
          )}

          {etapa === 'resultado' && resultado && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
                <p className="text-lg font-medium text-gray-800 dark:text-gray-100">Importação concluída!</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-lg text-center">
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{resultado.total}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-600">{resultado.importados}</p>
                  <p className="text-sm text-green-700 dark:text-green-400">Importados</p>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg text-center">
                  <p className="text-2xl font-bold text-yellow-600">{resultado.duplicados}</p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-400">Já cadastrados</p>
                </div>
              </div>
              {resultado.erros.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-800 dark:text-gray-100 mb-2">Linhas que não entraram ({resultado.erros.length})</h3>
                  <div className="max-h-40 overflow-y-auto border dark:border-gray-700 rounded-lg divide-y dark:divide-gray-700">
                    {resultado.erros.map((e, i) => (
                      <div key={i} className="p-2 text-sm">
                        <span className="font-medium text-red-600">Linha {e.linha}:</span>{' '}
                        <span className="text-gray-700 dark:text-gray-300">{e.erro}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 flex justify-end gap-3 shrink-0">
          {etapa === 'upload' && (
            <button onClick={fechar} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg">Cancelar</button>
          )}
          {etapa === 'mapeamento' && (
            <>
              <button onClick={() => { setEtapa('upload'); setPreview(null); setArquivo(null) }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg">Voltar</button>
              <button onClick={importar} disabled={!mapeamento.nome || !mapeamento.cpf_cnpj || carregando}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50">Importar {Clientes}</button>
            </>
          )}
          {etapa === 'resultado' && (
            <button onClick={fechar} className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600">Fechar</button>
          )}
        </div>
      </div>
    </div>
  )
}
