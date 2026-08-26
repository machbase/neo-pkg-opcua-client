// Derived-tag data contract (frontend, ESM).
//
// Backend spec (see cgi-bin/docs/API.md, cgi-bin/src/expression/evaluator.js):
//   config.derivedTags[] = {
//     name, expression:"A * B", variables:{ A:"node", B:"node" },
//     timeSource:"latest"|alias, onChanged:bool,
//     onError:"skip"|"null"|"value"|"previous", errorValue?:number
//   }
//
// Grammar/expression validity is NOT re-implemented here — that is authoritative on the
// backend via POST /expression/validate and POST /collector/validate. This module only
// handles: shape conversion (config <-> form), stable alias assignment, palette metadata,
// and cheap local pre-checks that never contradict the backend.
//
// Form shape (editable, alias-ordered array instead of a map):
//   {
//     name: string,
//     expression: string,
//     variables: [{ alias:"A", node:"voltage" }, ...],   // stable aliases, never reindexed
//     timeSource: "latest" | alias,
//     onChanged: boolean,
//     onError: "skip"|"null"|"value"|"previous",
//     errorValue: string,                                 // UI string; Number() on serialize
//   }

import { validateTagName } from "./tagName.js";

// ── Backend-mirrored static metadata (values only, not grammar) ────────────────────
// Kept in sync with cgi-bin/src/expression/evaluator.js + limits.js. Used for the palette
// and limit checks. The authoritative supported lists are also returned by
// /expression/validate (supportedFunctions/supportedConstants) if reconciliation is needed.

export const SUPPORTED_FUNCTIONS = [
  "abs", "ceil", "floor", "round", "trunc", "min", "max", "sqrt", "pow",
  "sin", "cos", "tan", "asin", "acos", "atan", "log", "log2", "log10", "exp",
];

// Displayed as <PI> / <E> in expressions.
export const SUPPORTED_CONSTANTS = ["PI", "E"];

export const EXPRESSION_LIMITS = {
  maxExpressionLength: 512,
  maxDerivedTagsPerCollector: 64,
  maxVariablesPerExpression: 26,
};

export const ON_ERROR_OPTIONS = ["skip", "null", "value", "previous"];

// Display labels for ON_ERROR_OPTIONS. The stored values stay backend-shaped.
export const ON_ERROR_LABELS = {
  skip: "skip",
  null: "write null",
  value: "use fallback value",
  previous: "hold last value",
};

// ── Alias assignment (stable: never reindex on delete) ─────────────────────────────

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// First A–Z letter not already taken by an existing variable. Returns "" if all 26 used.
export function nextAlias(variables) {
  const used = new Set((variables || []).map((v) => v && v.alias).filter(Boolean));
  for (const ch of ALPHABET) {
    if (!used.has(ch)) return ch;
  }
  return "";
}

// Uppercase alias tokens referenced by an expression string. Constants (<PI>, <E>) are
// stripped first so their inner uppercase letters are not mistaken for aliases. A valid
// expression only uses single uppercase letters as variable references, so this is a
// confident (never over-eager) "declared alias" signal.
export function extractAliases(expression) {
  const withoutConstants = String(expression == null ? "" : expression).replace(/<[^>]*>/g, " ");
  const set = new Set();
  const matches = withoutConstants.match(/[A-Z]/g);
  if (matches) for (const ch of matches) set.add(ch);
  return [...set].sort();
}

// ── Factories ──────────────────────────────────────────────────────────────────────

// New-tag defaults, matching the documented backend defaults (cgi-bin/docs/API.md). `onChanged`
// starts off: serializeDerivedTag always writes the flag, so this prefill is the effective default
// for anything authored here, and change-only storage should be an explicit opt-in.
export function emptyDerivedTag() {
  return {
    name: "",
    expression: "",
    variables: [],
    timeSource: "latest",
    onChanged: false,
    onError: "skip",
    errorValue: "",
  };
}

// ── config -> form ───────────────────────────────────────────────────────────────

export function normalizeDerivedTags(list) {
  if (!Array.isArray(list)) return [];
  return list.map((dt) => normalizeDerivedTag(dt)).filter(Boolean);
}

export function normalizeDerivedTag(dt) {
  if (!dt || typeof dt !== "object") return null;

  const variables = [];
  const map = dt.variables && typeof dt.variables === "object" && !Array.isArray(dt.variables)
    ? dt.variables
    : {};
  for (const alias of Object.keys(map).filter((a) => /^[A-Z]$/.test(a)).sort()) {
    variables.push({ alias, node: map[alias] == null ? "" : String(map[alias]) });
  }

  const onError = ON_ERROR_OPTIONS.indexOf(dt.onError) >= 0 ? dt.onError : "skip";

  return {
    name: dt.name == null ? "" : String(dt.name),
    expression: dt.expression == null ? "" : String(dt.expression),
    variables,
    timeSource: dt.timeSource == null || dt.timeSource === "" ? "latest" : String(dt.timeSource),
    onChanged: Boolean(dt.onChanged),
    onError,
    errorValue: dt.errorValue == null ? "" : String(dt.errorValue),
  };
}

