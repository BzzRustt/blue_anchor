/**
 * Pure event logic: tags, roster parsing, access codes, badge CSV.
 *
 * No database, no framework, no `@/` alias — so every rule here runs under `node --test`.
 */
import { randomBytes, randomInt } from 'node:crypto'

export interface Role {
  letter: string
  label: string
}

/** The default room at a founders' event. Organisers on Pro can replace it. */
export const DEFAULT_ROLES: Role[] = [
  { letter: 'F', label: 'Founder' },
  { letter: 'I', label: 'Investor' },
  { letter: 'M', label: 'Mentor' },
  { letter: 'S', label: 'Sponsor' },
]

/**
 * The four questions that make matching work. The middle pair is the product: one field
 * supports browsing, the pair supports matching in both directions.
 */
export const DEFAULT_QUESTIONS = [
  { prompt: 'What do you do?', placeholder: 'One line a stranger would understand' },
  { prompt: 'What are you looking for?', placeholder: 'Introductions, advice, funding, customers…' },
  { prompt: 'What can you help with?', placeholder: 'Where could you be useful to someone here?' },
  { prompt: 'Sector, stage or topics', placeholder: 'e.g. fintech, pre-seed, climate' },
] as const

const MAX_ROLES = 8

// ponytail: fixed to London time, the launch market. Add a per-event zone when it isn't.
export const formatWhen = (date: Date) =>
  date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' })

/** "F=Founder, I=Investor" → roles. Letters are unique, A–Z, and capped. */
export function parseRoles(input: string): { roles: Role[]; error?: string } {
  const roles: Role[] = []
  const seen = new Set<string>()
  for (const part of input.split(/[,\n]/)) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const match = /^([A-Za-z])\s*[=:]\s*(.{1,30})$/.exec(trimmed)
    if (!match) return { roles: [], error: `"${trimmed.slice(0, 30)}" is not in the form F=Founder.` }
    const letter = match[1].toUpperCase()
    if (seen.has(letter)) return { roles: [], error: `The letter ${letter} is used twice.` }
    seen.add(letter)
    roles.push({ letter, label: match[2].trim() })
  }
  if (roles.length > MAX_ROLES) return { roles: [], error: `Use at most ${MAX_ROLES} roles.` }
  return { roles }
}

/** "F-042" with roles, "042" for a single-cohort event. */
export function formatTag(letter: string | null, n: number): string {
  const num = String(n).padStart(3, '0')
  return letter ? `${letter}-${num}` : num
}

/** The next free number for one letter, given the tags already allocated at the event. */
export function nextNumber(existingTags: string[], letter: string | null): number {
  let max = 0
  for (const tag of existingTags) {
    const match = /^(?:([A-Z])-)?(\d+)$/.exec(tag)
    if (!match) continue
    if ((match[1] ?? null) !== letter) continue
    max = Math.max(max, Number(match[2]))
  }
  return max + 1
}

export interface RosterRow {
  name: string
  email: string | null
  letter: string | null
}

export interface RosterResult {
  rows: RosterRow[]
  errors: string[]
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * One attendee per line: `Name, email, role letter`. Email and letter are optional, which
 * is what makes a plain list of names from a spreadsheet usable as-is.
 */
export function parseRoster(input: string, allowedLetters: string[]): RosterResult {
  const rows: RosterRow[] = []
  const errors: string[] = []
  const seenEmails = new Set<string>()

  input.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return
    const [rawName = '', rawEmail = '', rawLetter = ''] = line.split(',').map((cell) => cell.trim())
    const at = `Line ${index + 1}`

    if (rawName.length < 2 || rawName.length > 80) return void errors.push(`${at}: the name must be 2–80 characters.`)

    const email = rawEmail.toLowerCase()
    if (email && !EMAIL.test(email)) return void errors.push(`${at}: "${rawEmail.slice(0, 40)}" is not a valid email.`)
    if (email && seenEmails.has(email)) return void errors.push(`${at}: ${email} appears twice.`)

    const letter = rawLetter ? rawLetter.toUpperCase() : null
    if (letter && !allowedLetters.includes(letter)) {
      return void errors.push(`${at}: "${rawLetter.slice(0, 10)}" is not one of this event's roles.`)
    }

    if (email) seenEmails.add(email)
    rows.push({ name: rawName, email: email || null, letter })
  })

  return { rows, errors }
}

/**
 * Five characters from an alphabet with no 0/O/1/I/L, because this is read off a slide and
 * typed on a phone. About 33 million values: a speed bump against crawlers, not a secret.
 */
const ACCESS_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function generateAccessCode(): string {
  let code = ''
  for (let i = 0; i < 5; i++) code += ACCESS_ALPHABET[randomInt(ACCESS_ALPHABET.length)]
  return code
}

