/**
 * Demo data you can add and remove again:
 *   npm run demo:seed            creates demo accounts, Modes, responses, events, attendees, messages
 *   npm run demo:delete          removes all of it
 *   npm run demo:delete -- --dry only counts what would be removed
 *
 * Every demo account has an id starting "demo-" AND an email at demo.scanme.test (a .test domain can
 * never be real). Every other demo row hangs off those accounts, and the database's ON DELETE CASCADE
 * rules remove it when the accounts go, so delete is one statement that cannot reach a real account.
 * The database is shared with the live site, so the demo shows there too.
 * Uses DATABASE_OWNER_URL from .env.local; the value is never printed.
 */
import { randomBytes } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import { hashPassword } from 'better-auth/crypto'
import { buildBlocks, parseModeConfig, type ModeKey } from '../lib/modes.ts'
import { newAccessToken } from '../lib/attendee-access.ts'
import { DEFAULT_QUESTIONS, eventSlug, formatTag, generateAccessCode } from '../lib/events.ts'

try { process.loadEnvFile('.env.local') } catch { /* reported below */ }
const url = process.env.DATABASE_OWNER_URL
if (!url) { console.error('DATABASE_OWNER_URL is required in .env.local'); process.exit(1) }
const db = neon(url)
// Links are printed for this address: --site=https://your-site, else NEXT_PUBLIC_APP_URL. The paths work on any host.
const site = (process.argv.find((arg) => arg.startsWith('--site='))?.slice(7) ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')

const DEMO_USERS = `select id from users where id like 'demo-%' and email like '%@demo.scanme.test'`
const DEMO_EVENTS = `select id from events where user_id in (${DEMO_USERS})`

type Row = Record<string, unknown>
const rows = async (text: string, params: unknown[] = []) => (await db.query(text, params)) as Row[]

/**
 * Bulk insert, types taken from the table itself; omitted columns keep their defaults. Rows with a
 * different set of columns go in separate statements (in order), so a default is never replaced by NULL.
 */
async function insert(table: string, values: Row[]): Promise<Row[]> {
  const out: Row[] = []
  for (let i = 0; i < values.length;) {
    const sig = Object.keys(values[i]).join(', ')
    let j = i
    while (j < values.length && Object.keys(values[j]).join(', ') === sig) j++
    out.push(...await rows(`insert into ${table} (${sig}) select ${sig} from jsonb_populate_recordset(null::${table}, $1::jsonb) returning *`, [JSON.stringify(values.slice(i, j))]))
    i = j
  }
  return out
}

async function counts() {
  const [row] = await rows(`select
    (select count(*)::int from users where id in (${DEMO_USERS})) as accounts,
    (select count(*)::int from codes where user_id in (${DEMO_USERS}) and kind = 'personal') as personal_codes,
    (select count(*)::int from responses where user_id in (${DEMO_USERS})) as responses,
    (select count(*)::int from scans where code_id in (select id from codes where user_id in (${DEMO_USERS}))) as visits,
    (select count(*)::int from events where id in (${DEMO_EVENTS})) as events,
    (select count(*)::int from event_attendees where event_id in (${DEMO_EVENTS})) as attendees,
    (select count(*)::int from message_requests where event_id in (${DEMO_EVENTS})) as message_requests,
    (select count(*)::int from event_messages where request_id in (select id from message_requests where event_id in (${DEMO_EVENTS}))) as messages`)
  return row as Record<string, number>
}

// ── Small deterministic helpers ─────────────────────────────────────────────
let seed = 20261122
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))
const hex = (bytes: number) => randomBytes(bytes).toString('hex')
const HOUR = 3_600_000
const DAY = 24 * HOUR
const now = Date.now()
const at = (ms: number) => new Date(ms).toISOString()
/** A time in the last `days` days, more of them recent. */
const recent = (days: number) => now - Math.floor(Math.pow(rand(), 1.6) * days * DAY) - int(5, 55) * 60_000

