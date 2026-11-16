import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { Check, IdentificationBadge, Sticker, TShirt, Ticket } from '@phosphor-icons/react/dist/ssr'
import { PageIntro } from '@/components/workspace/PageIntro'
import { schema, withOwnerDb } from '@/lib/db'
import { requireOwner } from '@/lib/owner'

const products = [
  { key: 'shirt', name: 'Code shirt', price: 'From £28', body: 'A heavyweight cotton shirt with your permanent code printed cleanly at chest height.', icon: TShirt, tone: 'bg-[#b9d8ff]' },
  { key: 'card', name: 'Code card', price: 'From £12', body: 'A durable set of conversation cards for desks, counters, events and quick introductions.', icon: IdentificationBadge, tone: 'bg-[#ffd69b]' },
  { key: 'stickers', name: 'Code stickers', price: 'From £8', body: 'Weather-resistant stickers for laptops, notebooks, product packaging and displays.', icon: Sticker, tone: 'bg-[#d5c3ff]' },
  { key: 'event_badges', name: 'Printed event badges', price: 'Per event', body: 'Badges printed with each attendee’s tag and QR, delivered before your event.', icon: Ticket, tone: 'bg-[#d9e7b6]' },
] as const

async function toggleInterest(formData: FormData) {
  'use server'
  const session = await requireOwner()
  const product = String(formData.get('product') ?? '')
  if (!products.some((p) => p.key === product)) return
  await withOwnerDb(session.user.id, (db) => formData.get('on') === '1'
    ? db.delete(schema.shopInterests).where(and(eq(schema.shopInterests.userId, session.user.id), eq(schema.shopInterests.product, product)))
    : db.insert(schema.shopInterests).values({ userId: session.user.id, product }).onConflictDoNothing())
  revalidatePath('/app/shop')
}

export default async function ShopPage() {
  const session = await requireOwner()
  // ponytail: empty until the shop_interests table exists; the catch keeps the page working before then.
  const mine = await withOwnerDb(session.user.id, (db) => db.select({ product: schema.shopInterests.product }).from(schema.shopInterests))
    .then((rows) => new Set(rows.map((r) => r.product))).catch(() => new Set<string>())
  return (
    <div className="grid gap-7">
      <PageIntro eyebrow="Wear or share it" title="Shop" body="Put your permanent ScanMe code somewhere people naturally notice it." />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {products.map((product) => {
          const on = mine.has(product.key)
          return (
            <article key={product.key} className="soft-card flex min-h-[370px] flex-col overflow-hidden">
              <div className={`grid min-h-40 place-items-center ${product.tone}`}><span className="grid h-24 w-24 place-items-center rounded-[28px] bg-white/75 text-[#102018] shadow-lg"><product.icon size={50} weight="duotone" /></span></div>
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-3"><h2 className="text-xl font-extrabold">{product.name}</h2><span className="text-sm font-extrabold text-[var(--accent-strong)]">{product.price}</span></div>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{product.body}</p>
                <form action={toggleInterest} className="mt-auto pt-5">
                  <input type="hidden" name="product" value={product.key} /><input type="hidden" name="on" value={on ? '1' : '0'} />
                  <button className={`${on ? 'action-primary' : 'action-secondary'} w-full justify-center`}>{on ? <><Check size={17} weight="bold" />You are on the list</> : 'I am interested'}</button>
                </form>
              </div>
            </article>
          )
        })}
      </section>
      <p className="text-center text-xs text-[var(--faint)]">Product previews only. Nothing is sold yet. Your choices tell us what to make first.</p>
    </div>
  )
}
