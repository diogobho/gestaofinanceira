import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { MousePointerClick, Plus, Trash2, Paperclip, X, Loader2, FileText, Music, Video, ArrowUp, ArrowDown } from 'lucide-react'
import { LinkVideo } from '@/tutoriais/LinkVideo'
import { followupsApi, origensApi, type RegraRespostaBotao, type PassoRespostaBotao } from '@/api/crm'

const MEDIA_BASE = import.meta.env.VITE_API_URL || ''
/** Mesma regra do AgendamentoConfig: a mídia não é pública, o token vai na query. */
function urlMidia(caminho: string): string {
  if (caminho.startsWith('http')) return caminho
  const token = localStorage.getItem('token')
  return `${MEDIA_BASE}${caminho}${token ? `?t=${encodeURIComponent(token)}` : ''}`
}

// Áudio entra em m4a/mp3/ogg (o m4a do WhatsApp/celular é o caso comum); vídeo em mp4.
const ACEITA = 'audio/mp4,audio/x-m4a,audio/m4a,.m4a,audio/aac,audio/mpeg,audio/ogg,video/mp4,image/jpeg,image/png,application/pdf'
const VARIAVEIS = ['PrimeiroNome', 'Nome', 'Origem', 'PrimeiroNomeResponsavel']

export const regraNova = (): RegraRespostaBotao => ({ origem: null, botao: '', passos: [{ texto: '' }], tarefa_dias: 3, ativa: true })

const iconeDo = (mime?: string | null) =>
  mime?.startsWith('audio/') ? <Music size={16} className="text-violet-600 shrink-0" />
    : mime?.startsWith('video/') ? <Video size={16} className="text-violet-600 shrink-0" />
      : <FileText size={16} className="text-violet-600 shrink-0" />

/**
 * Respostas por botão (094): quando o lead CLICA num botão do modelo da Meta enquanto
 * está neste estágio, envia a sequência (texto, áudio, vídeo, imagem, documento) e cria
 * a tarefa de FUP. Origem vazia = vale para qualquer origem; a regra com origem vence.
 */
