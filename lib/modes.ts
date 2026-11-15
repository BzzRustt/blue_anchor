/**
 * The five personal Modes (spec: Basic, Networking, Incognito free; Creator, Portfolio Pro).
 *
 * A Mode is one `campaigns` row per user per mode: `config` holds what to show and the extras,
 * and `question_blocks` holds what visitors are asked (rebuilt from config on every save).
 * Everything here is pure so it can be unit tested without a database.
 */

export const MODE_KEYS = ['basic', 'networking', 'incognito', 'creator', 'portfolio'] as const
export type ModeKey = (typeof MODE_KEYS)[number]

export const isModeKey = (value: string): value is ModeKey => (MODE_KEYS as readonly string[]).includes(value)

export const MODE_INFO: Record<ModeKey, { name: string; blurb: string; pro: boolean; sees: string; does: string }> = {
  basic: { name: 'Basic', blurb: 'A simple introduction with one casual question.', pro: false, sees: 'Your name, photo, short bio and the social links you choose.', does: 'Answer one question and leave an optional message.' },
  networking: { name: 'Networking', blurb: 'A professional introduction people can reply to.', pro: false, sees: 'Your role, company, bio, what you look for and can offer, and professional links.', does: 'Send you a short introduction with an optional way to reach them.' },
  incognito: { name: 'Incognito', blurb: 'Collect answers without showing who you are.', pro: false, sees: 'Nothing about you: no name, photo, bio, company or accounts.', does: 'Answer one question and leave an optional message.' },
  creator: { name: 'Creator', blurb: 'Point people to what you are making.', pro: true, sees: 'Your photo, bio, social buttons, one featured item and up to three links.', does: 'Open your featured item, follow your links, vote in a poll or send a collaboration enquiry.' },
  portfolio: { name: 'Portfolio', blurb: 'Show your work and invite enquiries.', pro: true, sees: 'Your introduction and up to three projects, in a Professional or Visual layout.', does: 'Open a project or send you an enquiry.' },
}

export const SHOW_FIELDS = ['photo', 'bio', 'role', 'company', 'interests', 'looking', 'offer', 'instagram', 'linkedin', 'tiktok', 'youtube', 'spotify', 'website', 'portfolio'] as const
export type ShowField = (typeof SHOW_FIELDS)[number]

export const SHOW_LABELS: Record<ShowField, string> = {
  photo: 'Photo', bio: 'Short bio', role: 'Role', company: 'Company', interests: 'Interests', looking: 'What I am looking for', offer: 'What I can offer',
  instagram: 'Instagram', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', spotify: 'Spotify', website: 'Website', portfolio: 'Portfolio link',
}

/** Which profile fields each Mode may show. Incognito may show none: that is the point. */
export const ALLOWED_SHOW: Record<ModeKey, readonly ShowField[]> = {
  basic: ['photo', 'bio', 'instagram', 'linkedin', 'tiktok', 'youtube', 'spotify', 'website'],
  networking: ['photo', 'bio', 'role', 'company', 'interests', 'looking', 'offer', 'linkedin', 'website'],
  incognito: [],
  creator: ['photo', 'bio', 'instagram', 'tiktok', 'youtube', 'spotify', 'website'],
  portfolio: ['photo', 'bio', 'role', 'company', 'linkedin', 'website', 'portfolio'],
}

const DEFAULT_SHOW: Record<ModeKey, readonly ShowField[]> = {
  basic: ['photo', 'bio', 'instagram', 'linkedin'],
  networking: ['photo', 'role', 'company', 'bio', 'looking', 'offer', 'linkedin'],
  incognito: [],
  creator: ['photo', 'bio', 'instagram', 'tiktok', 'youtube', 'spotify'],
  portfolio: ['photo', 'bio', 'role', 'company', 'linkedin', 'portfolio'],
}

export type QuestionType = 'scale' | 'yes_no' | 'choice' | 'open_text'
export const QUESTION_TYPES: Array<{ value: QuestionType; label: string }> = [
  { value: 'scale', label: 'Rating' },
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'choice', label: 'Single choice' },
  { value: 'open_text', label: 'Short text' },
]

export type ModeConfig = {
  show: Partial<Record<ShowField, boolean>>
  question: { on: boolean; type: QuestionType; prompt: string; options: string[]; max: 5 | 10 }
  message: { on: boolean; prompt: string; required: boolean }
  creator: {
    featured: { title: string; description: string; url: string; imageUrl: string; button: string }
    links: Array<{ label: string; url: string }>
    poll: { on: boolean; prompt: string; options: string[] }
    collab: boolean
  }
  portfolio: { style: 'professional' | 'visual'; intro: string; projects: Array<{ title: string; description: string; url: string; imageUrl: string }>; enquiry: boolean }
}

