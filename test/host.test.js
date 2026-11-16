/**
 * Host wiring tests: tool registration, settings precedence and the
 * composition-config fallback flag promised by the README.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import * as plugin from '../src/host/index.js'

/**
 * Build a minimal plugin context: `tools.register` captures the tool, and
 * `inject(['settings'])` only resolves when a settings provider is supplied.
 * @param {*} settings - settings service mock, or undefined for "no provider".
 * @returns {{ ctx: *, tools: Record<string, *> }} context and captured tools.
 */
function makeContext(settings) {
  const tools = {}
  const ctx = {
    fiber: { state: 0 },
    tools: { register(tool) { tools[tool.name] = tool } },
    effect() {},
    on() {},
    logger: console,
    inject(deps, callback) {
      if (deps.includes('settings') && settings) callback({ ...ctx, settings })
    },
  }
  return { ctx, tools }
}

test('registers cost_preflight with the documented output schema', () => {
  const { ctx, tools } = makeContext(undefined)
  plugin.apply(ctx, { enabled: true, sensitivity: 'standard' })
  const tool = tools.cost_preflight
  assert.ok(tool, 'tool registered')
  assert.deepEqual(tool.parameters.required, ['text'])
  assert.equal(tool.output.schema.additionalProperties, false)
  assert.deepEqual(Object.keys(tool.output.schema.properties).sort(), [
    'advice', 'characterCount', 'pathCount', 'score', 'sensitivity',
    'sensitivityFallback', 'signals', 'thresholds', 'tier', 'tierLabel',
  ])
})

test('composition config wins over defaults and keeps the documented fallback flag', async () => {
  const { ctx, tools } = makeContext(undefined)
  plugin.apply(ctx, { enabled: true, sensitivity: 'aggressive' })
  const strict = await tools.cost_preflight.execute({ text: '改一个小文件' }, {})
  assert.equal(strict.sensitivity, 'aggressive')
  assert.equal(strict.tier, 'low')
  assert.equal(strict.sensitivityFallback, false)

  const { ctx: fallbackCtx, tools: fallbackTools } = makeContext(undefined)
  plugin.apply(fallbackCtx, { enabled: 'yes', sensitivity: 'turbo' })
  const fallback = await fallbackTools.cost_preflight.execute({ text: '改一个小文件' }, {})
  assert.equal(fallback.sensitivity, 'standard')
  assert.equal(fallback.sensitivityFallback, true)
})

test('a live settings section overrides the composition entry', async () => {
  const state = { enabled: true, sensitivity: 'standard' }
  const scope = {
    get: () => ({ ...state }),
    set: (key, value) => { state[key] = value },
    watch() {},
  }
  const { ctx, tools } = makeContext({ register: () => scope })
  plugin.apply(ctx, { enabled: true, sensitivity: 'standard' })
  const before = await tools.cost_preflight.execute({ text: '然后 测试' }, {})
  assert.equal(before.tier, 'medium')

  scope.set('sensitivity', 'aggressive')
  const after = await tools.cost_preflight.execute({ text: '然后 测试' }, {})
  assert.equal(after.sensitivity, 'aggressive')
  assert.equal(after.tier, 'high')
})
