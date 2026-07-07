import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, LabelHTMLAttributes, ReactNode, forwardRef } from 'react'
import clsx from 'clsx'

const fieldBase =
  'w-full rounded bg-ocean-ink border border-border-subtle text-text-primary font-mono text-2xs ' +
  'px-2.5 py-1.5 outline-none transition-colors duration-150 ' +
  'focus:border-border-active placeholder:text-text-ghost caret-brand-cyan'

export function Label({ children, className, ...rest }: LabelHTMLAttributes<HTMLLabelElement> & { children: ReactNode }) {
  return (
    <label className={clsx('block mb-1 font-mono text-label text-text-soft uppercase', className)} {...rest}>
      {children}
    </label>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={clsx(fieldBase, className)} {...rest} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={clsx(fieldBase, 'resize-none leading-relaxed', className)} {...rest} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} className={clsx(fieldBase, 'cursor-pointer', className)} {...rest}>
        {children}
      </select>
    )
  },
)
