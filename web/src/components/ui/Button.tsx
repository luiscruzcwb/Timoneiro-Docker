import { ButtonHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'

type Variant = 'primary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-cyan/10 border-brand-cyan/30 text-brand-cyan hover:bg-brand-cyan/20',
  ghost:   'bg-transparent border-border-subtle text-text-soft hover:text-text-bright hover:border-border-mid',
  danger:  'bg-brand-coral/10 border-brand-coral/30 text-brand-coral hover:bg-brand-coral/20',
  outline: 'bg-transparent border-border-subtle text-text-muted hover:text-text-soft',
}

const SIZE: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-3xs',
  md: 'px-3.5 py-1.5 text-2xs',
}

export default function Button({ variant = 'ghost', size = 'md', className, children, ...rest }: Props) {
  return (
    <button
      className={clsx(
        'inline-flex items-center gap-1.5 rounded border font-mono uppercase tracking-wider',
        'transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
        VARIANT[variant], SIZE[size], className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
