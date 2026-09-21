/**
 * Switch — toggle liga/desliga padrão do sistema.
 *
 * Por que existe: os toggles soltos usavam `bg-white` no knob e `bg-primary-600`
 * na trilha. No dark mode o override global `html.dark .bg-white` (index.css)
 * pinta o knob de cinza-800 e o navy da trilha some sobre o card escuro — o
 * switch virava um círculo invisível. Aqui as cores são fixadas com variante
 * `dark:` explícita (especificidade maior que `html.dark .classe`), então o
 * controle fica legível nos dois temas.
 */
interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  /** Texto ao lado do switch ("Ativo"/"Inativo"). Passe `false` para esconder. */
  showLabel?: boolean
  labels?: { on: string; off: string }
  title?: string
  'aria-label'?: string
}

export function Switch({
  checked,
  onChange,
  disabled = false,
  showLabel = true,
  labels = { on: 'Ativo', off: 'Inativo' },
  title,
  'aria-label': ariaLabel,
}: SwitchProps) {
  return (
    <div className="flex items-center gap-2.5 flex-shrink-0">
      {showLabel && (
        <span
          className={`text-xs font-semibold uppercase tracking-wide select-none ${
            checked
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-gray-400 dark:text-gray-500'
          }`}
        >
          {checked ? labels.on : labels.off}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative w-14 h-7 rounded-full transition-colors flex-shrink-0 shadow-inner
          focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500
          disabled:opacity-50 disabled:cursor-not-allowed ${
            checked
              ? 'bg-emerald-500 dark:bg-emerald-500'
              : 'bg-gray-300 dark:bg-gray-600'
          }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full shadow-md transition-transform
            bg-white dark:bg-white ${checked ? 'translate-x-7' : 'translate-x-0'}`}
        />
      </button>
    </div>
  )
}
