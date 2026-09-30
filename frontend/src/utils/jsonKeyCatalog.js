// Adapted from neo-web PR #737 (JSON value key exploration).
import { displayJsonPathLabel, jsonPathToSqlPath, normalizeJsonPath } from './dashboardJsonValue.js';
export const jsonKeyTypeLabel = (type) => type === 'n' ? 'NUMBER' : type === 's' ? 'STRING' : type === 'b' ? 'BOOLEAN' : '';
export const jsonKeyPathToSql = (path) => jsonPathToSqlPath(path);
export const TAG_ANALYZER_MAX_JSON_KEY_TEXT = 256;
export const toTagAnalyzerJsonKeyPath = (path) => {
    const normalized = normalizeJsonPath(path);
    if (!normalized)
        return { ok: false, reason: 'A JSON key is required.' };
    if (normalized.length > TAG_ANALYZER_MAX_JSON_KEY_TEXT) {
        return { ok: false, reason: `JSON key is too long for Tag Analyzer (max ${TAG_ANALYZER_MAX_JSON_KEY_TEXT - 2} characters).` };
    }
    return { ok: true, path: normalized };
};
export const jsonKeyPathLabel = (path) => {
    return displayJsonPathLabel(path);
};
