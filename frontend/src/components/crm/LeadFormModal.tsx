import { useState, useEffect } from 'react'
import { X, User, Phone, Mail, Building, DollarSign, Thermometer, Calendar, ListTodo, AlertCircle, FileText, Globe, UserCheck } from 'lucide-react'
import { useCreateLead, useUpdateLead, useUsuariosEmpresa } from '@/hooks/useCRM'
import type { CreateLeadDto, UpdateLeadDto, TarefaTipo, LeadOrigem, Lead } from '@/types/crm'

interface LeadFormModalProps {
  isOpen: boolean
  onClose: () => void
  funilId: number
  estagioId?: number
  mode?: 'create' | 'edit'
  initialLead?: Lead
  onUpdate?: () => void
}

const temperaturaOptions = [
  { value: 'frio' as const, label: 'Frio' },
  { value: 'morno' as const, label: 'Morno' },
  { value: 'quente' as const, label: 'Quente' },
]

const origemOptions: { value: LeadOrigem; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'indicacao', label: 'Indicacao' },
  { value: 'networking', label: 'Networking' },
  { value: 'parceria', label: 'Parceria' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'lancamento', label: 'Lancamento' },
  { value: 'forms', label: 'Forms' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'importacao', label: 'Importacao' },
]

const PAISES = [
  { code: '55',  flag: '🇧🇷', label: '+55 Brasil' },
  { code: '351', flag: '🇵🇹', label: '+351 Portugal' },
  { code: '1',   flag: '🇺🇸', label: '+1 EUA / Canadá' },
  { code: '54',  flag: '🇦🇷', label: '+54 Argentina' },
  { code: '595', flag: '🇵🇾', label: '+595 Paraguai' },
  { code: '598', flag: '🇺🇾', label: '+598 Uruguai' },
  { code: '56',  flag: '🇨🇱', label: '+56 Chile' },
  { code: '34',  flag: '🇪🇸', label: '+34 Espanha' },
  { code: '44',  flag: '🇬🇧', label: '+44 Reino Unido' },
  { code: '49',  flag: '🇩🇪', label: '+49 Alemanha' },
  { code: '39',  flag: '🇮🇹', label: '+39 Itália' },
  { code: '33',  flag: '🇫🇷', label: '+33 França' },
  { code: '52',  flag: '🇲🇽', label: '+52 México' },
  { code: '57',  flag: '🇨🇴', label: '+57 Colômbia' },
  { code: '51',  flag: '🇵🇪', label: '+51 Peru' },
  { code: 'outro', flag: '🌍', label: 'Outro país...' },
]

const PAISES_CODES = PAISES.filter(p => p.code !== 'outro').map(p => p.code)

function detectAndStripCode(phone: string): { code: string; rest: string } {
  const digits = phone.replace(/\D/g, '')
  // Try known codes (longer first to avoid prefix conflicts, e.g. 595 vs 5)
  const sorted = PAISES.filter(p => p.code !== 'outro').sort((a, b) => b.code.length - a.code.length)
  for (const p of sorted) {
    if (digits.startsWith(p.code)) return { code: p.code, rest: digits.slice(p.code.length) }
  }
  return { code: '55', rest: digits }
}

function effectiveCode(codigoPais: string, codigoCustom: string): string {
  if (codigoPais !== 'outro') return codigoPais
  return codigoCustom.replace(/\D/g, '')
}

const tipoTarefaOptions: { value: TarefaTipo; label: string }[] = [
  { value: 'ligacao', label: 'Ligacao' },
  { value: 'reuniao', label: 'Reuniao' },
  { value: 'email', label: 'Email' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'proposta', label: 'Proposta' },
  { value: 'visita', label: 'Visita' },
  { value: 'outros', label: 'Outros' },
]

interface TarefaFormData {
  tipo: TarefaTipo
  titulo: string
  descricao: string
  data_vencimento: string
}

