'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ''

const PREVIEW_SIZE = 320
const DOWNLOAD_SIZE = 1200

export default function QRCodeTab() {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [genError, setGenError] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!APP_URL) return
    QRCode.toDataURL(APP_URL, {
      width: PREVIEW_SIZE,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    })
      .then(setPreviewSrc)
      .catch(() => setGenError(true))
  }, [])

  async function handleDownload() {
    if (!APP_URL) return
    setDownloading(true)
    try {
      const dataUrl = await QRCode.toDataURL(APP_URL, {
        width: DOWNLOAD_SIZE,
        margin: 4,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'H',
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = 'scanme-qrcode.png'
      a.click()
    } finally {
      setDownloading(false)
    }
  }

  if (!APP_URL) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <p className="text-sm text-gray-400">
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">NEXT_PUBLIC_APP_URL</code>{' '}
          is not set. Add it to your environment variables and redeploy.
        </p>
      </div>
    )
  }

  if (genError) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <p className="text-sm text-gray-400">Failed to generate QR code. Please refresh.</p>
      </div>
    )
  }

  return (
    <div className="max-w-sm space-y-6">
      {/* QR preview card */}
      <div className="bg-white border border-gray-200 rounded-xl p-8 flex flex-col items-center gap-5">
        {previewSrc ? (
          <img
            src={previewSrc}
            alt="QR code"
            width={PREVIEW_SIZE}
            height={PREVIEW_SIZE}
            className="rounded-lg"
          />
        ) : (
          <div
            className="rounded-lg bg-gray-100 animate-pulse"
            style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
          />
        )}

        <p className="text-xs text-gray-400 text-center break-all">{APP_URL}</p>

        <button
          onClick={handleDownload}
          disabled={!previewSrc || downloading}
          className="w-full py-2.5 bg-accent text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {downloading ? 'Generating…' : 'Download PNG (1200 × 1200 px)'}
        </button>
      </div>

      {/* Print note */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
        <p className="text-sm text-amber-800 leading-relaxed">
          Print at a minimum of <strong>5 × 5 cm</strong> for reliable scanning. Larger is
          better — <strong>7 × 7 cm</strong> is recommended for arm-length distances
          (e.g. reading off a shirt).
        </p>
      </div>
    </div>
  )
}
