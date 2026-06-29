import React, { forwardRef } from 'react'

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        <div className="flex items-center">
          <input
            ref={ref}
            type="checkbox"
            className={`h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer ${className}`}
            {...props}
          />
          {label && (
            <label className="ml-2 block text-sm text-gray-900 cursor-pointer">
              {label}
            </label>
          )}
        </div>
        {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
      </div>
    )
  }
)

Checkbox.displayName = 'Checkbox'
