import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Brand } from '@/components/Brand'
import heroImage from '@/prototype-assets/scanme-hero-clear-v3.png'

/** The shared frame for log in, sign up and the password reset pages: art on the left, form on the right. */
export function AuthFrame({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="site-shell grid min-h-dvh place-items-center py-6 sm:py-8">
      <div className="w-full max-w-[850px]">
        <Link className="mb-6 block w-fit" href="/" aria-label="ScanMe home"><Brand /></Link>
        <section className="grid overflow-hidden rounded-[25px] border border-[var(--line)] bg-[var(--surface-strong)] md:grid-cols-2">
          <div className="relative isolate hidden min-h-[520px] flex-col justify-end bg-[var(--deep)] p-7 text-white md:flex">
            <Image src={heroImage} alt="" fill sizes="425px" className="-z-20 object-cover object-[48%_center]" />
            <div className="absolute inset-0 -z-10 bg-[linear-gradient(transparent_30%,#0c2117ef_95%)]" />
            <h2 className="max-w-[280px] text-[2.4rem] font-extrabold leading-[1.02] tracking-[-.05em]">Bring the room into focus.</h2>
            <p className="mt-2 max-w-[300px] text-sm leading-6 text-[#e1eddd]">Run an event, or keep one permanent code that opens whatever you choose.</p>
          </div>
          <div className="grid content-center gap-4 p-6 sm:p-9">
            <div>
              <h1 className="text-4xl font-extrabold tracking-[-.06em]">{title}</h1>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{subtitle}</p>
            </div>
            {children}
          </div>
        </section>
        {footer && <p className="mt-5 text-center text-sm text-[var(--muted)]">{footer}</p>}
      </div>
    </main>
  )
}
