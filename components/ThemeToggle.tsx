'use client'

import { Moon, Sun } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const nextDark = window.localStorage.getItem('scanme-theme') === 'dark'
    document.documentElement.dataset.theme = nextDark ? 'dark' : 'light'
    const frame = window.requestAnimationFrame(() => setDark(nextDark))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.dataset.theme = next ? 'dark' : 'light'
    window.localStorage.setItem('scanme-theme', next ? 'dark' : 'light')
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--ink)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
      aria-label={dark ? 'Use light theme' : 'Use dark theme'}
    >
      {dark ? <Sun size={20} weight="bold" /> : <Moon size={20} weight="bold" />}
    </button>
  )
}
