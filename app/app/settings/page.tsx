import Link from 'next/link'
import { ArrowLeft, DownloadSimple } from '@phosphor-icons/react/dist/ssr'
import { deleteAccount } from '@/app/app/actions'
import { PageIntro } from '@/components/workspace/PageIntro'
import { SignOutButton } from '@/components/workspace/SignOutButton'
import { signInMethods } from '@/lib/auth-server'
import { requireOwner } from '@/lib/owner'
import { ownerSummary } from '@/lib/product'

const ERRORS: Record<string, string> = {
  confirm: 'To delete your account, type DELETE in the box.',
  reauth: 'For your safety, sign out and sign in again, then delete your account within a day.',
}

/**
 * Account settings, kept off the main Profile page so downloading data or deleting the account is
 * never one stray tap away. Deleting still needs the word DELETE and a recent sign-in.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams
  const session = await requireOwner()
  const summary = await ownerSummary(session.user.id)
  const methods = signInMethods()
  const section = 'soft-card grid gap-3 p-5 sm:p-7'

  return (
    <div className="grid gap-6">
      <Link href="/app/profile" className="action-quiet w-fit !px-0"><ArrowLeft size={18} />Profile</Link>
      <PageIntro eyebrow="Account" title="Settings" body="Sharing, sign-in, your data and your account." />
      {query.error && <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_32%,var(--line))] p-3 text-sm text-[var(--danger)]">{ERRORS[query.error] ?? 'Something went wrong. Please try again.'}</p>}

      <section className={section}>
        <h2 className="text-lg font-extrabold">Sharing</h2>
        <p className="text-sm text-[var(--muted)]">Your personal QR is <strong className="text-[var(--ink)]">{summary.code?.isLive ? 'on' : 'paused'}</strong>. Turn it on or off from Home; switch what visitors see in Modes.</p>
        <div className="flex flex-wrap gap-2"><Link href="/app" className="action-secondary">Go to Home</Link><Link href="/app/modes" className="action-quiet">Modes</Link></div>
      </section>

      <section className={section}>
        <h2 className="text-lg font-extrabold">Signing in</h2>
        <p className="text-sm text-[var(--muted)]">Signed in as <strong className="break-all text-[var(--ink)]">{session.user.email}</strong>.</p>
        <ul className="grid gap-1 text-sm">
          <li>Email and password: <strong>on</strong></li>
          <li>Email sign-in code: <strong>{methods.emailCode ? 'on' : 'not available yet'}</strong></li>
          <li>Google: <strong>{methods.google ? 'on' : 'not available yet'}</strong></li>
        </ul>
        <div><SignOutButton /></div>
      </section>

      <section className={section}>
        <h2 className="text-lg font-extrabold">Your data</h2>
        <p className="text-sm text-[var(--muted)]">A file with your profile, Modes, responses and events. Nothing is deleted when you download it.</p>
        <a href="/app/export" className="action-secondary w-fit"><DownloadSimple size={17} />Download my data</a>
      </section>

      <section className={`${section} border-[color-mix(in_srgb,var(--danger)_35%,var(--line))]`}>
        <h2 className="text-lg font-extrabold text-[var(--danger)]">Delete my account</h2>
        <details className="text-sm">
          <summary className="cursor-pointer font-bold">Show how to delete my account</summary>
          <form action={deleteAccount} className="mt-3 grid gap-3">
            <p className="leading-6 text-[var(--muted)]">This permanently deletes your account, your code, Modes, responses, and every event you organise with its attendees. It cannot be undone. Download your data first if you want a copy.</p>
            <label className="field-label">Type DELETE to confirm<input className="field-input" name="confirm" required autoComplete="off" /></label>
            <button className="action-danger w-fit">Delete my account for good</button>
          </form>
        </details>
      </section>
    </div>
  )
}
