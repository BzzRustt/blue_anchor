import Link from 'next/link'
import { createEvent } from '@/app/app/events/actions'
import { PageIntro } from '@/components/workspace/PageIntro'
import { TimezoneField } from '@/components/workspace/TimezoneField'
import { DEFAULT_QUESTIONS, DEFAULT_ROLES } from '@/lib/events'

const errors: Record<string, string> = {
  invalid: 'Something in the form was missing or too long. Check it and try again.',
  dates: 'The event must end after it starts.',
  pro_roles: 'Role letters on badges are a Pro feature. Clear the roles box to use plain numbers.',
  event_limit: 'You have used this year’s events on your plan.',
}

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ error?: string; detail?: string }> }) {
  const query = await searchParams
  const message = query.error === 'roles' ? query.detail : query.error ? errors[query.error] : undefined
  const defaultRoles = DEFAULT_ROLES.map((role) => `${role.letter}=${role.label}`).join(', ')

  return (
    <div className="grid gap-7">
      <PageIntro eyebrow="Run a room" title="New event" body="Set the basics and the four questions every attendee answers. You add people and print badges next." />
      <form action={createEvent} className="soft-card grid gap-5 p-5 sm:grid-cols-2 sm:p-7">
        <TimezoneField />
        {message && <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] p-3 text-sm text-[var(--danger)] sm:col-span-2">{message} {(query.error === 'pro_roles' || query.error === 'event_limit') && <Link className="font-bold underline" href="/plans">See plans</Link>}</p>}
        <label className="field-label sm:col-span-2">Event name<input className="field-input" name="name" required minLength={2} maxLength={80} placeholder="Wray Forward Pitch Night" /></label>
        <label className="field-label sm:col-span-2">Venue <span className="font-normal text-[var(--faint)]">(optional)</span><input className="field-input" name="venue" maxLength={120} placeholder="The venue and city" /></label>
        <label className="field-label">Starts<input className="field-input" type="datetime-local" name="startsAt" required /></label>
        <label className="field-label">Ends<input className="field-input" type="datetime-local" name="endsAt" required /></label>
        <label className="field-label sm:col-span-2">Roles on badges <span className="font-normal text-[var(--faint)]">(Pro — leave empty for plain numbers)</span><input className="field-input" name="roles" maxLength={400} defaultValue={defaultRoles} /><span className="mt-1 block text-xs font-normal leading-5 text-[var(--muted)]">A letter makes someone&apos;s role readable across the room, before any lookup. Format: F=Founder, I=Investor.</span></label>
        <fieldset className="grid gap-4 sm:col-span-2"><legend className="mb-1 text-sm font-extrabold">What every attendee answers</legend>{DEFAULT_QUESTIONS.map((question, index) => <label key={index} className="field-label">Question {index + 1}{index < 2 && <span className="font-normal text-[var(--faint)]"> · required</span>}<input className="field-input" name={`q${index}`} required minLength={3} maxLength={120} defaultValue={question.prompt} /></label>)}<p className="text-xs leading-5 text-[var(--muted)]">Questions 2 and 3 are the matching pair: what people want, and what they can offer.</p></fieldset>
        <button className="action-primary sm:col-span-2">Create event</button>
      </form>
    </div>
  )
}
