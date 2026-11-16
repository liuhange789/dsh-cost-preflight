/**
 * Browser half of dsh-cost-preflight.
 *
 * Registers three real slots from the web app shell:
 * - `conversation.input.right`: the cost-tier pill next to the send button;
 * - `conversation.input.dock`: the one-line warning above the composer;
 * - `settings.plugin.item`: this plugin's enable/sensitivity card.
 *
 * Settings come from the same `cost-preflight` namespace the host registers,
 * so the toggle and profile apply live without a reload.
 *
 * @module dsh-cost-preflight/client
 */

import React from 'react'
import {
  PREFLIGHT_DEBOUNCE_MS,
  analysisSignature,
  createDebouncer,
} from '../core/debounce.js'
import { analyze, normalizeConfig, SENSITIVITIES } from '../core/heuristic.js'

/** Settings namespace, mirrored from the host half. */
const NAMESPACE = 'cost-preflight'

/** Client plugin name shown in diagnostics. */
export const name = 'cost-preflight-client'

/** Settings transport plus the slot registry are required; the web profile provides all of them. */
export const inject = ['slots', 'connection', 'remote', 'settingsScope']

const TIER_FACE = Object.freeze({
  low: { emoji: '🟢', label: '低', color: '#16a34a' },
  medium: { emoji: '🟡', label: '中', color: '#d97706' },
  high: { emoji: '🔴', label: '高', color: '#dc2626' },
})

const SENSITIVITY_LABELS = Object.freeze({
  loose: '宽松',
  standard: '标准',
  aggressive: '激进',
})

/**
 * Cache the derived config snapshot so React's `useSyncExternalStore` sees a
 * stable value; returning a fresh object per call would loop forever.
 * @param {{ getSnapshot: () => any, subscribe: (fn: () => void) => () => void }} scope - settings scope.
 * @returns {{ getSnapshot: () => { enabled: boolean, sensitivity: string, writable: boolean, loading: boolean }, subscribe: (fn: () => void) => () => void }} readable store.
 */
function createConfigStore(scope) {
  let lastSnapshot
  let lastValue
  return {
    getSnapshot() {
      const snapshot = scope.getSnapshot()
      if (snapshot !== lastSnapshot) {
        const resolved = normalizeConfig(snapshot === undefined ? undefined : snapshot.value)
        lastSnapshot = snapshot
        lastValue = {
          enabled: resolved.enabled,
          sensitivity: resolved.sensitivity,
          writable: Boolean(snapshot?.writable),
          loading: snapshot === undefined || snapshot.status === 'loading',
        }
      }
      return lastValue
    },
    subscribe(listener) {
      return scope.subscribe(listener)
    },
  }
}

/**
 * Debounced analysis hook shared by the pill and the hint.
 * @param {string} draft - current composer draft.
 * @param {string} sensitivity - active profile.
 * @returns {ReturnType<typeof analyze>} latest settled analysis.
 */
function usePreflight(draft, sensitivity) {
  const [analysis, setAnalysis] = React.useState(() => analyze(draft, sensitivity))
  const debouncer = React.useMemo(() => createDebouncer(PREFLIGHT_DEBOUNCE_MS), [])
  React.useEffect(() => {
    debouncer.schedule(() => {
      setAnalysis(current => {
        const next = analyze(draft, sensitivity)
        return analysisSignature(current) === analysisSignature(next) ? current : next
      })
    })
    return () => debouncer.cancel()
  }, [draft, sensitivity, debouncer])
  return analysis
}

const PILL_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 8px',
  borderRadius: '999px',
  border: '1px solid currentColor',
  fontSize: '12px',
  lineHeight: '18px',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  opacity: 0.92,
}

/**
 * Tier pill next to the send button.
 * @param {*} props - slot props: `input.draft` owner share plus `usePreflightConfig`.
 * @returns {React.ReactElement | null} pill or nothing.
 */
export function CostBadge(props) {
  const enabled = props.usePreflightConfig(snapshot => snapshot.enabled)
  const sensitivity = props.usePreflightConfig(snapshot => snapshot.sensitivity)
  const draft = props.input?.draft ?? ''
  const analysis = usePreflight(draft, sensitivity)
  if (!enabled || draft.trim() === '') return null
  const face = TIER_FACE[analysis.tier]
  const title = analysis.signals.length === 0
    ? `成本档位：${face.label}（无信号）`
    : `成本档位：${face.label}（${analysis.signals.map(signal => signal.label).join('；')}）`
  return (
    <span style={{ ...PILL_STYLE, color: face.color }} title={title} aria-label={title}>
      <span aria-hidden="true">{face.emoji}</span>
      <span>{face.label}</span>
    </span>
  )
}

