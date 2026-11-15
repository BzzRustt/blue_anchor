'use client'

import { Briefcase, LockKey, Palette, UsersThree } from '@phosphor-icons/react'
import { useState } from 'react'
import { createCampaign } from '@/app/app/actions'

const modes = [
  { value: 'networking', name: 'Networking', body: 'Share your role, goals and a useful reason to connect.', icon: UsersThree, preset: { name: 'First introductions', question: 'Rate my drip from 1 to 10', prompt: 'Do you have a message for me?' } },
  { value: 'private', name: 'Private notes', body: 'Collect honest feedback that only you can read.', icon: LockKey, preset: { name: 'Quick feedback', question: 'How would you rate the experience?', prompt: 'What could I do better?' } },
  { value: 'creator', name: 'Creator', body: 'Ask your audience what to make next and gather enquiries.', icon: Palette, preset: { name: 'What should I make next?', question: 'How much would you like to see a behind-the-scenes series?', prompt: 'What do you want to see next?' } },
  { value: 'portfolio', name: 'Portfolio', body: 'Guide interest toward your work, services and contact links.', icon: Briefcase, preset: { name: 'Studio enquiries', question: 'How relevant is this work to your project?', prompt: 'What would you like to work on together?' } },
] as const

type Mode = (typeof modes)[number]['value']
type Fields = { name: string; question: string; prompt: string }
const presetOf = (mode: Mode) => modes.find((item) => item.value === mode)!.preset

/**
 * Picking an intent fills in sensible wording, but only for fields still holding the previous
 * intent's wording (or empty). Anything the person has typed is never overwritten.
 */
export function CampaignForm() {
  const [mode, setMode] = useState<Mode>('networking')
  const [values, setValues] = useState<Fields>({ ...presetOf('networking') })

  function choose(next: Mode) {
    const previous = presetOf(mode)
    const upcoming = presetOf(next)
    setValues((current) => ({
      name: !current.name || current.name === previous.name ? upcoming.name : current.name,
      question: !current.question || current.question === previous.question ? upcoming.question : current.question,
      prompt: !current.prompt || current.prompt === previous.prompt ? upcoming.prompt : current.prompt,
    }))
    setMode(next)
  }

  return (
    <form action={createCampaign} className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
      <section className="soft-card p-5 sm:p-7">
        <h2 className="text-lg font-extrabold">1. Choose an intent</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {modes.map((item) => (
            <label key={item.value} className="relative cursor-pointer">
              <input className="peer sr-only" type="radio" name="mode" value={item.value} checked={mode === item.value} onChange={() => choose(item.value)} />
              <span className="flex min-h-36 flex-col rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 transition peer-checked:border-[var(--accent)] peer-checked:bg-[var(--accent-soft)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent)]">
                <item.icon size={24} className="text-[var(--accent-strong)]" />
                <strong className="mt-4">{item.name}</strong>
                <span className="mt-1 text-xs leading-5 text-[var(--muted)]">{item.body}</span>
              </span>
            </label>
          ))}
        </div>
      </section>
      <section className="soft-card p-5 sm:p-7">
        <h2 className="text-lg font-extrabold">2. Shape the experience</h2>
        <div className="mt-5 grid gap-5">
          <label className="field-label">Mode name<input className="field-input" name="name" required maxLength={80} value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="field-label">Rating question<input className="field-input" name="question" required maxLength={180} value={values.question} onChange={(event) => setValues((current) => ({ ...current, question: event.target.value }))} /></label>
          <label className="field-label">Message prompt<input className="field-input" name="messagePrompt" maxLength={180} value={values.prompt} onChange={(event) => setValues((current) => ({ ...current, prompt: event.target.value }))} /></label>
          <button className="action-primary mt-2">Save draft</button>
        </div>
      </section>
    </form>
  )
}
