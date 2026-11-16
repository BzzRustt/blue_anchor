/**
 * Email transport.
 *
 * Resend's REST API over plain fetch — no SDK. Sending an email is one POST, and an SDK
 * here would be a dependency to audit and upgrade forever in exchange for nothing.
 *
 * Every outbound email in the product routes through `sendEmail`, which is why the
 * per-recipient throttle lives here rather than at each call site. Better Auth already
 * rate-limits `/request-password-reset` per IP; that protects the service but not a single
 * person's inbox, since a distributed flood uses a fresh IP each time. One guard at the
 * only exit point covers password resets today and claim links, connect notifications and
 * import invitations later, without anyone having to remember it.
 */
// Relative with an explicit extension so `node --test` can resolve it without the
// tsconfig path alias, which bare Node does not read.
import { RateLimiter } from './rate-limiter.ts'

const ENDPOINT = 'https://api.resend.com/emails'

/**
 * ponytail: in-memory, so on serverless each instance keeps its own count and the real
 * ceiling is 3 x instances per hour. Same trade-off as lib/rate-limiter.ts. Move both to
 * a shared store when abuse is measured, not before.
 */
const recipientLimiter = new RateLimiter(3, 3_600_000)

export type SendResult = 'sent' | 'rate_limited' | 'not_configured'

export interface Email {
  to: string
  subject: string
  text: string
  html: string
}

/** Lets callers skip work that only makes sense if an email can actually leave. */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

export async function sendEmail(email: Email): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM

  if (!apiKey || !from) {
    // Loud, because the alternative is a silent dead flow in production.
    console.error('[email] RESEND_API_KEY or EMAIL_FROM is missing; not sending:', email.subject)
    return 'not_configured'
  }

  const key = email.to.trim().toLowerCase()
  if (recipientLimiter.isLimited(key)) return 'rate_limited'
  recipientLimiter.increment(key)

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Resend rejected the email (${response.status}): ${detail.slice(0, 300)}`)
  }

  return 'sent'
}

/* ── Templates ────────────────────────────────────────────────────────────────
 * Kept as pure functions returning subject/text/html so they are testable without a
 * network, and so the plain-text part is never an afterthought.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function layout(heading: string, body: string, action?: { label: string; url: string }): string {
  const button = action
    ? `<p style="margin:28px 0"><a href="${escapeHtml(action.url)}" style="background:#111;color:#fff;border-radius:12px;padding:13px 22px;font-weight:700;text-decoration:none;display:inline-block">${escapeHtml(action.label)}</a></p>`
    : ''
  return `<!doctype html><html><body style="margin:0;background:#f6f6f4;padding:28px;font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:18px;padding:32px">
<tr><td>
<p style="margin:0 0 20px;font-weight:800;letter-spacing:-.03em;font-size:19px">ScanMe</p>
<h1 style="margin:0 0 14px;font-size:25px;letter-spacing:-.04em">${escapeHtml(heading)}</h1>
${body}
${button}
</td></tr></table>
</td></tr></table>
</body></html>`
}

export function resetPasswordEmail(name: string | null | undefined, url: string): Omit<Email, 'to'> {
  const greeting = name?.trim() ? `Hi ${name.trim()},` : 'Hi,'
  return {
    subject: 'Reset your ScanMe password',
    text: `${greeting}

Use this link to choose a new password:

${url}

The link works once and expires in an hour. If you did not ask for it, ignore this email — your password stays as it is.

— ScanMe`,
    html: layout(
      'Reset your password',
      `<p style="margin:0 0 14px">${escapeHtml(greeting)}</p>
<p style="margin:0">Choose a new password with the button below. The link works once and expires in an hour.</p>
<p style="margin:16px 0 0;color:#666;font-size:14px">If you did not ask for this, ignore this email — your password stays as it is.</p>`,
      { label: 'Choose a new password', url }
    ),
  }
}

/** One email per address. A group booking shares an address, so it lists each person's own link. */
export function attendeeAccessEmail(eventName: string, links: Array<{ name: string; url: string }>): Omit<Email, 'to'> {
  const several = links.length > 1
  return {
    subject: `Your link for ${eventName}`,
    text: `Hi,

${several ? 'Here are the personal links for the people registered with this email' : 'Here is your personal link'} for ${eventName}:

${links.map((l) => `${l.name}: ${l.url}`).join('\n')}

Each link opens one person's event card on the device you use it on. Do not forward it: anyone with the link can edit that card until the event closes. If you did not ask for this, ignore this email.

— ScanMe`,
    html: layout(
      `Your link for ${eventName}`,
      `<p style="margin:0 0 14px">${several ? 'Here are the personal links for the people registered with this email.' : 'Use the button below to open your event card on this device.'}</p>
${several ? `<ul style="margin:0 0 14px;padding-left:20px">${links.map((l) => `<li><a href="${escapeHtml(l.url)}">${escapeHtml(l.name)}</a></li>`).join('')}</ul>` : ''}
<p style="margin:16px 0 0;color:#666;font-size:14px">Do not forward this email: anyone with the link can edit the card until the event closes. If you did not ask for it, ignore it.</p>`,
      several ? undefined : { label: 'Open my event card', url: links[0].url }
    ),
  }
}

/** A new message request. Never includes the message or who sent it: only that one is waiting. */
export function messageRequestEmail(eventName: string, url: string): Omit<Email, 'to'> {
  return {
    subject: `New message request at ${eventName}`,
    text: `Hi,\n\nSomeone at ${eventName} sent you a message request on ScanMe. Open your event messages to read it and choose whether to reply:\n\n${url}\n\nYou can turn these emails off in your event preferences.\n\n— ScanMe`,
    html: layout(
      `New message request at ${eventName}`,
      `<p style="margin:0 0 14px">Someone at ${escapeHtml(eventName)} sent you a message request. Open your event messages to read it and choose whether to reply.</p>
<p style="margin:16px 0 0;color:#666;font-size:14px">You can turn these emails off in your event preferences.</p>`,
      { label: 'Open my messages', url }
    ),
  }
}

/** A six-digit sign-in code. Valid for 10 minutes, five tries. */
export function signInCodeEmail(code: string): Omit<Email, 'to'> {
  return {
    subject: `Your ScanMe sign-in code: ${code}`,
    text: `Your ScanMe sign-in code is ${code}\n\nIt works for 10 minutes. If you did not ask for it, ignore this email; nobody can sign in without the code.\n\n— ScanMe`,
    html: layout(
      'Your sign-in code',
      `<p style="margin:0 0 14px">Enter this code to sign in to ScanMe:</p>
<p style="margin:0 0 14px;font-size:32px;font-weight:800;letter-spacing:.2em">${escapeHtml(code)}</p>
<p style="margin:16px 0 0;color:#666;font-size:14px">It works for 10 minutes. If you did not ask for it, ignore this email.</p>`
    ),
  }
}
