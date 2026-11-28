import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalDoc } from '@/components/LegalDoc'
import { LEGAL } from '@/lib/legal'

export const metadata: Metadata = { title: 'Terms of use' }

export default function TermsPage() {
  const mail = <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
  return (
    <LegalDoc title="Terms of use" intro="These terms apply when you use ScanMe as an account holder, event organiser, event attendee or visitor. By creating an account, registering for an event or paying, you agree to them. If you do not agree, please do not use ScanMe.">
      <section className="grid gap-3">
        <h2>1. Who we are and who can use ScanMe</h2>
        <p>{LEGAL.operator ? <>ScanMe is run by <strong>{LEGAL.operator}</strong>.</> : 'ScanMe is run from the United Kingdom.'} You must be {LEGAL.minimumAge} or over. If you use ScanMe for an organisation, you confirm you can bind it. Contact: {mail}.</p>
      </section>

      <section className="grid gap-3">
        <h2>2. Your account</h2>
        <p>Give accurate details, keep your password safe, and tell us if you think your account has been misused. You are responsible for what happens under your account. You can delete your account at any time in <Link href="/app/settings">Settings</Link>.</p>
      </section>

      <section className="grid gap-3">
        <h2>3. Plans and payments</h2>
        <ul className="grid gap-2">
          <li><strong>Free:</strong> the features listed on the <Link href="/plans">Plans</Link> page.</li>
          <li><strong>Pro</strong> (when available): a monthly subscription that renews automatically until you cancel. Cancel any time using &ldquo;Manage or cancel Pro&rdquo; in your Profile; you keep Pro until the end of the period you have paid for.</li>
          <li><strong>Event packages:</strong> a one-off payment per event that publishes the event and sets the number of attendees allowed. Creating and previewing an event is free.</li>
          <li>Prices are in pounds sterling and are shown before you pay. If VAT applies to a charge, it will be shown before you pay. Payments are handled by Stripe; we never see your card number.</li>
          <li>We may change prices for future purchases. We will give existing Pro subscribers at least 30 days&apos; notice, and you can cancel before the change applies.</li>
        </ul>
      </section>

      <section className="grid gap-3">
        <h2 id="refunds">4. Cancelling and refunds</h2>
        <p><strong>If you are a consumer</strong> (buying for purposes outside your trade or business) you have a legal right to cancel a digital service within 14 days of buying it. When you buy, you ask us to start the service straight away; if you then cancel within the 14 days you must pay for what you have already used, and we will refund the rest. Pro subscriptions can be cancelled at any time for future periods. For an event package, ask us for a refund before the event starts by emailing {mail} with the event name; if we refund a package before an event starts, the event goes back to draft, attendees can no longer reach its page until it is published again, and registrations are kept. After an event has started we refund only where the service was faulty or the law requires it. These terms do not affect your statutory rights, including that digital services must be provided with reasonable care and skill.</p>
        <p><strong>If you are a business</strong>, the same refund process applies as a courtesy, but the statutory consumer cancellation right does not.</p>
      </section>

      <section className="grid gap-3">
        <h2>5. Event organisers</h2>
        <ul className="grid gap-2">
          <li>You must have a lawful reason to give us attendee names or emails and must tell attendees you use ScanMe. You are the controller of that information and we are your processor, as set out in our <Link href="/privacy">Privacy notice</Link>; that notice and these terms are our data processing terms with you. If you need a separate signed agreement, email us.</li>
          <li>You are responsible for your event, including accuracy of dates and venue, safety, and anything you print on badges. ScanMe is a tool, not a party to your event.</li>
          <li>You may not use attendee information for anything unrelated to the event.</li>
        </ul>
      </section>

      <section className="grid gap-3">
        <h2>6. Acceptable use and safety</h2>
        <p>Do not harass, threaten, impersonate or spam anyone; share illegal or sexual content or content that exploits or endangers children; try to collect people&apos;s information for other purposes (including scraping badge numbers); use messaging to sell; attack or probe the service; or break the law. Messaging is for people at the same event.</p>
        <p>ScanMe lets people send each other messages, which the Online Safety Act 2023 treats as user-to-user content. Use the report option in the app, or email {mail}, to tell us about illegal or harmful content. We review reports, remove content that breaks these terms or the law, and may suspend or close accounts. If we close your account you can complain to us at the same address and we will review it.</p>
      </section>

      <section className="grid gap-3">
        <h2>7. Your content</h2>
        <p>You keep ownership of what you add. You give us permission to store, display and deliver it as needed to run ScanMe and the Modes and events you set up. You confirm you have the right to share it, including any photo you upload or link.</p>
      </section>

      <section className="grid gap-3">
        <h2>8. Availability and changes</h2>
        <p>We work to keep ScanMe running but cannot promise it will always be available or error-free; we may update, change or remove features. Photo QR codes are decorative: always check that a code scans before printing or relying on it. We will tell you about material changes to these terms and the date above will change; continuing to use ScanMe after that means you accept them.</p>
      </section>

      <section className="grid gap-3">
        <h2>9. Our responsibility</h2>
        <p>Nothing in these terms limits liability that cannot be limited by law, including for death or personal injury caused by negligence, fraud, or your statutory consumer rights. Subject to that, we are not liable for losses that were not a foreseeable result of our breach, for loss of profit or business to the extent you use ScanMe for business, or for what other users do or say. For business customers, our total liability in any 12 months is limited to the amount you paid us in that period.</p>
      </section>

      <section className="grid gap-3">
        <h2>10. Ending, law and complaints</h2>
        <p>You may stop using ScanMe at any time. We may suspend or end your access if you seriously or repeatedly break these terms, with notice where we reasonably can. These terms are governed by the law of England and Wales (if you live in Scotland or Northern Ireland you may also use your local courts), and the courts of England and Wales have jurisdiction, but consumers keep any rights to use their local courts. If you have a complaint, email {mail} and we will reply within 14 days.</p>
      </section>
    </LegalDoc>
  )
}
