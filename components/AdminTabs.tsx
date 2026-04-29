'use client'

import { useState } from 'react'
import QRCodeTab from '@/components/tabs/QRCodeTab'

const TABS = ['Analytics', 'Responses', 'Edit Profile', 'QR Code'] as const
type Tab = (typeof TABS)[number]

interface Props {
  analyticsContent: React.ReactNode
  responsesContent: React.ReactNode
  editProfileContent: React.ReactNode
  initialTestMode: boolean
}

function TestModeToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial)
  const [saving, setSaving] = useState(false)

  async function toggle() {
    const next = !enabled
    setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test_mode: next }),
      })
      if (res.ok) setEnabled(next)
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      title={
        enabled
          ? 'Test mode on — token, rate limiting, and one-response checks are disabled. Click to go live.'
          : 'Live mode — all security checks are active. Click to enable test mode.'
      }
      className={[
        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all shrink-0 disabled:opacity-60',
        enabled
          ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
          : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700',
      ].join(' ')}
    >
      {/* Toggle pill */}
      <span
        className={[
          'relative inline-flex w-7 h-4 rounded-full transition-colors flex-shrink-0',
          enabled ? 'bg-amber-400' : 'bg-gray-200',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform',
            enabled ? 'translate-x-3.5' : 'translate-x-0.5',
          ].join(' ')}
        />
      </span>
      {enabled ? 'Test mode' : 'Live mode'}
    </button>
  )
}

export default function AdminTabs({
  analyticsContent,
  responsesContent,
  editProfileContent,
  initialTestMode,
}: Props) {
  const [active, setActive] = useState<Tab>('Analytics')

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex items-center gap-0 overflow-x-auto">
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

          {/* Test mode toggle — always visible regardless of active tab */}
          <TestModeToggle initial={initialTestMode} />
        </div>
      </header>

      {/* Content area */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Always mounted so server-fetched data is never re-requested on tab switch */}
        <div className={active === 'Analytics' ? 'block' : 'hidden'}>
          {analyticsContent}
        </div>

        <div className={active === 'Responses' ? 'block' : 'hidden'}>
          {responsesContent}
        </div>

        <div className={active === 'Edit Profile' ? 'block' : 'hidden'}>
          {editProfileContent}
        </div>

        <div className={active === 'QR Code' ? 'block' : 'hidden'}>
          <QRCodeTab />
        </div>
      </main>
    </div>
  )
}
