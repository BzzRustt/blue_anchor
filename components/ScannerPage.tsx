'use client'

import { useState, useEffect, useRef, FormEvent } from 'react'
import type { Profile } from '@/types/database'

const SESSION_DURATION_MS = 15 * 60 * 1000

interface Props {
  profile: Profile
  sessionToken: string
  testMode?: boolean
}

type PageState = 'checking' | 'already_submitted' | 'active' | 'expired' | 'submitted'

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ photoUrl, name, size = 96 }: { photoUrl: string | null; name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((n) => n[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const cls = `rounded-full object-cover shadow-sm flex-shrink-0`
  const style = { width: size, height: size }

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt={name} className={cls} style={style} />
    )
  }

  return (
    <div
      className={`${cls} flex items-center justify-center text-white font-bold`}
      style={{ ...style, backgroundColor: '#1D9E75', fontSize: size * 0.28 }}
    >
      {initials}
    </div>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="fixed top-0 left-0 right-0 h-[3px] z-50 bg-stone-200">
      <div
        className="h-full transition-[width] duration-500 ease-linear"
        style={{ width: `${progress}%`, backgroundColor: '#1D9E75' }}
      />
    </div>
  )
}

// ─── Test mode banner ─────────────────────────────────────────────────────────

function TestModeBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-50 border-b border-amber-200 py-1.5 text-center">
      <p className="text-xs font-medium text-amber-700 tracking-wide">
        Test mode — restrictions disabled
      </p>
    </div>
  )
}

// ─── Poll ─────────────────────────────────────────────────────────────────────

interface PollProps {
  profile: Profile
  value: string
  onChange: (v: string) => void
  hasError: boolean
}

