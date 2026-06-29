import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Bold, Italic, Underline as UnderlineIcon, Link2, Image as ImageIcon,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Minus,
  Code, Eye, EyeOff, Undo, Redo, Type, Upload, Loader2
} from 'lucide-react'
import api from '@/api/client'

interface EmailEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  onInsertVariable?: (insertFn: (variable: string) => void) => void
  minHeight?: number
}

export default function EmailEditor({
  value,
  onChange,
  placeholder = 'Escreva o corpo do e-mail aqui...',
  onInsertVariable,
  minHeight = 200,
}: EmailEditorProps) {
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [showImageInput, setShowImageInput] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [showHtmlMode, setShowHtmlMode] = useState(false)
  const [htmlRaw, setHtmlRaw] = useState(value)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const linkInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const imageUploadRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-blue-600 underline cursor-pointer' },
      }),
      Image.configure({
        HTMLAttributes: { class: 'max-w-full rounded' },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate({ editor }) {
      onChange(editor.getHTML())
    },
  })

  // Sync external value changes
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (current !== value && !showHtmlMode) {
      editor.commands.setContent(value || '')
    }
  }, [value, editor, showHtmlMode])

  // Expose insert variable function
  useEffect(() => {
    if (!onInsertVariable || !editor) return
    onInsertVariable((variable: string) => {
      if (showHtmlMode) {
        setHtmlRaw(prev => {
          const updated = prev + variable
          onChange(updated)
          return updated
        })
      } else {
        editor.commands.insertContent(variable)
      }
    })
  }, [onInsertVariable, editor, showHtmlMode, onChange])

  const handleToggleHtml = useCallback(() => {
    if (!editor) return
    if (!showHtmlMode) {
      // Entering HTML mode — sync current content
      setHtmlRaw(editor.getHTML())
    } else {
      // Leaving HTML mode — push raw HTML into editor
      editor.commands.setContent(htmlRaw)
      onChange(htmlRaw)
    }
    setShowHtmlMode(prev => !prev)
  }, [editor, showHtmlMode, htmlRaw, onChange])

  const handleHtmlChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setHtmlRaw(e.target.value)
    onChange(e.target.value)
  }

  const handleSetLink = () => {
    if (!editor) return
    const url = linkUrl.trim()
    if (!url) {
      editor.chain().focus().unsetLink().run()
    } else {
      editor.chain().focus().setLink({ href: url.startsWith('http') ? url : `https://${url}` }).run()
    }
    setShowLinkInput(false)
    setLinkUrl('')
  }

  const handleInsertImage = () => {
    if (!editor || !imageUrl.trim()) return
    editor.chain().focus().setImage({ src: imageUrl.trim() }).run()
    setShowImageInput(false)
    setImageUrl('')
  }

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    e.target.value = ''
    setUploadingImage(true)
    try {
      const form = new FormData()
      form.append('imagem', file)
      const res = await api.post('/crm/email-images', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      editor.chain().focus().setImage({ src: res.data.url }).run()
    } catch {
      alert('Erro ao fazer upload da imagem. Tente novamente.')
    } finally {
      setUploadingImage(false)
    }
  }

  if (!editor) return null

  const ToolbarBtn = ({
    active,
    onClick,
    title,
    disabled = false,
    children,
  }: {
    active?: boolean
    onClick: () => void
    title: string
    disabled?: boolean
    children: React.ReactNode
  }) => (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      disabled={disabled}
      className={`p-1.5 rounded transition-colors text-sm ${
        active
          ? 'bg-blue-100 text-blue-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
      } disabled:opacity-40`}
    >
      {children}
    </button>
  )

  const Divider = () => <span className="w-px h-5 bg-gray-200 mx-0.5 self-center" />

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
      {/* Toolbar */}
      <div className="bg-gray-50 border-b border-gray-200 px-2 py-1.5 flex flex-wrap items-center gap-0.5">
        {/* History */}
        <ToolbarBtn
          title="Desfazer"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          <Undo size={15} />
        </ToolbarBtn>
        <ToolbarBtn
          title="Refazer"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          <Redo size={15} />
        </ToolbarBtn>

        <Divider />

        {/* Headings */}
        <select
          title="Estilo de texto"
          className="text-xs border-0 bg-transparent text-gray-600 focus:ring-0 py-1 px-1 rounded hover:bg-gray-100 cursor-pointer"
          value={
            editor.isActive('heading', { level: 1 }) ? 'h1' :
            editor.isActive('heading', { level: 2 }) ? 'h2' :
            editor.isActive('heading', { level: 3 }) ? 'h3' : 'p'
          }
          onChange={e => {
            const val = e.target.value
            if (val === 'p') editor.chain().focus().setParagraph().run()
            else editor.chain().focus().setHeading({ level: parseInt(val[1]) as 1|2|3 }).run()
          }}
        >
          <option value="p">Parágrafo</option>
          <option value="h1">Título 1</option>
          <option value="h2">Título 2</option>
          <option value="h3">Título 3</option>
        </select>

        <Divider />

        {/* Formatting */}
        <ToolbarBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrito (Ctrl+B)">
          <Bold size={15} />
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Itálico (Ctrl+I)">
          <Italic size={15} />
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Sublinhado (Ctrl+U)">
          <UnderlineIcon size={15} />
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Tachado">
          <span className="text-xs font-bold line-through">S</span>
        </ToolbarBtn>

        <Divider />

        {/* Color */}
        <div className="relative">
          <button
            type="button"
            title="Cor do texto"
            onMouseDown={e => { e.preventDefault(); setShowColorPicker(p => !p) }}
            className="p-1.5 rounded hover:bg-gray-100 flex items-center gap-0.5 text-gray-600"
          >
            <Type size={15} />
            <div
              className="w-3 h-1 rounded-sm"
              style={{ backgroundColor: editor.getAttributes('textStyle').color || '#000000' }}
            />
          </button>
          {showColorPicker && (
            <div className="absolute top-8 left-0 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex flex-wrap gap-1 w-36">
              {['#000000','#1f2937','#dc2626','#d97706','#16a34a','#2563eb','#243a65','#db2777','#6b7280','#ffffff'].map(c => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onMouseDown={e => {
                    e.preventDefault()
                    editor.chain().focus().setColor(c).run()
                    setShowColorPicker(false)
                  }}
                  className="w-6 h-6 rounded border border-gray-300 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                />
              ))}
              <button
                type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  editor.chain().focus().unsetColor().run()
                  setShowColorPicker(false)
                }}
                className="text-xs text-gray-500 hover:text-gray-700 px-1 w-full mt-1"
              >
                Padrão
              </button>
            </div>
          )}
        </div>

        <Divider />

        {/* Alignment */}
        <ToolbarBtn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Alinhar à esquerda">
          <AlignLeft size={15} />
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Centralizar">
          <AlignCenter size={15} />
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Alinhar à direita">
          <AlignRight size={15} />
        </ToolbarBtn>

        <Divider />

        {/* Lists */}
        <ToolbarBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista com marcadores">
          <List size={15} />
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Lista numerada">
          <ListOrdered size={15} />
        </ToolbarBtn>

        <Divider />

        {/* Link */}
        <div className="relative">
          <ToolbarBtn
            active={editor.isActive('link') || showLinkInput}
            onClick={() => {
              if (editor.isActive('link')) {
                editor.chain().focus().unsetLink().run()
              } else {
                setShowLinkInput(p => !p)
                setShowImageInput(false)
                setTimeout(() => linkInputRef.current?.focus(), 50)
              }
            }}
            title="Inserir link"
          >
            <Link2 size={15} />
          </ToolbarBtn>
          {showLinkInput && (
            <div className="absolute top-8 left-0 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex gap-1 min-w-52">
              <input
                ref={linkInputRef}
                type="text"
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSetLink(); if (e.key === 'Escape') setShowLinkInput(false) }}
                placeholder="https://exemplo.com"
                className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); handleSetLink() }}
                className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
              >
                OK
              </button>
            </div>
          )}
        </div>

        {/* Image by URL */}
        <div className="relative">
          <ToolbarBtn
            active={showImageInput}
            onClick={() => {
              setShowImageInput(p => !p)
              setShowLinkInput(false)
              setTimeout(() => imageInputRef.current?.focus(), 50)
            }}
            title="Inserir imagem por URL"
          >
            <ImageIcon size={15} />
          </ToolbarBtn>
          {showImageInput && (
            <div className="absolute top-8 left-0 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex gap-1 min-w-64">
              <input
                ref={imageInputRef}
                type="text"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleInsertImage(); if (e.key === 'Escape') setShowImageInput(false) }}
                placeholder="https://url-da-imagem.png"
                className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); handleInsertImage() }}
                className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
              >
                OK
              </button>
            </div>
          )}
        </div>

        {/* Image upload from computer */}
        <ToolbarBtn
          title="Fazer upload de imagem do computador"
          onClick={() => imageUploadRef.current?.click()}
          disabled={uploadingImage}
        >
          {uploadingImage ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
        </ToolbarBtn>
        <input
          ref={imageUploadRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleUploadImage}
        />

        <Divider />

        {/* Horizontal rule */}
        <ToolbarBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Linha horizontal">
          <Minus size={15} />
        </ToolbarBtn>

        {/* Code block */}
        <ToolbarBtn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Código inline">
          <Code size={15} />
        </ToolbarBtn>

        <Divider />

        {/* HTML mode toggle */}
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); handleToggleHtml() }}
          title={showHtmlMode ? 'Voltar ao editor visual' : 'Editar HTML bruto'}
          className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
            showHtmlMode
              ? 'bg-amber-100 text-amber-700 border border-amber-300'
              : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          {showHtmlMode ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
      </div>

      {/* Editor area */}
      {showHtmlMode ? (
        <textarea
          value={htmlRaw}
          onChange={handleHtmlChange}
          className="w-full p-3 font-mono text-xs text-gray-700 bg-gray-50 border-0 outline-none resize-none"
          style={{ minHeight }}
          placeholder="<p>Escreva HTML aqui...</p>"
        />
      ) : (
        <EditorContent
          editor={editor}
          className="px-3 py-2.5 focus:outline-none text-sm text-gray-800 leading-relaxed"
          style={{ minHeight }}
        />
      )}
    </div>
  )
}
