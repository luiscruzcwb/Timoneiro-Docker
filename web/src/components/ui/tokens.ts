// Semantic color tokens — single source of truth for the UI kit.
// Components accept a `tone` and resolve hex values from here, so
// pages never hardcode colors.

export type Tone = 'cyan' | 'emerald' | 'amber' | 'orange' | 'coral' | 'violet' | 'neutral'

export const TONE: Record<Tone, string> = {
  cyan:    '#22d3ee',
  emerald: '#34d399',
  amber:   '#fbbf24',
  orange:  '#fb923c',
  coral:   '#f87171',
  violet:  '#a78bfa',
  neutral: '#3d5a80',
}

// Status → tone mapping used across containers, updates and history
export const STATUS_TONE: Record<string, Tone> = {
  up_to_date:       'emerald',
  update_available: 'amber',
  updating:         'cyan',
  failed:           'coral',
  local:            'violet',
  unknown:          'neutral',
  pending:          'amber',
  approved:         'cyan',
  deploying:        'violet',
  deployed:         'emerald',
  ignored:          'neutral',
  success:          'emerald',
  rolled_back:      'violet',
}
