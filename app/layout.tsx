import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { DemoBanner } from '@/components/DemoBanner'
import { Toaster } from '@/components/Toaster'

const geist = localFont({
  src: './fonts/GeistVF.woff',
  display: 'swap',
  variable: '--font-geist',
})

export const metadata: Metadata = {
  title: {
    default: 'ScanMe | Make networking more purposeful',
    template: '%s | ScanMe',
  },
  description: 'A permanent QR code for your profile, questions, and next conversation.',
}

/**
 * Applies the saved theme before first paint. Without it only pages that mount the theme
 * toggle (the workspace and marketing header) honoured a saved "dark", so log in, sign up and
 * the attendee pages came up light and flashed. A fixed string with no user input in it.
 */
const THEME_BOOT = "try{var t=localStorage.getItem('scanme-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.dataset.theme='dark'}catch(e){}"

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className={`${geist.className} antialiased`}><Toaster><DemoBanner />{children}</Toaster></body>
    </html>
  )
}
