import { and, eq } from 'drizzle-orm'
import Image from 'next/image'
import { revalidatePath } from 'next/cache'
import { Check } from '@phosphor-icons/react/dist/ssr'
import { PageIntro } from '@/components/workspace/PageIntro'
import { schema, withOwnerDb } from '@/lib/db'
import { requireOwner } from '@/lib/owner'

const products = [
  {
    key: 'patch',
    name: 'Code patch kit',
    price: '£15',
    body: 'Add your permanent code to the jacket, tote or shirt you already own.',
    note: 'Includes an embroidered patch, an iron-on transfer and 3 months of Pro.',
    image: '/images/shop/patch-kit.webp',
    alt: 'Embroidered code patch with an iron-on transfer and paper sleeve',
  },
  {
    key: 'shirt',
    name: 'Heavyweight code shirt',
    price: '£28',
    body: 'Heavyweight cotton with your permanent code printed cleanly at chest height.',
    note: 'Choose an off-white or forest-green shirt.',
    image: '/images/shop/code-shirt.webp',
    alt: 'Folded heavyweight shirt with a square code printed at chest height',
  },
  {
    key: 'card',
    name: 'Personal code cards',
    price: '£20 / 50',
    body: 'A business-card replacement that opens your live ScanMe profile in one scan.',
    note: 'Printed with your name, role and permanent code.',
    image: '/images/shop/code-cards.webp',
    alt: 'Set of rounded personal code cards with a matching card wallet',
  },
  {
    key: 'stickers',
    name: 'Tap + scan tags',
    price: 'From £8',
    body: 'Weather-resistant NFC and QR tags for a phone case, laptop, display or product.',
    note: 'A tap or camera scan opens the same live experience.',
    image: '/images/shop/tap-scan-tags.webp',
    alt: 'Coordinated set of round, rectangular and keyring tap-and-scan tags',
  },
  {
    key: 'table_cards',
    name: 'Event table cards',
    price: '£18 / 10',
    body: 'Put feedback, introductions or event prompts within easy reach on every table.',
    note: 'Ten folded cards, each printed with the code you choose.',
    image: '/images/shop/event-table-cards.webp',
    alt: 'Three folded event table cards printed with large square codes',
  },
  {
    key: 'event_badges',
    name: 'Lanyard + badge',
    price: '£10 each',
    body: 'A reusable lanyard and personalised badge for conferences, meetups and teams.',
    note: 'Each attendee gets their own name, tag and code.',
    image: '/images/shop/event-badges.webp',
    alt: 'Two woven lanyards with personalised code badges',
  },
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
      <PageIntro eyebrow="Wear or share it" title="Shop" body="Put your permanent code on products people already notice. Every item uses the QR you already own." />
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => {
          const on = mine.has(product.key)
          return (
            <article key={product.key} className="group soft-card flex min-h-[510px] flex-col overflow-hidden">
              <div className="relative aspect-[4/3] overflow-hidden bg-[var(--surface-muted)]">
                <Image
                  src={product.image}
                  alt={product.alt}
                  fill
                  sizes="(min-width: 1280px) 350px, (min-width: 768px) 50vw, 100vw"
                  className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.025]"
                />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-xl font-extrabold leading-6">{product.name}</h2>
                  <span className="shrink-0 text-right text-sm font-extrabold text-[var(--accent-strong)]">{product.price}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{product.body}</p>
                <p className="mt-2 text-xs font-semibold leading-5 text-[var(--accent-strong)]">{product.note}</p>
                <form action={toggleInterest} className="mt-auto pt-5">
                  <input type="hidden" name="product" value={product.key} /><input type="hidden" name="on" value={on ? '1' : '0'} />
                  <button aria-pressed={on} className={`${on ? 'action-primary' : 'action-secondary'} w-full justify-center`}>{on ? <><Check size={17} weight="bold" />You are on the list</> : 'I am interested'}</button>
                </form>
              </div>
            </article>
          )
        })}
      </section>
      <p className="text-center text-xs leading-5 text-[var(--faint)]">These are product previews. Nothing is being sold yet. Registering interest helps us decide what to produce first.</p>
    </div>
  )
}
