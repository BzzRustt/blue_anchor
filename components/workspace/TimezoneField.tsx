'use client'

/**
 * datetime-local carries no zone; this sends the browser's UTC offset so the server can
 * apply it. Set through a ref rather than state, so there is no extra render.
 */
export function TimezoneField() {
  return <><input type="hidden" name="tzOffset" defaultValue="0" ref={(el) => { if (el) el.value = String(new Date().getTimezoneOffset()) }} /><input type="hidden" name="tzName" defaultValue="Europe/London" ref={(el) => { if (el) el.value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London' }} /></>
}
