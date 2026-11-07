'use client'

import { Printer } from '@phosphor-icons/react'

export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="action-primary"><Printer size={18} />Print or save as PDF</button>
}
