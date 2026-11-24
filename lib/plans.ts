/**
 * Plan limits — the single source of truth for every gated action.
 *
 * Mirrors docs/PRODUCT_SPEC.md section 7.1. If that table changes, change it here and
 * nowhere else: every server-side gate reads from this file.
 *
 * Two rules from the spec that must survive any future edit:
 *   1. Monthly response volume is never capped. Capping it punishes the owner for
 *      virality, which is the outcome the product exists to produce.
 *   2. Safety controls (block, report, kill switch) are never gated. They are absent
 *      from this file on purpose — there is no plan in which they are unavailable.
 */

export type Plan = 'free' | 'pro' | 'studio'

export type Mode =
  | 'basic'
  | 'incognito'
  | 'private'
  | 'networking'
  | 'creator'
  | 'open_dm'
  | 'event'
  | 'business'
  | 'portfolio'
  | 'recruiting'

export type BlockType =
  | 'scale'
  | 'choice'
  | 'open_text'
  | 'yes_no'
  | 'emoji'
  | 'contact'
  | 'image_ab'
  | 'link_out'
  | 'consent'

export interface PlanLimits {
  /** Distinct printed QR codes. */
  codes: number
  /** Campaigns that may be live at once. Also bounded by one live campaign per code. */
  liveCampaigns: number
  savedCampaigns: number
  blocksPerCampaign: number
  /** Days of response history visible. Infinity means unlimited. */
  historyDays: number
  socialLinks: number
  seats: number
  reply: boolean
  csvExport: boolean
  scheduling: boolean
  customTheme: boolean
  /** Apply a theme bought in the marketplace. */
  marketplaceThemes: boolean
  /** List a theme for sale. */
  sellThemes: boolean
  removeBadge: boolean
  customSlug: boolean
  customDomain: boolean
  webhooks: boolean

  /* ── Events layer ──────────────────────────────────────────────────────────
   * Metered separately from the personal product: organisers pay per event, and
   * an event code must never consume someone's personal code quota.
   */
  /** Events an organiser may run per calendar year. */
  eventsPerYear: number
  /** Attendees a single event may hold. The headline number organisers price on. */
  attendeesPerEvent: number
  /** Export attendees and the post-event report as CSV. */
  eventReportExport: boolean
  /** Organiser-defined role letters (F/I/M/…) rather than plain numbers. */
  eventRoleLetters: boolean

  /** Download a Photo-style QR from QR Studio. Classic download and validation stay free. */
  photoQr: boolean
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    codes: 1,
    liveCampaigns: 1,
    savedCampaigns: 3,
    blocksPerCampaign: 2,
    historyDays: 30,
    socialLinks: 1,
    seats: 1,
    reply: false,
    csvExport: false,
    scheduling: false,
    customTheme: false,
    marketplaceThemes: false,
    sellThemes: false,
    removeBadge: false,
    customSlug: false,
    customDomain: false,
    webhooks: false,
    eventsPerYear: 2,
    attendeesPerEvent: 50,
    eventReportExport: false,
    eventRoleLetters: false,
    photoQr: false,
  },
  pro: {
    codes: 3,
    liveCampaigns: 3,
    savedCampaigns: Infinity,
    blocksPerCampaign: 5,
    historyDays: Infinity,
    socialLinks: Infinity,
    seats: 1,
    reply: true,
    csvExport: true,
    scheduling: true,
    customTheme: true,
    marketplaceThemes: true,
    sellThemes: true,
    removeBadge: true,
    customSlug: true,
    customDomain: false,
    webhooks: false,
    eventsPerYear: 12,
    attendeesPerEvent: 150,
    eventReportExport: true,
    eventRoleLetters: true,
    photoQr: true,
  },
  studio: {
    codes: 25,
    liveCampaigns: 25,
    savedCampaigns: Infinity,
    blocksPerCampaign: 5,
    historyDays: Infinity,
    socialLinks: Infinity,
    seats: 3,
    reply: true,
    csvExport: true,
    scheduling: true,
    customTheme: true,
    marketplaceThemes: true,
    sellThemes: true,
    removeBadge: true,
    customSlug: true,
    customDomain: true,
    webhooks: true,
    eventsPerYear: Infinity,
    attendeesPerEvent: 500,
    eventReportExport: true,
    eventRoleLetters: true,
    photoQr: true,
  },
}

/**
 * Blocks that require a paid plan. Only Image A/B is gated (spec section 4).
 *
 * `consent` is deliberately absent: it is the lawful basis for email and phone capture,
 * and gating a compliance control behind payment is the same mistake as gating safety.
 */
const BLOCK_MIN_PLAN: Partial<Record<BlockType, Plan>> = {
  image_ab: 'pro',
}

const PLAN_RANK: Record<Plan, number> = { free: 0, pro: 1, studio: 2 }

export type Gate = { ok: true } | { ok: false; reason: string; upgradeTo?: Plan }

const allow: Gate = { ok: true }
const deny = (reason: string, upgradeTo?: Plan): Gate => ({ ok: false, reason, upgradeTo })

export function planLimits(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan]
}

export function planAtLeast(plan: Plan, required: Plan): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[required]
}

/** Can this plan add another block to a campaign that already has `currentCount`? */
export function canAddBlock(plan: Plan, type: BlockType, currentCount: number): Gate {
  const required = BLOCK_MIN_PLAN[type]
  if (required && !planAtLeast(plan, required)) {
    return deny(`The ${type} block needs the ${required} plan.`, required)
  }

  const max = planLimits(plan).blocksPerCampaign
  if (currentCount >= max) {
    return deny(
      `The ${plan} plan allows ${max} question${max === 1 ? '' : 's'} per campaign.`,
      plan === 'free' ? 'pro' : undefined
    )
  }

  return allow
}

