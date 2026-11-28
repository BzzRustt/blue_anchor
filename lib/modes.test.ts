import assert from 'node:assert/strict'
import test from 'node:test'
import { ALLOWED_SHOW, buildBlocks, countShownLinks, defaultConfig, isLinkField, MODE_INFO, FREE_SOCIAL_LINKS, MODE_KEYS, parseModeConfig, safeHttpUrl, visitorLinks, type OwnerProfile } from './modes.ts'
import { canAddSocialLink, planLimits } from './plans.ts'

const owner: OwnerProfile = {
  name: 'Amara Cole', image: 'https://x.test/a.png', bio: 'Designer', role: 'Designer', company: 'Fieldwork',
  instagram: '@amara.c', linkedin: 'https://linkedin.com/in/amara', tiktok: 'amara', youtube: 'javascript:alert(1)', spotify: null,
  website: 'https://amara.test', portfolioUrl: 'https://folio.test', interests: 'Typography', lookingFor: 'Clients', canOffer: 'Design',
}

test('five modes, three free and two Pro', () => {
  assert.deepEqual([...MODE_KEYS], ['basic', 'networking', 'incognito', 'creator', 'portfolio'])
  assert.deepEqual(MODE_KEYS.filter((k) => MODE_INFO[k].pro), ['creator', 'portfolio'])
})

test('parseModeConfig is total: garbage in, bounded defaults out', () => {
  for (const raw of [null, undefined, 'x', 42, [], { show: 'no', question: 7, creator: { links: 'no' } }]) {
    const cfg = parseModeConfig('basic', raw)
    assert.equal(cfg.question.prompt, 'What’s on your mind today?')
    assert.equal(cfg.question.type, 'open_text')
    assert.equal(cfg.creator.links.length, 0)
  }
})

test('incognito can never show anything about the owner', () => {
  assert.deepEqual([...ALLOWED_SHOW.incognito], [])
  const cfg = parseModeConfig('incognito', { show: { photo: true, bio: true, instagram: true } })
  assert.deepEqual(cfg.show, {})
  assert.deepEqual(visitorLinks('incognito', cfg, owner), [])
})

test('a field a mode does not allow is dropped even if posted', () => {
  const cfg = parseModeConfig('creator', { show: { company: true, role: true, instagram: true } })
  assert.equal(cfg.show.company, undefined)
  assert.equal(cfg.show.instagram, true)
})

test('only http(s) urls survive', () => {
  assert.equal(safeHttpUrl('javascript:alert(1)'), '')
  assert.equal(safeHttpUrl('data:text/html,hi'), '')
  assert.equal(safeHttpUrl('/relative'), '')
  assert.equal(safeHttpUrl('https://a.test/x'), 'https://a.test/x')
  const cfg = parseModeConfig('creator', { creator: { featured: { title: 't', url: 'javascript:x', imageUrl: 'data:x' }, links: [{ label: 'a', url: 'ftp://x' }] } })
  assert.equal(cfg.creator.featured.url, '')
  assert.equal(cfg.creator.links.length, 0)
})

test('creator links and portfolio projects are capped at three', () => {
  const links = Array.from({ length: 6 }, (_, i) => ({ label: `L${i}`, url: `https://x.test/${i}` }))
  assert.equal(parseModeConfig('creator', { creator: { links } }).creator.links.length, 3)
  const projects = Array.from({ length: 6 }, (_, i) => ({ title: `P${i}`, url: `https://x.test/${i}` }))
  assert.equal(parseModeConfig('portfolio', { portfolio: { projects } }).portfolio.projects.length, 3)
})

