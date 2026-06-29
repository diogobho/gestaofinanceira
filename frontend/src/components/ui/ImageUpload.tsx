import React, { useState, useRef } from 'react'
import { Camera, Upload, X } from 'lucide-react'
import { Button } from './Button'

interface ImageUploadProps {
  currentImage?: string
  onImageChange: (file: File | null, preview: string | null) => void
  label?: string
  maxSize?: number // em MB
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  currentImage,
  onImageChange,
  label = 'Foto de Perfil',
  maxSize = 5,
}) => {
  const [preview, setPreview] = useState<string | null>(currentImage || null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

    // Criar preview
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      setPreview(result)
      onImageChange(file, result)
    }
    reader.readAsDataURL(file)
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
