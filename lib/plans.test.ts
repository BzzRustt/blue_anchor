/**
 * Run with: npm run test
 * (node --test, no framework — Node 24 strips the types itself)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DIRECTORY_WINDOW_HOURS,
  PLAN_LIMITS,
  canAddAttendee,
  canAddBlock,
  canAddSocialLink,
  canCreateCode,
  canCreateEvent,
  canEnableMode,
  canExportEventReport,
  canGoLive,
  canReply,
  canUsePhotoQr,
  canUseRoleLetters,
  directoryExpiresAt,
  eventActivityLimit,
  canActivateMode,
  historyCutoff,
  planAtLeast,
  responseVolumeLimit,
} from './plans.ts'

test('free plan gates match the spec table', () => {
  const free = PLAN_LIMITS.free
  assert.equal(free.codes, 1)
  assert.equal(free.liveCampaigns, 1)
  assert.equal(free.blocksPerCampaign, 2)
  assert.equal(free.historyDays, 30)
  assert.equal(free.socialLinks, 1)
  assert.equal(free.reply, false)
})

test('response volume is never capped on any plan', () => {
  assert.equal(responseVolumeLimit(), null)
})

test('block count is capped per plan', () => {
  assert.equal(canAddBlock('free', 'scale', 0).ok, true)
  assert.equal(canAddBlock('free', 'scale', 1).ok, true)
  assert.equal(canAddBlock('free', 'scale', 2).ok, false, 'free stops at 2 blocks')
  assert.equal(canAddBlock('pro', 'scale', 4).ok, true)
  assert.equal(canAddBlock('pro', 'scale', 5).ok, false, 'pro stops at 5 blocks')
})

test('image A/B needs pro, and says so', () => {
  const gate = canAddBlock('free', 'image_ab', 0)
  assert.equal(gate.ok, false)
  assert.equal(gate.ok === false && gate.upgradeTo, 'pro')
  assert.equal(canAddBlock('pro', 'image_ab', 0).ok, true)
  assert.equal(canAddBlock('studio', 'image_ab', 0).ok, true)
})

test('consent block is never gated — it is the lawful basis for contact capture', () => {
  assert.equal(canAddBlock('free', 'consent', 0).ok, true)
})

test('live campaign count is capped per plan', () => {
  assert.equal(canGoLive('free', 0).ok, true)
  assert.equal(canGoLive('free', 1).ok, false)
  assert.equal(canGoLive('pro', 2).ok, true)
  assert.equal(canGoLive('pro', 3).ok, false)
  assert.equal(canGoLive('studio', 24).ok, true)
  assert.equal(canGoLive('studio', 25).ok, false)
})

test('codes are capped per plan', () => {
  assert.equal(canCreateCode('free', 1).ok, false)
  assert.equal(canCreateCode('pro', 2).ok, true)
  assert.equal(canCreateCode('studio', 25).ok, false)
})

test('reply is the free plan upgrade lever', () => {
  assert.equal(canReply('free').ok, false)
  assert.equal(canReply('pro').ok, true)
  assert.equal(canReply('studio').ok, true)
})

test('free plan allows exactly one social link', () => {
  assert.equal(canAddSocialLink('free', 0).ok, true)
  assert.equal(canAddSocialLink('free', 1).ok, false)
  assert.equal(canAddSocialLink('pro', 99).ok, true)
})

test('open DM requires a verified date of birth, on every plan', () => {
  assert.equal(canEnableMode('open_dm', { dobVerified: false }).ok, false)
  assert.equal(canEnableMode('open_dm', { dobVerified: true }).ok, true)
  assert.equal(canEnableMode('private', { dobVerified: false }).ok, true)
})

test('every mode is selectable regardless of plan', () => {
  const modes = [
    'private',
    'networking',
    'creator',
    'event',
    'business',
    'portfolio',
    'recruiting',
  ] as const
  for (const mode of modes) {
    assert.equal(canEnableMode(mode, { dobVerified: false }).ok, true, `${mode} should be open`)
  }
})

test('history cutoff is 30 days on free and absent above it', () => {
  const now = new Date('2026-10-10T12:00:00Z')
  const cutoff = historyCutoff('free', now)
  assert.ok(cutoff instanceof Date)
  assert.equal(cutoff.toISOString(), '2026-09-10T12:00:00.000Z')
  assert.equal(historyCutoff('pro', now), null)
  assert.equal(historyCutoff('studio', now), null)
})

test('plan ranking is ordered', () => {
  assert.equal(planAtLeast('free', 'pro'), false)
  assert.equal(planAtLeast('pro', 'pro'), true)
  assert.equal(planAtLeast('studio', 'pro'), true)
})

/* ── Events layer ───────────────────────────────────────────────────────────── */

