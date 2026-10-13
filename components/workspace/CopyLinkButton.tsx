'use client'

import { Check, Copy } from '@phosphor-icons/react'
import { useState } from 'react'

export function CopyLinkButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }
  return <button type="button" onClick={copy} className="action-secondary">{copied ? <Check size={18} weight="bold" /> : <Copy size={18} />}{copied ? 'Copied' : 'Copy link'}</button>
}
