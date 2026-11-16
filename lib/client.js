window.__ModuleLoader__.load({
	id: "@liuhange/dsh-cost-preflight",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.jsx
var index_exports = {};
__export(index_exports, {
  CostBadge: () => CostBadge,
  CostHint: () => CostHint,
  CostSettingsCard: () => CostSettingsCard,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_react = __toESM(require("react"), 1);

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

// src/core/debounce.js
var PREFLIGHT_DEBOUNCE_MS = 500;
function createDebouncer(delay, timers = globalThis) {
  let handle = null;
  return {
    schedule(fn) {
      if (handle !== null) timers.clearTimeout(handle);
      handle = timers.setTimeout(() => {
        handle = null;
        fn();
      }, delay);
    },
    cancel() {
      if (handle !== null) {
        timers.clearTimeout(handle);
        handle = null;
      }
    },
    get pending() {
      return handle !== null;
    }
  };
}
function analysisSignature(analysis) {
  const signals = analysis.signals.map((signal) => signal.label).join("+");
  return `${analysis.tier}|${analysis.score}|${analysis.sensitivity}|${analysis.pathCount}|${signals}`;
}

// src/client/index.jsx
var import_jsx_runtime = require("react/jsx-runtime");
var NAMESPACE = "cost-preflight";
var name = "cost-preflight-client";
var inject = ["slots", "settingsScope"];
var TIER_FACE = Object.freeze({
  low: { emoji: "\u{1F7E2}", label: "\u4F4E", color: "#16a34a" },
  medium: { emoji: "\u{1F7E1}", label: "\u4E2D", color: "#d97706" },
  high: { emoji: "\u{1F534}", label: "\u9AD8", color: "#dc2626" }
});
var SENSITIVITY_LABELS = Object.freeze({
  loose: "\u5BBD\u677E",
  standard: "\u6807\u51C6",
  aggressive: "\u6FC0\u8FDB"
});
function createConfigStore(scope) {
  let lastSnapshot;
  let lastValue;
  return {
    getSnapshot() {
      const snapshot = scope.getSnapshot();
      if (snapshot !== lastSnapshot) {
        const resolved = normalizeConfig(snapshot === void 0 ? void 0 : snapshot.value);
        lastSnapshot = snapshot;
        lastValue = {
          enabled: resolved.enabled,
          sensitivity: resolved.sensitivity,
          writable: Boolean(snapshot?.writable),
          loading: snapshot === void 0 || snapshot.status === "loading"
        };
      }
      return lastValue;
    },
    subscribe(listener) {
      return scope.subscribe(listener);
    }
  };
}
function usePreflight(draft, sensitivity) {
  const [analysis, setAnalysis] = import_react.default.useState(() => analyze(draft, sensitivity));
  const debouncer = import_react.default.useMemo(() => createDebouncer(PREFLIGHT_DEBOUNCE_MS), []);
  import_react.default.useEffect(() => {
    debouncer.schedule(() => {
      setAnalysis((current) => {
        const next = analyze(draft, sensitivity);
        return analysisSignature(current) === analysisSignature(next) ? current : next;
      });
    });
    return () => debouncer.cancel();
  }, [draft, sensitivity, debouncer]);
  return analysis;
}
var PILL_STYLE = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  padding: "2px 8px",
  borderRadius: "999px",
  border: "1px solid currentColor",
  fontSize: "12px",
  lineHeight: "18px",
  whiteSpace: "nowrap",
  userSelect: "none",
  opacity: 0.92
};
function CostBadge(props) {
  const enabled = props.usePreflightConfig((snapshot) => snapshot.enabled);
  const sensitivity = props.usePreflightConfig((snapshot) => snapshot.sensitivity);
  const draft = props.input?.draft ?? "";
  const analysis = usePreflight(draft, sensitivity);
  if (!enabled || draft.trim() === "") return null;
  const face = TIER_FACE[analysis.tier];
  const title = analysis.signals.length === 0 ? `\u6210\u672C\u6863\u4F4D\uFF1A${face.label}\uFF08\u65E0\u4FE1\u53F7\uFF09` : `\u6210\u672C\u6863\u4F4D\uFF1A${face.label}\uFF08${analysis.signals.map((signal) => signal.label).join("\uFF1B")}\uFF09`;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { ...PILL_STYLE, color: face.color }, title, "aria-label": title, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true", children: face.emoji }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: face.label })
  ] });
}
function CostHint(props) {
  const enabled = props.usePreflightConfig((snapshot) => snapshot.enabled);
  const sensitivity = props.usePreflightConfig((snapshot) => snapshot.sensitivity);
  const draft = props.input?.draft ?? "";
  const analysis = usePreflight(draft, sensitivity);
  if (!enabled || draft.trim() === "" || analysis.tier !== "high") return null;
  const reasons = analysis.signals.map((signal) => signal.label).join("\uFF1B");
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        margin: "0 0 6px",
        padding: "6px 10px",
        borderLeft: "3px solid #dc2626",
        borderRadius: "6px",
        background: "rgba(220, 38, 38, 0.10)",
        color: "inherit",
        fontSize: "12px",
        lineHeight: "1.5"
      },
      role: "status",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true", children: "\u{1F534}" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          "\u6B64\u4EFB\u52A1\u9884\u8BA1\u6D88\u8017\u8F83\u9AD8\uFF0C\u5EFA\u8BAE\u786E\u8BA4\u4EFB\u52A1\u8303\u56F4\u540E\u53D1\u9001\uFF08",
          reasons,
          "\uFF09\u3002"
        ] })
      ]
    }
  );
}
var CARD_STYLE = {
  border: "1px solid rgba(128, 128, 128, 0.28)",
  borderRadius: "10px",
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  fontSize: "13px",
  lineHeight: "1.6"
};
function CostSettingsCard(props) {
  const enabled = props.usePreflightConfig((snapshot) => snapshot.enabled);
  const sensitivity = props.usePreflightConfig((snapshot) => snapshot.sensitivity);
  const writable = props.usePreflightConfig((snapshot) => snapshot.writable);
  const [error, setError] = import_react.default.useState(null);
  const write = (action) => {
    setError(null);
    action().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: CARD_STYLE, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontWeight: 600, fontSize: "14px" }, children: "\u6210\u672C\u9884\u68C0 \xB7 Cost Preflight" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { opacity: 0.72 }, children: "\u53D1\u9001\u524D\u6309\u542F\u53D1\u5F0F\u4FE1\u53F7\u7ED9\u51FA \u4F4E / \u4E2D / \u9AD8 \u6210\u672C\u6863\u4F4D\uFF0C\u4E0D\u505A\u7CBE\u786E token \u8BA1\u8D39\u3002" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: { display: "flex", alignItems: "center", gap: "8px", cursor: writable ? "pointer" : "not-allowed" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          type: "checkbox",
          checked: enabled,
          disabled: !writable,
          onChange: (event) => write(() => props.setEnabled(event.target.checked))
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u5728\u8F93\u5165\u6846\u65C1\u663E\u793A\u6210\u672C\u6863\u4F4D\u6807\u7B7E\uFF08\u9AD8\u6210\u672C\u65F6\u989D\u5916\u663E\u793A\u63D0\u793A\uFF09" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { opacity: 0.72 }, children: "\u7075\u654F\u5EA6" }),
      SENSITIVITIES.map((profile) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: { display: "inline-flex", alignItems: "center", gap: "4px", cursor: writable ? "pointer" : "not-allowed" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "radio",
            name: "cost-preflight-sensitivity",
            value: profile,
            checked: sensitivity === profile,
            disabled: !writable,
            onChange: () => write(() => props.setSensitivity(profile))
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: SENSITIVITY_LABELS[profile] })
      ] }, profile))
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { opacity: 0.6, fontSize: "12px" }, children: "\u5BBD\u677E\uFF1A0\u20132 \u4F4E / 3 \u4E2D / 4 \u9AD8 \xB7 \u6807\u51C6\uFF1A0\u20131 \u4F4E / 2 \u4E2D / 3\u20134 \u9AD8 \xB7 \u6FC0\u8FDB\uFF1A0 \u4F4E / 1 \u4E2D / 2\u20134 \u9AD8" }),
    error !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { color: "#dc2626", fontSize: "12px" }, children: [
      "\u4FDD\u5B58\u5931\u8D25\uFF1A",
      error
    ] }) : null
  ] });
}
function apply(ctx) {
  const scope = ctx.settingsScope.bind({ namespace: NAMESPACE });
  const store = createConfigStore(scope);
  const configFace = () => ({ hooks: { preflightConfig: store } });
  ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
    name: "conversation.input.right",
    id: "cost-preflight-badge",
    inject: configFace
  }, CostBadge));
  ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
    name: "conversation.input.dock",
    id: "cost-preflight-hint",
    inject: configFace
  }, CostHint));
  ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
    name: "settings.plugin.item",
    key: NAMESPACE,
    id: "cost-preflight-settings",
    inject: () => ({
      hooks: { preflightConfig: store },
      setEnabled: (value) => scope.set("enabled", Boolean(value)),
      setSensitivity: (value) => scope.set("sensitivity", String(value))
    })
  }, CostSettingsCard));
}
		return module.exports;
	},
});
