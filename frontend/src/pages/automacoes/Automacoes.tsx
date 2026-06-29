import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus } from 'lucide-react'
import { Header } from '@/components/layout'
import { Button, Input } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { WhatsAppFormatToolbar } from '@/components/ui/WhatsAppFormatToolbar'
import { AutomacoesPanel } from '@/components/automacoes/AutomacoesPanel'
import { DisparosAgendadosSection } from '@/components/crm/DisparosAgendadosSection'
import { automacoesApi } from '@/api/automacoes'
import { contatosApi } from '@/api/crm'
import type { GrupoWhatsApp } from '@/types/crm'

interface FormState {
  nome: string
  grupo_whatsapp_id: string
  grupo_nome: string
  mensagem: string
  ativa: boolean
  delay_segundos: number
  enviar_para: 'dm_participante' | 'grupo'
}

const estadoInicial: FormState = {
  nome: '',
  grupo_whatsapp_id: '',
  grupo_nome: '',
  mensagem: '',
  ativa: true,
  delay_segundos: 30,
  enviar_para: 'dm_participante'
}

export default function Automacoes() {
  const [grupos, setGrupos] = useState<GrupoWhatsApp[]>([])
  const [loadingGrupos, setLoadingGrupos] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>(estadoInicial)
  const [saving, setSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const mensagemRef = useRef<HTMLTextAreaElement>(null)

  const carregarGrupos = async () => {
    setLoadingGrupos(true)
    try {
      const grupos = await contatosApi.getGrupos()
      setGrupos(grupos)
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Erro ao carregar grupos do WhatsApp'
      toast.error(msg)
    } finally {
      setLoadingGrupos(false)
    }
  }

  useEffect(() => { carregarGrupos() }, [])

  const abrirNovo = () => {
    setForm(estadoInicial)
    setModalOpen(true)
  }

  const handleGrupoChange = (grupoId: string) => {
    const grupo = grupos.find((g) => g.id === grupoId)
    setForm((prev) => ({
      ...prev,
      grupo_whatsapp_id: grupoId,
      grupo_nome: grupo?.subject || ''
    }))
  }

  const salvar = async () => {
    if (!form.nome.trim() || !form.grupo_whatsapp_id || !form.mensagem.trim()) {
      toast.error('Preencha nome, grupo e mensagem')
      return
    }
    setSaving(true)
    try {
      await automacoesApi.create({
        nome: form.nome,
        tipo_acao: 'envio_mensagem_grupo',
        grupo_whatsapp_id: form.grupo_whatsapp_id,
        ativa: form.ativa,
        config: {
          mensagem: form.mensagem,
          grupo_nome: form.grupo_nome,
          delay_segundos: form.delay_segundos,
          enviar_para: form.enviar_para
        }
      })
      toast.success('Automação criada')
      setModalOpen(false)
      setReloadKey((k) => k + 1)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Header
        title="Automações"
        subtitle="Visão unificada de todas as automações ativas no sistema"
        tourId="automacoes"
        action={
          <Button data-tour="automacoes-nova" onClick={abrirNovo} variant="primary" className="flex items-center gap-2">
            <Plus size={18} /> Nova automação WhatsApp
          </Button>
        }
      />

      <div className="p-6 space-y-6">

        {/* ── Disparos agendados ─────────────────────────────────────── */}
        <div data-tour="automacoes-disparos">
          <DisparosAgendadosSection />
        </div>

        {/* ── Automações configuradas ────────────────────────────────── */}
        <div data-tour="automacoes-lista">
          <AutomacoesPanel
            key={reloadKey}
            showContexto
            emptyMessage="Nenhuma automação criada ainda. As automações aparecem aqui quando você ativa o agente IA em estágios/leads, configura follow-ups ou cria mensagens automáticas para grupos do WhatsApp."
          />
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nova automação de grupo WhatsApp"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nome da automação *
            </label>
            <Input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: Boas-vindas grupo VIP"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Grupo WhatsApp *
            </label>
            <select
              value={form.grupo_whatsapp_id}
              onChange={(e) => handleGrupoChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
              disabled={loadingGrupos}
            >
              <option value="">{loadingGrupos ? 'Carregando grupos...' : 'Selecione um grupo'}</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.subject} ({g.participantCount} membros)
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Mensagem *</label>
              <WhatsAppFormatToolbar
                textareaRef={mensagemRef}
                value={form.mensagem}
                onChange={(v) => setForm({ ...form, mensagem: v })}
              />
            </div>
            <textarea
              ref={mensagemRef}
              value={form.mensagem}
              onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
              rows={5}
              placeholder="Olá {{primeiro_nome}}! Seja bem-vindo(a) ao {{nome_grupo}}..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Variáveis: <code>{'{{nome}}'}</code>, <code>{'{{primeiro_nome}}'}</code>, <code>{'{{nome_grupo}}'}</code>
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Enviar para</label>
              <select
                value={form.enviar_para}
                onChange={(e) => setForm({ ...form, enviar_para: e.target.value as 'dm_participante' | 'grupo' })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
              >
                <option value="dm_participante">DM do novo participante</option>
                <option value="grupo">Dentro do grupo</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Delay (segundos)</label>
              <Input
                type="number"
                min="0"
                max="3600"
                value={form.delay_segundos}
                onChange={(e) => setForm({ ...form, delay_segundos: parseInt(e.target.value) || 0 })}
              />
              <p className="text-xs text-gray-500 mt-1">Aguardar antes de enviar (evita aparência de bot)</p>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.ativa}
              onChange={(e) => setForm({ ...form, ativa: e.target.checked })}
              className="rounded text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Automação ativa</span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={salvar} disabled={saving}>
              {saving ? 'Salvando...' : 'Criar automação'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
