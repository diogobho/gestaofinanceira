import { useState, useEffect } from 'react'
import { X, Bot, Key, Eye, EyeOff, Save, Cpu, Users, Info } from 'lucide-react'
import { useAgenteIAConfig, useAgenteIAUpdateConfig } from '@/hooks/useCRM'
import type { AgenteIAConfig } from '@/types/crm'

interface Props {
  onClose: () => void
}

const MODELOS_CLAUDE = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Recomendado)' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (Mais poderoso)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Mais rápido)' },
]

const MODELOS_GEMINI = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Recomendado)' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Mais poderoso)' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (Mais rápido)' },
  { value: 'gemini-3.1-pro-preview-customtools', label: 'Gemini 3.1 Pro Ferramentas (Preview)' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)' },
  { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
]

const TONS = [
  { value: 'amigavel', label: '😊 Amigável', desc: 'Acolhedor e próximo, sem ser informal demais' },
  { value: 'casual', label: '😎 Casual', desc: 'Descontraído, pode usar linguagem informal' },
  { value: 'formal', label: '💼 Formal', desc: 'Profissional e respeitoso' },
]

export default function AgenteIAConfigModal({ onClose }: Props) {
  const [aba, setAba] = useState<'config' | 'acesso'>('config')
  const [mostrarApiKey, setMostrarApiKey] = useState(false)
  const [mostrarGeminiKey, setMostrarGeminiKey] = useState(false)
  const [form, setForm] = useState<Partial<AgenteIAConfig>>({
    ativo: false,
    provider: 'claude',
    api_key: '',
    gemini_api_key: '',
    modelo: 'claude-sonnet-4-6',
    nome_agente: 'Assistente',
    tom: 'amigavel',
    area_negocio: '',
    system_prompt_extra: '',
    max_tokens: 1024,
    contexto_mensagens: 10,
    usuarios_habilitados: [],
    delay_segundos: 0,
  })

  const { data: config, isLoading } = useAgenteIAConfig()
  const updateConfig = useAgenteIAUpdateConfig()

  useEffect(() => {
    if (config) {
      setForm({
        ativo: config.ativo,
        provider: config.provider || 'claude',
        api_key: config.api_key_configurada ? '••••••••••••••••••••••••' : '',
        gemini_api_key: config.gemini_api_key_configurada ? '••••••••••••••••••••••••' : '',
        modelo: config.modelo,
        nome_agente: config.nome_agente,
        tom: config.tom,
        area_negocio: config.area_negocio || '',
        system_prompt_extra: config.system_prompt_extra || '',
        max_tokens: config.max_tokens,
        contexto_mensagens: config.contexto_mensagens,
        usuarios_habilitados: config.usuarios_habilitados || [],
        delay_segundos: config.delay_segundos ?? 0,
      })
    }
  }, [config])

  const handleSave = () => {
    const payload: Partial<AgenteIAConfig> = { ...form }
    // Se o campo api_key tem bullets (não foi editado), não enviar
    if (payload.api_key && payload.api_key.includes('•')) {
      delete payload.api_key
    }
    if (payload.gemini_api_key && payload.gemini_api_key.includes('•')) {
      delete payload.gemini_api_key
    }
    updateConfig.mutate(payload)
  }

  const set = (key: keyof AgenteIAConfig, value: any) =>
    setForm(prev => ({ ...prev, [key]: value }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary-100">
              <Bot size={22} className="text-primary-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-lg">Agente de IA</h2>
              <p className="text-xs text-gray-500">Configurações de prospecção automática</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6">
          {[
            { key: 'config', label: 'Configurações', icon: Cpu },
            { key: 'acesso', label: 'Acesso', icon: Users },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setAba(key as any)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                aba === key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-8 w-8 border-2 border-primary-600 border-t-transparent rounded-full" />
            </div>
          ) : aba === 'config' ? (
            <>
              {/* Toggle ativo */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border">
                <div>
                  <p className="font-medium text-gray-900">Agente ativo</p>
                  <p className="text-xs text-gray-500 mt-0.5">Liga ou desliga o agente globalmente para toda a empresa</p>
                </div>
                <button
                  onClick={() => set('ativo', !form.ativo)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${form.ativo ? 'bg-primary-600' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.ativo ? 'translate-x-6' : ''}`} />
                </button>
              </div>

              {/* Provedor */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Provedor de IA</label>
                <div className="flex gap-2">
                  {[
                    { value: 'claude', label: 'Claude (Anthropic)', note: 'Com ferramentas CRM completas' },
                    { value: 'gemini', label: 'Gemini (Google)', note: 'Com ferramentas CRM completas' },
                  ].map(p => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => {
                        set('provider', p.value)
                        set('modelo', p.value === 'claude' ? 'claude-sonnet-4-6' : 'gemini-2.5-flash')
                      }}
                      className={`flex-1 text-left px-3 py-2.5 border rounded-lg text-sm transition-colors ${
                        form.provider === p.value
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium">{p.label}</div>
                      <div className="text-xs opacity-70 mt-0.5">{p.note}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* API Key Claude */}
              {form.provider !== 'gemini' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <Key size={14} className="inline mr-1.5 text-gray-400" />
                    API Key da Anthropic
                  </label>
                  <div className="relative">
                    <input
                      type={mostrarApiKey ? 'text' : 'password'}
                      value={form.api_key || ''}
                      onChange={e => set('api_key', e.target.value)}
                      placeholder="sk-ant-api03-..."
                      className="w-full pr-10 px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarApiKey(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {mostrarApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {config?.api_key_configurada && (
                    <p className="text-xs text-green-600 mt-1">✓ Chave configurada — deixe em branco para manter a atual</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Obtenha em <span className="font-mono">console.anthropic.com</span>
                  </p>
                </div>
              )}

              {/* API Key Gemini */}
              {form.provider === 'gemini' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <Key size={14} className="inline mr-1.5 text-gray-400" />
                    API Key do Google Gemini
                  </label>
                  <div className="relative">
                    <input
                      type={mostrarGeminiKey ? 'text' : 'password'}
                      value={form.gemini_api_key || ''}
                      onChange={e => set('gemini_api_key', e.target.value)}
                      placeholder="AIzaSy..."
                      className="w-full pr-10 px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarGeminiKey(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {mostrarGeminiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {config?.gemini_api_key_configurada && (
                    <p className="text-xs text-green-600 mt-1">✓ Chave configurada — deixe em branco para manter a atual</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Obtenha em <span className="font-mono">aistudio.google.com</span>
                  </p>
                </div>
              )}

              {/* Modelo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Modelo de IA</label>
                <select
                  value={form.modelo}
                  onChange={e => set('modelo', e.target.value)}
                  className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  {(form.provider === 'gemini' ? MODELOS_GEMINI : MODELOS_CLAUDE).map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Nome e Tom */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome do agente</label>
                  <input
                    type="text"
                    value={form.nome_agente || ''}
                    onChange={e => set('nome_agente', e.target.value)}
                    placeholder="Ex: Ana"
                    className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Tom de voz</label>
                  <select
                    value={form.tom}
                    onChange={e => set('tom', e.target.value as any)}
                    className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  >
                    {TONS.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    {TONS.find(t => t.value === form.tom)?.desc}
                  </p>
                </div>
              </div>

              {/* Área do negócio */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Área/contexto do negócio</label>
                <input
                  type="text"
                  value={form.area_negocio || ''}
                  onChange={e => set('area_negocio', e.target.value)}
                  placeholder="Ex: academia de dança, clínica de estética, escola de inglês..."
                  className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">Isso vai para o system prompt para contextualizar o agente</p>
              </div>

              {/* System prompt extra */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Instruções adicionais
                  <span className="ml-1.5 text-xs font-normal text-gray-400">(system prompt)</span>
                </label>
                <textarea
                  value={form.system_prompt_extra || ''}
                  onChange={e => set('system_prompt_extra', e.target.value)}
                  rows={5}
                  placeholder={`Ex:\n- Nossos planos são R$ 150/mês (mensal) ou R$ 120/mês (semestral)\n- Não oferecer desconto sem aprovação do gerente\n- Sempre perguntar qual dia/horário é melhor para uma visita\n- Priorizar leads com temperatura "quente"`}
                  className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none font-mono"
                />
              </div>

              {/* Configurações avançadas */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Histórico de contexto
                    <span className="ml-1 text-xs text-gray-400">mensagens</span>
                  </label>
                  <input
                    type="number"
                    min={3}
                    max={20}
                    value={form.contexto_mensagens}
                    onChange={e => set('contexto_mensagens', parseInt(e.target.value))}
                    className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">Mensagens anteriores enviadas ao modelo</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Tamanho máximo da resposta
                    <span className="ml-1 text-xs text-gray-400">tokens</span>
                  </label>
                  <input
                    type="number"
                    min={256}
                    max={4096}
                    step={256}
                    value={form.max_tokens}
                    onChange={e => set('max_tokens', parseInt(e.target.value))}
                    className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
              </div>

              {/* Delay de resposta */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Delay antes de responder
                </label>
                <select
                  value={form.delay_segundos ?? 0}
                  onChange={e => set('delay_segundos', parseInt(e.target.value))}
                  className="w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  <option value={0}>Sem delay (responde imediatamente)</option>
                  <option value={5}>5 segundos</option>
                  <option value={10}>10 segundos</option>
                  <option value={15}>15 segundos</option>
                  <option value={30}>30 segundos</option>
                  <option value={60}>1 minuto</option>
                  <option value={120}>2 minutos</option>
                  <option value={300}>5 minutos</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Tempo de espera após receber a mensagem antes de processar. Útil para parecer mais natural.
                </p>
              </div>

              {/* Aviso */}
              <div className="flex gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <Info size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  O agente responde automaticamente apenas mensagens de <strong>texto</strong>. Arquivos de áudio, imagens e documentos são armazenados mas não processados pela IA.
                </p>
              </div>
            </>
          ) : (
            /* Aba Acesso */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-primary-50 border border-primary-200">
                <p className="text-sm font-medium text-primary-800">Quem pode ativar/desativar o agente nos leads?</p>
                <p className="text-xs text-primary-600 mt-1">
                  Por padrão, qualquer usuário com acesso ao CRM pode ativar o agente individualmente por lead.
                  Use os checkboxes abaixo para restringir o acesso se necessário.
                </p>
              </div>
              <div className="p-4 rounded-xl border bg-gray-50">
                <p className="text-sm text-gray-500 flex items-center gap-2">
                  <Users size={16} />
                  A seleção de usuários específicos estará disponível em breve.
                  Por enquanto, todos os usuários com acesso ao CRM podem usar o agente.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={updateConfig.isPending}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <Save size={15} />
            {updateConfig.isPending ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </div>
      </div>
    </div>
  )
}
