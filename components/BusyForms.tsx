'use client'

import { useEffect } from 'react'

/**
 * Gives every form inside the page an immediate "working" cue: the pressed button dims, is disabled
 * and gets an ellipsis until the next page arrives. Attendee actions (block, reply, save) take a
 * moment on the server, and with no cue people press the button again. Mount once per page.
 */
export function BusyForms() {
  useEffect(() => {
    const onSubmit = (event: SubmitEvent) => {
      const button = event.submitter
      if (!(button instanceof HTMLButtonElement) || event.defaultPrevented) return
      // After the browser has read the button's name/value into the form data.
      setTimeout(() => { button.disabled = true; button.classList.add('is-busy'); button.setAttribute('aria-busy', 'true') }, 0)
    }
    document.addEventListener('submit', onSubmit)
    return () => document.removeEventListener('submit', onSubmit)
  }, [])
  return null
}
