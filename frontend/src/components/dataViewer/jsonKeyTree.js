// Adapted from neo-web PR #737 (JSON value key exploration).
import { displayJsonPathLabel, displayJsonPathSegments, getJsonPathSegments, jsonPathSegment, jsonPathToSqlPath, jsonSampleValueType } from '../../utils/dashboardJsonValue.js';
import { jsonKeyTypeLabel } from '../../utils/jsonKeyCatalog.js';
import { jsonChartNumber } from '../../utils/jsonChartNumber.js';
const isContainer = (value) => value !== null && typeof value === 'object';
const entriesOf = (value) => Array.isArray(value)
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value);
const branchPreview = (value, count) => `${Array.isArray(value) ? 'array' : 'object'} · ${count}`;
const leafPreview = (value) => {
    if (value === null || value === undefined)
        return 'null';
    if (typeof value === 'string')
        return value;
    return String(value);
};
const isChartable = (value) => jsonChartNumber(value) !== null;
const isQueryable = (path) => {
    try {
        jsonPathToSqlPath(path);
        return true;
    }
    catch {
        return false;
    }
};
export const parseJsonKeyDocument = (value) => {
    if (isContainer(value))
        return value;
    if (typeof value !== 'string')
        return undefined;
    try {
        return JSON.parse(value);
    }
    catch {
        return undefined;
    }
};
export const buildJsonKeyTree = (document, rootLabel = 'VALUE') => {
    const nodes = [];
    const walk = (value, prefix, dotted, parentDotted, label, depth) => {
        if (isContainer(value)) {
            const entries = entriesOf(value);
            nodes.push({
                path: prefix,
                label,
                dotted,
                parentDotted,
                depth,
                leaf: false,
                dataType: '',
                numeric: false,
                queryable: false,
                preview: branchPreview(value, entries.length),
                childCount: entries.length,
            });
            for (const [key, child] of entries) {
                const childPath = `${prefix}${jsonPathSegment(key)}`;
                walk(child, childPath, displayJsonPathLabel(childPath), dotted, key, depth + 1);
            }
            return;
        }
        const queryable = isQueryable(prefix);
        nodes.push({
            path: prefix,
            label,
            dotted,
            parentDotted,
            depth,
            leaf: true,
            dataType: jsonKeyTypeLabel(jsonSampleValueType(value)),
            numeric: queryable && isChartable(value),
            queryable,
            preview: leafPreview(value),
            childCount: 0,
        });
    };
    const parsed = parseJsonKeyDocument(document);
    if (parsed !== undefined && parsed !== null && !isContainer(parsed)) {
        return [
            {
                path: '',
                label: rootLabel,
                dotted: rootLabel,
                parentDotted: '',
                depth: 0,
                leaf: true,
                dataType: jsonKeyTypeLabel(jsonSampleValueType(parsed)),
                numeric: isChartable(parsed),
                queryable: true,
                preview: leafPreview(parsed),
                childCount: 0,
            },
        ];
    }
    if (!isContainer(parsed))
        return [];
    for (const [key, child] of entriesOf(parsed)) {
        const path = jsonPathSegment(key);
        walk(child, path, displayJsonPathLabel(path), '', key, 0);
    }
    return nodes;
};
export const jsonKeyTreeLeavesUnder = (nodes = [], path) => {
    const node = nodes.find((entry) => entry.path === path);
    if (!node)
        return [];
    if (node.leaf)
        return node.queryable ? [node.path] : [];
    return nodes.filter((entry) => entry.leaf && entry.queryable && entry.path.startsWith(path)).map((entry) => entry.path);
};
export const jsonKeyDocumentHasKeys = (value) => buildJsonKeyTree(value).some((node) => node.leaf && node.path !== '');
export const jsonKeyTreeLeafPaths = (nodes = []) => nodes.filter((node) => node.leaf).map((node) => node.path);
export const MAX_JSON_KEY_SERIES = 4;
export const jsonKeyTreeSeriesCount = (nodes = [], selected = []) => {
    const picked = new Set(selected);
    return nodes.filter((node) => node.leaf && node.numeric && picked.has(node.path)).length;
};
export const filterJsonKeyTree = (nodes = [], filter = '') => {
    const needle = String(filter ?? '').trim().toLowerCase();
    if (!needle)
        return nodes;
    return nodes.filter((node) => node.leaf && (node.dotted.toLowerCase().includes(needle) || node.path.toLowerCase().includes(needle)));
};
export const visibleJsonKeyTree = (nodes = [], collapsed = new Set()) => {
    if (collapsed.size === 0)
        return nodes;
    return nodes.filter((node) => {
        for (const path of collapsed) {
            if (node.path !== path && node.path.startsWith(path))
                return false;
        }
        return true;
    });
};
export const shortJsonKeyNames = (paths = []) => {
    const parts = paths.map((path) => getJsonPathSegments(path));
    const longest = parts.reduce((max, part) => Math.max(max, part.length), 1);
    let names = parts.map((part) => displayJsonPathSegments(part.slice(-1)));
    for (let depth = 2; depth <= longest && new Set(names).size !== names.length; depth += 1) {
        names = parts.map((part) => displayJsonPathSegments(part.slice(-depth)));
    }
    return names;
};
