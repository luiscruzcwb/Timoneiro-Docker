/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Fira Code', 'monospace'],
        display: ['Sora', 'sans-serif'],
      },
      colors: {
        ocean: {
          void:    '#03060d',
          ink:     '#06090f',
          deep:    '#060d1a',
          surface: '#0a1628',
          panel:   '#0c1830',
          mid:     '#0f2040',
          lift:    '#162a52',
        },
        brand: {
          cyan:    '#22d3ee',
          emerald: '#34d399',
          amber:   '#fbbf24',
          orange:  '#fb923c',
          coral:   '#f87171',
          violet:  '#a78bfa',
        },
        text: {
          bright:  '#e2f0ff',
          primary: '#94b4d4',
          soft:    '#7aa3c0',
          muted:   '#3d5a80',
          ghost:   '#1e3a5f',
        },
        border: {
          subtle: '#0e2040',
          faint:  '#08101f',
          mid:    '#1a3560',
          active: '#22d3ee44',
        },
      },
      fontSize: {
        '3xs': ['0.64rem', { lineHeight: '1.45' }],
        '2xs': ['0.7rem', { lineHeight: '1.55' }],
        'label': ['0.66rem', { lineHeight: '1.45', letterSpacing: '0.09em' }],
      },
      boxShadow: {
        'glow-cyan':    '0 0 20px -5px #22d3ee44, 0 0 60px -20px #22d3ee22',
        'glow-emerald': '0 0 20px -5px #34d39944',
        'glow-amber':   '0 0 20px -5px #fbbf2444',
        'glow-coral':   '0 0 20px -5px #f8717144',
        'inner-glow':   'inset 0 1px 0 0 rgba(34,211,238,0.06)',
      },
      backgroundImage: {
        'grid-ocean': `
          linear-gradient(#0e204044 1px, transparent 1px),
          linear-gradient(90deg, #0e204044 1px, transparent 1px)
        `,
        'card-gradient': 'linear-gradient(135deg, #0c1830, #060d1a)',
      },
      backgroundSize: {
        'grid': '40px 40px',
      },
    },
  },
  plugins: [],
}
