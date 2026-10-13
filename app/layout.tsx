import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'

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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body className={`${geist.className} antialiased`}>{children}</body>
    </html>
  )
}
