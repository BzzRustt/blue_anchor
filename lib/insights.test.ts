import assert from 'node:assert/strict'
import test from 'node:test'
import { asRange, busiestDay, percentChange, rate } from './insights-math.ts'

test('range is 7 unless 30 is asked for', () => {
  assert.equal(asRange('30'), 30)
  assert.equal(asRange('7'), 7)
  assert.equal(asRange('999'), 7)
  assert.equal(asRange(undefined), 7)
})

test('percent change and response rate never divide by zero', () => {
  assert.equal(percentChange(148, 120), 23)
  assert.equal(percentChange(5, 0), null)
  assert.equal(percentChange(0, 10), -100)
  assert.equal(rate(24, 148), 16)
  assert.equal(rate(1, 0), null)
})

test('busiest day is the highest visit count, or none when quiet', () => {
  const days = [{ key: 'a', label: 'Mon', visits: 3, responses: 0 }, { key: 'b', label: 'Tue', visits: 9, responses: 2 }, { key: 'c', label: 'Wed', visits: 9, responses: 5 }]
  assert.equal(busiestDay(days)?.label, 'Tue')
  assert.equal(busiestDay([{ key: 'a', label: 'Mon', visits: 0, responses: 0 }]), null)
  assert.equal(busiestDay([]), null)
})
