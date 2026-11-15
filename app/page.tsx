import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  CalendarCheck,
  ChatCircleDots,
  DownloadSimple,
  Hash,
  IdentificationCard,
  QrCode,
  Storefront,
  UsersThree,
} from '@phosphor-icons/react/dist/ssr'
import { MarketingFooter } from '@/components/MarketingFooter'
import { MarketingHeader } from '@/components/MarketingHeader'
import { PLAN_LIMITS } from '@/lib/plans'
import heroImage from '@/prototype-assets/scanme-hero-clear-v3.png'
import socialiseImage from '@/prototype-assets/scanme-step-socialise-v2.png'

/*
 * Events lead, the personal code follows. Everything below describes what exists today:
 * tags, printable badges, spare tags and cards guests fill in. The directory, search and
 * connect features are not built, so this page must not promise them.
 */

const steps = [
  { icon: CalendarCheck, title: 'Create the event', body: 'Name it, set the times and choose the four questions every guest answers. You get a permanent link and a short access code.' },
  { icon: Hash, title: 'Print the badges', body: 'Add your guest list and every person gets a numbered tag with a QR on it. Download the CSV for your printer, or print the sheet.' },
  { icon: IdentificationCard, title: 'Guests add their card', body: 'They scan their badge or open your link, then say what they do and what they are looking for. No account needed.' },
] as const

const organiser = [
  { title: 'Tags you can read across a room', body: 'Plain numbers like 042, or role letters like F-042 on Pro, so you can tell a founder from an investor before you say hello.' },
  { title: 'Spare tags for walk-ups', body: 'Print extras for people who register on arrival. They scan, answer, and join in a minute.' },
  { title: 'Cards guests fill in themselves', body: 'A name, a role and your four questions. Guests can edit or withdraw their card whenever they like.' },
  { title: 'Private by design', body: 'Guest emails are never shown to other guests, and cards close 48 hours after your event ends.' },
] as const

const keepsake = [
  { icon: UsersThree, title: 'Network with intent', body: 'Show your role, goals and socials before the first hello.' },
  { icon: ChatCircleDots, title: 'Collect honest answers', body: 'Ask for a rating or a private note without asking anyone to sign up.' },
  { icon: Storefront, title: 'Move interest forward', body: 'Send scanners to your portfolio, booking page or the link that matters today.' },
] as const

