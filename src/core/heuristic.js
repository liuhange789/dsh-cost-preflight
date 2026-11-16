/**
 * Pure cost-tier heuristics shared by the host tool and the browser half.
 *
 * This is a deliberately coarse warning, not a token estimate: four
 * observable signals are summed into 0..4 points, and a sensitivity
 * profile turns the sum into a low/medium/high tier. No network, no LLM,
 * no timers — everything here is a deterministic string function.
 *
 * @module dsh-cost-preflight/core
 */

/** Sensitivity profiles: only the tier cut lines move, the four signals stay fixed. */
export const SENSITIVITIES = ['loose', 'standard', 'aggressive']

/** Default sensitivity when nothing is configured. */
export const DEFAULT_SENSITIVITY = 'standard'

/** Default user-facing configuration used by both halves. */
export const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  sensitivity: DEFAULT_SENSITIVITY,
})

/** Long-message rule: more than 500 characters adds one point. */
export const LONG_MESSAGE_CHARS = 500

/** File-reference rule: more than 3 distinct paths adds one point. */
export const MANY_PATHS = 3

/** Multi-step instruction words from the product spec. */
export const MULTI_STEP_KEYWORDS = ['循环', '遍历', '逐个', '所有', '批量', '接着', '然后', '之后']

/** English multi-step phrases; word boundaries keep words like "latest" out. */
export const ENGLISH_MULTI_STEP = /\b(?:for each|iterate|loop(?:ing)?(?:\s+(?:over|through))?|all\s+(?:files|tests|cases|modules|of them)|batch|one by one|step by step|then|after that|afterwards)\b/i

/** Test/deploy words from the product spec. */
export const VERIFY_KEYWORDS = ['测试', '验证', '部署']

/** English test/deploy words, matched on word boundaries (not "latest"/"contest"). */
export const ENGLISH_VERIFY = /\b(?:test(?:s|ing)?|verify|verification|deploy(?:ment|ing)?)\b/i

/** Tier cut lines per sensitivity; the standard profile is the spec default. */
export const TIER_THRESHOLDS = Object.freeze({
  loose: Object.freeze({ lowMax: 2, mediumMax: 3 }),
  standard: Object.freeze({ lowMax: 1, mediumMax: 2 }),
  aggressive: Object.freeze({ lowMax: 0, mediumMax: 1 }),
})

const TIER_LABELS = Object.freeze({ low: '低', medium: '中', high: '高' })

const ADVICE = Object.freeze({
  low: '档位低：可以直接发送。',
  medium: '档位中：发送前快速确认一下任务范围。',
  high: '档位高：预计工具调用较多，建议先确认范围或拆分任务再发送。',
})

/**
 * Clamp an arbitrary configured value to a known sensitivity.
 * @param {unknown} value - configured or stored value.
 * @returns {{ sensitivity: string, fallback: boolean }} normalized value and whether a fallback happened.
 */
export function normalizeSensitivity(value) {
  if (typeof value === 'string' && SENSITIVITIES.includes(value)) {
    return { sensitivity: value, fallback: false }
  }
  return { sensitivity: DEFAULT_SENSITIVITY, fallback: value !== undefined && value !== null }
}

/**
 * Normalize one config snapshot, filling invalid or missing fields with defaults.
 * @param {unknown} value - raw settings value.
 * @returns {{ enabled: boolean, sensitivity: string, fallback: boolean }} resolved config.
 */
export function normalizeConfig(value) {
  const source = value !== null && typeof value === 'object' ? value : {}
  const sensitivity = normalizeSensitivity(source.sensitivity)
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_CONFIG.enabled,
    sensitivity: sensitivity.sensitivity,
    fallback: sensitivity.fallback,
  }
}

/** @param {string} text @returns {number} number of Unicode code points in the trimmed text. */
export function characterCount(text) {
  return Array.from(String(text ?? '').trim()).length
}

const PATH_CANDIDATE = /(?:[A-Za-z]:[\\/]|\.{1,2}[\\/]|~[\\/])?[\w.@~\u4e00-\u9fff()+-]+(?:[\\/][\w.@~\u4e00-\u9fff()+-]+)+/g
const EXTENSION_TAIL = /^[^\s/\\]+\.\w{1,10}$/
const PREFIXED = /^(?:[A-Za-z]:[\\/]|\.{1,2}[\\/]|~[\\/])/