const str = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {})

/** http(s) only. Anything else (javascript:, data:, relative) becomes empty, so it can never be linked. */
export function safeHttpUrl(value: unknown): string {
  const text = str(value, 300)
  if (!text) return ''
  try { const url = new URL(text); return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '' } catch { return '' }
}

const options = (value: unknown, limit = 6): string[] => (Array.isArray(value) ? value : []).map((item) => str(item, 40)).filter(Boolean).slice(0, limit)

/** Turns whatever is stored (or posted) into a complete, bounded config for this Mode. Never throws. */
export function parseModeConfig(mode: ModeKey, raw: unknown): ModeConfig {
  const input = obj(raw)
  const showInput = obj(input.show)
  const allowed = ALLOWED_SHOW[mode]
  const show: ModeConfig['show'] = {}
  for (const field of allowed) show[field] = bool(showInput[field], DEFAULT_SHOW[mode].includes(field))

  const q = obj(input.question)
  const qDefaults = mode === 'incognito'
    ? { on: true, prompt: 'What do you think of my outfit? Rate it from 1 to 5.' }
    : mode === 'basic' ? { on: true, prompt: 'Rate my drip from 1 to 5' } : { on: false, prompt: '' }
  const type = (['scale', 'yes_no', 'choice', 'open_text'] as const).find((t) => t === q.type) ?? 'scale'
  const m = obj(input.message)
  const featured = obj(obj(input.creator).featured)
  const poll = obj(obj(input.creator).poll)
  const pf = obj(input.portfolio)

  return {
    show,
    question: {
      on: bool(q.on, qDefaults.on),
      type,
      prompt: str(q.prompt, 120) || qDefaults.prompt,
      options: options(q.options),
      max: q.max === 10 ? 10 : 5,
    },
    message: { on: bool(m.on, mode === 'basic' || mode === 'incognito'), prompt: str(m.prompt, 120) || 'Leave me a message (optional)', required: bool(m.required, false) },
    creator: {
      featured: { title: str(featured.title, 80), description: str(featured.description, 160), url: safeHttpUrl(featured.url), imageUrl: safeHttpUrl(featured.imageUrl), button: str(featured.button, 30) || 'Open' },
      links: (Array.isArray(obj(input.creator).links) ? (obj(input.creator).links as unknown[]) : []).map((item) => ({ label: str(obj(item).label, 40), url: safeHttpUrl(obj(item).url) })).filter((item) => item.label && item.url).slice(0, 3),
      poll: { on: bool(poll.on, false), prompt: str(poll.prompt, 120), options: options(poll.options, 4) },
      collab: bool(obj(input.creator).collab, true),
    },
    portfolio: {
      style: pf.style === 'visual' ? 'visual' : 'professional',
      intro: str(pf.intro, 200),
      projects: (Array.isArray(pf.projects) ? (pf.projects as unknown[]) : []).map((item) => ({ title: str(obj(item).title, 80), description: str(obj(item).description, 160), url: safeHttpUrl(obj(item).url), imageUrl: safeHttpUrl(obj(item).imageUrl) })).filter((item) => item.title).slice(0, 3),
      enquiry: bool(pf.enquiry, true),
    },
  }
}

export const defaultConfig = (mode: ModeKey) => parseModeConfig(mode, {})

export type BlockSpec = { type: 'scale' | 'yes_no' | 'choice' | 'open_text' | 'contact'; required: boolean; config: { prompt: string; min?: number; max?: number; options?: string[]; placeholder?: string } }

