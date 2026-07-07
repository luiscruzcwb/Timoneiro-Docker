import { useTranslation } from 'react-i18next'
import clsx from 'clsx'

const LANGUAGES: { code: string; label: string }[] = [
  { code: 'pt-BR', label: 'PT' },
  { code: 'en', label: 'EN' },
]

export default function LanguageSwitcher({ className = 'flex' }: { className?: string }) {
  const { i18n } = useTranslation()
  return (
    <div className={clsx('items-center gap-0.5 rounded border border-border-subtle p-0.5', className)}>
      {LANGUAGES.map(l => (
        <button
          key={l.code}
          onClick={() => i18n.changeLanguage(l.code)}
          className={clsx(
            'px-1.5 py-0.5 rounded font-mono text-3xs tracking-wider transition-colors',
            i18n.language === l.code ? 'bg-brand-cyan/15 text-brand-cyan' : 'text-text-muted hover:text-text-soft',
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}