// ── form -> config (save payload) ────────────────────────────────────────────────

export function serializeDerivedTags(list) {
  if (!Array.isArray(list)) return [];
  return list.map((dt) => serializeDerivedTag(dt));
}

export function serializeDerivedTag(dt) {
  const variables = {};
  for (const v of dt.variables || []) {
    if (v && v.alias && v.node != null && String(v.node).trim() !== "") {
      variables[v.alias] = String(v.node).trim();
    }
  }
  const out = {
    name: String(dt.name == null ? "" : dt.name).trim(),
    expression: String(dt.expression == null ? "" : dt.expression),
    variables,
    timeSource: dt.timeSource || "latest",
    onChanged: Boolean(dt.onChanged),
    onError: ON_ERROR_OPTIONS.indexOf(dt.onError) >= 0 ? dt.onError : "skip",
  };
  if (out.onError === "value") {
    const num = Number(dt.errorValue);
    out.errorValue = Number.isFinite(num) ? num : 0;
  }
  return out;
}

// The alias options a timeSource select should offer for a given form derived tag.
export function timeSourceOptions(dt) {
  return ["latest", ...(dt.variables || []).map((v) => v && v.alias).filter(Boolean)];
}

// ── Local pre-checks (never contradict the backend) ────────────────────────────────
//
// ctx = {
//   nodeNames: string[],          // source node names in this collector
//   derivedNames: string[],       // OTHER derived-tag names (exclude the one being edited)
//   summarizedValueColumn: bool,  // true when VALUE column is SUMMARIZED (autoCreate / DOUBLE SUMMARIZED)
// }
// Returns { ok, errors: { name?, variables?, expression?, errorValue? } }.
export function validateDerivedTagLocal(dt, ctx = {}) {
  const errors = {};
  const nodeNames = ctx.nodeNames || [];
  const derivedNames = ctx.derivedNames || [];
  // JSON collector 는 파생 태그 값도 payload 안에 넣는다(collector.js 의 payload[derived.name]).
  // 즉 이 이름도 노드 이름과 똑같이 json 경로에 실리므로 같은 문자 제약을 받는다.
  const jsonPayloadKey = ctx.jsonPayloadKey === true;
  const name = String(dt && dt.name != null ? dt.name : "").trim();
  const expression = String(dt && dt.expression != null ? dt.expression : "");
  const variables = (dt && dt.variables) || [];

  // name
  if (!name) {
    errors.name = "Enter a tag name.";
  } else if (!validateTagName(name, { jsonPayloadKey }).ok) {
    errors.name = validateTagName(name, { jsonPayloadKey }).reason;
  } else if (nodeNames.indexOf(name) >= 0) {
    errors.name = `'${name}' conflicts with a source node name.`;
  } else if (derivedNames.indexOf(name) >= 0) {
    errors.name = `'${name}' conflicts with another derived tag.`;
  }

  // variables
  const declared = variables.map((v) => v && v.alias).filter(Boolean);
  if (variables.length < 1) {
    errors.variables = "Add at least one variable.";
  } else if (variables.some((v) => !v || !v.node)) {
    errors.variables = "Select a node for every variable.";
  } else if (variables.length > EXPRESSION_LIMITS.maxVariablesPerExpression) {
    errors.variables = `At most ${EXPRESSION_LIMITS.maxVariablesPerExpression} variables.`;
  }

  // expression (grammar is validated by the backend; only cheap checks here)
  if (!expression.trim()) {
    errors.expression = "Enter an expression.";
  } else if (expression.length > EXPRESSION_LIMITS.maxExpressionLength) {
    errors.expression = `Expression exceeds ${EXPRESSION_LIMITS.maxExpressionLength} characters.`;
  } else {
    const undeclared = extractAliases(expression).filter((a) => declared.indexOf(a) < 0);
    if (undeclared.length > 0) {
      errors.expression = `Undeclared variable${undeclared.length > 1 ? "s" : ""}: ${undeclared.join(", ")}. Add ${undeclared.length > 1 ? "them" : "it"} above.`;
    }
  }

  // onError policy
  if (dt && dt.onError === "value") {
    if (dt.errorValue == null || String(dt.errorValue).trim() === "" || !Number.isFinite(Number(dt.errorValue))) {
      errors.errorValue = "Enter a numeric fallback value.";
    }
  }
  if (dt && dt.onError === "null" && ctx.summarizedValueColumn) {
    errors.errorValue = "onError:null cannot be used with a SUMMARIZED value column.";
  }

  return { ok: Object.keys(errors).length === 0, errors };
}