export default function RespostasBotaoConfig({ value, onChange, etapas = [] }: {
  value: RegraRespostaBotao[]
  onChange: (v: RegraRespostaBotao[]) => void
  /** Outras etapas do funil, para "depois, mover o card para". */
  etapas?: { id: number; nome: string }[]
}) {
  const origens = useQuery({ queryKey: ['crm', 'origens'], queryFn: origensApi.list })
  const mudarRegra = (i: number, p: Partial<RegraRespostaBotao>) => onChange(value.map((r, j) => (j === i ? { ...r, ...p } : r)))

  return (
    <div className="space-y-3">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
          <MousePointerClick size={15} className="text-violet-500" /> Respostas por botão
          <LinkVideo video="respostas-botao" className="ml-1" />
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          Quando o lead <strong>clicar</strong> num botão da mensagem (ex.: "Sim, conheço" / "Ainda não") enquanto estiver
          neste estágio, envia as mensagens abaixo pelo número do responsável e cria a tarefa de FUP. Texto digitado não dispara.
          Cada regra vale uma vez por lead.
        </p>
      </div>

      <datalist id="origens-resposta-botao">
        {(origens.data || []).map(o => <option key={o.id} value={o.nome} />)}
      </datalist>

      {value.map((r, i) => (
        <div key={i} className={`rounded-lg border p-3 space-y-3 ${r.ativa ? 'border-violet-200 bg-violet-50/40' : 'border-gray-200 bg-gray-50 opacity-75'}`}>
          <div className="flex items-start gap-2">
            <div className="grid flex-1 gap-2 sm:grid-cols-2">
              <label className="text-xs text-gray-600">Origem do lead
                <input list="origens-resposta-botao" value={r.origem ?? ''} maxLength={50} placeholder="Qualquer origem"
                  onChange={e => mudarRegra(i, { origem: e.target.value || null })}
                  className="mt-1 w-full px-2 py-1.5 border rounded text-sm" />
              </label>
              <label className="text-xs text-gray-600">Botão clicado
                <input value={r.botao} maxLength={60} placeholder="Ex.: Ainda não"
                  onChange={e => mudarRegra(i, { botao: e.target.value })}
                  className="mt-1 w-full px-2 py-1.5 border rounded text-sm" />
              </label>
            </div>
            <label className="mt-5 flex items-center gap-1 text-xs text-gray-600 cursor-pointer" title="Ligar ou desligar esta regra">
              <input type="checkbox" checked={r.ativa} onChange={e => mudarRegra(i, { ativa: e.target.checked })} className="rounded text-violet-600" /> Ligada
            </label>
            <button type="button" onClick={() => { if (confirm('Excluir esta regra?')) onChange(value.filter((_, j) => j !== i)) }}
              className="mt-5 p-1 text-gray-400 hover:text-red-500" title="Excluir regra"><Trash2 size={15} /></button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600">Mensagens, nesta ordem</p>
            {r.passos.map((p, k) => (
              <PassoEditor key={k} indice={k} total={r.passos.length} passo={p}
                onChange={np => mudarRegra(i, { passos: r.passos.map((x, j) => (j === k ? np : x)) })}
                onMover={d => {
                  const ps = [...r.passos]; const alvo = k + d
                  ;[ps[k], ps[alvo]] = [ps[alvo], ps[k]]
                  mudarRegra(i, { passos: ps })
                }}
                onRemover={() => mudarRegra(i, { passos: r.passos.filter((_, j) => j !== k) })} />
            ))}
            {r.passos.length < 10 && (
              <button type="button" onClick={() => mudarRegra(i, { passos: [...r.passos, { texto: '' }] })}
                className="flex items-center gap-1 text-xs text-violet-700 hover:text-violet-900"><Plus size={13} /> Adicionar mensagem</button>
            )}
          </div>

          <label className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={!!r.tarefa_dias} onChange={e => mudarRegra(i, { tarefa_dias: e.target.checked ? 3 : null })} className="rounded text-violet-600" />
            Criar tarefa de FUP para
            <input type="number" min={1} max={365} value={r.tarefa_dias ?? ''} disabled={!r.tarefa_dias}
              onChange={e => mudarRegra(i, { tarefa_dias: Math.max(1, Number(e.target.value) || 1) })}
              className="w-16 px-2 py-1 border rounded text-sm disabled:opacity-50" />
            dia(s), para o responsável
          </label>

          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={!!r.aceita_texto} onChange={e => mudarRegra(i, { aceita_texto: e.target.checked })} className="mt-0.5 rounded text-violet-600" />
            <span>Vale também a resposta escrita
              <span className="block text-xs text-gray-400">Para o WhatsApp por QR Code, onde o botão não aparece: o lead escreve "{r.botao || 'SIM'}" e a regra roda igual.</span></span>
          </label>

          <label className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
            Depois, mover o card para
            <select value={r.mover_para_estagio_id ?? ''} onChange={e => mudarRegra(i, { mover_para_estagio_id: e.target.value ? Number(e.target.value) : null })}
              className="px-2 py-1 border rounded text-sm">
              <option value="">— não mover —</option>
              {etapas.map(et => <option key={et.id} value={et.id}>{et.nome}</option>)}
            </select>
          </label>
        </div>
      ))}

      <button type="button" onClick={() => onChange([...value, regraNova()])}
        className="flex items-center gap-1.5 text-sm text-violet-700 hover:text-violet-900">
        <Plus size={15} /> Adicionar regra de resposta
      </button>
    </div>
  )
}

