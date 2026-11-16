/**
 * Unit tests for the 500ms debounce and the duplicate-draft guard.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PREFLIGHT_DEBOUNCE_MS,
  analysisSignature,
  createDebouncer,
  createTierTracker,
} from '../src/core/debounce.js'
import { analyze } from '../src/core/heuristic.js'

/**
 * Deterministic timer host: scheduled callbacks only run when the test ticks.
 * @returns {{ host: { setTimeout: Function, clearTimeout: Function }, tick: (ms: number) => void, size: () => number }} fake clock.
 */
function fakeTimers() {
  let nextId = 1
  const pending = new Map()
  let now = 0
  return {
    host: {
      setTimeout(fn, ms) {
        const id = nextId++
        pending.set(id, { fn, at: now + ms })
        return id
      },
      clearTimeout(id) {
        pending.delete(id)
      },
    },
    tick(ms) {
      now += ms
      for (const [id, entry] of [...pending.entries()]) {
        if (entry.at <= now) {
          pending.delete(id)
          entry.fn()
        }
      }
    },
    size: () => pending.size,
  }
}

test('debounce keeps only the last scheduled call', () => {
  const timers = fakeTimers()
  const debouncer = createDebouncer(PREFLIGHT_DEBOUNCE_MS, timers.host)
  const calls = []
  debouncer.schedule(() => calls.push('a'))
  debouncer.schedule(() => calls.push('b'))
  debouncer.schedule(() => calls.push('c'))
  assert.equal(timers.size(), 1)
  timers.tick(PREFLIGHT_DEBOUNCE_MS)
  assert.deepEqual(calls, ['c'])
  assert.equal(debouncer.pending, false)
})

test('debounce does not fire before the window closes', () => {
  const timers = fakeTimers()
  const debouncer = createDebouncer(PREFLIGHT_DEBOUNCE_MS, timers.host)
  let fired = false
  debouncer.schedule(() => { fired = true })
  timers.tick(PREFLIGHT_DEBOUNCE_MS - 1)
  assert.equal(fired, false)
  timers.tick(1)
  assert.equal(fired, true)
})

test('cancel drops the pending call', () => {
  const timers = fakeTimers()
  const debouncer = createDebouncer(PREFLIGHT_DEBOUNCE_MS, timers.host)
  let fired = false
  debouncer.schedule(() => { fired = true })
  debouncer.cancel()
  assert.equal(debouncer.pending, false)
  timers.tick(PREFLIGHT_DEBOUNCE_MS)
  assert.equal(fired, false)
})

test('analysis signature ignores identical re-analysis but changes with the tier', () => {
  const base = analyze('然后 测试', 'standard')
  assert.equal(analysisSignature(base), analysisSignature(analyze('然后 测试', 'standard')))
  const high = analyze(`${'a'.repeat(600)} 然后 测试 ./a.ts ./b.ts ./c.ts ./d.ts`, 'standard')
  assert.notEqual(analysisSignature(base), analysisSignature(high))
})

test('tracker skips a duplicate draft and recomputes on change', () => {
  const tracker = createTierTracker('standard')
  const first = tracker.next('然后 测试')
  assert.equal(first.tier, 'medium')
  assert.equal(tracker.next('然后 测试'), null)
  assert.notEqual(tracker.next('然后 测试 '), null)
  const changed = tracker.next(`${'a'.repeat(600)} 然后 测试 部署`)
  assert.equal(changed.score, 3)
  assert.equal(changed.tier, 'high')
  tracker.reset()
  assert.notEqual(tracker.next('然后 测试'), null)
})

test('tracker recomputes when only the sensitivity changes', () => {
  const tracker = createTierTracker('standard')
  assert.equal(tracker.next('然后 测试').tier, 'medium')
  assert.equal(tracker.next('然后 测试', 'aggressive').tier, 'high')
})