function PollInput({ profile, value, onChange, hasError }: PollProps) {
  if (!profile.poll_type) return null

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
      {profile.poll_question && (
        <p className="text-stone-700 font-medium text-[15px] leading-snug">
          {profile.poll_question}
        </p>
      )}

      {profile.poll_type === 'slider' && (
        <div className="space-y-3">
          <div
            className="text-6xl font-bold text-center tabular-nums select-none"
            style={{ color: '#1D9E75' }}
          >
            {value || '5'}
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={value || '5'}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-2 rounded-full cursor-pointer"
          />
          <div className="flex justify-between text-xs text-stone-400 select-none">
            <span>1 — terrible</span>
            <span>10 — amazing</span>
          </div>
        </div>
      )}

      {profile.poll_type === 'multiple_choice' && (
        <div className="space-y-2">
          {(profile.poll_options ?? []).map((option) => {
            const selected = value === option
            return (
              <button
                key={option}
                type="button"
                onClick={() => onChange(option)}
                className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium border-2 transition-all"
                style={
                  selected
                    ? { borderColor: '#1D9E75', color: '#1D9E75', backgroundColor: 'rgba(29,158,117,0.07)' }
                    : { borderColor: '#e7e5e4', color: '#57534e' }
                }
              >
                {option}
              </button>
            )
          })}
        </div>
      )}

      {profile.poll_type === 'open_text' && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Your answer…"
          maxLength={500}
          rows={3}
          className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none focus:border-stone-400 resize-y"
        />
      )}

      {hasError && (
        <p className="text-red-400 text-xs">Please answer this before sending.</p>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ScannerPage({ profile, sessionToken, testMode = false }: Props) {
  const [pageState, setPageState] = useState<PageState>('checking')
  const [progress, setProgress] = useState(100)
  const [pollAnswer, setPollAnswer] = useState(profile.poll_type === 'slider' ? '5' : '')
  const [comment, setComment] = useState('')
  const [commenterName, setCommenterName] = useState('')
  const [pollError, setPollError] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const startTimeRef = useRef<number>(0)

  useEffect(() => {
    // In test mode: skip localStorage check entirely and go straight to active
    if (!testMode && localStorage.getItem('scanme_submitted')) {
      setPageState('already_submitted')
      return
    }

    startTimeRef.current = Date.now()
    setPageState('active')

    // In test mode: no countdown — session never expires
    if (testMode) return

    const id = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      const remaining = Math.max(0, SESSION_DURATION_MS - elapsed)
      setProgress((remaining / SESSION_DURATION_MS) * 100)
      if (remaining === 0) {
        clearInterval(id)
        setPageState('expired')
      }
    }, 500)

    return () => clearInterval(id)
  }, [testMode])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setPollError(false)
    setSubmitError('')

    if (profile.poll_type && !pollAnswer.trim()) {
      setPollError(true)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: sessionToken,
          poll_answer: pollAnswer,
          comment: comment || undefined,
          commenter_name: commenterName || undefined,
        }),
      })
      const data: { success: boolean; message?: string } = await res.json()

      if (data.success) {
        if (!testMode) {
          localStorage.setItem('scanme_submitted', 'true')
        }
        setPageState('submitted')
      } else {
        setSubmitError(data.message ?? 'Something went wrong. Please try again.')
      }
    } catch {
      setSubmitError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── checking ──────────────────────────────────────────────────────────────
  if (pageState === 'checking') return null

  // ── already submitted ────────────────────────────────────────────────────
  if (pageState === 'already_submitted') {
    return (
      <main
        className="min-h-screen flex items-center justify-center px-6 py-16"
        style={{ backgroundColor: '#f9f6f1' }}
      >
        <div className="max-w-sm w-full text-center space-y-5">
          <Avatar photoUrl={profile.photo_url} name={profile.name} size={80} />
          <p className="text-xl font-semibold text-stone-800">{profile.name}</p>
          <p className="text-stone-500 leading-relaxed text-[15px]">
            Hey, you&apos;ve already left me a note from this phone — means a lot.
            If you&apos;ve got more to say, just find me and say it out loud — I promise
            I don&apos;t bite.
          </p>
          {profile.instagram && (
            <a
              href={`https://instagram.com/${profile.instagram.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm font-medium underline underline-offset-2"
              style={{ color: '#1D9E75' }}
            >
              @{profile.instagram.replace('@', '')} on Instagram
            </a>
          )}
        </div>
      </main>
    )
  }

  // ── expired ───────────────────────────────────────────────────────────────
  if (pageState === 'expired') {
    return (
      <main
        className="min-h-screen flex items-center justify-center px-6 py-16"
        style={{ backgroundColor: '#f9f6f1' }}
      >
        <ProgressBar progress={0} />
        <div className="max-w-sm w-full text-center space-y-4">
          <p className="text-4xl">⌛</p>
          <p className="text-stone-500 leading-relaxed text-[15px]">
            Looks like this link has done its thing. These are made fresh each time someone
            scans — so if you want to leave a note, come find me in person. Would love to
            hear from you!
          </p>
        </div>
      </main>
    )
  }

  // ── submitted ─────────────────────────────────────────────────────────────
  if (pageState === 'submitted') {
    return (
      <main
        className="min-h-screen flex items-center justify-center px-6 py-16"
        style={{ backgroundColor: '#f9f6f1' }}
      >
        <div className="max-w-sm w-full text-center space-y-5">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
            style={{ backgroundColor: '#1D9E75' }}
          >
            <svg
              className="w-7 h-7 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-stone-800">
              Your note is in — thank you.
            </h2>
            <p className="mt-2 text-stone-500 text-[15px] leading-relaxed">
              You&apos;ll only be able to submit once from this phone. If you&apos;ve got
              more to say, find me in person — I&apos;d genuinely love that.
            </p>
          </div>
          {profile.instagram && (
            <a
              href={`https://instagram.com/${profile.instagram.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm font-medium underline underline-offset-2"
              style={{ color: '#1D9E75' }}
            >
              Follow along @{profile.instagram.replace('@', '')}
            </a>
          )}
          {profile.survey_link && (
            <a
              href={profile.survey_link}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-3 rounded-2xl text-sm font-semibold border-2 text-center transition-opacity hover:opacity-80"
              style={{ borderColor: '#1D9E75', color: '#1D9E75' }}
            >
              Got more to say? Take the survey →
            </a>
          )}
        </div>
      </main>
    )
  }

  // ── active (main form) ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f9f6f1' }}>
      {testMode ? <TestModeBanner /> : <ProgressBar progress={progress} />}

      <div className="max-w-md mx-auto px-5 pt-10 pb-16">
        {!testMode && (
          <p className="text-xs text-stone-400 text-center mb-8 tracking-wide">
            This link is just for you — only open for a little while
          </p>
        )}

        {/* Profile header */}
        <div className="flex flex-col items-center text-center mb-8 space-y-4">
          <Avatar photoUrl={profile.photo_url} name={profile.name} size={96} />
          <div>
            <h1 className="text-3xl font-bold text-stone-800 tracking-tight">
              {profile.name}
            </h1>
            {profile.bio && (
              <p className="mt-2 text-stone-500 text-[15px] leading-relaxed max-w-xs mx-auto">
                {profile.bio}
              </p>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Poll */}
          {profile.poll_type && (
            <>
              <div className="h-px bg-stone-200" />
              <PollInput
                profile={profile}
                value={pollAnswer}
                onChange={(v) => { setPollAnswer(v); setPollError(false) }}
                hasError={pollError}
              />
            </>
          )}

          {/* Note */}
          <div className="h-px bg-stone-200" />
          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
            {profile.note_intro && (
              <p className="text-stone-500 text-sm leading-relaxed italic">
                {profile.note_intro}
              </p>
            )}
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Your thoughts, feedback, a compliment, a question — anything goes…"
              maxLength={2000}
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none focus:border-stone-400 resize-y"
            />
            <input
              type="text"
              value={commenterName}
              onChange={(e) => setCommenterName(e.target.value)}
              placeholder="Your name (totally optional — anonymous is fine)"
              maxLength={100}
              className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none focus:border-stone-400"
            />
            <p className="text-xs text-stone-400">
              Only you and the shirt owner will ever see this.
            </p>
          </div>

          {/* Error */}
          {submitError && (
            <p className="text-red-400 text-sm text-center">{submitError}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-2xl text-white text-base font-semibold disabled:opacity-50 transition-all active:scale-[0.98]"
            style={{ backgroundColor: '#1D9E75' }}
          >
            {submitting ? 'Sending…' : 'Send it'}
          </button>
        </form>
      </div>
    </div>
  )
}
