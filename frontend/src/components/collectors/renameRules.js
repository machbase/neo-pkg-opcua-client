// Pure helpers for the bulk node-rename modal.
//
// 세그먼트는 trim 후 이어붙이기만 한다. 노드 브라우저에서 노드를 고를 때와 같은 처리라
// 규칙 버튼과 직접 선택이 같은 이름을 만든다. 문자는 손대지 않는다 — 이전의 영숫자 전용
// 치환에 근거가 없었던 이유는 tagName.js 참고.
//
// A `treePath` is an array of OPC UA path segment labels; the LAST segment is the
// node's unique identifier and is ALWAYS preserved by every rule. Each rule maps a
// list of treePaths (+ params) to proposed name strings. Masks (boolean[] where
// true = removed/struck-through) drive the breadcrumb preview in the modal.

import { normalizeTagName } from './tagName.js';

export function lastSegment(treePath) {
  const p = treePath || [];
  return p.length ? String(p[p.length - 1]) : '';
}

// 남긴(제거되지 않은) 세그먼트를 밑줄로 이어 만든 이름.
//
// 비었거나 공백뿐인 세그먼트는 구분자만 남기지 않도록 빠진다 ("Area" + "" + "Pump" 가
// "Area__Pump" 가 되는 것을 막는다). 세그먼트가 원래 갖고 있던 밑줄은 그대로 둔다 —
// "Tank_Pressure_01" 은 서버가 준 라벨 그 자체다.
export function nameFromMask(treePath, mask) {
  return (treePath || [])
    .filter((_, i) => !mask[i])
    .map((segment) => normalizeTagName(segment))
    .filter(Boolean)
    .join('_');
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
