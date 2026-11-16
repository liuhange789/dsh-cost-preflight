/**
 * Unit tests for the tier heuristic: every rule, the tier cut lines, and the
 * invalid-value fallbacks. Run with `node --test test/`.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LONG_MESSAGE_CHARS,
  analyze,
  countFilePaths,
  normalizeConfig,
  normalizeSensitivity,
} from '../src/core/heuristic.js'

test('empty draft is the lowest tier with no signals', () => {
  const result = analyze('', 'standard')
  assert.equal(result.tier, 'low')
  assert.equal(result.score, 0)
  assert.deepEqual(result.signals, [])
  assert.equal(result.tierLabel, '低')
})

test('a message over 500 characters alone is one point: low under standard', () => {
  const text = 'a'.repeat(LONG_MESSAGE_CHARS + 1)
  const result = analyze(text, 'standard')
  assert.equal(result.score, 1)
  assert.equal(result.tier, 'low')
  assert.ok(result.signals.some(signal => signal.id === 'long-message'))
  assert.equal(result.characterCount, LONG_MESSAGE_CHARS + 1)
})

test('exactly 500 characters is not long', () => {
  const result = analyze('a'.repeat(LONG_MESSAGE_CHARS), 'standard')
  assert.equal(result.score, 0)
  assert.equal(result.signals.length, 0)
})

test('length plus one multi-step keyword reaches medium', () => {
  const result = analyze(`${'a'.repeat(LONG_MESSAGE_CHARS + 1)} 然后继续`, 'standard')
  assert.equal(result.score, 2)
  assert.equal(result.tier, 'medium')
  assert.ok(result.signals.some(signal => signal.id === 'multi-step'))
})

test('every multi-step keyword is recognized', () => {
  for (const keyword of ['循环', '遍历', '逐个', '所有', '批量', '接着', '然后', '之后']) {
    const result = analyze(`请${keyword}处理`, 'standard')
    assert.equal(result.score, 1, keyword)
    assert.equal(result.signals[0].id, 'multi-step')
  }
})

test('more than three file paths add a point; exactly three do not', () => {
  const three = analyze('改 ./a.ts ./b.ts ./c.ts', 'standard')
  assert.equal(three.score, 0)
  assert.equal(three.pathCount, 3)

  const four = analyze('改 ./a.ts ./b.ts ./c.ts ./d.ts', 'standard')
  assert.equal(four.score, 1)
  assert.equal(four.pathCount, 4)
  assert.ok(four.signals.some(signal => signal.id === 'many-paths'))
})

test('Windows, absolute, home and Chinese paths all count once', () => {
  const text = '看 C:\\repo\\src\\a.ts、/home/u/b.py、~/c.md、./中文目录/说明.txt，再看 ./a.ts 和 ./a.ts'
  assert.equal(countFilePaths(text), 5)
})

test('URLs, slash dates and bare slash words are not file paths', () => {
  const text = '参考 https://example.com/a/b/c 和 2026/11/16 以及 a/b'
  assert.equal(countFilePaths(text), 0)
})

test('verification keywords add one point each-message', () => {
  for (const keyword of ['测试', '验证', '部署']) {
    const result = analyze(`帮我${keyword}一下`, 'standard')
    assert.equal(result.score, 1, keyword)
    assert.equal(result.signals[0].id, 'verification')
  }
})

test('all four signals reach the high tier under standard', () => {
  const text = `${'a'.repeat(LONG_MESSAGE_CHARS + 1)} 然后 测试 改 ./a.ts ./b.ts ./c.ts ./d.ts`
  const result = analyze(text, 'standard')
  assert.equal(result.score, 4)
  assert.equal(result.tier, 'high')
  assert.deepEqual(result.signals.map(signal => signal.id), [
    'long-message', 'multi-step', 'many-paths', 'verification',
  ])
})

test('sensitivity profiles only move the tier cut lines', () => {
  const twoPoints = analyze('然后 测试', 'loose')
  assert.equal(twoPoints.score, 2)
  assert.equal(twoPoints.tier, 'low')
  assert.deepEqual(twoPoints.thresholds, { lowMax: 2, mediumMax: 3 })

  const standard = analyze('然后 测试', 'standard')
  assert.equal(standard.tier, 'medium')
  assert.deepEqual(standard.thresholds, { lowMax: 1, mediumMax: 2 })

  const aggressive = analyze('然后 测试', 'aggressive')
  assert.equal(aggressive.tier, 'high')
  assert.deepEqual(aggressive.thresholds, { lowMax: 0, mediumMax: 1 })
})

test('invalid sensitivity falls back to standard and reports it', () => {
  const result = analyze('然后 测试', 'turbo')
  assert.equal(result.sensitivity, 'standard')
  assert.equal(result.sensitivityFallback, true)
  assert.equal(result.tier, 'medium')
})

test('missing sensitivity is not reported as a fallback', () => {
  const result = analyze('x')
  assert.equal(result.sensitivity, 'standard')
  assert.equal(result.sensitivityFallback, false)
})

test('normalizeSensitivity and normalizeConfig reject invalid values', () => {
  assert.deepEqual(normalizeSensitivity('aggressive'), { sensitivity: 'aggressive', fallback: false })
  assert.deepEqual(normalizeSensitivity(null), { sensitivity: 'standard', fallback: false })
  assert.deepEqual(normalizeSensitivity(7), { sensitivity: 'standard', fallback: true })

  assert.deepEqual(normalizeConfig({ enabled: false, sensitivity: 'loose' }), {
    enabled: false, sensitivity: 'loose', fallback: false,
  })
  assert.deepEqual(normalizeConfig({ enabled: 'yes', sensitivity: 'turbo' }), {
    enabled: true, sensitivity: 'standard', fallback: true,
  })
  assert.deepEqual(normalizeConfig(undefined), { enabled: true, sensitivity: 'standard', fallback: false })
})