/** URL slug for an event: readable prefix plus a random suffix so slugs cannot be guessed. */
export function eventSlug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'event'
  return `${base}-${randomBytes(3).toString('hex')}`
}

/**
 * Spreadsheet formula injection: a cell starting with = + - @ (or tab/CR) is executed by
 * Excel and Sheets. Names come from attendees and CSV imports, so they are untrusted.
 */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export interface BadgeRow {
  tag: string
  name: string
  role: string
  joinUrl: string
}

export function badgesCsv(rows: BadgeRow[], accessCode: string): string {
  const header = ['tag', 'name', 'role', 'access_code', 'join_url']
  const lines = rows.map((r) => [r.tag, r.name, r.role, accessCode, r.joinUrl].map(csvCell).join(','))
  return [header.join(','), ...lines].join('\r\n') + '\r\n'
}

/** Splits CSV text into rows of cells. Handles quoted cells, doubled quotes and quoted newlines. */
export function splitCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell.trim()); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++
      row.push(cell.trim()); cell = ''
      if (row.some(Boolean)) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

export interface ImportRow extends RosterRow { ref: string | null }
export interface ImportResult { rows: ImportRow[]; errors: string[]; skipped: number; mapped: string[] }

const HEADER_WORDS: Record<string, 'name' | 'first' | 'last' | 'email' | 'letter' | 'ref'> = {
  name: 'name', 'full name': 'name', attendee: 'name', 'first name': 'first', firstname: 'first', first: 'first',
  'last name': 'last', lastname: 'last', surname: 'last', last: 'last', email: 'email', 'e-mail': 'email',
  'email address': 'email', role: 'letter', letter: 'letter', 'role letter': 'letter',
  ref: 'ref', reference: 'ref', 'registration reference': 'ref', 'order id': 'ref', 'ticket id': 'ref',
}

/**
 * CSV or pasted roster with an optional header row. With a header, columns are matched by name
 * (name, first/last name, email, role, reference); without one the order is name, email, letter.
 * Repeated emails or references within the file are skipped and counted, never merged silently;
 * a bad row is an error and nothing at all is imported.
 */
export function parseImport(input: string, allowedLetters: string[]): ImportResult {
  const table = splitCsv(input)
  const errors: string[] = []
  const rows: ImportRow[] = []
  let skipped = 0
  if (!table.length) return { rows, errors, skipped, mapped: [] }

  const guess = table[0].map((cell) => HEADER_WORDS[cell.toLowerCase()])
  const hasHeader = guess.some(Boolean)
  const cols: Array<'name' | 'first' | 'last' | 'email' | 'letter' | 'ref' | undefined> = hasHeader ? guess : ['name', 'email', 'letter']
  const mapped = hasHeader ? [...new Set(cols.filter(Boolean) as string[])] : ['name', 'email', 'letter']
  const pick = (cells: string[], key: string) => cells[cols.indexOf(key as never)]?.trim() ?? ''

  const seenEmail = new Set<string>()
  const seenRef = new Set<string>()
  table.slice(hasHeader ? 1 : 0).forEach((cells, index) => {
    const at = `Row ${index + (hasHeader ? 2 : 1)}`
    const name = (pick(cells, 'name') || [pick(cells, 'first'), pick(cells, 'last')].filter(Boolean).join(' ')).trim()
    if (name.length < 2 || name.length > 80) return void errors.push(`${at}: the name must be 2–80 characters.`)
    const email = pick(cells, 'email').toLowerCase()
    if (email && !EMAIL.test(email)) return void errors.push(`${at}: "${email.slice(0, 40)}" is not a valid email.`)
    const rawLetter = pick(cells, 'letter')
    const letter = rawLetter ? rawLetter.toUpperCase() : null
    if (letter && !allowedLetters.includes(letter)) return void errors.push(`${at}: "${rawLetter.slice(0, 10)}" is not one of this event's roles.`)
    const ref = pick(cells, 'ref').slice(0, 60) || null
    if ((email && seenEmail.has(email)) || (ref && seenRef.has(ref))) { skipped++; return }
    if (email) seenEmail.add(email)
    if (ref) seenRef.add(ref)
    rows.push({ name, email: email || null, letter, ref })
  })
  return { rows, errors, skipped, mapped }
}

/** The wall-clock `YYYY-MM-DDTHH:mm` of an instant in an IANA zone (for datetime-local inputs). */
export function toLocalInput(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(date).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

/** Inverse of toLocalInput: the instant at which an IANA zone's wall clock reads `local`. */
export function fromLocalInput(local: string, timeZone: string): Date {
  const asUtc = Date.parse(`${local}:00Z`)
  let guess = asUtc
  for (let i = 0; i < 2; i++) guess = asUtc - (Date.parse(`${toLocalInput(new Date(guess), timeZone)}:00Z`) - guess)
  return new Date(guess)
}