function PassoEditor({ indice, total, passo, onChange, onMover, onRemover }: {
  indice: number
  total: number
  passo: PassoRespostaBotao
  onChange: (p: PassoRespostaBotao) => void
  onMover: (d: -1 | 1) => void
  onRemover: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const txt = useRef<HTMLTextAreaElement>(null)
  const [subindo, setSubindo] = useState(false)
  const audio = passo.media_mimetype?.startsWith('audio/')

  const anexar = async (f: File | null) => {
    if (!f) return
    if (f.size > 20 * 1024 * 1024) { toast.error('Arquivo maior que 20MB'); return }
    setSubindo(true)
    try {
      const m = await followupsApi.uploadMedia(f)
      onChange({ ...passo, ...m })
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Não foi possível anexar o arquivo')
    } finally {
      setSubindo(false)
      if (ref.current) ref.current.value = ''
    }
  }

  const inserir = (v: string) => {
    const el = txt.current
    const atual = passo.texto || ''
    const pos = el?.selectionStart ?? atual.length
    onChange({ ...passo, texto: `${atual.slice(0, pos)}[${v}]${atual.slice(pos)}` })
  }

  return (
    <div className="rounded border border-gray-200 bg-white p-2">
      <div className="flex items-start gap-2">
        <span className="mt-1 text-[11px] font-semibold text-gray-400 w-4">{indice + 1}</span>
        <div className="flex-1 min-w-0 space-y-1.5">
          {passo.media_url && (
            <div className="flex items-center gap-2">
              {passo.media_mimetype?.startsWith('image/')
                ? <img src={urlMidia(passo.media_url)} alt="anexo" className="h-10 w-10 rounded object-cover border" />
                : iconeDo(passo.media_mimetype)}
              {audio && <audio controls src={urlMidia(passo.media_url)} className="h-8 max-w-[220px]" />}
              <span className="text-xs text-gray-600 truncate flex-1" title={passo.media_filename ?? ''}>{passo.media_filename || 'arquivo'}</span>
              <button type="button" onClick={() => onChange({ ...passo, media_url: null, media_mimetype: null, media_filename: null })}
                className="p-1 text-gray-400 hover:text-red-500" title="Remover anexo"><X size={13} /></button>
            </div>
          )}
          <textarea ref={txt} rows={2} value={passo.texto ?? ''} onChange={e => onChange({ ...passo, texto: e.target.value })}
            placeholder={passo.media_url ? (audio ? 'Texto opcional — sai logo depois do áudio' : 'Legenda (opcional)') : 'Mensagem'}
            className="w-full px-2 py-1.5 border rounded text-sm resize-y" />
          {!passo.media_url && (
            <label className="flex items-center gap-2 text-[11px] text-gray-600">
              <span className="shrink-0">Botões de resposta</span>
              <input value={(passo.botoes || []).join(', ')} placeholder="Opcional — ex.: SIM, NÃO (só no QR)"
                title="Até 3, separados por vírgula. O toque cai nas regras da etapa para onde o card for movido."
                onChange={e => { const b = e.target.value.split(',').map(x => x.trimStart()).slice(0, 3); onChange({ ...passo, botoes: b.some(x => x.trim()) ? b : null }) }}
                onBlur={() => onChange({ ...passo, botoes: (passo.botoes || []).map(x => x.trim()).filter(Boolean).length ? (passo.botoes || []).map(x => x.trim()).filter(Boolean) : null })}
                className="min-w-0 flex-1 px-2 py-1 border rounded text-xs" />
            </label>
          )}
          <div className="flex flex-wrap items-center gap-1">
            {VARIAVEIS.map(v => (
              <button key={v} type="button" onClick={() => inserir(v)}
                className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 text-[11px] hover:bg-violet-100">[{v}]</button>
            ))}
            {!passo.media_url && (
              <>
                <input ref={ref} type="file" accept={ACEITA} className="hidden" onChange={e => anexar(e.target.files?.[0] ?? null)} />
                <button type="button" onClick={() => ref.current?.click()} disabled={subindo}
                  className="ml-auto flex items-center gap-1 text-[11px] text-violet-700 hover:text-violet-900 disabled:opacity-50">
                  {subindo ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
                  {subindo ? 'Enviando…' : 'Anexar áudio, vídeo, imagem ou PDF'}
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col">
          <button type="button" disabled={indice === 0} onClick={() => onMover(-1)} className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Subir"><ArrowUp size={13} /></button>
          <button type="button" disabled={indice === total - 1} onClick={() => onMover(1)} className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Descer"><ArrowDown size={13} /></button>
          <button type="button" onClick={onRemover} className="p-0.5 text-gray-400 hover:text-red-500" title="Remover mensagem"><Trash2 size={13} /></button>
        </div>
      </div>
    </div>
  )
}
