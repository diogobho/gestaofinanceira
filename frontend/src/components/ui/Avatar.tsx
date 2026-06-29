interface AvatarProps {
  name: string
  src?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

// Cores vibrantes para os avatares
const colors = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-yellow-500',
  'bg-lime-500',
  'bg-green-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-sky-500',
  'bg-blue-500',
  'bg-primary-500',
  'bg-primary-500',
  'bg-primary-500',
  'bg-fuchsia-500',
  'bg-pink-500',
  'bg-rose-500',
]

// Gera uma cor consistente baseada no nome
function getColorFromName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % colors.length
  return colors[index]
}

// Extrai as iniciais do nome (até 2 letras)
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
}

export default function Avatar({ name, src, size = 'md', className = '' }: AvatarProps) {
  const initials = getInitials(name || '?')
  const bgColor = getColorFromName(name || '')

  if (src) {
    return (
      <div className={`${sizeClasses[size]} rounded-full overflow-hidden flex-shrink-0 ${className}`}>
        <img
          src={src}
          alt={name}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Se a imagem falhar, esconde ela para mostrar as iniciais
            e.currentTarget.style.display = 'none'
          }}
        />
        {/* Fallback com iniciais caso a imagem falhe */}
        <div className={`w-full h-full ${bgColor} flex items-center justify-center text-white font-semibold`}>
          {initials}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`${sizeClasses[size]} ${bgColor} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 ${className}`}
    >
      {initials}
    </div>
  )
}
