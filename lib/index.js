// src/host/index.js
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";

// src/core/heuristic.js
var SENSITIVITIES = ["loose", "standard", "aggressive"];
var DEFAULT_SENSITIVITY = "standard";
var DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  sensitivity: DEFAULT_SENSITIVITY
});
var LONG_MESSAGE_CHARS = 500;
var MANY_PATHS = 3;
var MULTI_STEP_KEYWORDS = ["\u5FAA\u73AF", "\u904D\u5386", "\u9010\u4E2A", "\u6240\u6709", "\u6279\u91CF", "\u63A5\u7740", "\u7136\u540E", "\u4E4B\u540E"];
var ENGLISH_MULTI_STEP = /\b(?:for each|iterate|loop(?:ing)?(?:\s+(?:over|through))?|all\s+(?:files|tests|cases|modules|of them)|batch|one by one|step by step|then|after that|afterwards)\b/i;
var VERIFY_KEYWORDS = ["\u6D4B\u8BD5", "\u9A8C\u8BC1", "\u90E8\u7F72"];
var ENGLISH_VERIFY = /\b(?:test(?:s|ing)?|verify|verification|deploy(?:ment|ing)?)\b/i;
var TIER_THRESHOLDS = Object.freeze({
  loose: Object.freeze({ lowMax: 2, mediumMax: 3 }),
  standard: Object.freeze({ lowMax: 1, mediumMax: 2 }),
  aggressive: Object.freeze({ lowMax: 0, mediumMax: 1 })
});
var TIER_LABELS = Object.freeze({ low: "\u4F4E", medium: "\u4E2D", high: "\u9AD8" });
var ADVICE = Object.freeze({
  low: "\u6863\u4F4D\u4F4E\uFF1A\u53EF\u4EE5\u76F4\u63A5\u53D1\u9001\u3002",
  medium: "\u6863\u4F4D\u4E2D\uFF1A\u53D1\u9001\u524D\u5FEB\u901F\u786E\u8BA4\u4E00\u4E0B\u4EFB\u52A1\u8303\u56F4\u3002",
  high: "\u6863\u4F4D\u9AD8\uFF1A\u9884\u8BA1\u5DE5\u5177\u8C03\u7528\u8F83\u591A\uFF0C\u5EFA\u8BAE\u5148\u786E\u8BA4\u8303\u56F4\u6216\u62C6\u5206\u4EFB\u52A1\u518D\u53D1\u9001\u3002"
});
function normalizeSensitivity(value) {
  if (typeof value === "string" && SENSITIVITIES.includes(value)) {
    return { sensitivity: value, fallback: false };
  }
  return { sensitivity: DEFAULT_SENSITIVITY, fallback: value !== void 0 && value !== null };
}
function normalizeConfig(value) {
  const source = value !== null && typeof value === "object" ? value : {};
  const sensitivity = normalizeSensitivity(source.sensitivity);
  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : DEFAULT_CONFIG.enabled,
    sensitivity: sensitivity.sensitivity,
    fallback: sensitivity.fallback
  };
}
function characterCount(text) {
  return Array.from(String(text ?? "").trim()).length;
}
var PATH_CANDIDATE = /(?:[A-Za-z]:[\\/]|\.{1,2}[\\/]|~[\\/])?[\w.@~\u4e00-\u9fff()+-]+(?:[\\/][\w.@~\u4e00-\u9fff()+-]+)+/g;
var EXTENSION_TAIL = /^[^\s/\\]+\.\w{1,10}$/;
var PREFIXED = /^(?:[A-Za-z]:[\\/]|\.{1,2}[\\/]|~[\\/])/;
function countFilePaths(text) {
  const stripped = String(text ?? "").replace(/```[\s\S]*?```/g, " ").replace(/https?:\/\/[^\s)>\]]+/gi, " ");
  const paths = /* @__PURE__ */ new Set();
  for (const match of stripped.match(PATH_CANDIDATE) ?? []) {
    const token = match.replace(/[),.;:]+$/, "");
    const segments = token.split(/[\\/]/).filter(Boolean);
    if (segments.length < 2) continue;
    const last = segments[segments.length - 1];
    const accepted = PREFIXED.test(token) || EXTENSION_TAIL.test(last);
    if (!accepted) continue;
    paths.add(segments.join("/").toLowerCase());
  }
  return paths.size;
}
function firstKeyword(text, keywords) {
  return keywords.find((keyword) => text.includes(keyword));
}
function firstPattern(text, pattern) {
  return text.match(pattern)?.[0];
}
function findMultiStep(text) {
  return firstKeyword(text, MULTI_STEP_KEYWORDS) ?? firstPattern(text, ENGLISH_MULTI_STEP);
}
function findVerification(text) {
  return firstKeyword(text, VERIFY_KEYWORDS) ?? firstPattern(text, ENGLISH_VERIFY);
}
function analyze(text, sensitivityInput) {
  const raw = String(text ?? "");
  const sensitivity = normalizeSensitivity(sensitivityInput);
  const characters = characterCount(raw);
  const paths = countFilePaths(raw);
  const signals = [];
  if (characters > LONG_MESSAGE_CHARS) {
    signals.push({ id: "long-message", label: `\u957F\u6D88\u606F (${characters} \u5B57 > ${LONG_MESSAGE_CHARS})`, delta: 1 });
  }
  const multiStep = findMultiStep(raw);
  if (multiStep !== void 0) {
    signals.push({ id: "multi-step", label: `\u591A\u6B65\u6307\u4EE4\u5173\u952E\u8BCD\u300C${multiStep}\u300D`, delta: 1 });
  }
  if (paths > MANY_PATHS) {
    signals.push({ id: "many-paths", label: `\u5F15\u7528 ${paths} \u4E2A\u6587\u4EF6\u8DEF\u5F84 (> ${MANY_PATHS})`, delta: 1 });
  }
  const verify = findVerification(raw);
  if (verify !== void 0) {
    signals.push({ id: "verification", label: `\u6D4B\u8BD5/\u9A8C\u8BC1/\u90E8\u7F72\u5173\u952E\u8BCD\u300C${verify}\u300D`, delta: 1 });
  }
  const score = signals.reduce((total, signal) => total + signal.delta, 0);
  const thresholds = TIER_THRESHOLDS[sensitivity.sensitivity];
  const tier = score <= thresholds.lowMax ? "low" : score <= thresholds.mediumMax ? "medium" : "high";
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
    tierLabel: TIER_LABELS[tier]
  };
}