/** Can this plan publish another campaign, given how many are already live? */
export function canGoLive(plan: Plan, currentLiveCount: number): Gate {
  const max = planLimits(plan).liveCampaigns
  if (currentLiveCount >= max) {
    return deny(
      `The ${plan} plan allows ${max} live campaign${max === 1 ? '' : 's'}.`,
      plan === 'free' ? 'pro' : plan === 'pro' ? 'studio' : undefined
    )
  }
  return allow
}

export function canSaveCampaign(plan: Plan, currentSavedCount: number): Gate {
  const max = planLimits(plan).savedCampaigns
  if (currentSavedCount >= max) {
    return deny(`The ${plan} plan allows ${max} saved campaigns.`, 'pro')
  }
  return allow
}

export function canCreateCode(plan: Plan, currentCodeCount: number): Gate {
  const max = planLimits(plan).codes
  if (currentCodeCount >= max) {
    return deny(
      `The ${plan} plan allows ${max} code${max === 1 ? '' : 's'}.`,
      plan === 'free' ? 'pro' : plan === 'pro' ? 'studio' : undefined
    )
  }
  return allow
}

export function canReply(plan: Plan): Gate {
  return planLimits(plan).reply ? allow : deny('Replying needs the pro plan.', 'pro')
}

export function canUsePhotoQr(plan: Plan): Gate {
  return planLimits(plan).photoQr ? allow : deny('Photo QR needs the pro plan.', 'pro')
}

export function canAddSocialLink(plan: Plan, currentCount: number): Gate {
  const max = planLimits(plan).socialLinks
  if (currentCount >= max) {
    return deny(
      `The ${plan} plan allows ${max} social link${max === 1 ? '' : 's'}.`,
      'pro'
    )
  }
  return allow
}

/**
 * Open DM is the only mode with a non-plan gate: an unverified date of birth cannot
 * enable it (spec section 8). Every mode is otherwise available on every plan —
 * Portfolio and Recruiting run as their shallower parent mode below Studio.
 */
export function canEnableMode(mode: Mode, owner: { dobVerified: boolean }): Gate {
  if (mode === 'open_dm' && !owner.dobVerified) {
    return deny('Confirm your date of birth before turning on Open DM.')
  }
  return allow
}

/**
 * The five personal Modes (spec 9.5): Basic, Networking and Incognito are free; Creator and
 * Portfolio need Pro. Free users may PREVIEW a Pro Mode, but cannot save or activate it.
 * The one place a Mode's price tier is decided.
 */
export function canActivateMode(plan: Plan, mode: string): Gate {
  if ((mode === 'creator' || mode === 'portfolio') && !planAtLeast(plan, 'pro')) {
    return deny('Creator and Portfolio are Pro Modes. You can preview them, but activating one needs Pro.', 'pro')
  }
  return allow
}

/**
 * Oldest response timestamp this plan may read, or null when history is unlimited.
 *
 * Current behavior: hides older responses rather than deleting them. A retention job that
 * actually purges past the cutoff is the upgrade path when the spec's retention promise
 * has to be provable rather than merely honoured in the UI.
 */
export function historyCutoff(plan: Plan, now: Date = new Date()): Date | null {
  const days = planLimits(plan).historyDays
  if (!Number.isFinite(days)) return null
  return new Date(now.getTime() - days * 86_400_000)
}

/** Monthly response volume is never capped. Kept as a function so it reads as a decision. */
export function responseVolumeLimit(): null {
  return null
}

/* ── Events layer gates ──────────────────────────────────────────────────────── */

export function canCreateEvent(plan: Plan, eventsThisYear: number): Gate {
  const max = planLimits(plan).eventsPerYear
  if (eventsThisYear >= max) {
    return deny(
      `The ${plan} plan allows ${max} event${max === 1 ? '' : 's'} per year.`,
      plan === 'free' ? 'pro' : plan === 'pro' ? 'studio' : undefined
    )
  }
  return allow
}

/**
 * Attendee headroom for one event.
 *
 * This is the number organisers price on, so the message names the ceiling rather than
 * just refusing. Note it caps attendees an event may *hold* — never the lookups,
 * searches or connections they generate, for the same reason response volume is
 * uncapped: never bill someone for the product working.
 */
export function canAddAttendee(plan: Plan, currentAttendeeCount: number, eventCapacity?: number | null): Gate {
  // A purchased per-event capacity (M4) wins; events created before it fall back to the plan.
  const max = eventCapacity ?? planLimits(plan).attendeesPerEvent
  if (currentAttendeeCount >= max) {
    return deny(
      `The ${plan} plan allows ${max} attendees per event.`,
      plan === 'free' ? 'pro' : plan === 'pro' ? 'studio' : undefined
    )
  }
  return allow
}

export function canUseRoleLetters(plan: Plan): Gate {
  return planLimits(plan).eventRoleLetters
    ? allow
    : deny('Role letters on badges need the pro plan.', 'pro')
}

export function canExportEventReport(plan: Plan): Gate {
  return planLimits(plan).eventReportExport
    ? allow
    : deny('Exporting the event report needs the pro plan.', 'pro')
}

/**
 * When an event's directory goes dark: the end of the event plus 48 hours.
 *
 * Attendees shared for a room, not forever. The window is also the conversion moment —
 * claiming an account is what keeps the connections someone made.
 */
export const DIRECTORY_WINDOW_HOURS = 48

export function directoryExpiresAt(endsAt: Date): Date {
  return new Date(endsAt.getTime() + DIRECTORY_WINDOW_HOURS * 3_600_000)
}

/** Lookups, searches, connections and reactions are never capped. */
export function eventActivityLimit(): null {
  return null
}
