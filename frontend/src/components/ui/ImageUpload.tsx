import React, { useState, useRef } from 'react'
import { Camera, Upload, X } from 'lucide-react'
import { Button } from './Button'

interface ImageUploadProps {
  currentImage?: string
  onImageChange: (file: File | null, preview: string | null) => void
  label?: string
  maxSize?: number // em MB
  /** Maior lado da imagem gravada, em pixels. */
  maxDimensao?: number
}

/**
 * Reduz a imagem ANTES de virar base64. O que o componente devolve é gravado
 * como texto na coluna `usuarios.foto_perfil`, e base64 engorda o arquivo em
 * ~33%: uma foto de celular de 4 MB viraria 5,4 MB de texto, enquanto a API
 * recusa acima de 400 KB. A tela prometia 5 MB e o salvar respondia "Imagem
 * muito grande" — duas regras diferentes para a mesma foto (chamado #109).
 *
 * Um avatar é exibido em 128px; 512 no maior lado cobre telas retina e cabe
 * folgado no limite. Fundo branco porque a saída é JPEG, e PNG transparente
 * viraria preto.
 */
async function reduzirImagem(file: File, maxDimensao: number): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo'))
    reader.onloadend = () => resolve(reader.result as string)
    reader.readAsDataURL(file)
  })

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Falha ao abrir a imagem'))
    el.src = dataUrl
  })

  const maior = Math.max(img.width, img.height)
  const escala = maior > maxDimensao ? maxDimensao / maior : 1
  const largura = Math.round(img.width * escala)
  const altura = Math.round(img.height * escala)

  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, largura, altura)
  ctx.drawImage(img, 0, 0, largura, altura)

  return canvas.toDataURL('image/jpeg', 0.85)
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  currentImage,
  onImageChange,
  label = 'Foto de Perfil',
  maxSize = 5,
  maxDimensao = 512,
}) => {
  const [preview, setPreview] = useState<string | null>(currentImage || null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setError(null)

    if (!file) return

    // Validar tipo de arquivo
    if (!file.type.startsWith('image/')) {
      setError('Por favor, selecione uma imagem válida')
      return
    }

    // Validar tamanho (em MB)
    const fileSizeMB = file.size / (1024 * 1024)
    if (fileSizeMB > maxSize) {
      setError(`A imagem deve ter no máximo ${maxSize}MB`)
      return
    }

    // Reduzir e criar preview. O que vai para o banco é a versão reduzida.
    try {
      const result = await reduzirImagem(file, maxDimensao)
      setPreview(result)
      onImageChange(file, result)
    } catch {
      setError('Não foi possível ler esta imagem. Tente outro arquivo.')
    }
  }

  const handleRemove = () => {
    setPreview(null)
    setError(null)
    onImageChange(null, null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700">
        {label}
      </label>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        {/* Preview da Imagem */}
        <div className="relative">
          <div className="w-32 h-32 rounded-full overflow-hidden bg-gray-100 border-2 border-gray-200">
            {preview ? (
              <img
                src={preview}
                alt="Preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <Camera size={40} />
              </div>
            )}
          </div>

          {preview && (
            <button
              type="button"
              onClick={handleRemove}
              className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg"
              title="Remover foto"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClick}
          >
            <Upload className="w-4 h-4 mr-2" />
            {preview ? 'Trocar Foto' : 'Upload Foto'}
          </Button>

          {preview && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              className="text-red-600 hover:text-red-700"
            >
              <X className="w-4 h-4 mr-2" />
              Remover
            </Button>
          )}

          <p className="text-xs text-gray-500 mt-1">
            JPG, PNG ou GIF (máx. {maxSize}MB)
          </p>
        </div>
      </div>

      {/* Input escondido */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Mensagem de erro */}
      {error && (
        <p className="text-sm text-red-600 mt-2">{error}</p>
      )}
    </div>
  )
}
