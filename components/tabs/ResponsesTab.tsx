import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Profile, Response as ScanResponse } from '@/types/database'
import ResponsesClient from './ResponsesClient'

// ─── Poll results (server-rendered, pure display) ─────────────────────────────

function SliderResults({ answers }: { answers: string[] }) {
  const nums = answers
    .map((a) => parseFloat(a))
    .filter((n) => !isNaN(n) && n >= 1 && n <= 10)

  if (nums.length === 0) {
    return <p className="text-sm text-gray-400">No poll responses yet.</p>
  }

  const avg = nums.reduce((a, b) => a + b, 0) / nums.length
  const distribution: Record<number, number> = {}
  for (let i = 1; i <= 10; i++) distribution[i] = 0
  for (const n of nums) distribution[Math.round(n)]++
  const maxCount = Math.max(...Object.values(distribution), 1)

  return (
    <div className="space-y-4">
      <p className="text-3xl font-bold text-gray-900 tabular-nums">
        {avg.toFixed(1)}{' '}
        <span className="text-base font-normal text-gray-400">/ 10</span>
      </p>
      <div className="space-y-1.5">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => {
          const count = distribution[score]
          const pct = Math.round((count / maxCount) * 100)
          return (
            <div key={score} className="flex items-center gap-3">
              <span className="w-4 text-xs text-gray-400 text-right tabular-nums">
                {score}
              </span>
              <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                <div
                  className="h-full bg-accent rounded transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-6 text-xs text-gray-400 tabular-nums">{count}</span>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-gray-400">{nums.length} response{nums.length !== 1 ? 's' : ''}</p>
    </div>
  )
}

function MultipleChoiceResults({
  answers,
  options,
}: {
  answers: string[]
  options: string[]
}) {
  if (answers.length === 0) {
    return <p className="text-sm text-gray-400">No poll responses yet.</p>
  }

  const counts: Record<string, number> = {}
  for (const opt of options) counts[opt] = 0
  for (const a of answers) {
    if (a in counts) counts[a]++
  }
  const maxCount = Math.max(...Object.values(counts), 1)

  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const count = counts[opt] ?? 0
        const pct = answers.length > 0 ? Math.round((count / answers.length) * 100) : 0
        const barPct = Math.round((count / maxCount) * 100)
        return (
          <div key={opt}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-700 font-medium">{opt}</span>
              <span className="text-gray-400 tabular-nums">{count} ({pct}%)</span>
            </div>
            <div className="h-4 bg-gray-100 rounded overflow-hidden">
              <div
                className="h-full bg-accent rounded transition-all"
                style={{ width: `${barPct}%` }}
              />
            </div>
          </div>
        )
      })}
      <p className="text-xs text-gray-400 pt-1">
        {answers.length} response{answers.length !== 1 ? 's' : ''}
      </p>
    </div>
  )
}

function OpenTextResults({ answers }: { answers: string[] }) {
  if (answers.length === 0) {
    return <p className="text-sm text-gray-400">No poll responses yet.</p>
  }

  return (
    <div className="space-y-2">
      {answers.map((answer, i) => (
        <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          <p className="text-sm text-gray-700">{answer}</p>
        </div>
      ))}
      <p className="text-xs text-gray-400">
        {answers.length} response{answers.length !== 1 ? 's' : ''}
      </p>
    </div>
  )
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default async function ResponsesTab() {
  const cookieStore = cookies()
  if (!cookieStore.get('admin_session')?.value) {
    redirect('/')
  }

  const supabase = createAdminClient()

  const [profileResult, responsesResult] = await Promise.all([
    supabase.from('profiles').select('poll_type, poll_question, poll_options').single(),
    supabase
      .from('responses')
      .select('*')
      .order('submitted_at', { ascending: false }),
  ])

  if (responsesResult.error) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <p className="text-sm text-gray-400">Failed to load data. Please refresh the page.</p>
      </div>
    )
  }

  const profile = profileResult.data as Pick<
    Profile,
    'poll_type' | 'poll_question' | 'poll_options'
  > | null

  const responses = (responsesResult.data ?? []) as ScanResponse[]

  const pollAnswers = responses
    .map((r) => r.poll_answer)
    .filter((a): a is string => a !== null && a !== '')

  const comments = responses.filter(
    (r) => r.comment !== null && r.comment !== ''
  )

  return (
    <div className="space-y-8">
      {/* Poll results */}
      {profile?.poll_question && (
        <section>
          <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">
            Poll results
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <p className="text-sm font-semibold text-gray-800">{profile.poll_question}</p>
            {profile.poll_type === 'slider' && (
              <SliderResults answers={pollAnswers} />
            )}
            {profile.poll_type === 'multiple_choice' && (
              <MultipleChoiceResults
                answers={pollAnswers}
                options={profile.poll_options ?? []}
              />
            )}
            {profile.poll_type === 'open_text' && (
              <OpenTextResults answers={pollAnswers} />
            )}
          </div>
        </section>
      )}

      {/* Comments feed — client component handles delete */}
      <section>
        <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">
          Comments — {comments.length} total
        </h2>
        <ResponsesClient initialComments={comments} />
      </section>
    </div>
  )
}
