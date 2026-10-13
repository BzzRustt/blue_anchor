import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  Briefcase,
  ChatCircleDots,
  IdentificationCard,
  QrCode,
  SlidersHorizontal,
  Storefront,
  UsersThree,
} from '@phosphor-icons/react/dist/ssr'
import { MarketingFooter } from '@/components/MarketingFooter'
import { MarketingHeader } from '@/components/MarketingHeader'
import heroImage from '@/prototype-assets/scanme-hero-clear-v3.png'
import discoverImage from '@/prototype-assets/scanme-step-discover-man-v3.png'
import customiseImage from '@/prototype-assets/scanme-step-customise-man-v3.png'
import socialiseImage from '@/prototype-assets/scanme-step-socialise-v2.png'

const uses = [
  {
    icon: UsersThree,
    title: 'Network with intent',
    body: 'Show your role, goals, and socials before the first hello, so the right people know why to connect.',
  },
  {
    icon: ChatCircleDots,
    title: 'Collect honest answers',
    body: 'Ask for a rating, a private note, or a quick opinion without asking visitors to create an account.',
  },
  {
    icon: Storefront,
    title: 'Move interest forward',
    body: 'Send scanners to your portfolio, latest release, booking page, shop, or the link that matters today.',
  },
  {
    icon: Briefcase,
    title: 'Run an event or business',
    body: 'Use one permanent code for guest feedback, customer insight, public information, and changing campaigns.',
  },
]

