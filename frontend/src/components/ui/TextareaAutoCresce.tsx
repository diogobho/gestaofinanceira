import React, { useLayoutEffect, useRef } from 'react'

interface Props extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string
  /** Teto em px — acima disso o campo rola por dentro. */
  alturaMaxima?: number
}

/**
 * Campo de texto que cresce com o conteúdo (#182): mensagem de cadência com
 * três parágrafos não cabia em 3 linhas fixas, e o `resize-none` nem deixava
 * esticar. Continua redimensionável à mão (`resize-y`) para quem quiser mais.
 */
export function TextareaAutoCresce({ value, alturaMaxima = 480, rows = 3, className = '', ...props }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight + 2, alturaMaxima)}px`
  }, [value, alturaMaxima])

  return <textarea ref={ref} value={value} rows={rows} className={`resize-y ${className}`} {...props} />
}
