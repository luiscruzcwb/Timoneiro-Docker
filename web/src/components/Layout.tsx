import { ReactNode } from 'react'
import { Toaster } from 'sonner'
import TopNav from './TopNav'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-ocean-void">
      <TopNav />

      <main
        className="flex-1 overflow-y-auto relative"
        style={{
          backgroundImage: `
            linear-gradient(#0e204020 1px, transparent 1px),
            linear-gradient(90deg, #0e204020 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          backgroundPosition: '-1px -1px',
        }}
      >
        {/* Top ambient glow */}
        <div
          className="pointer-events-none absolute top-0 left-0 right-0 h-48 opacity-20"
          style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #22d3ee14, transparent)' }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
          {children}
        </div>
      </main>

      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: '#0a1628',
            border: '1px solid #1a3560',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '0.73rem',
            borderRadius: '3px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          },
        }}
      />
    </div>
  )
}