const FIRST = ['Ada', 'Ben', 'Chloe', 'Dami', 'Elena', 'Femi', 'Grace', 'Hassan', 'Isla', 'Jonah', 'Kemi', 'Leo', 'Maya', 'Nikhil', 'Olu', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tara', 'Uche', 'Vik', 'Wren', 'Xavier', 'Yara', 'Zane', 'Aisha', 'Bruno', 'Cara', 'Dev']
const LAST = ['Adeyemi', 'Brooks', 'Chen', 'Dubois', 'Evans', 'Fischer', 'Gupta', 'Hughes', 'Ibrahim', 'Jones', 'Khan', 'Lopez', 'Mensah', 'Novak', 'Owusu', 'Patel', 'Quarshie', 'Reid', 'Silva', 'Taylor']
const usedNames = new Set<string>()
function personName() {
  for (;;) { const name = `${pick(FIRST)} ${pick(LAST)}`; if (!usedNames.has(name)) { usedNames.add(name); return name } }
}
const emailOf = (name: string) => `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`

const TEXT = {
  intro: ['Loved your talk on community building. I run a small climate meetup and would love to swap notes.', 'We met briefly by the coffee. I am hiring a first designer and would value your take.', 'Saw your badge, I work on payments for marketplaces. Happy to help if useful.', 'Fellow organiser here. Could we compare sponsor decks some time?', 'I am a product lead looking for a mentor in community-led growth.'],
  message: ['Great energy today, thanks!', 'Love the jacket, where is it from?', 'Your stall was the best one here.', 'Thanks for the tip about the venue.', 'Keep going, this is brilliant.', 'Met you at the bar, say hi next time!', 'That playlist was perfect.'],
  collab: ['Would you feature on our podcast next month?', 'Brand collab: we make reusable bottles and love your style.', 'Can we use your track in a short film? Credit given.', 'I edit videos, happy to help on your next drop.'],
  project: ['We need a new brand identity for a cafe opening in March.', 'Looking for a photographer for a two-day product shoot.', 'Can you quote for a 5-page website redesign?', 'Interested in an illustration for our book cover.'],
  short: ['Brilliant', 'Really helpful', 'More of this please', 'Good, a bit loud', 'Loved it'],
}

const CARD = {
  F: { does: ['Building a carbon accounting tool for SMEs', 'Founder of a fintech for freelancers', 'Running a marketplace for local makers', 'Building AI note-taking for clinicians', 'Co-founder of a student housing app'], looking: ['Pre-seed investors', 'A technical co-founder', 'First 10 customers in retail', 'Advice on pricing', 'Intros to NHS buyers'], offer: ['Lessons from a failed first startup', 'Hiring advice for first engineers', 'Intros to Lagos tech scene', 'Product feedback', 'Growth on TikTok'], topics: ['climate, seed', 'fintech, pre-seed', 'marketplaces', 'healthtech, AI', 'proptech'] },
  I: { does: ['Partner at an early-stage fund', 'Angel investor, ex-founder', 'Scout for a seed fund'], looking: ['Climate founders raising pre-seed', 'B2B SaaS with early revenue', 'Founders from underrepresented groups'], offer: ['Pitch deck reviews', 'Fundraising strategy', 'Intros to other investors'], topics: ['seed, climate', 'B2B SaaS', 'consumer, community'] },
  M: { does: ['Head of product at a scale-up', 'Fractional CFO for startups', 'Design lead, 15 years in agencies'], looking: ['Founders to mentor', 'Interesting side projects', 'Speaking slots'], offer: ['Product strategy', 'Financial models and fundraising prep', 'Brand and design reviews'], topics: ['product, growth', 'finance', 'design, brand'] },
} as const

// ── Seed ────────────────────────────────────────────────────────────────────
type Person = { key: string; name: string; plan: 'free' | 'pro'; mode: ModeKey | null; extra: Row; config: Row; responses: number }

const PEOPLE: Person[] = [
  { key: 'organiser', name: 'Amara Okafor', plan: 'pro', mode: 'networking', responses: 38, config: {},
    extra: { role: 'Community lead', company: 'Northside Founders', bio: 'I run founder events in London and connect people who should know each other.', linkedin: 'https://example.com/in/amara', website: 'https://example.com/amara', instagram: 'amara.builds', interests: 'Founders, climate, community', looking_for: 'Speakers and sponsors for next season', can_offer: 'Intros to 300+ London founders' } },
  { key: 'creator', name: 'Jay Mensah', plan: 'pro', mode: 'creator', responses: 32,
    config: { creator: { featured: { title: 'New EP: Night Bus', description: 'Four tracks written on the N29.', url: 'https://example.com/night-bus', imageUrl: '', button: 'Listen now' }, links: [{ label: 'Tour dates', url: 'https://example.com/tour' }, { label: 'Merch', url: 'https://example.com/merch' }, { label: 'Newsletter', url: 'https://example.com/news' }], poll: { on: true, prompt: 'Which sound should the next track have?', options: ['Slow and moody', 'Upbeat', 'Acoustic'] }, collab: true } },
    extra: { bio: 'Producer and DJ. New music every month.', instagram: 'jaymensah.music', tiktok: 'jaymensah', youtube: 'https://example.com/youtube/jay', spotify: 'https://example.com/spotify/jay' } },
  { key: 'portfolio', name: 'Lena Fischer', plan: 'pro', mode: 'portfolio', responses: 22,
    config: { portfolio: { style: 'visual', intro: 'Brand and packaging designer. Available from January.', enquiry: true, projects: [{ title: 'Oat & Co rebrand', description: 'Identity and packaging for an oat milk brand.', url: 'https://example.com/oat', imageUrl: '' }, { title: 'Riverside Festival', description: 'Posters, wayfinding and wristbands.', url: 'https://example.com/festival', imageUrl: '' }, { title: 'Kiln Cafe menus', description: 'Menu system for a three-site cafe.', url: 'https://example.com/kiln', imageUrl: '' }] } },
    extra: { role: 'Brand designer', company: 'Studio Fischer', bio: 'I design brands people remember.', linkedin: 'https://example.com/in/lena', website: 'https://example.com/lena', portfolio_url: 'https://example.com/lena/work' } },
  { key: 'basic', name: 'Tom Reid', plan: 'free', mode: 'basic', responses: 26, config: {},
    extra: { bio: 'Student, runner, coffee snob.', instagram: 'tomreid.runs', linkedin: 'https://example.com/in/tom' } },
  { key: 'incognito', name: 'Nadia Khan', plan: 'free', mode: 'incognito', responses: 24, config: { question: { on: true, type: 'scale', prompt: 'How was my set tonight? Rate it 1 to 5.', max: 5 } },
    extra: { bio: 'This name must never appear on the Incognito page.' } },
  { key: 'attendee', name: 'Kwame Owusu', plan: 'free', mode: 'networking', responses: 20, config: {},
    extra: { role: 'Software engineer', company: 'Brightpath', bio: 'Backend engineer exploring founding something.', linkedin: 'https://example.com/in/kwame', looking_for: 'A co-founder', can_offer: 'Backend and data help' } },
  { key: 'organiser2', name: 'Sofia Silva', plan: 'free', mode: 'basic', responses: 12, config: {},
    extra: { bio: 'Organising my first meetup.', instagram: 'sofia.meets' } },
  { key: 'newuser', name: 'New Demo User', plan: 'free', mode: null, responses: 0, config: {}, extra: {} },
]

function answerFor(block: Row, owner: string): unknown {
  const cfg = block.config as { prompt?: string; max?: number; options?: string[] }
  const prompt = cfg.prompt ?? ''
  if (block.type === 'scale') return Math.min(cfg.max ?? 5, int(2, cfg.max ?? 5) + (rand() < 0.5 ? 1 : 0))
  if (block.type === 'yes_no') return rand() < 0.7 ? 'Yes' : 'No'
  if (block.type === 'choice') return pick(cfg.options ?? ['A'])
  if (block.type === 'contact') return rand() < 0.5 ? emailOf(personName()) : 'linkedin.com/in/demo-contact'
  if (prompt === 'Your name') return personName()
  if (prompt.startsWith('Write a short introduction')) return pick(TEXT.intro)
  if (prompt.startsWith('Collaboration')) return pick(TEXT.collab)
  if (prompt.startsWith('Tell them about')) return pick(TEXT.project)
  return owner === 'creator' ? pick(TEXT.collab) : pick(TEXT.message)
}

async function seedPersonal(person: Person, userId: string) {
  const mode = person.mode!
  const [code] = await insert('codes', [{ user_id: userId, slug: hex(6), label: 'My ScanMe', kind: 'personal', is_live: true }])
  const modes: Array<{ mode: ModeKey; status: string; raw: Row }> = [{ mode, status: 'live', raw: person.config }]
  if (mode !== 'basic') modes.push({ mode: 'basic', status: 'draft', raw: {} })
  if (mode !== 'incognito' && person.plan === 'pro') modes.push({ mode: 'incognito', status: 'draft', raw: {} })

  const campaigns: Array<{ id: string; mode: ModeKey; blocks: Row[] }> = []
  for (const m of modes) {
    const cfg = parseModeConfig(m.mode, m.raw)
    const name = m.mode[0].toUpperCase() + m.mode.slice(1)
    const [campaign] = await insert('campaigns', [{ user_id: userId, code_id: code.id, mode: m.mode, name, status: m.status, repeat_policy: 'always_open', config: cfg, created_at: at(now - (m.status === 'live' ? 12 : 40) * DAY) }])
    const blocks = await insert('question_blocks', buildBlocks(m.mode, cfg).map((block, position) => ({ campaign_id: campaign.id, position, type: block.type, required: block.required, config: block.config })))
    campaigns.push({ id: campaign.id as string, mode: m.mode, blocks })
  }

  // Responses: the last 12 days went to the live Mode, older ones to an earlier Mode (so "filter by Mode" has something to filter).
  const blockedDevice = hex(16)
  const responses: Row[] = []
  for (let i = 0; i < person.responses; i++) {
    const when = recent(29)
    const campaign = when > now - 12 * DAY || campaigns.length === 1 ? campaigns[0] : campaigns[1]
    const answers = Object.fromEntries(campaign.blocks.filter((b) => b.required || rand() < 0.85).map((b) => [b.id, answerFor(b, person.key)]))
    const old = when < now - 3 * DAY
    responses.push({ user_id: userId, code_id: code.id, campaign_id: campaign.id, session_token: hex(12), answers, device_hash: i === 1 ? blockedDevice : hex(16),
      submitted_at: at(when), read_at: old && rand() < 0.8 ? at(when + HOUR) : null, archived: old && rand() < 0.12, flagged: i === 2, blocked: i === 1 })
  }
  await insert('responses', responses)
  await insert('blocked_devices', [{ user_id: userId, device_hash: blockedDevice }])

  const live = campaigns[0]
  await insert('scans', Array.from({ length: person.responses * 3 }, () => ({ code_id: code.id, campaign_id: live.id, session_token: hex(12), ip_hash: hex(16), scanned_at: at(recent(29)) })))
  const targets = mode === 'creator' ? ['featured', 'link1', 'link2', 'link3', 'instagram', 'spotify'] : mode === 'portfolio' ? ['project1', 'project2', 'project3', 'linkedin', 'website'] : mode === 'incognito' ? [] : ['linkedin', 'instagram', 'website']
  if (targets.length) await insert('link_clicks', Array.from({ length: person.responses }, () => ({ code_id: code.id, campaign_id: live.id, target: pick(targets), session_token: hex(12), clicked_at: at(recent(29)) })))
  return code.slug as string
}

type EventSpec = { name: string; venue: string; description: string; startsAt: number; endsAt: number; roles: Array<{ letter: string; label: string }>; discovery: string; messaging: boolean; status: string; attendees: number; checkedIn: number; spares: number }

async function seedEvent(userId: string, spec: EventSpec) {
  const [code] = await insert('codes', [{ user_id: userId, slug: eventSlug(spec.name), label: spec.name, kind: 'event', is_live: true }])
  const [campaign] = await insert('campaigns', [{ user_id: userId, code_id: code.id, mode: 'event', name: spec.name, status: 'live', repeat_policy: 'always_open' }])
  const blocks = await insert('question_blocks', DEFAULT_QUESTIONS.map((q, position) => ({ campaign_id: campaign.id, type: 'open_text', position, required: position < 2, config: { prompt: q.prompt, placeholder: q.placeholder } })))
  const published = spec.status === 'published'
  const [event] = await insert('events', [{
    user_id: userId, code_id: code.id, campaign_id: campaign.id, name: spec.name, venue: spec.venue, description: spec.description,
    starts_at: at(spec.startsAt), ends_at: at(spec.endsAt), access_code: generateAccessCode(), role_set: spec.roles,
    directory_expires_at: at(spec.endsAt + 48 * HOUR), status: spec.status, timezone: 'Europe/London',
    capacity: published ? 50 : null, discovery: spec.discovery, messaging_enabled: spec.messaging,
    published_at: published ? at(spec.startsAt - 14 * DAY) : null, cancelled_at: spec.status === 'cancelled' ? at(now - 2 * DAY) : null,
  }])
  if (published) await insert('event_purchases', [{ event_id: event.id, user_id: userId, package_key: 'p50', capacity: 50, amount_pence: 2900, status: 'paid', stripe_session_id: `demo_${hex(8)}`, paid_at: event.published_at }])

  const next = new Map<string | null, number>()
  const tag = (letter: string | null) => { const n = (next.get(letter) ?? 0) + 1; next.set(letter, n); return formatTag(letter, n) }
  const people: Row[] = []
  for (let i = 0; i < spec.attendees; i++) {
    const letter = spec.roles.length ? (i % 4 === 1 ? 'I' : i % 4 === 3 ? 'M' : 'F') : null
    const card = CARD[(letter ?? 'F') as keyof typeof CARD]
    const name = personName()
    const complete = i < spec.attendees - 3 // the last three were imported but never filled in their card
    const k = i % card.does.length
    people.push({
      event_id: event.id, tag: tag(letter), role_letter: letter, display_name: name, email: emailOf(name),
      answers: complete ? { [blocks[0].id as string]: card.does[k], [blocks[1].id as string]: card.looking[k % card.looking.length], [blocks[2].id as string]: card.offer[k % card.offer.length], [blocks[3].id as string]: card.topics[k % card.topics.length] } : {},
      source: i % 3 === 0 ? 'native' : 'import', external_ref: i % 3 === 0 ? null : `TKT-${1000 + i}`, status: complete ? 'complete' : 'invited',
      profile_visibility: i > 3 && i % 9 === 4 ? 'name' : i > 3 && i % 13 === 6 ? 'hidden' : 'full', allow_messages: !(i > 3 && i % 11 === 5),
      checked_in_at: i < spec.checkedIn ? at(spec.startsAt + i * 4 * 60_000) : null, created_at: at(spec.startsAt - int(2, 20) * DAY),
    })
  }
  for (let i = 0; i < spec.spares; i++) people.push({ event_id: event.id, tag: tag(spec.roles.length ? 'F' : null), role_letter: spec.roles.length ? 'F' : null, display_name: 'Walk-up', source: 'walk_up', status: 'invited' })
  const attendees = await insert('event_attendees', people)
  return { event, slug: code.slug as string, attendees }
}

async function conversation(eventId: unknown, from: Row, to: Row, startMs: number, lines: string[], status = 'accepted') {
  const [request] = await insert('message_requests', [{ event_id: eventId, from_attendee_id: from.id, to_attendee_id: to.id, status, created_at: at(startMs), responded_at: status === 'pending' ? null : at(startMs + 10 * 60_000) }])
  if (status === 'accepted' || status === 'pending') {
    await insert('event_messages', lines.map((body, i) => ({ request_id: request.id, from_attendee_id: i % 2 === 0 ? from.id : to.id, body, created_at: at(startMs + i * 7 * 60_000), read_at: i < lines.length - 1 ? at(startMs + i * 7 * 60_000 + 60_000) : null })))
  }
  return request
}

async function accessLink(eventId: unknown, attendee: Row, slug: string, expires: unknown) {
  const { token, hash } = newAccessToken()
  await insert('attendee_access_tokens', [{ attendee_id: attendee.id, event_id: eventId, token_hash: hash, created_by: 'organiser', expires_at: expires }])
  return `${site}/e/${slug}/access?t=${token}`
}

async function seedAll() {
  const existing = await counts()
  if (existing.accounts > 0) { console.error(`Demo data already exists (${existing.accounts} accounts). Run "npm run demo:delete" first.`); process.exit(1) }

  const password = `demo-${hex(4)}`
  const hash = await hashPassword(password)
  const ids: Record<string, string> = {}
  for (const person of PEOPLE) ids[person.key] = `demo-${person.key}`
  await insert('users', PEOPLE.map((p) => ({ id: ids[p.key], email: `${p.key}@demo.scanme.test`, email_verified: true, name: p.name, plan: p.plan, created_at: at(now - (p.key === 'newuser' ? 0 : 45) * DAY), ...p.extra })))
  await insert('account', PEOPLE.map((p) => ({ id: `demo-acc-${p.key}`, account_id: ids[p.key], provider_id: 'credential', user_id: ids[p.key], password: hash })))

  const personal: Record<string, string> = {}
  for (const person of PEOPLE) if (person.mode) personal[person.key] = await seedPersonal(person, ids[person.key])
  await insert('shop_interests', [{ user_id: ids.organiser, product: 'event_badges' }, { user_id: ids.creator, product: 'shirt' }])

  const roles = [{ letter: 'F', label: 'Founder' }, { letter: 'I', label: 'Investor' }, { letter: 'M', label: 'Mentor' }]
  const mixer = await seedEvent(ids.organiser, { name: 'Demo Founders Summit', venue: 'The Glasshouse, Shoreditch', description: 'Two days for early-stage founders, investors and mentors. Happening now.', startsAt: now - HOUR, endsAt: now + 36 * HOUR, roles, discovery: 'directory', messaging: true, status: 'published', attendees: 40, checkedIn: 15, spares: 0 })
  const breakfast = await seedEvent(ids.organiser, { name: 'Demo Product Breakfast', venue: 'Kiln Cafe, Kings Cross', description: 'Product people over pastries. Ended three hours ago: replies still work, new requests do not.', startsAt: now - 6 * HOUR, endsAt: now - 3 * HOUR, roles: [], discovery: 'directory', messaging: true, status: 'published', attendees: 25, checkedIn: 20, spares: 0 })
  const design = await seedEvent(ids.organiser, { name: 'Demo Design Night', venue: 'Studio 9, Peckham', description: 'Show and tell for designers. Next week, so networking has not opened yet.', startsAt: now + 7 * DAY, endsAt: now + 7 * DAY + 3 * HOUR, roles: [], discovery: 'badge', messaging: true, status: 'published', attendees: 10, checkedIn: 0, spares: 5 })
  const old = await seedEvent(ids.organiser, { name: 'Demo Old Meetup', venue: 'The Crown, Hackney', description: 'Ended ten days ago, so it is closed.', startsAt: now - 10 * DAY, endsAt: now - 10 * DAY + 3 * HOUR, roles: [], discovery: 'directory', messaging: true, status: 'published', attendees: 18, checkedIn: 14, spares: 0 })
  const draft = await seedEvent(ids.organiser2, { name: 'Demo Supper Club', venue: 'Sofia’s flat', description: 'A draft waiting for payment before it can be published.', startsAt: now + 14 * DAY, endsAt: now + 14 * DAY + 3 * HOUR, roles: [], discovery: 'badge', messaging: false, status: 'draft', attendees: 4, checkedIn: 0, spares: 0 })
  await seedEvent(ids.organiser2, { name: 'Demo Rained Off Picnic', venue: 'London Fields', description: 'Cancelled by the organiser.', startsAt: now + 3 * DAY, endsAt: now + 3 * DAY + 3 * HOUR, roles: [], discovery: 'badge', messaging: false, status: 'cancelled', attendees: 0, checkedIn: 0, spares: 0 })

  // Live event networking. "you" and "friend" are the two attendee links, already talking to each other.
  const m = mixer.attendees
  const [you, friend] = [m[0], m[1]]
  const t0 = now - 50 * 60_000
  await conversation(mixer.event.id, you, friend, t0, ['Hi! Saw your card, I am building in climate too.', 'Hey, nice to meet you. What stage are you at?', 'Pre-seed, talking to a few angels. You?', 'Same. Want to grab a coffee by the bar in 10?', 'Perfect, see you there.', 'On my way 👋'])
  await conversation(mixer.event.id, m[4], you, t0 + 5 * 60_000, ['Hello, I am an investor here tonight. Would love to hear about your company.'], 'pending')
  await conversation(mixer.event.id, m[5], you, t0 + 9 * 60_000, ['Hi, are you hiring engineers by any chance?'], 'pending')
  await conversation(mixer.event.id, you, m[7], t0 + 12 * 60_000, ['Hi, could I ask you about your pricing model?'], 'pending')
  await conversation(mixer.event.id, m[8], you, t0 + 15 * 60_000, [], 'declined')
  for (const [a, b] of [[m[9], m[10]], [m[12], m[13]], [m[16], m[17]]] as const) await conversation(mixer.event.id, a, b, t0 + int(10, 40) * 60_000, ['Great to meet you!', 'Likewise, let us stay in touch.', 'Sending you my deck now.'])
  const nuisance = m[19]
  const spam = await conversation(mixer.event.id, nuisance, friend, t0 + 20 * 60_000, [], 'blocked')
  await insert('attendee_blocks', [{ event_id: mixer.event.id, blocker_attendee_id: friend.id, blocked_attendee_id: nuisance.id }])
  await insert('abuse_reports', [{ event_id: mixer.event.id, reporter_attendee_id: friend.id, reported_attendee_id: nuisance.id, request_id: spam.id, reason: 'Repeated unwanted messages (demo report)' }])
  await insert('saved_attendees', [...[2, 3, 6, 11, 14].map((i) => ({ event_id: mixer.event.id, attendee_id: you.id, saved_attendee_id: m[i].id })), ...[0, 15, 18, 20].map((i) => ({ event_id: mixer.event.id, attendee_id: friend.id, saved_attendee_id: m[i].id }))])

  // The demo "attendee" account is also at the mixer, linked to their account.
  const kwame = PEOPLE.find((p) => p.key === 'attendee')!
  const [linked] = await insert('event_attendees', [{ event_id: mixer.event.id, tag: 'F-099', role_letter: 'F', display_name: kwame.name, email: 'attendee@demo.scanme.test', answers: { [Object.keys(m[0].answers as Row)[0]]: 'Backend engineer exploring a startup idea', [Object.keys(m[0].answers as Row)[1]]: 'A co-founder' }, source: 'native', status: 'complete', claimed_user_id: ids.attendee }])

  // Ended event: one conversation to reply to (allowed for 48 hours), no new requests.
  const b = breakfast.attendees
  const t1 = now - 5 * HOUR
  await conversation(breakfast.event.id, b[1], b[0], t1, ['Thanks for the chat about onboarding flows!', 'Anytime. Shall I send you that article?', 'Yes please.'])
  await conversation(breakfast.event.id, b[0], b[2], t1 + 20 * 60_000, ['Good to meet you, let us follow up next week.'])
  await insert('saved_attendees', [3, 4].map((i) => ({ event_id: breakfast.event.id, attendee_id: b[0].id, saved_attendee_id: b[i].id })))

  await insert('audit_log', [{ user_id: ids.organiser, event_id: mixer.event.id, action: 'issue_access_link', target_id: you.id }])
  const links = {
    you: await accessLink(mixer.event.id, you, mixer.slug, mixer.event.directory_expires_at),
    friend: await accessLink(mixer.event.id, friend, mixer.slug, mixer.event.directory_expires_at),
    kwame: await accessLink(mixer.event.id, linked, mixer.slug, mixer.event.directory_expires_at),
    breakfast: await accessLink(breakfast.event.id, b[0], breakfast.slug, breakfast.event.directory_expires_at),
    design: await accessLink(design.event.id, design.attendees[0], design.slug, design.event.directory_expires_at),
  }

  const c = await counts()
  console.log('\nDEMO DATA CREATED')
  console.log(Object.entries(c).map(([k, v]) => `  ${k}: ${v}`).join('\n'))
  console.log(`\nSite: ${site}`)
  console.log(`Password for every demo login: ${password}`)
  console.log('\nLogins (sign in at /login):')
  for (const p of PEOPLE) console.log(`  ${`${p.key}@demo.scanme.test`.padEnd(32)} ${p.plan.padEnd(4)} ${p.name}${personal[p.key] ? `   personal page: ${site}/t/${personal[p.key]}` : ''}`)
  console.log('\nEvents (organiser: organiser@demo.scanme.test unless noted):')
  for (const [label, e] of [['LIVE NOW', mixer], ['ENDED 3h AGO', breakfast], ['NEXT WEEK', design], ['CLOSED', old], ['DRAFT (organiser2)', draft]] as const) console.log(`  ${label.padEnd(20)} ${String(e.event.name).padEnd(24)} join: ${site}/e/${e.slug}   access code: ${e.event.access_code}`)
  console.log('\nBe an attendee (open each in its own private window):')
  console.log(`  Summit, as ${you.display_name} (${you.tag}): ${links.you}`)
  console.log(`  Summit, as ${friend.display_name} (${friend.tag}): ${links.friend}`)
  console.log(`  Summit, as ${kwame.name} (F-099, linked to attendee@): ${links.kwame}`)
  console.log(`  Breakfast (ended), as ${b[0].display_name}: ${links.breakfast}`)
  console.log(`  Design Night (next week), as ${design.attendees[0].display_name}: ${links.design}`)
  console.log('\nTo remove everything: npm run demo:delete\n')
}

async function deleteAll(dry: boolean) {
  const before = await counts()
  console.log(Object.entries(before).map(([k, v]) => `  ${k}: ${v}`).join('\n'))
  if (dry) { console.log('Dry run: nothing deleted.'); return }
  if (!before.accounts) { console.log('No demo data found.'); return }
  await rows(`delete from users where id in (${DEMO_USERS})`)
  const after = await counts()
  console.log(Object.values(after).every((v) => v === 0) ? 'All demo data deleted.' : `Something was left: ${JSON.stringify(after)}`)
}

const command = process.argv[2]
if (command === 'seed') await seedAll()
else if (command === 'delete') await deleteAll(process.argv.includes('--dry'))
else { console.error('Usage: node scripts/demo-data.ts seed | delete [--dry]'); process.exit(1) }
