'use client'

import {
  ChartLineUp,
  ChatCircleDots,
  Megaphone,
  QrCode,
  Storefront,
  UserCircle,
} from '@phosphor-icons/react'
import { useState } from 'react'

const ownerTabs = [
  { id: 'inbox', label: 'Inbox', icon: ChatCircleDots },
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { id: 'insights', label: 'Insights', icon: ChartLineUp },
  { id: 'code', label: 'Code', icon: QrCode },
  { id: 'shop', label: 'Shop', icon: Storefront },
  { id: 'profile', label: 'Profile', icon: UserCircle },
] as const

const copy: Record<(typeof ownerTabs)[number]['id'], { title: string; body: string }> = {
  inbox: { title: 'Responses, ready to act on', body: 'See every answer, note, and contact left by someone who scanned your code.' },
  campaigns: { title: 'Change the experience', body: 'Keep previous customisations, duplicate a campaign, or make a new one live.' },
  insights: { title: 'Know what converts', body: 'Compare scans with completed responses and learn which question works.' },
  code: { title: 'One permanent code', body: 'Download your QR for print. Publishing a new campaign never changes it.' },
  shop: { title: 'Put your code in the room', body: 'Order code shirts, code cards, and stickers using the QR you already own.' },
  profile: { title: 'Decide what people learn', body: 'Manage your bio, photo, role, socials, plan, and account settings.' },
}

export function HowDemo() {
  const [side, setSide] = useState<'owner' | 'visitor'>('owner')
  const [tab, setTab] = useState<(typeof ownerTabs)[number]['id']>('inbox')

  return (
    <section className="site-shell py-10 md:py-14">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div><h1 className="text-5xl font-extrabold leading-none tracking-[-.065em] md:text-7xl">See both sides of every scan.</h1><p className="mt-4 text-lg text-[var(--muted)]">Switch between the owner workspace and the visitor experience.</p></div>
        <div className="flex w-fit rounded-[14px] border border-[var(--line)] bg-[var(--surface-muted)] p-1">
          <button className={`rounded-[10px] px-4 py-2 text-sm font-bold ${side === 'owner' ? 'bg-[var(--surface-strong)] shadow-sm' : 'text-[var(--muted)]'}`} onClick={() => setSide('owner')}>Owner view</button>
          <button className={`rounded-[10px] px-4 py-2 text-sm font-bold ${side === 'visitor' ? 'bg-[var(--surface-strong)] shadow-sm' : 'text-[var(--muted)]'}`} onClick={() => setSide('visitor')}>Visitor view</button>
        </div>
      </div>

      <div className="mt-7 grid min-h-[620px] items-center gap-8 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 md:p-9 lg:grid-cols-[minmax(0,1fr)_290px]">
        {side === 'owner' ? (
          <>
            <div className="mx-auto aspect-[16/9] w-full max-w-[1040px] overflow-hidden rounded-[18px] border-[10px] border-[#29332e] bg-[var(--surface-strong)] shadow-[var(--shadow)]">
              <div className="grid h-full grid-cols-[170px_1fr]">
                <aside className="border-r border-[var(--line)] bg-[var(--surface)] p-3">
                  <p className="px-2 py-3 font-extrabold">Allen K.</p>
                  <div className="grid gap-1">
                    {ownerTabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`flex items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold ${tab === item.id ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]' : 'text-[var(--muted)]'}`}><item.icon size={16} weight="bold" />{item.label}</button>)}
                  </div>
                </aside>
                <div className="p-[clamp(18px,3vw,42px)]"><span className="status-live">Live workspace</span><h2 className="mt-5 text-[clamp(1.7rem,4vw,3.4rem)] font-extrabold tracking-[-.055em]">{copy[tab].title}</h2><p className="mt-3 max-w-xl text-[clamp(.75rem,1.4vw,1rem)] leading-6 text-[var(--muted)]">{copy[tab].body}</p><div className="mt-8 grid grid-cols-3 gap-3"><div className="rounded-xl bg-[var(--surface-muted)] p-4"><p className="text-xs text-[var(--muted)]">Scans</p><strong className="mt-2 block text-3xl">38</strong></div><div className="rounded-xl bg-[var(--surface-muted)] p-4"><p className="text-xs text-[var(--muted)]">Responses</p><strong className="mt-2 block text-3xl">16</strong></div><div className="rounded-xl bg-[var(--accent-soft)] p-4"><p className="text-xs text-[var(--muted)]">Conversion</p><strong className="mt-2 block text-3xl">42%</strong></div></div></div>
              </div>
            </div>
            <div className="mx-auto h-[530px] w-[270px] overflow-hidden rounded-[38px] border-[7px] border-[#29332e] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow)]">
              <div className="mx-auto mb-5 h-5 w-20 rounded-full bg-[#29332e]" />
              <p className="text-sm font-extrabold">Owner workspace</p>
              <div className="mt-4 grid grid-cols-3 gap-2">{ownerTabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`grid place-items-center gap-1 rounded-xl px-1 py-3 text-[9px] font-bold ${tab === item.id ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]' : 'text-[var(--muted)]'}`}><item.icon size={18} weight="bold" />{item.label}</button>)}</div>
              <h2 className="mt-7 text-2xl font-extrabold tracking-[-.05em]">{copy[tab].title}</h2><p className="mt-2 text-xs leading-5 text-[var(--muted)]">{copy[tab].body}</p>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto aspect-[16/9] w-full max-w-[1040px] overflow-hidden rounded-[18px] border-[10px] border-[#29332e] bg-[var(--surface-strong)] p-[clamp(22px,5vw,70px)] shadow-[var(--shadow)]">
              <div className="grid h-full items-center gap-8 lg:grid-cols-[.75fr_1.25fr]"><div className="text-center"><div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[var(--accent-soft)] text-2xl font-extrabold text-[var(--accent-strong)]">AK</div><h2 className="mt-3 text-3xl font-extrabold">Allen K.</h2><p className="mt-2 text-sm text-[var(--muted)]">Product designer. Open to climate-tech collaborations.</p><p className="mt-3 text-sm font-bold text-[var(--accent-strong)]">@allen.builds</p></div><div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-6"><p className="font-extrabold">What should I remember you for?</p><textarea className="field-textarea mt-4" value="A thoughtful idea, question, or introduction." readOnly /><button className="action-primary mt-4 w-full">Send privately</button></div></div>
            </div>
            <div className="mx-auto h-[530px] w-[270px] overflow-hidden rounded-[38px] border-[7px] border-[#29332e] bg-[var(--surface-strong)] px-4 pb-5 pt-3 shadow-[var(--shadow)]"><div className="mx-auto mb-5 h-5 w-20 rounded-full bg-[#29332e]" /><div className="text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--accent-soft)] text-lg font-extrabold text-[var(--accent-strong)]">AK</div><h2 className="mt-2 text-2xl font-extrabold">Allen K.</h2><p className="mt-1 text-xs leading-4 text-[var(--muted)]">Product designer. Open to climate-tech collaborations.</p><p className="mt-2 text-xs font-bold text-[var(--accent-strong)]">@allen.builds</p></div><div className="mt-5 rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-3"><p className="text-sm font-extrabold">What should I remember you for?</p><div className="mt-3 min-h-20 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] p-3 text-[10px] text-[var(--faint)]">A thoughtful idea, question, or introduction.</div><button className="mt-3 min-h-10 w-full rounded-xl bg-[var(--accent)] text-xs font-bold text-white">Send privately</button></div></div>
          </>
        )}
      </div>
    </section>
  )
}
