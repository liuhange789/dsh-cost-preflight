/**
 * Debounce and de-duplication helpers for the input badge.
 *
 * The component re-renders on every keystroke, so recomputation is delayed
 * 500ms and a draft that was already analyzed is never analyzed twice.
 * Timers are injectable so the unit tests can drive a fake clock.
 *
 * @module dsh-cost-preflight/core/debounce
 */

import { analyze } from './heuristic.js'

/** Default debounce window in milliseconds. */
export const PREFLIGHT_DEBOUNCE_MS = 500

/**
 * Minimal timer surface used by the debouncer.
 * @typedef {{ setTimeout: (fn: () => void, ms: number) => unknown, clearTimeout: (handle: unknown) => void }} TimerHost
 */

/**
 * Create a trailing-edge debouncer.
 * @param {number} delay - milliseconds to wait after the last call.
 * @param {TimerHost} [timers] - timer host, defaults to the global one.
 * @returns {{ schedule: (fn: () => void) => void, cancel: () => void, readonly pending: boolean }} scheduler.
 */
export function createDebouncer(delay, timers = globalThis) {
  let handle = null
  return {
    schedule(fn) {
      if (handle !== null) timers.clearTimeout(handle)
      handle = timers.setTimeout(() => {
        handle = null
        fn()
      }, delay)
    },
    cancel() {
      if (handle !== null) {
        timers.clearTimeout(handle)
        handle = null
      }
    },
    get pending() {
      return handle !== null
    },
  }
}

/**
 * A stable identity for one analysis result: two analyses with the same
 * signature never need to re-render the badge.
 * @param {{ tier: string, score: number, sensitivity: string, pathCount: number, signals: { id: string }[] }} analysis - analysis result.
 * @returns {string} signature string.
 */
export function analysisSignature(analysis) {
  const signals = analysis.signals.map(signal => signal.id).join('+')
  return `${analysis.tier}|${analysis.score}|${analysis.sensitivity}|${analysis.pathCount}|${signals}`
}

/**
 * De-duplicate repeated drafts and repeated analysis results.
 *
 * `next()` returns `null` when the same text under the same sensitivity is
 * analyzed twice, which is the normal case while a render loop or a settings
 * notification re-runs the component.
 * @param {string} sensitivity - initial sensitivity profile.
 * @param {(text: string, sensitivity: string) => object} [run] - analyzer, injectable for tests.
 * @returns {{ next: (text: string, sensitivity?: string) => object | null, reset: () => void }} tracker.
 */
export function createTierTracker(sensitivity, run = analyze) {
  let lastKey = null
  return {
    next(text, nextSensitivity = sensitivity) {
      const key = `${nextSensitivity}\u0000${text}`
      if (key === lastKey) return null
      lastKey = key
      return run(text, nextSensitivity)
    },
    reset() {
      lastKey = null
    },
  }
}
