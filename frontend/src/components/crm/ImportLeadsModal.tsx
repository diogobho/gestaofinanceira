import { useState, useRef } from 'react'
import { X, Upload, FileSpreadsheet, AlertCircle, CheckCircle, Loader2, Download } from 'lucide-react'
import { importacaoApi, type MapeamentoColunas, type PreviewDados, type ResultadoImportacao } from '@/api/crm'
import { useFunis } from '@/hooks/useCRM'
import { useQueryClient } from '@tanstack/react-query'

interface ImportLeadsModalProps {
  isOpen: boolean
  onClose: () => void
  defaultFunilId?: number
}

type Step = 'upload' | 'mapping' | 'importing' | 'result'

const camposLead = [
  { key: 'nome', label: 'Nome', required: true },
  { key: 'telefone', label: 'Telefone', required: false },
  { key: 'email', label: 'Email', required: false },
  { key: 'empresa', label: 'Empresa', required: false },
  { key: 'cargo', label: 'Cargo', required: false },
  { key: 'valor_potencial', label: 'Valor Potencial', required: false },
  { key: 'temperatura', label: 'Temperatura', required: false },
  { key: 'origem', label: 'Origem', required: false },
  { key: 'notas', label: 'Notas', required: false },
]

export default function ImportLeadsModal({ isOpen, onClose, defaultFunilId }: ImportLeadsModalProps) {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewDados | null>(null)
  const [mapeamento, setMapeamento] = useState<MapeamentoColunas>({ nome: '' })
  const [funilId, setFunilId] = useState<number | null>(defaultFunilId || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data: funis } = useFunis()
  const queryClient = useQueryClient()

  const downloadTemplate = () => {
    const headers = ['nome', 'telefone', 'email', 'empresa', 'cargo', 'valor_potencial', 'temperatura', 'origem', 'notas']
    const exemplo = ['Maria Silva', '5511999990000', 'maria@email.com', 'Empresa XYZ', 'CEO', '5000', 'quente', 'instagram', 'Conheceu no evento']
    const csv = [headers.join(','), exemplo.join(',')].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo_importacao_leads.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!isOpen) return null

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setError(null)
    setLoading(true)

    try {
      const previewData = await importacaoApi.preview(selectedFile)
      setPreview(previewData)

      // Auto-mapear colunas com nomes similares
      const autoMap: MapeamentoColunas = { nome: '' }
      for (const campo of camposLead) {
        const coluna = previewData.colunas.find(c =>
          c.toLowerCase().includes(campo.key) ||
          campo.key.includes(c.toLowerCase())
        )
        if (coluna) {
          (autoMap as unknown as Record<string, string>)[campo.key] = coluna
        }
      }
      setMapeamento(autoMap)
      setStep('mapping')
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } }; message?: string }
      const errorMsg = axiosErr?.response?.data?.message || axiosErr?.message || 'Erro ao processar arquivo'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && fileInputRef.current) {
      const dt = new DataTransfer()
      dt.items.add(droppedFile)
      fileInputRef.current.files = dt.files
      handleFileSelect({ target: { files: dt.files } } as React.ChangeEvent<HTMLInputElement>)
    }
  }

  const handleMapeamentoChange = (campo: string, coluna: string) => {
    setMapeamento(prev => ({
      ...prev,
      [campo]: coluna || undefined
    }))
  }

  const handleImportar = async () => {
    if (!file || !funilId || !mapeamento.nome) return

    setLoading(true)
    setError(null)
    setStep('importing')

    try {
      const result = await importacaoApi.importar(file, funilId, mapeamento)
      setResultado(result)
      setStep('result')

      // Invalidar cache do kanban
      queryClient.invalidateQueries({ queryKey: ['crm'] })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } }; message?: string }
      const errorMsg = axiosErr?.response?.data?.message || axiosErr?.message || 'Erro ao importar leads'
      setError(errorMsg)
      setStep('mapping')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setStep('upload')
    setFile(null)
    setPreview(null)
    setMapeamento({ nome: '' })
    setResultado(null)
    setError(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">
            Importar Leads
          </h2>
          <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Step: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              {/* Área de upload */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary-400 transition-colors"
              >
                <FileSpreadsheet size={40} className="mx-auto text-gray-400 mb-3" />
                <p className="text-gray-600 mb-1">Arraste um arquivo CSV ou Excel aqui</p>
                <p className="text-xs text-gray-400 mb-4">Formatos aceitos: .csv · .xlsx · .xls</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" />Processando...</span>
                  ) : (
                    <span className="flex items-center gap-2"><Upload size={16} />Selecionar Arquivo</span>
                  )}
                </button>
              </div>

              {/* Guia de formato */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2.5 flex items-center justify-between border-b">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet size={16} className="text-primary-600" />
                    <span className="text-sm font-semibold text-gray-700">Formato da Planilha</span>
                  </div>
                  <button
                    onClick={downloadTemplate}
                    className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-800 font-medium"
                  >
                    <Download size={13} />
                    Baixar Modelo CSV
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  {/* Campo obrigatório */}
                  <div>
                    <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-2">⚠ Campo Obrigatório</p>
                    <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <code className="text-sm font-mono font-bold text-red-700 w-32 shrink-0">nome</code>
                      <span className="text-sm text-gray-600">Nome completo do contato</span>
                    </div>
                  </div>

                  {/* Campos opcionais */}
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Campos Opcionais</p>
                    <div className="divide-y border rounded-lg overflow-hidden">
                      {[
                        { col: 'telefone',        desc: 'Número com código do país + DDD',   hint: 'ex: 5511999990000' },
                        { col: 'email',           desc: 'Endereço de e-mail',                hint: 'ex: joao@empresa.com' },
                        { col: 'empresa',         desc: 'Nome da empresa ou negócio',        hint: '' },
                        { col: 'cargo',           desc: 'Cargo ou função do contato',        hint: 'ex: CEO, Diretora...' },
                        { col: 'valor_potencial', desc: 'Valor estimado do negócio',         hint: 'ex: 5000.00' },
                        { col: 'temperatura',     desc: 'Nível de interesse',                hint: 'frio · morno · quente' },
                        { col: 'origem',          desc: 'Como o lead chegou',                hint: 'manual · instagram · indicacao · whatsapp · lancamento · forms' },
                        { col: 'notas',           desc: 'Observações livres',                hint: '' },
                      ].map(f => (
                        <div key={f.col} className="flex items-center gap-3 px-3 py-2 bg-white hover:bg-gray-50">
                          <code className="text-xs font-mono text-primary-700 bg-primary-50 border border-primary-100 rounded px-1.5 py-0.5 w-32 shrink-0">{f.col}</code>
                          <div className="min-w-0">
                            <span className="text-sm text-gray-700">{f.desc}</span>
                            {f.hint && <span className="text-xs text-gray-400 ml-1">— {f.hint}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs text-gray-400">
                    💡 A 1ª linha da planilha deve ser o cabeçalho com os nomes das colunas. Você poderá mapear as colunas do seu arquivo na próxima etapa.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step: Mapping */}
          {step === 'mapping' && preview && (
            <div className="space-y-4">
              {/* Funil Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Funil de Destino *
                </label>
                <select
                  value={funilId || ''}
                  onChange={(e) => setFunilId(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Selecione um funil</option>
                  {funis?.map(f => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
              </div>

              {/* File Info */}
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-sm text-gray-600">
                  <strong>Arquivo:</strong> {file?.name}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Linhas encontradas:</strong> {preview.totalLinhas}
                </p>
              </div>

              {/* Column Mapping */}
              <div>
                <h3 className="font-medium text-gray-800 mb-2">Mapeamento de Colunas</h3>
                <p className="text-sm text-gray-500 mb-3">
                  Associe as colunas do arquivo aos campos do lead
                </p>

                <div className="space-y-2">
                  {camposLead.map(campo => (
                    <div key={campo.key} className="flex items-center gap-3">
                      <label className="w-32 text-sm text-gray-700">
                        {campo.label}
                        {campo.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      <select
                        value={(mapeamento as unknown as Record<string, string | undefined>)[campo.key] || ''}
                        onChange={(e) => handleMapeamentoChange(campo.key, e.target.value)}
                        className="flex-1 px-3 py-1.5 text-sm border rounded focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">-- Ignorar --</option>
                        {preview.colunas.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview Table */}
              <div>
                <h3 className="font-medium text-gray-800 mb-2">Preview (primeiras linhas)</h3>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {preview.colunas.map(col => (
                          <th key={col} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {preview.linhas.slice(0, 5).map((linha, i) => (
                        <tr key={i}>
                          {preview.colunas.map(col => (
                            <td key={col} className="px-3 py-2 whitespace-nowrap text-gray-700">
                              {linha[col] || '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Step: Importing */}
          {step === 'importing' && (
            <div className="py-12 text-center">
              <Loader2 size={48} className="mx-auto text-primary-500 animate-spin mb-4" />
              <p className="text-lg text-gray-700">Importando leads...</p>
              <p className="text-sm text-gray-500">
                {preview && preview.totalLinhas > 1000
                  ? `Processando ${preview.totalLinhas.toLocaleString('pt-BR')} registros. Aguarde, isso pode levar alguns minutos.`
                  : 'Isso pode demorar alguns segundos'}
              </p>
            </div>
          )}

          {/* Step: Result */}
          {step === 'result' && resultado && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
                <p className="text-lg font-medium text-gray-800">Importacao Concluida!</p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg text-center">
                  <p className="text-2xl font-bold text-gray-800">{resultado.total}</p>
                  <p className="text-sm text-gray-600">Total</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-600">{resultado.importados}</p>
                  <p className="text-sm text-green-700">Importados</p>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg text-center">
                  <p className="text-2xl font-bold text-yellow-600">{resultado.duplicados}</p>
                  <p className="text-sm text-yellow-700">Duplicados</p>
                </div>
              </div>

              {resultado.erros.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-800 mb-2">
                    Erros ({resultado.erros.length})
                  </h3>
                  <div className="max-h-40 overflow-y-auto border rounded-lg divide-y">
                    {resultado.erros.map((err, i) => (
                      <div key={i} className="p-2 text-sm">
                        <span className="font-medium text-red-600">Linha {err.linha}:</span>{' '}
                        <span className="text-gray-700">{err.erro}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3 shrink-0">
          {step === 'upload' && (
            <button
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg"
            >
              Cancelar
            </button>
          )}

          {step === 'mapping' && (
            <>
              <button
                onClick={() => {
                  setStep('upload')
                  setPreview(null)
                  setFile(null)
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg"
              >
                Voltar
              </button>
              <button
                onClick={handleImportar}
                disabled={!funilId || !mapeamento.nome || loading}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
              >
                Importar Leads
              </button>
            </>
          )}

          {step === 'result' && (
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
            >
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