/**
 * Count distinct file-path-looking tokens. URLs are stripped first, fenced code
 * blocks are ignored, timestamps and plain slash dates are rejected (they have
 * no path prefix and no extension), and the same path written twice counts once.
 * Inline code spans (`src/a.ts`) still count: they are usually file references,
 * not whole programs.
 * @param {string} text - raw message text.
 * @returns {number} distinct path count.
 */
export function countFilePaths(text) {
  const stripped = String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/[^\s)>\]]+/gi, ' ')
  const paths = new Set()
  for (const match of stripped.match(PATH_CANDIDATE) ?? []) {
    const token = match.replace(/[),.;:]+$/, '')
    const segments = token.split(/[\\/]/).filter(Boolean)
    if (segments.length < 2) continue
    const last = segments[segments.length - 1]
    const accepted = PREFIXED.test(token) || EXTENSION_TAIL.test(last)
    if (!accepted) continue
    paths.add(segments.join('/').toLowerCase())
  }
  return paths.size
}

/** @param {string} text @param {string[]} keywords @returns {string|undefined} first matched keyword. */
function firstKeyword(text, keywords) {
  return keywords.find(keyword => text.includes(keyword))
}

/** @param {string} text @param {RegExp} pattern @returns {string|undefined} first regex match. */
function firstPattern(text, pattern) {
  return text.match(pattern)?.[0]
}

/** @param {string} text @returns {string|undefined} Chinese or English multi-step phrase. */
function findMultiStep(text) {
  return firstKeyword(text, MULTI_STEP_KEYWORDS) ?? firstPattern(text, ENGLISH_MULTI_STEP)
}

/** @param {string} text @returns {string|undefined} Chinese or English test/deploy word. */
function findVerification(text) {
  return firstKeyword(text, VERIFY_KEYWORDS) ?? firstPattern(text, ENGLISH_VERIFY)
}

/**
 * Analyze one message against the four fixed signals.
 *
 * @param {string} text - message draft.
 * @param {unknown} sensitivityInput - 'loose' | 'standard' | 'aggressive'; invalid values fall back to standard.
 * @returns {{
 *   tier: 'low'|'medium'|'high',
 *   score: number,
 *   sensitivity: string,
 *   sensitivityFallback: boolean,
 *   characterCount: number,
 *   pathCount: number,
 *   thresholds: { lowMax: number, mediumMax: number },
 *   signals: { id: string, label: string, delta: number }[],
 *   advice: string,
 *   tierLabel: string,
 * }} deterministic analysis.
 */
export function analyze(text, sensitivityInput) {
  const raw = String(text ?? '')
  const sensitivity = normalizeSensitivity(sensitivityInput)
  const characters = characterCount(raw)
  const paths = countFilePaths(raw)

  /** @type {{ id: string, label: string, delta: number }[]} */
  const signals = []
  if (characters > LONG_MESSAGE_CHARS) {
    signals.push({ id: 'long-message', label: `长消息 (${characters} 字 > ${LONG_MESSAGE_CHARS})`, delta: 1 })
  }
  const multiStep = findMultiStep(raw)
  if (multiStep !== undefined) {
    signals.push({ id: 'multi-step', label: `多步指令关键词「${multiStep}」`, delta: 1 })
  }
  if (paths > MANY_PATHS) {
    signals.push({ id: 'many-paths', label: `引用 ${paths} 个文件路径 (> ${MANY_PATHS})`, delta: 1 })
  }
  const verify = findVerification(raw)
  if (verify !== undefined) {
    signals.push({ id: 'verification', label: `测试/验证/部署关键词「${verify}」`, delta: 1 })
  }

  const score = signals.reduce((total, signal) => total + signal.delta, 0)
  const thresholds = TIER_THRESHOLDS[sensitivity.sensitivity]
  const tier = score <= thresholds.lowMax ? 'low' : score <= thresholds.mediumMax ? 'medium' : 'high'

  return {
    tier,
    score,
    sensitivity: sensitivity.sensitivity,
    sensitivityFallback: sensitivity.fallback,
    characterCount: characters,
    pathCount: paths,
    thresholds: { lowMax: thresholds.lowMax, mediumMax: thresholds.mediumMax },
    signals,
    advice: ADVICE[tier],
    tierLabel: TIER_LABELS[tier],
  }
}
