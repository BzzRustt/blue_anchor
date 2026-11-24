'use client'

import { useState } from 'react'
import { QUESTION_TYPES, type QuestionType } from '@/lib/modes'

/**
 * "What to ask": only the inputs that apply to the chosen question type are shown (a rating scale
 * for Rating, choices for Single choice, nothing extra for Yes / No or Short text). The hidden
 * ones still submit their old values, and the server ignores what doesn't apply.
 */
export function QuestionFields({ on, type, prompt, max, options }: { on: boolean; type: QuestionType; prompt: string; max: 5 | 10; options: string[] }) {
  const [current, setCurrent] = useState<QuestionType>(type)
  const [enabled, setEnabled] = useState(on)
  return (
    <>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] p-3"><input type="checkbox" name="question_on" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--accent)]" /><span className="block text-sm font-bold">Show a question</span></label>
      <div className={`grid gap-4 ${enabled ? '' : 'opacity-50'}`}>
        <label className="field-label">Question type<select className="field-select" name="question_type" value={current} onChange={(e) => setCurrent(e.target.value as QuestionType)}>{QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
        <label className="field-label">Question<input className="field-input" name="question_prompt" defaultValue={prompt} maxLength={120} placeholder={current === 'scale' ? 'Rate my set from 1 to 5' : current === 'yes_no' ? 'Would you come to my next gig?' : current === 'choice' ? 'Which song should I play next?' : 'What’s on your mind today?'} /></label>
        {/* Not rendered (rather than CSS-hidden): .field-label sets display and beat the "hidden" class. */}
        {current === 'scale' && <label className="field-label">Rating scale<select className="field-select" name="question_max" defaultValue={String(max)}><option value="5">1 to 5</option><option value="10">1 to 10</option></select></label>}
        {current === 'choice' && <label className="field-label">Choices (one per line, at least two)<textarea className="field-textarea" name="question_options" defaultValue={options.join('\n')} maxLength={300} /></label>}
        {current === 'yes_no' && <p className="text-xs text-[var(--muted)]">Visitors answer Yes or No.</p>}
        {current === 'open_text' && <p className="text-xs text-[var(--muted)]">Visitors write a short answer.</p>}
      </div>
    </>
  )
}