export default function LeadFormModal({ isOpen, onClose, funilId, estagioId, mode = 'create', initialLead, onUpdate }: LeadFormModalProps) {
  const isEditMode = mode === 'edit' && !!initialLead

  const [codigoPais, setCodigoPais] = useState('55')
  const [codigoCustom, setCodigoCustom] = useState('')

  const [formData, setFormData] = useState<CreateLeadDto & { responsavel_id?: number }>({
    funil_id: funilId,
    estagio_id: estagioId,
    nome: '',
    telefone: '',
    email: '',
    empresa: '',
    titulo: '',
    valor_potencial: undefined,
    temperatura: 'frio',
    origem: 'manual',
    notas: '',
    responsavel_id: undefined,
  })

  const { data: usuariosEmpresa = [] } = useUsuariosEmpresa()

  const [tarefaData, setTarefaData] = useState<TarefaFormData>({
    tipo: 'follow_up',
    titulo: '',
    descricao: '',
    data_vencimento: '',
  })

  // Preencher formulário com dados do lead ao abrir em modo edição
  useEffect(() => {
    if (isEditMode && initialLead) {
      const { code, rest } = detectAndStripCode(initialLead.telefone || '')
      if (PAISES_CODES.includes(code)) {
        setCodigoPais(code)
        setCodigoCustom('')
      } else {
        setCodigoPais('outro')
        setCodigoCustom(code)
      }
      setFormData({
        funil_id: initialLead.funil_id,
        estagio_id: initialLead.estagio_id,
        nome: initialLead.nome || '',
        telefone: rest,
        email: initialLead.email || '',
        empresa: initialLead.empresa || '',
        titulo: initialLead.titulo || '',
        cpf_cnpj: initialLead.cpf_cnpj || '',
        valor_potencial: initialLead.valor_potencial ?? undefined,
        temperatura: initialLead.temperatura || 'frio',
        origem: initialLead.origem || 'manual',
        notas: initialLead.notas || '',
        responsavel_id: initialLead.responsavel_id ?? undefined,
      })
    }
  }, [isEditMode, initialLead, isOpen])

  const createLead = useCreateLead()
  const updateLead = useUpdateLead()

  if (!isOpen) return null

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => {
      if (name === 'valor_potencial') {
        return { ...prev, valor_potencial: value ? parseFloat(value) : undefined }
      }
      if (name === 'responsavel_id') {
        return { ...prev, responsavel_id: value ? parseInt(value, 10) : undefined }
      }
      return { ...prev, [name]: value }
    })
  }

  const handleTarefaChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setTarefaData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.nome.trim()) {
      return
    }

    const codigo = effectiveCode(codigoPais, codigoCustom)
    const telefoneFormatado = codigo + (formData.telefone || '').replace(/\D/g, '')

    if (isEditMode && initialLead) {
      // Modo edição — atualizar lead existente
      const updateData: UpdateLeadDto = {
        nome: formData.nome,
        telefone: telefoneFormatado,
        email: formData.email,
        empresa: formData.empresa,
        titulo: formData.titulo,
        cpf_cnpj: (formData as any).cpf_cnpj,
        valor_potencial: formData.valor_potencial,
        temperatura: formData.temperatura,
        origem: formData.origem,
        notas: formData.notas,
        responsavel_id: formData.responsavel_id,
      }
      await updateLead.mutateAsync({ id: initialLead.id, data: updateData })
      onUpdate?.()
      onClose()
    } else {
      // Modo criação — validar tarefa inicial obrigatória
      if (!tarefaData.titulo.trim() || !tarefaData.data_vencimento) {
        return
      }

      await createLead.mutateAsync({
        ...formData,
        telefone: telefoneFormatado,
        funil_id: funilId,
        estagio_id: estagioId,
        tarefa_inicial: {
          tipo: tarefaData.tipo,
          titulo: tarefaData.titulo,
          descricao: tarefaData.descricao || undefined,
          data_vencimento: tarefaData.data_vencimento,
        },
      })

      onClose()
      setFormData({
        funil_id: funilId,
        estagio_id: estagioId,
        nome: '',
        telefone: '',
        email: '',
        empresa: '',
        titulo: '',
        valor_potencial: undefined,
        temperatura: 'frio',
        origem: 'manual',
        notas: '',
        responsavel_id: undefined,
      })
      setTarefaData({
        tipo: 'follow_up',
        titulo: '',
        descricao: '',
        data_vencimento: '',
      })
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">{isEditMode ? 'Editar Lead' : 'Novo Lead'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                name="nome"
                value={formData.nome}
                onChange={handleChange}
                required
                placeholder="Nome do contato"
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          {/* Titulo do negocio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Titulo do Negocio
            </label>
            <input
              type="text"
              name="titulo"
              value={formData.titulo}
              onChange={handleChange}
              placeholder="Ex: Proposta de consultoria"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Telefone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Telefone (WhatsApp)
            </label>
            <div className="flex gap-2">
              <select
                value={codigoPais}
                onChange={(e) => {
                  setCodigoPais(e.target.value)
                  if (e.target.value !== 'outro') setCodigoCustom('')
                }}
                className="border border-gray-300 rounded-lg px-2 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm bg-gray-50 shrink-0"
              >
                {PAISES.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.flag} {p.code !== 'outro' ? `+${p.code}` : p.label}
                  </option>
                ))}
              </select>
              {codigoPais === 'outro' && (
                <div className="relative w-24 shrink-0">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">+</span>
                  <input
                    type="text"
                    value={codigoCustom}
                    onChange={(e) => setCodigoCustom(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="000"
                    maxLength={4}
                    className="w-full pl-6 pr-2 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                  />
                </div>
              )}
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  name="telefone"
                  value={formData.telefone}
                  onChange={handleChange}
                  placeholder="(DDD) 99999-9999"
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>
            {codigoPais === 'outro' && codigoCustom && (
              <p className="mt-1 text-xs text-gray-500">
                Número completo: +{codigoCustom} {formData.telefone || '...'}
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="email@exemplo.com"
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          {/* Empresa */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Empresa
            </label>
            <div className="relative">
              <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                name="empresa"
                value={formData.empresa}
                onChange={handleChange}
                placeholder="Nome da empresa"
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          {/* CPF/CNPJ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              CPF/CNPJ
            </label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                name="cpf_cnpj"
                value={formData.cpf_cnpj || ''}
                onChange={handleChange}
                placeholder="000.000.000-00 ou 00.000.000/0001-00"
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          {/* Valor e Temperatura */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valor Potencial
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="number"
                  name="valor_potencial"
                  value={formData.valor_potencial || ''}
                  onChange={handleChange}
                  placeholder="0,00"
                  step="0.01"
                  min="0"
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Temperatura
              </label>
              <div className="relative">
                <Thermometer className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <select
                  name="temperatura"
                  value={formData.temperatura}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 appearance-none"
                >
                  {temperaturaOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Origem */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Origem do Lead
            </label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <select
                name="origem"
                value={formData.origem}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 appearance-none"
              >
                {formData.origem && !origemOptions.some(o => o.value === formData.origem) && (
                  <option value={formData.origem}>{formData.origem}</option>
                )}
                {origemOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Proprietário do Lead */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Proprietário do Lead
            </label>
            <div className="relative">
              <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <select
                name="responsavel_id"
                value={formData.responsavel_id ?? ''}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 appearance-none"
              >
                <option value="">Sem responsável</option>
                {usuariosEmpresa.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notas
            </label>
            <textarea
              name="notas"
              value={formData.notas}
              onChange={handleChange}
              rows={3}
              placeholder="Observacoes sobre o lead..."
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Tarefa Inicial — apenas no modo criação */}
          {!isEditMode && <div className="border-t pt-4 mt-4">
            <div className="flex items-center gap-2 mb-4">
              <ListTodo className="text-primary-500" size={20} />
              <h3 className="text-md font-semibold text-gray-800">Tarefa Inicial *</h3>
              <span className="text-xs text-gray-500">(obrigatório)</span>
            </div>

            {/* Titulo da Tarefa */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Titulo da Tarefa *
              </label>
              <input
                type="text"
                name="titulo"
                value={tarefaData.titulo}
                onChange={handleTarefaChange}
                required
                placeholder="Ex: Ligar para apresentar proposta"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            {/* Tipo e Data */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo *
                </label>
                <div className="relative">
                  <AlertCircle className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <select
                    name="tipo"
                    value={tarefaData.tipo}
                    onChange={handleTarefaChange}
                    required
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 appearance-none"
                  >
                    {tipoTarefaOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data de Vencimento *
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="date"
                    name="data_vencimento"
                    value={tarefaData.data_vencimento}
                    onChange={handleTarefaChange}
                    required
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>
            </div>

            {/* Descricao da Tarefa */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descricao da Tarefa
              </label>
              <textarea
                name="descricao"
                value={tarefaData.descricao}
                onChange={handleTarefaChange}
                rows={2}
                placeholder="Detalhes sobre a tarefa..."
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>}

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isEditMode ? updateLead.isPending : createLead.isPending}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
            >
              {isEditMode
                ? (updateLead.isPending ? 'Salvando...' : 'Salvar Alterações')
                : (createLead.isPending ? 'Criando...' : 'Criar Lead')
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