test('events per year are capped per plan', () => {
  assert.equal(canCreateEvent('free', 1).ok, true)
  assert.equal(canCreateEvent('free', 2).ok, false, 'free stops at 2 events a year')
  assert.equal(canCreateEvent('pro', 11).ok, true)
  assert.equal(canCreateEvent('pro', 12).ok, false)
  assert.equal(canCreateEvent('studio', 999).ok, true, 'studio is unlimited')
})

test('attendees per event are capped per plan, and the message names the ceiling', () => {
  assert.equal(canAddAttendee('free', 49).ok, true)
  const gate = canAddAttendee('free', 50)
  assert.equal(gate.ok, false)
  assert.match(gate.ok === false ? gate.reason : '', /50 attendees/)
  assert.equal(gate.ok === false && gate.upgradeTo, 'pro')
  assert.equal(canAddAttendee('pro', 149).ok, true)
  assert.equal(canAddAttendee('pro', 150).ok, false)
  assert.equal(canAddAttendee('studio', 499).ok, true)
  assert.equal(canAddAttendee('studio', 500).ok, false)
})

test('event activity is never capped — never bill for the product working', () => {
  assert.equal(eventActivityLimit(), null)
})

test('role letters and report export are pro features', () => {
  assert.equal(canUseRoleLetters('free').ok, false)
  assert.equal(canUseRoleLetters('pro').ok, true)
  assert.equal(canExportEventReport('free').ok, false)
  assert.equal(canExportEventReport('studio').ok, true)
})

test('the directory window is 48 hours past the end of the event', () => {
  assert.equal(DIRECTORY_WINDOW_HOURS, 48)
  const ends = new Date('2026-11-20T21:00:00Z')
  assert.equal(directoryExpiresAt(ends).toISOString(), '2026-11-22T21:00:00.000Z')
})

test('free tier can still run a real small event end to end', () => {
  // A free organiser must be able to run one 50-person meetup without paying,
  // because small meetups are the distribution channel.
  assert.equal(canCreateEvent('free', 0).ok, true)
  assert.equal(canAddAttendee('free', 0).ok, true)
  assert.equal(canAddAttendee('free', 49).ok, true)
})

test('Pro Modes need Pro; free Modes are open to everyone', () => {
  for (const mode of ['basic', 'networking', 'incognito']) assert.equal(canActivateMode('free', mode).ok, true)
  for (const mode of ['creator', 'portfolio']) {
    const gate = canActivateMode('free', mode)
    assert.equal(gate.ok, false)
    assert.equal(canActivateMode('pro', mode).ok, true)
    assert.equal(canActivateMode('studio', mode).ok, true)
  }
})

test('Photo QR download needs pro; classic QR is not gated here', () => {
  const free = canUsePhotoQr('free')
  assert.equal(free.ok, false)
  assert.equal(!free.ok && free.upgradeTo, 'pro')
  assert.equal(canUsePhotoQr('pro').ok, true)
  assert.equal(canUsePhotoQr('studio').ok, true)
})
