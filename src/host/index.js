/**
 * Host half of dsh-cost-preflight: settings section + an explicit preflight tool.
 *
 * The pre-send warning itself lives in the browser half, because the earliest
 * host event (`agent/inbox/inserted`) fires after the message is already
 * submitted. The host therefore contributes the two things it can do honestly:
 * a settings namespace shared with the browser UI, and a `cost_preflight` tool
 * usable from headless/CLI sessions and by the model.
 *
 * @module dsh-cost-preflight
 */

import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  DEFAULT_CONFIG,
  analyze,
  normalizeConfig,
  normalizeSensitivity,
  SENSITIVITIES,
} from '../core/heuristic.js'

/** Plugin id used by the loader entry and diagnostics. */
export const name = 'cost-preflight'

/** The tool registry is the only hard dependency; settings stay optional. */
export const inject = ['tools']

/** Settings namespace shared by the host section and the browser settings card. */
export const COST_PREFLIGHT_SETTINGS_NAMESPACE = settingsNamespace('cost-preflight')

/** Stored configuration shape. */
export const CostPreflightSettings = z.object({
  enabled: z.boolean().default(DEFAULT_CONFIG.enabled),
  sensitivity: z.union(SENSITIVITIES).default(DEFAULT_CONFIG.sensitivity),
})

/** Composition-entry configuration; same shape as the stored section. */
export const Config = CostPreflightSettings

/** Tier labels carried by the tool result, reused by the text renderer. */
const TIER_TEXT = Object.freeze({ low: '低 (low)', medium: '中 (medium)', high: '高 (high)' })

/**
 * Compose the invocation-time settings: composition entry first, user section
 * (when a settings provider is mounted) overrides it live.
 * @param {unknown} entry - validated composition entry config.
 * @returns {{ enabled: boolean, sensitivity: string, fallback: boolean }} resolved settings.
 */
function resolveEntry(entry) {
  return normalizeConfig(entry)
}

export function apply(ctx, config) {
  const entry = resolveEntry(config)
  /** @type {() => { enabled: boolean, sensitivity: string, fallback: boolean }} */
  let source = () => entry

  installSettingsSection(ctx, COST_PREFLIGHT_SETTINGS_NAMESPACE, CostPreflightSettings, entry, {
    setSource: current => {
      source = () => normalizeConfig(current())
    },
    onChange: () => {},
  })

  ctx.tools.register(defineTool({
    name: 'cost_preflight',
    description: [
      'Heuristic cost-tier preflight for a task description (低/中/高), for deciding whether to send a task now or narrow it first.',
      'Not a token count: it scores four observable signals — message length over 500 characters, multi-step instruction words (循环/遍历/逐个/所有/批量/接着/然后/之后), more than 3 referenced file paths, and 测试/验证/部署 words.',
      'Each hit adds one point; 0-1 is low, 2 is medium, 3+ is high under the standard sensitivity.',
      'Use this before starting a broad task when the cost is unclear.',
    ].join(' '),
    parameters: {
      text: {
        type: 'string',
        required: true,
        description: 'The task description or pending message to analyze.',
      },
      sensitivity: {
        type: 'string',
        enum: SENSITIVITIES,
        description: 'Override the configured sensitivity for this call.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tier: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Cost tier.' },
          score: { type: 'integer', description: 'Signal points, 0 to 4.' },
          sensitivity: { type: 'string', enum: SENSITIVITIES, description: 'Profile used for the tier cut lines.' },
          sensitivityFallback: { type: 'boolean', description: 'True when an invalid sensitivity fell back to standard.' },
          characterCount: { type: 'integer', description: 'Unicode code points in the trimmed text.' },
          pathCount: { type: 'integer', description: 'Distinct file paths detected.' },
          thresholds: {
            type: 'object',
            additionalProperties: false,
            properties: {
              lowMax: { type: 'integer' },
              mediumMax: { type: 'integer' },
            },
          },
          signals: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                delta: { type: 'integer' },
              },
            },
          },
          advice: { type: 'string', description: 'One-line next step for this tier.' },
          tierLabel: { type: 'string', description: 'Localized tier label (低/中/高).' },
        },
      },
      render(_args, value) {
        const signalText = value.signals.length === 0 ? '无信号' : value.signals.map(signal => signal.label).join('；')
        return [{
          type: 'text',
          text: `成本档位：${TIER_TEXT[value.tier]}（${value.score} 分，灵敏度 ${value.sensitivity}）\n信号：${signalText}\n${value.advice}`,
        }]
      },
    },
    presentCall(args) {
      return {
        card: 'generic',
        title: 'Cost preflight',
        kind: 'other',
        rawInput: { text: String(args.text ?? '').slice(0, 400), sensitivity: args.sensitivity },
      }
    },
    isConcurrencySafe: () => true,
    execute(args) {
      const configured = source()
      const override = args.sensitivity === undefined ? undefined : normalizeSensitivity(args.sensitivity)
      const result = analyze(args.text, override === undefined ? configured.sensitivity : override.sensitivity)
      const fallback = override === undefined ? configured.fallback : override.fallback
      return Promise.resolve({
        ...result,
        sensitivityFallback: result.sensitivityFallback || fallback,
      })
    },
  }))
}