export default function HomePage() {
  const free = PLAN_LIMITS.free

  return (
    <>
      <MarketingHeader />
      <main>
        <section className="site-shell pt-5 sm:pt-6">
          <div className="grid overflow-hidden rounded-[22px] bg-[var(--deep)] text-white sm:rounded-[30px] lg:min-h-[520px] lg:grid-cols-[1.02fr_1fr]">
            <div className="flex flex-col items-start justify-center p-6 sm:p-12 lg:p-16">
              <p className="text-xs font-bold uppercase tracking-[.12em] text-[var(--lime)]">Event networking · Personal QR</p>
              <h1 className="my-5 text-[clamp(2.9rem,6.2vw,5.9rem)] font-extrabold leading-[.92] tracking-[-.075em]">A tag for every guest.<br /><span className="text-[var(--lime)]">A reason to connect.</span></h1>
              <p className="max-w-[430px] text-[clamp(1rem,1.4vw,1.15rem)] leading-7 text-[#d6e3d9]">Give each attendee a numbered tag and a short card about what they do and what they are looking for. Anyone can then get their own ScanMe code to keep.</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link className="action-primary" href="/signup">Run an event <ArrowRight size={18} weight="bold" /></Link>
                <Link className="action-secondary !border-[#557264] !bg-transparent !text-white hover:!bg-[#214436]" href="/how-it-works">See how it works</Link>
              </div>
              <p className="mt-5 text-sm text-[#bdd2c6]">Just want your own code? <Link className="font-bold text-[var(--lime)] underline underline-offset-4" href="/signup">Create yours</Link></p>
            </div>

            <div className="relative min-h-[320px] sm:min-h-[420px]">
              <Image
                src={heroImage}
                alt="A woman scanning a QR code worn by a man at a gallery event"
                fill
                priority
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover object-[48%_center]"
              />
              <div className="absolute bottom-4 right-4 flex items-center gap-3 rounded-[13px] bg-[#f9faf2] p-3 pr-4 text-[#18211c] shadow-[0_8px_30px_rgba(16,29,18,.3)]">
                <span className="grid h-11 w-11 place-items-center rounded-[9px] border border-[#dce1d5] bg-white"><QrCode size={30} weight="bold" /></span>
                <div className="leading-tight"><strong className="block font-mono text-xl tracking-wide">F-042</strong><span className="text-xs text-[#536057]">Founder · scan to add your card</span></div>
              </div>
            </div>
          </div>
        </section>

        <section id="events" className="site-shell scroll-mt-24 py-16 md:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[.12em] text-[var(--accent-strong)]">For events</p>
            <h2 className="mt-3 text-4xl font-extrabold leading-none tracking-[-.06em] md:text-6xl">Make the room easier to read.</h2>
            <p className="mt-5 max-w-xl text-lg leading-7 text-[var(--muted)]">Fifty strangers, one evening, and no way to tell who to talk to. Give everyone a tag and a card, and the room starts to make sense.</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <article key={step.title} className="soft-card p-6">
                <span className="grid h-12 w-12 place-items-center rounded-[13px] bg-[var(--accent-soft)] text-[var(--accent-strong)]"><step.icon size={25} weight="bold" /></span>
                <p className="mt-5 text-xs font-bold uppercase tracking-[.12em] text-[var(--faint)]">Step {index + 1}</p>
                <h3 className="mt-1 text-xl font-extrabold tracking-[-.035em]">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{step.body}</p>
              </article>
            ))}
          </div>

          <div className="mt-4 grid overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface-strong)] md:grid-cols-2">
            {organiser.map((item, index) => (
              <article key={item.title} className={`p-7 md:p-9 ${index < 2 ? 'border-b border-[var(--line)]' : ''} ${index % 2 === 0 ? 'md:border-r md:border-[var(--line)]' : ''}`}>
                <h3 className="text-xl font-extrabold tracking-[-.035em]">{item.title}</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">{item.body}</p>
              </article>
            ))}
          </div>

          <div className="mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm text-[var(--muted)]"><DownloadSimple size={18} weight="bold" className="shrink-0 text-[var(--accent)]" />Free to start: {free.eventsPerYear} events a year, up to {free.attendeesPerEvent} guests each.</p>
            <Link className="action-primary" href="/signup">Create your first event <ArrowRight size={18} weight="bold" /></Link>
          </div>
        </section>

        <section id="keepsake" className="site-shell scroll-mt-24 pb-16 md:pb-24">
          <div className="grid items-center gap-8 overflow-hidden rounded-[22px] bg-[var(--accent-soft)] lg:grid-cols-[.95fr_1.05fr]">
            <div className="relative min-h-[300px] self-stretch lg:min-h-[460px]"><Image src={socialiseImage} alt="A man scans the QR patch on another guest's jacket at a gallery event" fill sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" /></div>
            <div className="p-7 md:p-12">
              <p className="text-xs font-bold uppercase tracking-[.12em] text-[var(--accent-strong)]">For you</p>
              <h2 className="mt-3 text-4xl font-extrabold leading-none tracking-[-.06em] md:text-5xl">Then it is yours to keep.</h2>
              <p className="mt-4 max-w-md text-[var(--muted)]">Your own permanent code opens whatever you choose today: a profile, a question, your portfolio. Print it once and change what sits behind it whenever your plans change.</p>
              <div className="mt-6 grid gap-4">
                {keepsake.map((item) => (
                  <div key={item.title} className="flex gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-[var(--accent)] text-[var(--on-accent)]"><item.icon size={22} weight="bold" /></span><div><h3 className="font-extrabold tracking-[-.02em]">{item.title}</h3><p className="mt-0.5 text-sm leading-6 text-[var(--muted)]">{item.body}</p></div></div>
                ))}
              </div>
              <Link className="action-primary mt-8" href="/signup">Create your code <ArrowRight size={18} weight="bold" /></Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  )
}
