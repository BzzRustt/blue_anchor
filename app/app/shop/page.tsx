import Link from 'next/link'
import { IdentificationBadge, Sticker, TShirt } from '@phosphor-icons/react/dist/ssr'
import { PageIntro } from '@/components/workspace/PageIntro'

const products = [
  { name: 'Code shirt', price: 'From £28', body: 'A heavyweight cotton shirt with your permanent code printed cleanly at chest height.', icon: TShirt, tone: 'bg-[#b9d8ff]' },
  { name: 'Code card', price: 'From £12', body: 'A durable set of conversation cards for desks, counters, events and quick introductions.', icon: IdentificationBadge, tone: 'bg-[#ffd69b]' },
  { name: 'Code stickers', price: 'From £8', body: 'Weather-resistant stickers for laptops, notebooks, product packaging and displays.', icon: Sticker, tone: 'bg-[#d5c3ff]' },
] as const

export default function ShopPage() {
  return <div className="grid gap-7"><PageIntro eyebrow="Wear or share it" title="Shop" body="Put your permanent ScanMe code somewhere people naturally notice it." /><section className="grid gap-4 md:grid-cols-3">{products.map((product) => <article key={product.name} className="soft-card flex min-h-[370px] flex-col overflow-hidden"><div className={`grid min-h-48 place-items-center ${product.tone}`}><span className="grid h-24 w-24 place-items-center rounded-[28px] bg-white/75 text-[#102018] shadow-lg"><product.icon size={50} weight="duotone" /></span></div><div className="flex flex-1 flex-col p-5"><div className="flex items-start justify-between gap-3"><h2 className="text-xl font-extrabold">{product.name}</h2><span className="text-sm font-extrabold text-[var(--accent-strong)]">{product.price}</span></div><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{product.body}</p><Link href="mailto:hello@scanme.app?subject=ScanMe%20shop%20interest" className="action-secondary mt-auto">Join the launch list</Link></div></article>)}</section><p className="text-center text-xs text-[var(--faint)]">Product previews only. Checkout and fulfilment are not enabled in this prototype.</p></div>
}
