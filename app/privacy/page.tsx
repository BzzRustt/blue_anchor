import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalDoc } from '@/components/LegalDoc'
import { LEGAL } from '@/lib/legal'

export const metadata: Metadata = { title: 'Privacy notice' }

export default function PrivacyPage() {
  const mail = <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
  return (
    <LegalDoc title="Privacy notice" intro="This explains what personal information ScanMe collects, why, who sees it, how long we keep it, and your rights under UK data protection law (the UK GDPR and the Data Protection Act 2018, as amended by the Data (Use and Access) Act 2025).">
      <section className="grid gap-3">
        <h2>Who we are</h2>
        <p>{LEGAL.operator ? <>ScanMe is run by <strong>{LEGAL.operator}</strong>.</> : 'ScanMe is run from the United Kingdom.'} We are the &ldquo;controller&rdquo; of account holders&apos; and visitors&apos; information, except where we act for an event organiser (see &ldquo;Event attendees&rdquo;).{LEGAL.icoNumber ? <> ICO registration number: {LEGAL.icoNumber}.</> : null} Contact us at {mail}.</p>
      </section>

      <section className="grid gap-3">
        <h2>What we collect, and why</h2>
        <ul className="grid gap-2">
          <li><strong>Account holders:</strong> name, email, a password stored only as a hash (or your Google sign-in identifier if you choose Google), sign-in records, and the profile details you choose to add (role, links, bio, photo link). Why: to run your account and show your chosen details on the Mode you pick. Basis: contract.</li>
          <li><strong>Visitors who scan a code:</strong> the answers and messages you choose to send, any contact details you choose to give, simple visit and link-click counts, and a one-way hashed device identifier made from your IP address (we do not store the raw IP address). Why: to deliver your message to the person you scanned, show them basic statistics and limit spam. Basis: legitimate interests (you choose to send; we keep it minimal).</li>
          <li><strong>Event attendees:</strong> name, optional email, event card answers, tag number, check-in time, messages and saved people within the event, and a log of badge look-ups. Why: to run the event and its networking, and stop badge numbers being harvested. Basis: see below.</li>
          <li><strong>Payments:</strong> amount, package, status and Stripe reference. Your card details go to Stripe and never reach us. Why: take payment and keep accounts. Basis: contract and legal obligation.</li>
          <li><strong>Safety reports</strong> you send about another person, and the content reported. Why: safety and legal duties. Basis: legitimate interests and legal obligation.</li>
          <li><strong>Technical data:</strong> a sign-in cookie and a few security records needed to keep the service secure and working. Basis: legitimate interests.</li>
        </ul>
      </section>

      <section className="grid gap-3">
        <h2>Event attendees: who is responsible</h2>
        <p>The <strong>event organiser</strong> decides who is invited and what is asked, so for the attendee list and card answers the organiser is the controller and we are their processor, acting only on their instructions. Organisers must have a lawful reason to give us attendee details and must tell attendees they are using ScanMe. Organisers cannot read attendee messages, saved lists or reports. For networking features you choose to use as an attendee (messages, saved people), we handle your information to provide the service you asked for. You choose whether your card is shown in full, by name only, or hidden.</p>
      </section>

      <section className="grid gap-3">
        <h2>Who we share it with</h2>
        <p>We do not sell personal information and we show no advertising. We use these service providers (processors) to run ScanMe: Neon (database), Netlify (hosting), Resend (email), Stripe (payments), and Google (only if you choose Google sign-in). They may only use your information to provide their service to us. Some are based outside the UK; where information leaves the UK we rely on approved safeguards such as the UK&ndash;US data bridge or standard contractual clauses. We may disclose information when the law requires it or to protect people from harm.</p>
      </section>

      <section className="grid gap-3">
        <h2>How long we keep it</h2>
        <ul className="grid gap-2">
          <li>Accounts and profiles: until you delete your account (Settings, then delete account).</li>
          <li>Personal responses: Free accounts see the last 30 days in the app; responses are deleted when you delete your account.</li>
          <li>Event data: attendee access closes 48 hours after the event ends. Event data is then deleted when the organiser deletes the event or the account is deleted. If you link your event card to your own ScanMe account, you keep a read-only copy of your own conversations until you delete your account.</li>
          <li>Payment records: kept for 6 years for tax and accounting.</li>
          <li>Safety reports: kept for as long as needed to deal with them and any follow-up.</li>
        </ul>
      </section>

      <section className="grid gap-3">
        <h2>Cookies and similar technologies</h2>
        <p>We use only what is strictly necessary: a sign-in cookie (up to 14 days), a signed attendee cookie while an event is open to you, and a theme (light or dark) setting stored in your browser. We use no advertising or tracking cookies, so there is no cookie banner. Stripe may set its own cookies on its payment pages.</p>
      </section>

      <section className="grid gap-3">
        <h2>Your rights</h2>
        <p>You can ask to see, correct, delete or move your information, and to object to or restrict how we use it. Account holders can download their data and delete their account from <Link href="/app/settings">Settings</Link>. Attendees can remove their card from the event page. To use any right, or to ask a question or make a complaint, email {mail}; we will acknowledge a complaint within 30 days and reply without undue delay. You can also complain to the Information Commissioner&apos;s Office at <a href="https://ico.org.uk/make-a-complaint/" rel="noreferrer">ico.org.uk</a> (0303 123 1113).</p>
      </section>

      <section className="grid gap-3">
        <h2>Children</h2>
        <p>ScanMe is for people aged {LEGAL.minimumAge} and over. We do not knowingly collect information from younger children; if you think we have, tell us and we will delete it.</p>
      </section>

      <section className="grid gap-3">
        <h2>Security and changes</h2>
        <p>Data is protected by access controls in the database, encrypted connections, hashed passwords and tokens, and rate limits. No system is perfectly secure; if a breach puts people at risk we will tell the people affected and the ICO as the law requires. We will update this notice when our practices change and show the date at the top. See also our <Link href="/terms">Terms of use</Link>.</p>
      </section>
    </LegalDoc>
  )
}
