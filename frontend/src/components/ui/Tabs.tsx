import { ReactNode } from 'react'

export interface TabItem {
  key: string
  label: string
  icon?: ReactNode
  badge?: string | number
}

interface TabsProps {
  tabs: TabItem[]
  active: string
  onChange: (key: string) => void
  className?: string
}

export function Tabs({ tabs, active, onChange, className = '' }: TabsProps) {
  return (
    <div className={`border-b border-gray-200 dark:border-gray-700 ${className}`}>
      <nav className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.key === active
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={`
                group inline-flex items-center gap-2 whitespace-nowrap
                border-b-2 py-3 px-4 text-sm font-medium transition-colors
                ${isActive
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}
              `}
              aria-current={isActive ? 'page' : undefined}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`
                    ml-1 inline-flex items-center justify-center rounded-full
                    px-2 py-0.5 text-xs font-semibold
                    ${isActive
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}
                  `}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
