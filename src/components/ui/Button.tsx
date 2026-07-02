import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { clsx } from 'clsx'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, children, className, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(
          'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none',
          {
            // Sizes
            'text-sm px-3 py-1.5': size === 'sm',
            'text-sm px-4 py-2.5': size === 'md',
            'text-base px-6 py-3': size === 'lg',
            // Variants
            'bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white shadow-sm':
              variant === 'primary',
            'bg-transparent hover:bg-white/10 text-current': variant === 'ghost',
            'border border-border-light dark:border-border-dark bg-transparent hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300':
              variant === 'outline',
          },
          className,
        )}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin h-4 w-4 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'