/** What visitors are asked, derived from the config. The page and the response check both read these rows. */
export function buildBlocks(mode: ModeKey, cfg: ModeConfig): BlockSpec[] {
  const blocks: BlockSpec[] = []
  const question = (): BlockSpec | null => {
    const q = cfg.question
    if (!q.on || !q.prompt) return null
    if (q.type === 'scale') return { type: 'scale', required: false, config: { prompt: q.prompt, min: 1, max: q.max } }
    if (q.type === 'yes_no') return { type: 'yes_no', required: false, config: { prompt: q.prompt } }
    if (q.type === 'choice') return q.options.length >= 2 ? { type: 'choice', required: false, config: { prompt: q.prompt, options: q.options } } : null
    return { type: 'open_text', required: false, config: { prompt: q.prompt, placeholder: 'Write a short answer' } }
  }
  const message = (): BlockSpec | null => (cfg.message.on ? { type: 'open_text', required: cfg.message.required, config: { prompt: cfg.message.prompt, placeholder: 'Write a short message' } } : null)

  if (mode === 'networking') {
    blocks.push({ type: 'open_text', required: true, config: { prompt: 'Your name', placeholder: 'So they know who you are' } })
    blocks.push({ type: 'open_text', required: true, config: { prompt: 'Write a short introduction', placeholder: 'Who you are and why you would like to connect' } })
    blocks.push({ type: 'contact', required: false, config: { prompt: 'Email, LinkedIn or another way to reach you (optional)', placeholder: 'Only shared with this person' } })
  } else if (mode === 'creator') {
    if (cfg.creator.poll.on && cfg.creator.poll.prompt && cfg.creator.poll.options.length >= 2) blocks.push({ type: 'choice', required: false, config: { prompt: cfg.creator.poll.prompt, options: cfg.creator.poll.options } })
    if (cfg.creator.collab) blocks.push({ type: 'open_text', required: false, config: { prompt: 'Collaboration or enquiry', placeholder: 'Tell me what you have in mind' } })
  } else if (mode === 'portfolio') {
    if (cfg.portfolio.enquiry) {
      blocks.push({ type: 'open_text', required: true, config: { prompt: 'Tell them about your project', placeholder: 'What do you need and when?' } })
      blocks.push({ type: 'contact', required: false, config: { prompt: 'Email or another way to reach you', placeholder: 'Only shared with this person' } })
    }
  } else {
    const q = question(); if (q) blocks.push(q)
    const m = message(); if (m) blocks.push(m)
  }
  return blocks
}

export type OwnerProfile = {
  name: string; image: string | null; bio: string | null; role: string | null; company: string | null
  instagram: string | null; linkedin: string | null; tiktok: string | null; youtube: string | null; spotify: string | null
  website: string | null; portfolioUrl: string | null; interests: string | null; lookingFor: string | null; canOffer: string | null
}

const handle = (value: string | null) => { const v = (value ?? '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?(instagram|tiktok)\.com\/@?/i, '').replace(/\/$/, ''); return /^[A-Za-z0-9._]{1,30}$/.test(v) ? v : '' }

export type VisitorLink = { key: string; label: string; url: string; kind: 'social' | 'featured' | 'link' | 'project' }

/**
 * Every outbound link on a visitor page, in a fixed order. Links are NOT written into the page as
 * raw addresses: the page links to /api/t/<code>/out?i=<index>, and that route recomputes this same
 * list on the server, records the click, and redirects. So the redirect target can never be chosen
 * by a visitor (no open redirect), and clicks are counted.
 */
export function visitorLinks(mode: ModeKey, cfg: ModeConfig, owner: OwnerProfile): VisitorLink[] {
  if (mode === 'incognito') return []
  const on = (field: ShowField) => cfg.show[field] === true
  const links: VisitorLink[] = []
  const ig = handle(owner.instagram); if (on('instagram') && ig) links.push({ key: 'instagram', label: 'Instagram', url: `https://instagram.com/${ig}`, kind: 'social' })
  const tt = handle(owner.tiktok); if (on('tiktok') && tt) links.push({ key: 'tiktok', label: 'TikTok', url: `https://tiktok.com/@${tt}`, kind: 'social' })
  for (const [field, label, value] of [['linkedin', 'LinkedIn', owner.linkedin], ['youtube', 'YouTube', owner.youtube], ['spotify', 'Spotify', owner.spotify], ['website', 'Website', owner.website], ['portfolio', 'Portfolio', owner.portfolioUrl]] as const) {
    const url = safeHttpUrl(value); if (on(field) && url) links.push({ key: field, label, url, kind: 'social' })
  }
  if (mode === 'creator') {
    if (cfg.creator.featured.url) links.push({ key: 'featured', label: cfg.creator.featured.button, url: cfg.creator.featured.url, kind: 'featured' })
    cfg.creator.links.forEach((link, index) => links.push({ key: `link${index + 1}`, label: link.label, url: link.url, kind: 'link' }))
  }
  if (mode === 'portfolio') cfg.portfolio.projects.forEach((project, index) => { if (project.url) links.push({ key: `project${index + 1}`, label: project.title, url: project.url, kind: 'project' }) })
  return links
}
