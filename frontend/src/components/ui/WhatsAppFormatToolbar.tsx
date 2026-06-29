import React from 'react'
import { Bold, Italic, Strikethrough, Code } from 'lucide-react'

interface WhatsAppFormatToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (newValue: string) => void
  className?: string
}

type FormatTag = '*' | '_' | '~' | '```'

const BUTTONS: { tag: FormatTag; icon: React.ComponentType<{ size?: number }>; label: string }[] = [
  { tag: '*', icon: Bold, label: 'Negrito' },
  { tag: '_', icon: Italic, label: 'Itálico' },
  { tag: '~', icon: Strikethrough, label: 'Riscado' },
  { tag: '```', icon: Code, label: 'Monoespaçado' }
]

export const WhatsAppFormatToolbar: React.FC<WhatsAppFormatToolbarProps> = ({
  textareaRef,
  value,
  onChange,
  className = ''
}) => {
  const wrapSelection = (tag: FormatTag) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = value.slice(start, end)

    const before = value.slice(0, start)
    const after = value.slice(end)

    const placeholder = selected || 'texto'
    const wrapped = `${tag}${placeholder}${tag}`
    const newValue = `${before}${wrapped}${after}`

    onChange(newValue)

    setTimeout(() => {
      textarea.focus()
      if (selected) {
        textarea.setSelectionRange(start + tag.length, end + tag.length)
      } else {
        textarea.setSelectionRange(start + tag.length, start + tag.length + placeholder.length)
      }
    }, 0)
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <span className="text-xs text-gray-500 mr-1">Formatar:</span>
      {BUTTONS.map(({ tag, icon: Icon, label }) => (
        <button
          key={tag}
          type="button"
          onClick={() => wrapSelection(tag)}
          title={label}
          className="p-1.5 text-gray-600 hover:bg-gray-100 hover:text-primary-600 rounded transition"
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  )
}

export function renderWhatsAppFormatting(text: string): string {
  return text
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>')
    .replace(/```([^`\n]+)```/g, '<code>$1</code>')
}