export default function HomePage() {
  return (
    <>
      <MarketingHeader />
      <main>
        <section className="site-shell grid min-h-[calc(100dvh-72px)] items-center gap-9 py-8 lg:grid-cols-[.82fr_1.18fr] lg:py-10">
          <div className="max-w-[590px]">
            <p className="mb-4 text-sm font-bold uppercase tracking-[.14em] text-[var(--accent-strong)]">A better first scan</p>
            <h1 className="max-w-[10ch] text-[clamp(3.25rem,6vw,5.6rem)] font-extrabold leading-[.94] tracking-[-.075em]">
              Make networking easier. Make it count.
            </h1>
            <p className="mt-6 max-w-[530px] text-[clamp(1rem,1.3vw,1.2rem)] leading-7 text-[var(--muted)]">
              Scan a code, understand who someone is, and connect only when the conversation has somewhere to go.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="action-primary" href="/signup">Create your code <ArrowRight size={18} weight="bold" /></Link>
              <Link className="action-secondary" href="/how-it-works">See how it works</Link>
            </div>
          </div>

          <div className="relative min-h-[500px] overflow-hidden rounded-[20px] bg-[var(--surface-muted)] shadow-[var(--shadow)] sm:min-h-[590px] lg:h-[min(680px,calc(100dvh-118px))]">
            <Image
              src={heroImage}
              alt="A woman scanning a QR code worn by a man at a gallery event"
              fill
              priority
              sizes="(min-width: 1024px) 58vw, 100vw"
              className="object-cover object-center"
            />
            <div className="absolute bottom-4 right-4 top-4 w-[min(270px,42%)] min-w-[220px] overflow-hidden rounded-[36px] border-[7px] border-[#26312b] bg-[var(--surface-strong)] shadow-[0_26px_62px_rgba(11,28,19,.28)] sm:bottom-auto sm:top-1/2 sm:h-[510px] sm:-translate-y-1/2">
              <div className="absolute left-1/2 top-2 h-5 w-[76px] -translate-x-1/2 rounded-full bg-[#26312b]" />
              <div className="flex h-full flex-col overflow-hidden px-4 pb-4 pt-10">
                <div className="mb-4 h-1 overflow-hidden rounded-full bg-[var(--surface-muted)]"><div className="h-full w-3/4 bg-[var(--accent)]" /></div>
                <div className="text-center">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--accent-soft)] text-lg font-extrabold text-[var(--accent-strong)]">AK</div>
                  <h2 className="mt-2 text-xl font-extrabold tracking-[-.04em]">Allen K.</h2>
                  <p className="mt-1 text-[11px] leading-4 text-[var(--muted)]">Product designer building better ways for people to meet.</p>
                  <a className="mt-2 inline-flex text-[11px] font-bold text-[var(--accent-strong)]" href="#uses">@allen.builds</a>
                </div>
                <div className="mt-4 rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-3">
                  <p className="text-xs font-bold">Rate my drip from 1 to 10</p>
                  <div className="mt-2 flex items-center gap-2"><strong className="text-2xl text-[var(--accent-strong)]">8</strong><input aria-label="Sample rating" className="min-w-0 flex-1" type="range" value="8" readOnly min="1" max="10" /></div>
                  <p className="mt-3 text-[11px] font-bold">Do you have a message for me?</p>
                  <div className="mt-2 min-h-[58px] rounded-[10px] border border-[var(--line)] bg-[var(--surface-strong)] p-2 text-[10px] text-[var(--faint)]">Say something real</div>
                  <button className="mt-3 min-h-9 w-full rounded-[10px] bg-[var(--accent)] text-[10px] font-bold text-white" type="button">Send privately</button>
                </div>
                <p className="mt-2 text-center text-[9px] text-[var(--faint)]">Only Allen can read this</p>
              </div>
            </div>
          </div>
        </section>

        <section className="site-shell py-20 md:py-24">
          <div className="max-w-2xl">
            <h2 className="text-4xl font-extrabold leading-none tracking-[-.06em] md:text-6xl">From scan to a better introduction.</h2>
            <p className="mt-5 max-w-xl text-lg leading-7 text-[var(--muted)]">Your QR stays the same. Change the profile, questions, and reason to connect whenever your context changes.</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              { image: discoverImage, icon: QrCode, title: 'Scan and sign up', body: 'Discover ScanMe from a card, scan the code, and create your free profile.' },
              { image: customiseImage, icon: SlidersHorizontal, title: 'Choose your intent', body: 'Pick a use, shape your questions, and create the experience behind your code.' },
              { image: socialiseImage, icon: IdentificationCard, title: 'Go socialise', body: 'Wear or share your code so the right people understand why they should connect.' },
            ].map((step) => (
              <article key={step.title} className="soft-card overflow-hidden">
                <div className="relative aspect-[3/2]"><Image src={step.image} alt="" fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" /></div>
                <div className="p-5">
                  <h3 className="flex items-center gap-2 text-lg font-extrabold"><step.icon size={21} weight="bold" className="text-[var(--accent)]" />{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{step.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="uses" className="site-shell pb-20 md:pb-24">
          <h2 className="max-w-3xl text-4xl font-extrabold leading-none tracking-[-.06em] md:text-6xl">One code, many reasons to connect.</h2>
          <p className="mt-5 max-w-xl text-lg leading-7 text-[var(--muted)]">Change what people learn, what they can answer, and where their interest goes.</p>
          <div className="mt-10 grid overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface-strong)] md:grid-cols-2">
            {uses.map((use, index) => (
              <article key={use.title} className={`grid min-h-52 grid-cols-[52px_1fr] gap-5 p-7 md:p-10 ${index === 1 || index === 2 ? 'bg-[var(--accent-soft)]' : ''} ${index < 2 ? 'border-b border-[var(--line)]' : ''} ${index % 2 === 0 ? 'md:border-r md:border-[var(--line)]' : ''}`}>
                <span className="grid h-[52px] w-[52px] place-items-center rounded-[15px] bg-[var(--accent)] text-white"><use.icon size={26} weight="bold" /></span>
                <div><h3 className="text-2xl font-extrabold tracking-[-.045em]">{use.title}</h3><p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">{use.body}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section className="site-shell">
          <div className="grid items-center gap-6 rounded-[20px] bg-[var(--accent-soft)] p-7 md:grid-cols-[1fr_auto] md:p-12">
            <div><h2 className="text-4xl font-extrabold tracking-[-.055em]">Make the next room easier to read.</h2><p className="mt-3 text-[var(--muted)]">Start free, publish one campaign, and change it without replacing your QR.</p></div>
            <Link className="action-primary" href="/signup">Create your code <ArrowRight size={18} weight="bold" /></Link>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  )
}