/**
 * One-line warning above the composer, only for the high tier.
 * @param {*} props - slot props: `input.draft` owner share plus `usePreflightConfig`.
 * @returns {React.ReactElement | null} warning or nothing.
 */
export function CostHint(props) {
  const enabled = props.usePreflightConfig(snapshot => snapshot.enabled)
  const sensitivity = props.usePreflightConfig(snapshot => snapshot.sensitivity)
  const draft = props.input?.draft ?? ''
  const analysis = usePreflight(draft, sensitivity)
  if (!enabled || draft.trim() === '' || analysis.tier !== 'high') return null
  const reasons = analysis.signals.map(signal => signal.label).join('；')
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        margin: '0 0 6px',
        padding: '6px 10px',
        borderLeft: '3px solid #dc2626',
        borderRadius: '6px',
        background: 'rgba(220, 38, 38, 0.10)',
        color: 'inherit',
        fontSize: '12px',
        lineHeight: '1.5',
      }}
      role="status"
    >
      <span aria-hidden="true">🔴</span>
      <span>此任务预计消耗较高，建议确认任务范围后发送（{reasons}）。</span>
    </div>
  )
}

const CARD_STYLE = {
  border: '1px solid rgba(128, 128, 128, 0.28)',
  borderRadius: '10px',
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  fontSize: '13px',
  lineHeight: '1.6',
}

/**
 * Plugin-owned settings card: enable switch plus the three sensitivity profiles.
 * @param {*} props - slot props with `usePreflightConfig`, `setEnabled`, `setSensitivity`.
 * @returns {React.ReactElement} card.
 */
export function CostSettingsCard(props) {
  const enabled = props.usePreflightConfig(snapshot => snapshot.enabled)
  const sensitivity = props.usePreflightConfig(snapshot => snapshot.sensitivity)
  const writable = props.usePreflightConfig(snapshot => snapshot.writable)
  const [error, setError] = React.useState(null)

  const write = action => {
    setError(null)
    action().catch(cause => setError(cause instanceof Error ? cause.message : String(cause)))
  }

  return (
    <div style={CARD_STYLE}>
      <div>
        <div style={{ fontWeight: 600, fontSize: '14px' }}>成本预检 · Cost Preflight</div>
        <div style={{ opacity: 0.72 }}>
          发送前按启发式信号给出 低 / 中 / 高 成本档位，不做精确 token 计费。
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: writable ? 'pointer' : 'not-allowed' }}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={!writable}
          onChange={event => write(() => props.setEnabled(event.target.checked))}
        />
        <span>在输入框旁显示成本档位标签（高成本时额外显示提示）</span>
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
        <span style={{ opacity: 0.72 }}>灵敏度</span>
        {SENSITIVITIES.map(profile => (
          <label key={profile} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: writable ? 'pointer' : 'not-allowed' }}>
            <input
              type="radio"
              name="cost-preflight-sensitivity"
              value={profile}
              checked={sensitivity === profile}
              disabled={!writable}
              onChange={() => write(() => props.setSensitivity(profile))}
            />
            <span>{SENSITIVITY_LABELS[profile]}</span>
          </label>
        ))}
      </div>
      <div style={{ opacity: 0.6, fontSize: '12px' }}>
        宽松：0–2 低 / 3 中 / 4 高 · 标准：0–1 低 / 2 中 / 3–4 高 · 激进：0 低 / 1 中 / 2–4 高
      </div>
      {error !== null ? (
        <div style={{ color: '#dc2626', fontSize: '12px' }}>保存失败：{error}</div>
      ) : null}
    </div>
  )
}

/**
 * Client plugin body: bind the settings namespace and contribute the slots.
 * @param {*} ctx - client plugin context.
 */
export function apply(ctx) {
  const scope = ctx.settingsScope.bind({ namespace: NAMESPACE })
  const store = createConfigStore(scope)

  const configFace = () => ({ hooks: { preflightConfig: store } })

  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'cost-preflight-badge',
    inject: configFace,
  }, CostBadge))

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'cost-preflight-hint',
    inject: configFace,
  }, CostHint))

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: NAMESPACE,
    id: 'cost-preflight-settings',
    inject: () => ({
      hooks: { preflightConfig: store },
      setEnabled: value => scope.set('enabled', Boolean(value)),
      setSensitivity: value => scope.set('sensitivity', String(value)),
    }),
  }, CostSettingsCard))
}
