'use client'

import { useState } from 'react'

const TABS = ['Analytics', 'Responses', 'Edit Profile'] as const
type Tab = (typeof TABS)[number]

interface Props {
  analyticsContent: React.ReactNode
  responsesContent: React.ReactNode
  editProfileContent: React.ReactNode
}

export default function AdminTabs({ analyticsContent, responsesContent, editProfileContent }: Props) {
  const [active, setActive] = useState<Tab>('Analytics')

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 flex items-center gap-0 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              className={[
                'shrink-0 px-4 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                active === tab
                  ? 'border-accent text-accent'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
              ].join(' ')}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      {/* Content area */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Analytics — always mounted so server-fetched data is never re-requested */}
        <div className={active === 'Analytics' ? 'block' : 'hidden'}>
          {analyticsContent}
        </div>

        <div className={active === 'Responses' ? 'block' : 'hidden'}>
          {responsesContent}
        </div>

        <div className={active === 'Edit Profile' ? 'block' : 'hidden'}>
          {editProfileContent}
        </div>
      </main>
    </div>
  )
}
