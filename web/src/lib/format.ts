const REL_TIME_LABELS: Record<string, { now: string; min: string; hour: string; day: string }> = {
  'pt-BR': { now: 'agora', min: 'min', hour: 'h', day: 'd' },
  en: { now: 'now', min: 'min', hour: 'h', day: 'd' },
}

export function relTime(str: string, locale = 'pt-BR'): string {
  if (!str || str.startsWith('0001')) return '—'
  const labels = REL_TIME_LABELS[locale] ?? REL_TIME_LABELS['pt-BR']
  const diff = Date.now() - new Date(str).getTime()
  const m = Math.floor(diff / 60_000)
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(diff / 86_400_000)
  if (m < 2)  return labels.now
  if (m < 60) return `${m}${labels.min}`
  if (h < 24) return `${h}${labels.hour}`
  return `${d}${labels.day}`
}

export function formatDate(str: string, locale = 'pt-BR'): string {
  if (!str || str.startsWith('0001')) return '—'
  return new Date(str).toLocaleString(locale, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