// src/host/index.js
var name = "cost-preflight";
var inject = ["tools"];
var COST_PREFLIGHT_SETTINGS_NAMESPACE = settingsNamespace("cost-preflight");
var CostPreflightSettings = z.object({
  enabled: z.boolean().default(DEFAULT_CONFIG.enabled),
  sensitivity: z.union(SENSITIVITIES).default(DEFAULT_CONFIG.sensitivity)
});
var Config = CostPreflightSettings;
var TIER_TEXT = Object.freeze({ low: "\u4F4E (low)", medium: "\u4E2D (medium)", high: "\u9AD8 (high)" });
function resolveEntry(entry) {
  return normalizeConfig(entry);
}
function apply(ctx, config) {
  const entry = resolveEntry(config);
  let source = () => entry;
  installSettingsSection(ctx, COST_PREFLIGHT_SETTINGS_NAMESPACE, CostPreflightSettings, entry, {
    setSource: (current) => {
      source = () => normalizeConfig(current());
    },
    onChange: () => {
    }
  });
  ctx.tools.register(defineTool({
    name: "cost_preflight",
    description: [
      "Heuristic cost-tier preflight for a task description (\u4F4E/\u4E2D/\u9AD8), for deciding whether to send a task now or narrow it first.",
      "Not a token count: it scores four observable signals \u2014 message length over 500 characters, multi-step instruction words (\u5FAA\u73AF/\u904D\u5386/\u9010\u4E2A/\u6240\u6709/\u6279\u91CF/\u63A5\u7740/\u7136\u540E/\u4E4B\u540E), more than 3 referenced file paths, and \u6D4B\u8BD5/\u9A8C\u8BC1/\u90E8\u7F72 words.",
      "Each hit adds one point; 0-1 is low, 2 is medium, 3+ is high under the standard sensitivity.",
      "Use this before starting a broad task when the cost is unclear."
    ].join(" "),
    parameters: {
      text: {
        type: "string",
        required: true,
        description: "The task description or pending message to analyze."
      },
      sensitivity: {
        type: "string",
        enum: SENSITIVITIES,
        description: "Override the configured sensitivity for this call."
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          tier: { type: "string", enum: ["low", "medium", "high"], description: "Cost tier." },
          score: { type: "integer", description: "Signal points, 0 to 4." },
          sensitivity: { type: "string", enum: SENSITIVITIES, description: "Profile used for the tier cut lines." },
          sensitivityFallback: { type: "boolean", description: "True when an invalid sensitivity fell back to standard." },
          characterCount: { type: "integer", description: "Unicode code points in the trimmed text." },
          pathCount: { type: "integer", description: "Distinct file paths detected." },
          thresholds: {
            type: "object",
            additionalProperties: false,
            properties: {
              lowMax: { type: "integer" },
              mediumMax: { type: "integer" }
            }
          },
          signals: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                delta: { type: "integer" }
              }
            }
          },
          advice: { type: "string", description: "One-line next step for this tier." },
          tierLabel: { type: "string", description: "Localized tier label (\u4F4E/\u4E2D/\u9AD8)." }
        }
      },
      render(_args, value) {
        const signalText = value.signals.length === 0 ? "\u65E0\u4FE1\u53F7" : value.signals.map((signal) => signal.label).join("\uFF1B");
        return [{
          type: "text",
          text: `\u6210\u672C\u6863\u4F4D\uFF1A${TIER_TEXT[value.tier]}\uFF08${value.score} \u5206\uFF0C\u7075\u654F\u5EA6 ${value.sensitivity}\uFF09
\u4FE1\u53F7\uFF1A${signalText}
${value.advice}`
        }];
      }
    },
    presentCall(args) {
      return {
        card: "generic",
        title: "Cost preflight",
        kind: "other",
        rawInput: { text: String(args.text ?? "").slice(0, 400), sensitivity: args.sensitivity }
      };
    },
    isConcurrencySafe: () => true,
    execute(args) {
      const configured = source();
      const override = args.sensitivity === void 0 ? void 0 : normalizeSensitivity(args.sensitivity);
      const result = analyze(args.text, override === void 0 ? configured.sensitivity : override.sensitivity);
      const fallback = override === void 0 ? configured.fallback : override.fallback;
      return Promise.resolve({
        ...result,
        sensitivityFallback: result.sensitivityFallback || fallback
      });
    }
  }));
}
export {
  COST_PREFLIGHT_SETTINGS_NAMESPACE,
  Config,
  CostPreflightSettings,
  apply,
  inject,
  name
};
