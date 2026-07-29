// Pure helpers for the bulk node-rename modal.
//
// A `treePath` is an array of OPC UA path segment labels; the LAST segment is the
// node's unique identifier and is ALWAYS preserved by every rule. Each rule maps a
// list of treePaths (+ params) to proposed name strings. Masks (boolean[] where
// true = removed/struck-through) drive the breadcrumb preview in the modal.

export function lastSegment(treePath) {
  const p = treePath || [];
  return p.length ? String(p[p.length - 1]) : '';
}

// Name built from the kept (non-removed) segments, joined with underscores.
export function nameFromMask(treePath, mask) {
  return (treePath || []).filter((_, i) => !mask[i]).join('_');
}

// Number of leading segments shared by ALL paths, capped so the last (unique)
// segment of the shortest path is never included. 0 when there is no shared prefix.
export function commonPrefixLength(treePaths) {
  if (!treePaths || treePaths.length === 0) return 0;
  const minLen = Math.min(...treePaths.map((p) => (p ? p.length : 0)));
  let count = 0;
  for (let i = 0; i < minLen - 1; i++) {
    const seg = treePaths[0][i];
    if (treePaths.every((p) => p[i] === seg)) count++;
    else break;
  }
  return count;
}

export function commonPrefixApplicable(treePaths) {
  return commonPrefixLength(treePaths) > 0;
}

// ── Masks ──────────────────────────────────────────────────────────────────────

// Keep only the last segment.
export function maskLastSegment(treePath) {
  const n = (treePath || []).length;
  return (treePath || []).map((_, i) => i !== n - 1);
}

// Remove the first `prefixLen` segments (the last is never in the prefix range).
export function maskCommonPrefix(treePath, prefixLen) {
  return (treePath || []).map((_, i) => i < prefixLen);
}

// Remove `countStart` segments from the front (starting at 1-indexed `fromStart`)
// and `countEnd` segments from the back (starting at 1-indexed `fromEnd` from the
// end). The last segment is never removed.
export function maskTrim(treePath, params = {}) {
  const { fromStart = 1, countStart = 0, fromEnd = 1, countEnd = 0 } = params;
  const n = (treePath || []).length;
  const mask = new Array(n).fill(false);
  for (let k = 0; k < countStart; k++) {
    const idx = (fromStart - 1) + k;
    if (idx >= 0 && idx < n - 1) mask[idx] = true;
  }
  for (let k = 0; k < countEnd; k++) {
    const idx = (n - 1 - fromEnd) - k;
    if (idx >= 0 && idx < n - 1) mask[idx] = true;
  }
  return mask;
}

// Trim the CURRENTLY-KEPT segments, accumulating onto an existing mask. This enables
// chaining: applying trim again cuts further into the previous result rather than
// restarting from the original path. The last kept segment is always preserved.
export function maskTrimChained(treePath, currentMask, params = {}) {
  const len = (treePath || []).length;
  const mask = Array.isArray(currentMask) && currentMask.length === len
    ? currentMask.slice()
    : new Array(len).fill(false);
  const kept = [];
  for (let i = 0; i < len; i++) if (!mask[i]) kept.push(i);
  const m = kept.length;
  const { fromStart = 1, countStart = 0, fromEnd = 1, countEnd = 0 } = params;
  for (let k = 0; k < countStart; k++) {
    const local = (fromStart - 1) + k;
    if (local >= 0 && local < m - 1) mask[kept[local]] = true;
  }
  for (let k = 0; k < countEnd; k++) {
    const local = (m - 1 - fromEnd) - k;
    if (local >= 0 && local < m - 1) mask[kept[local]] = true;
  }
  return mask;
}

// ── Rule appliers (treePaths[] -> proposed names[]) ─────────────────────────────

export function applyLastSegment(treePaths) {
  return (treePaths || []).map((p) => nameFromMask(p, maskLastSegment(p)));
}

export function applyRemoveCommonPrefix(treePaths) {
  const n = commonPrefixLength(treePaths);
  return (treePaths || []).map((p) => nameFromMask(p, maskCommonPrefix(p, n)));
}

export function applyNumbering(treePaths, params = {}) {
  const prefix = params.prefix != null && params.prefix !== '' ? String(params.prefix) : 'tag';
  return (treePaths || []).map((_, i) => `${prefix}_${i + 1}`);
}

export function applyTrim(treePaths, params = {}) {
  return (treePaths || []).map((p) => nameFromMask(p, maskTrim(p, params)));
}

export const RENAME_RULES = ['lastSegment', 'removeCommonPrefix', 'numbering', 'trim'];