test('visitorLinks builds a stable ordered list and skips unsafe values', () => {
  const cfg = parseModeConfig('basic', { show: { instagram: true, linkedin: true, tiktok: true, youtube: true, website: true } })
  const links = visitorLinks('basic', cfg, owner)
  assert.deepEqual(links.map((l) => l.key), ['instagram', 'tiktok', 'linkedin', 'website']) // youtube was javascript:
  assert.equal(links[0].url, 'https://instagram.com/amara.c')
  assert.ok(links.every((l) => /^https?:\/\//.test(l.url)))
})

test('instagram handle cannot smuggle a path', () => {
  const links = visitorLinks('basic', defaultConfig('basic'), { ...owner, instagram: '../evil/path' })
  assert.equal(links.find((l) => l.key === 'instagram'), undefined)
})

test('blocks: a new basic Mode asks an open question and an optional message', () => {
  const blocks = buildBlocks('basic', defaultConfig('basic'))
  assert.deepEqual(blocks.map((b) => b.type), ['open_text', 'open_text'])
  assert.equal(blocks[0].config.prompt, 'What’s on your mind today?')
  assert.equal(blocks[1].required, false)
  // A saved rating question is kept as a rating.
  assert.equal(buildBlocks('basic', parseModeConfig('basic', { question: { on: true, type: 'scale', prompt: 'Rate me', max: 5 } }))[0].config.max, 5)
})

test('blocks: networking is a controlled introduction, not open chat', () => {
  const blocks = buildBlocks('networking', defaultConfig('networking'))
  assert.deepEqual(blocks.map((b) => b.type), ['open_text', 'open_text', 'contact'])
  assert.deepEqual(blocks.map((b) => b.required), [true, true, false])
})

test('blocks: single choice needs two options, switching off removes the block', () => {
  const one = parseModeConfig('basic', { question: { on: true, type: 'choice', prompt: 'Pick', options: ['a'] }, message: { on: false } })
  assert.equal(buildBlocks('basic', one).length, 0)
  const two = parseModeConfig('basic', { question: { on: true, type: 'choice', prompt: 'Pick', options: ['a', 'b'] }, message: { on: false } })
  assert.deepEqual(buildBlocks('basic', two).map((b) => b.type), ['choice'])
})

test('blocks: creator poll needs a prompt and two options', () => {
  const cfg = parseModeConfig('creator', { creator: { poll: { on: true, prompt: 'Which city?', options: ['Lagos', 'London'] }, collab: false } })
  assert.deepEqual(buildBlocks('creator', cfg).map((b) => b.type), ['choice'])
})

test('every Mode explains itself, and new Free defaults fit the one-link limit', () => {
  for (const key of MODE_KEYS) {
    assert.ok(MODE_INFO[key].bestFor.length > 10)
    assert.ok(MODE_INFO[key].rules.length >= 2)
  }
  for (const key of ['basic', 'networking', 'incognito'] as const) assert.ok(countShownLinks(defaultConfig(key).show) <= 1, key)
})

test('link fields are the accounts and sites, not photo, bio or role', () => {
  assert.equal(isLinkField('instagram'), true)
  assert.equal(isLinkField('website'), true)
  assert.equal(isLinkField('bio'), false)
  assert.equal(isLinkField('photo'), false)
})

test('Free may show one link, Pro as many as the Mode offers', () => {
  const show = { instagram: true, linkedin: true, tiktok: true }
  assert.equal(countShownLinks(show), 3)
  assert.equal(canAddSocialLink('free', countShownLinks(show) - 1).ok, false)
  assert.equal(canAddSocialLink('free', countShownLinks({ instagram: true }) - 1).ok, true)
  assert.equal(canAddSocialLink('pro', countShownLinks(show) - 1).ok, true)
})

test('visitor pages show one social link for Free owners, all for Pro, and the cap matches the plan table', () => {
  assert.equal(FREE_SOCIAL_LINKS, planLimits('free').socialLinks)
  const cfg = parseModeConfig('basic', { show: { instagram: true, linkedin: true, tiktok: true, website: true } })
  const free = visitorLinks('basic', cfg, { ...owner, plan: 'free' })
  assert.deepEqual(free.map((l) => l.key), ['instagram'])
  const pro = visitorLinks('basic', cfg, { ...owner, plan: 'pro' })
  assert.deepEqual(pro.map((l) => l.key), ['instagram', 'tiktok', 'linkedin', 'website'])
  // No plan given (older callers): unchanged behaviour.
  assert.equal(visitorLinks('basic', cfg, owner).length, 4)
})

test('the Free cap counts social links only, not Creator featured links', () => {
  const cfg = parseModeConfig('creator', { show: { instagram: true, tiktok: true }, creator: { featured: { title: 'EP', url: 'https://x.test/ep', button: 'Listen' }, links: [{ label: 'Shop', url: 'https://x.test/shop' }] } })
  const links = visitorLinks('creator', cfg, { ...owner, plan: 'free' })
  assert.deepEqual(links.map((l) => l.key), ['instagram', 'featured', 'link1'])
})
