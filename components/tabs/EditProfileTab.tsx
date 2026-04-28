'use client'

import { useState, useEffect } from 'react'
import type { Profile } from '@/types/database'

type PollType = 'slider' | 'multiple_choice' | 'open_text'

type FormState = {
  name: string
  photo_url: string
  bio: string
  poll_type: PollType
  poll_question: string
  poll_options: string[]
  note_intro: string
  instagram: string
  survey_link: string
}

const DEFAULTS: FormState = {
  name: '',
  photo_url: '',
  bio: '',
  poll_type: 'slider',
  poll_question: '',
  poll_options: ['', ''],
  note_intro: '',
  instagram: '',
  survey_link: '',
}

const POLL_TYPE_LABELS: Record<PollType, string> = {
  slider: 'Slider',
  multiple_choice: 'Multiple choice',
  open_text: 'Open question',
}

const inputCls =
  'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent'

// ─── Layout helpers ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
      <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
        {title}
      </h2>
      {children}
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
      {children}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EditProfileTab() {
  const [form, setForm] = useState<FormState>(DEFAULTS)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((data) => {
        const p = data.profile as Profile | null
        if (p) {
          setForm({
            name: p.name ?? '',
            photo_url: p.photo_url ?? '',
            bio: p.bio ?? '',
            poll_type: p.poll_type ?? 'slider',
            poll_question: p.poll_question ?? '',
            poll_options:
              p.poll_options && p.poll_options.length >= 2 ? p.poll_options : ['', ''],
            note_intro: p.note_intro ?? '',
            instagram: p.instagram ?? '',
            survey_link: p.survey_link ?? '',
          })
        }
        setLoadState('ready')
      })
      .catch(() => setLoadState('error'))
  }, [])

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function updateOption(idx: number, value: string) {
    setForm((prev) => {
      const next = [...prev.poll_options]
      next[idx] = value
      return { ...prev, poll_options: next }
    })
  }

  function addOption() {
    setForm((prev) => ({ ...prev, poll_options: [...prev.poll_options, ''] }))
  }

  function removeOption(idx: number) {
    setForm((prev) => ({
      ...prev,
      poll_options: prev.poll_options.filter((_, i) => i !== idx),
    }))
  }

  async function save() {
    setSaveState('saving')
    setErrorMsg('')
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.success) {
        setSaveState('success')
        setTimeout(() => setSaveState('idle'), 3000)
      } else {
        setErrorMsg(data.message ?? 'Something went wrong.')
        setSaveState('error')
      }
    } catch {
      setErrorMsg('Could not connect to the server.')
      setSaveState('error')
    }
  }

  if (loadState === 'loading') {
    return (
      <div className="space-y-4 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl h-36" />
        ))}
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <p className="text-sm text-gray-400">Failed to load data. Please refresh the page.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Profile */}
      <Section title="Profile">
        <Field label="Display name">
          <input
            type="text"
            value={form.name}
            onChange={(e) => patch('name', e.target.value)}
            className={inputCls}
            placeholder="Your name"
          />
        </Field>
        <Field label="Photo URL" hint="Paste a direct link to your photo">
          <input
            type="text"
            value={form.photo_url}
            onChange={(e) => patch('photo_url', e.target.value)}
            className={inputCls}
            placeholder="https://..."
          />
        </Field>
        <Field label="Bio message" hint="Appears under your name on the public page">
          <textarea
            value={form.bio}
            onChange={(e) => patch('bio', e.target.value)}
            rows={3}
            className={`${inputCls} resize-none`}
            placeholder="Hi, I'm…"
          />
        </Field>
      </Section>

      {/* Poll */}
      <Section title="Poll">
        <Field label="Poll type">
          <div className="flex flex-wrap gap-2">
            {(['slider', 'multiple_choice', 'open_text'] as PollType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => patch('poll_type', type)}
                className={[
                  'px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors',
                  form.poll_type === type
                    ? 'bg-accent text-white border-accent'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400',
                ].join(' ')}
              >
                {POLL_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Poll question">
          <input
            type="text"
            value={form.poll_question}
            onChange={(e) => patch('poll_question', e.target.value)}
            className={inputCls}
            placeholder="e.g. How interesting was this conversation?"
          />
        </Field>
        {form.poll_type === 'multiple_choice' && (
          <Field label="Options">
            <div className="space-y-2">
              {form.poll_options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    className={`${inputCls} flex-1`}
                    placeholder={`Option ${i + 1}`}
                  />
                  {form.poll_options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="text-gray-400 hover:text-red-500 transition-colors w-7 text-xl leading-none flex-shrink-0 text-center"
                      aria-label="Remove option"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addOption}
                className="text-sm text-accent hover:underline"
              >
                + Add option
              </button>
            </div>
          </Field>
        )}
      </Section>

      {/* Note intro */}
      <Section title="Leave a note prompt">
        <Field
          label="Prompt text"
          hint="This appears above the comment box. Use it to explain the ScanMe idea and ask for feedback."
        >
          <textarea
            value={form.note_intro}
            onChange={(e) => patch('note_intro', e.target.value)}
            rows={3}
            className={`${inputCls} resize-none`}
            placeholder="Hey! You scanned my shirt…"
          />
        </Field>
      </Section>

      {/* Links */}
      <Section title="Links">
        <Field label="Instagram handle" hint="e.g. @yourusername">
          <input
            type="text"
            value={form.instagram}
            onChange={(e) => patch('instagram', e.target.value)}
            className={inputCls}
            placeholder="@yourusername"
          />
        </Field>
        <Field label="Survey link" hint="Paste your Tally.so or Google Forms link">
          <input
            type="text"
            value={form.survey_link}
            onChange={(e) => patch('survey_link', e.target.value)}
            className={inputCls}
            placeholder="https://..."
          />
        </Field>
      </Section>

      {/* Save */}
      <div className="space-y-2 pb-8">
        <button
          type="button"
          onClick={save}
          disabled={saveState === 'saving'}
          className="w-full py-3 rounded-xl bg-accent text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {saveState === 'saving' ? 'Saving…' : 'Save changes — go live instantly'}
        </button>
        {saveState === 'success' && (
          <p className="text-center text-sm text-emerald-600">
            Changes saved. Your public page is updated.
          </p>
        )}
        {saveState === 'error' && (
          <p className="text-center text-sm text-red-500">{errorMsg}</p>
        )}
      </div>
    </div>
  )
}
