export const DEFAULT_TIME_FORMAT = "2006-01-02 15:04:05.000";
export const DEFAULT_TIME_ZONE = "LOCAL";

export const TIME_FORMATS = [
    { label: "TIMESTAMP(ns)", value: "ns" },
    { label: "TIMESTAMP(us)", value: "us" },
    { label: "TIMESTAMP(ms)", value: "ms" },
    { label: "TIMESTAMP(s)", value: "s" },
    { label: "YYYY-MM-DD", value: "2006-01-02" },
    { label: "YYYY-DD-MM", value: "2006-02-01" },
    { label: "DD-MM-YYYY", value: "02-01-2006" },
    { label: "MM-DD-YYYY", value: "01-02-2006" },
    { label: "YY-DD-MM", value: "06-02-01" },
    { label: "YY-MM-DD", value: "06-01-02" },
    { label: "MM-DD-YY", value: "01-02-06" },
    { label: "DD-MM-YY", value: "02-01-06" },
    { label: "YYYY-MM-DD HH:MI:SS", value: "2006-01-02 15:04:05" },
    { label: "YYYY-MM-DD HH:MI:SS.SSS", value: "2006-01-02 15:04:05.000" },
    { label: "YYYY-MM-DD HH:MI:SS.SSSSSS", value: "2006-01-02 15:04:05.000000" },
    { label: "YYYY-MM-DD HH:MI:SS.SSSSSSSSS", value: "2006-01-02 15:04:05.000000000" },
    { label: "YYYY-MM-DD HH", value: "2006-01-02 15" },
    { label: "YYYY-MM-DD HH:MI", value: "2006-01-02 15:04" },
    { label: "HH:MI:SS", value: "03:04:05" },
];

export const DATA_VIEWER_ROUTE_BASE = "/data-viewer";
export const DATA_VIEWER_BACK_PATH = "/";
export const NEO_WEB_TAG_ANALYZER_MESSAGE_TYPE = "neo.openTagAnalyzer";
export const NEO_WEB_TAG_ANALYZER_MESSAGE_SOURCE = "neo-package";
export const NEO_WEB_TAG_ANALYZER_MESSAGE_VERSION = 1;
export const NEO_WEB_TAG_ANALYZER_APP_NAME = "neo-pkg-opcua-client";
const TAG_ANALYZER_DATETIME_COLUMN_TYPE = 6;

const supportedTimeZones =
    typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("timeZone")
        : [];

export const TIME_ZONE_OPTIONS = [
    { value: "UTC", label: "UTC" },
    { value: "LOCAL", label: "LOCAL" },
    ...supportedTimeZones
        .filter((zone) => zone !== "UTC")
        .map((zone) => ({ value: zone, label: zone.replaceAll("_", " ") })),
];

export function getTimeFormatLabel(value) {
    return TIME_FORMATS.find((option) => option.value === value)?.label || value;
}

export function getTimeZoneLabel(value) {
    return TIME_ZONE_OPTIONS.find((option) => option.value === value)?.label || value;
}

export function buildDataViewerPath(collectorId) {
    return `${DATA_VIEWER_ROUTE_BASE}/${encodeURIComponent(String(collectorId || ""))}`;
}

export function buildDataViewerHeaderLabels(jobName, tableName) {
    const job = String(jobName || "").trim();
    const table = String(tableName || "").trim();
    return {
        title: job || table,
        detail: table,
    };
}

function normalizeTagAnalyzerRangeValue(value, keyPrefix) {
    if (value instanceof Date) {
        const time = value.getTime();
        return Number.isFinite(time) ? { [`${keyPrefix}Iso`]: value.toISOString() } : {};
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? { [`${keyPrefix}EpochMs`]: value } : {};
    }

    const text = String(value ?? "").trim();
    if (!text) return {};

    const parsed = Date.parse(text);
    if (!Number.isFinite(parsed)) return {};
    return { [`${keyPrefix}Iso`]: new Date(parsed).toISOString() };
}

export function buildNeoWebTagAnalyzerRange(range = {}) {
    const start = normalizeTagAnalyzerRangeValue(range.from ?? range.start ?? range.startIso ?? range.startEpochMs, "start");
    const end = normalizeTagAnalyzerRangeValue(range.to ?? range.end ?? range.endIso ?? range.endEpochMs, "end");
    if (Object.keys(start).length === 0 || Object.keys(end).length === 0) return undefined;

    const startMs = start.startEpochMs ?? Date.parse(start.startIso);
    const endMs = end.endEpochMs ?? Date.parse(end.endIso);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return undefined;
    return { ...start, ...end };
}

export function buildNeoWebTagAnalyzerMessage({
    appName = NEO_WEB_TAG_ANALYZER_APP_NAME,
    title = "OPC UA Data Viewer",
    table,
    tagNames = [],
    range,
    valueColumn = "VALUE",
    nameColumn = "NAME",
    timeColumn = "TIME",
    stringOnly = false,
} = {}) {
    const tableName = String(table || "").trim();
    if (!tableName) return { ok: false, reason: "Database table is required." };
    if (stringOnly) return { ok: false, reason: "Tag Analyzer requires a numeric value column." };

    const value = String(valueColumn || "VALUE").trim();
    const name = String(nameColumn || "NAME").trim();
    const time = String(timeColumn || "TIME").trim();
    if (!value || !name || !time) return { ok: false, reason: "Tag Analyzer column mapping is incomplete." };

    const seen = new Set();
    const tags = [];
    for (const rawName of tagNames || []) {
        const tagName = String(rawName || "").trim();
        if (!tagName || seen.has(tagName)) continue;
        seen.add(tagName);
        tags.push({
            tagName,
            table: tableName,
            calculationMode: "avg",
            alias: "",
            weight: 1,
            colName: {
                name,
                time,
                value,
                timeType: TAG_ANALYZER_DATETIME_COLUMN_TYPE,
                timeBaseTime: true,
                jsonKey: "",
            },
        });
    }

    if (tags.length === 0) return { ok: false, reason: "Cannot open Tag Analyzer because there is no tag." };

    const normalizedRange = buildNeoWebTagAnalyzerRange(range);
    return {
        ok: true,
        message: {
            source: NEO_WEB_TAG_ANALYZER_MESSAGE_SOURCE,
            type: NEO_WEB_TAG_ANALYZER_MESSAGE_TYPE,
            version: NEO_WEB_TAG_ANALYZER_MESSAGE_VERSION,
            appName,
            payload: {
                title,
                ...(normalizedRange ? { range: normalizedRange } : {}),
                tags,
            },
        },
    };
}

export function sendNeoWebTagAnalyzerMessage(message, targetWindow, targetOrigin) {
    if (!message || typeof targetWindow?.postMessage !== "function") return false;
    targetWindow.postMessage(message, targetOrigin);
    return true;
}

const RAW_COLUMN_ORDER = ["time", "name", "value"];
const INTERNAL_RAW_RESULT_KEYS = new Set(["buffer", "names"]);

function formatRawColumnLabel(key) {
    return String(key || "")
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ");
}

export function buildRawResultColumns(rows = [], options = {}) {
    const keys = [];
    const seen = new Set();
    const hiddenKeys = new Set((options.hiddenKeys || [])
        .map((key) => String(key || "").trim().toLowerCase())
        .filter(Boolean));
    if (options.hideAssetMetadata) hiddenKeys.add("asset");

    for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        for (const key of Object.keys(row)) {
            const normalizedKey = String(key).toLowerCase();
            if (INTERNAL_RAW_RESULT_KEYS.has(normalizedKey)) continue;
            if (hiddenKeys.has(normalizedKey)) continue;
            if (seen.has(key)) continue;
            seen.add(key);
            keys.push(key);
        }
    }

    const orderedKeys = keys.length > 0
        ? [
            ...RAW_COLUMN_ORDER.filter((key) => seen.has(key)),
            ...keys.filter((key) => !RAW_COLUMN_ORDER.includes(key)),
        ]
        : RAW_COLUMN_ORDER;

    return orderedKeys.map((key) => ({
        key,
        label: formatRawColumnLabel(key),
    }));
}

export function getResultHeading(mode) {
    return "";
}

export function getScanDirectionLabel(backwardScan) {
    return backwardScan ? "Backward" : "Forward";
}

export function showsDataViewerTimeControls(mode) {
    return mode === "raw" || mode === "chart";
}

export function buildDataViewerChartGroups({
    selectedTagNames = [],
    splitGroups = [],
    splitTagNames = [],
    globalRange = { from: "", to: "" },
    splitRanges = {},
} = {}) {
    const selected = [];
    const selectedSet = new Set();
    for (const name of selectedTagNames) {
        const tagName = String(name || "").trim();
        if (!tagName || selectedSet.has(tagName)) continue;
        selectedSet.add(tagName);
        selected.push(tagName);
    }

    const normalizedSplitGroups = [];
    const splitSet = new Set();
    const sourceSplitGroups = splitGroups.length > 0
        ? splitGroups
        : splitTagNames.map((name) => ({ id: `split:${name}`, tagNames: [name] }));

    for (const group of sourceSplitGroups) {
        const groupNames = [];
        for (const name of group?.tagNames || []) {
            const tagName = String(name || "").trim();
            if (!tagName || !selectedSet.has(tagName) || splitSet.has(tagName)) continue;
            splitSet.add(tagName);
            groupNames.push(tagName);
        }
        if (groupNames.length === 0) continue;
        const id = String(group?.id || `split:${groupNames.join("|")}`).trim();
        normalizedSplitGroups.push({
            id,
            title: group?.title || groupNames.join(", "),
            tagNames: groupNames,
        });
    }

    const range = globalRange || { from: "", to: "" };
    const groups = [];
    const defaultNames = selected.filter((name) => !splitSet.has(name));
    if (defaultNames.length > 0) {
        groups.push({
            id: "default",
            title: "Selected Tags",
            tagNames: defaultNames,
            range,
            split: false,
        });
    }

    for (const group of normalizedSplitGroups) {
        groups.push({
            id: group.id,
            title: group.title,
            tagNames: group.tagNames,
            range: splitRanges?.[group.id] || range,
            split: true,
        });
    }

    return groups;
}

export function buildDataViewerSplitGroups({
    tagNames = [],
    selectedTagNames = [],
    assignedTagNames = [],
    createId = (name, index) => `split:${Date.now()}:${index}:${name}`,
} = {}) {
    const selectedSet = new Set(
        selectedTagNames
            .map((name) => String(name || "").trim())
            .filter(Boolean)
    );
    const assignedSet = new Set(
        assignedTagNames
            .map((name) => String(name || "").trim())
            .filter(Boolean)
    );
    const seen = new Set();
    const groups = [];

    for (const name of tagNames || []) {
        const tagName = String(name || "").trim();
        if (!tagName || seen.has(tagName) || assignedSet.has(tagName) || !selectedSet.has(tagName)) continue;
        seen.add(tagName);
        groups.push({
            id: createId(tagName, groups.length),
            title: tagName,
            tagNames: [tagName],
        });
    }

    return groups;
}

function normalizeDataViewerGlobalTimeRange(range = {}) {
    const startValue = range.from ?? range.start ?? range.startTime;
    const endValue = range.to ?? range.end ?? range.endTime;
    const startTime = typeof startValue === "number" ? startValue : Date.parse(String(startValue ?? ""));
    const endTime = typeof endValue === "number" ? endValue : Date.parse(String(endValue ?? ""));

    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) return undefined;

    return {
        from: new Date(startTime).toISOString(),
        to: new Date(endTime).toISOString(),
    };
}

export function buildDataViewerGlobalTimeUpdate({
    sourceGroupId,
    chartGroups = [],
    chartViewRanges = {},
    chartNavigatorRanges = {},
    chartResults = {},
} = {}) {
    if (!sourceGroupId || chartGroups.length <= 1) return undefined;

    const sourceGroup = chartGroups.find((group) => group?.id === sourceGroupId);
    if (!sourceGroup) return undefined;

    const displayRange =
        normalizeDataViewerGlobalTimeRange(chartViewRanges?.[sourceGroupId]) ||
        normalizeDataViewerGlobalTimeRange(chartResults?.[sourceGroupId]?.range) ||
        normalizeDataViewerGlobalTimeRange(sourceGroup.range);
    const navigatorRange =
        normalizeDataViewerGlobalTimeRange(chartNavigatorRanges?.[sourceGroupId]) ||
        normalizeDataViewerGlobalTimeRange(chartResults?.[sourceGroupId]?.range) ||
        normalizeDataViewerGlobalTimeRange(sourceGroup.range) ||
        displayRange;

    if (!displayRange || !navigatorRange) return undefined;

    const splitRanges = {};
    const viewRanges = {};
    const navigatorRanges = {};
    for (const group of chartGroups) {
        if (group?.split && group.id) {
            splitRanges[group.id] = navigatorRange;
        }
        if (group?.id) {
            viewRanges[group.id] = displayRange;
            navigatorRanges[group.id] = navigatorRange;
        }
    }

    return {
        range: navigatorRange,
        splitRanges,
        viewRanges,
        navigatorRanges,
    };
}

export const QUICK_TIME_RANGE_GROUPS = [
    [
        { key: "now-5s", name: "Last 5 seconds", value: ["now-5s", "now"] },
        { key: "now-10s", name: "Last 10 seconds", value: ["now-10s", "now"] },
        { key: "now-5m", name: "Last 5 minutes", value: ["now-5m", "now"] },
        { key: "now-10m", name: "Last 10 minutes", value: ["now-10m", "now"] },
        { key: "now-1h", name: "Last 1 hour", value: ["now-1h", "now"] },
        { key: "now-3h", name: "Last 3 hour", value: ["now-3h", "now"] },
        { key: "now-1d", name: "Last 1 days", value: ["now-1d", "now"] },
        { key: "now-3d", name: "Last 3 days", value: ["now-3d", "now"] },
        { key: "now-1M", name: "Last 1 months", value: ["now-1M", "now"] },
        { key: "now-1y", name: "Last 1 year", value: ["now-1y", "now"] },
    ],
    [
        { key: "last-5s", name: "Last 5 seconds of data", value: ["last-5s", "last"] },
        { key: "last-10s", name: "Last 10 seconds of data", value: ["last-10s", "last"] },
        { key: "last-5m", name: "Last 5 minutes of data", value: ["last-5m", "last"] },
        { key: "last-10m", name: "Last 10 minutes of data", value: ["last-10m", "last"] },
        { key: "last-1h", name: "Last 1 hour of data", value: ["last-1h", "last"] },
        { key: "last-3h", name: "Last 3 hour of data", value: ["last-3h", "last"] },
        { key: "last-1d", name: "Last 1 days of data", value: ["last-1d", "last"] },
        { key: "last-3d", name: "Last 3 days of data", value: ["last-3d", "last"] },
        { key: "last-1M", name: "Last 1 months of data", value: ["last-1M", "last"] },
        { key: "last-1y", name: "Last 1 year of data", value: ["last-1y", "last"] },
    ],
];

function cleanPathParts(parts) {
    return parts
        .map((part) => String(part || "").trim())
        .filter(Boolean);
}

function isNodeTreeObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function findNodeTreePath(value, targetNodeId, path = []) {
    if (!isNodeTreeObject(value)) return null;

    const currentNodeId = typeof value.nodeId === "string" ? value.nodeId : "";
    if (currentNodeId && (!targetNodeId || currentNodeId === targetNodeId)) {
        const leafPath = [...path];
        if (value.label && leafPath.length > 0) {
            leafPath[leafPath.length - 1] = value.label;
        }
        return cleanPathParts(leafPath);
    }

    for (const [key, child] of Object.entries(value)) {
        if (key === "label" || key === "nodeId" || key === "dataType") continue;
        if (!isNodeTreeObject(child)) continue;

        const found = findNodeTreePath(child, targetNodeId, [...path, key]);
        if (found) return found;
    }

    return null;
}

function getNodeTreePath(node) {
    if (!isNodeTreeObject(node?.nodeTree)) return null;

    for (const root of Object.values(node.nodeTree)) {
        const path = findNodeTreePath(root, node?.nodeId || "");
        if (path && path.length > 1) return path;
    }

    return null;
}

export function getTagTreePath(node) {
    const nodeTreePath = getNodeTreePath(node);
    if (nodeTreePath) return nodeTreePath;

    if (Array.isArray(node?.treePath)) {
        const parts = cleanPathParts(node.treePath);
        return parts.length > 1 ? parts : null;
    }
    if (typeof node?.treePath === "string") {
        const parts = cleanPathParts(node.treePath.split(/[/>]/));
        return parts.length > 1 ? parts : null;
    }
    return null;
}

export function buildTagRows(nodes = []) {
    const rows = [];
    const folders = new Set();

    for (const node of nodes) {
        const path = getTagTreePath(node);
        if (!path) {
            rows.push({
                type: "tag",
                key: `tag:${node.name}`,
                depth: 0,
                label: node.name || node.nodeId || "-",
                tag: node,
            });
            continue;
        }

        const tagLabel = path[path.length - 1];
        for (let i = 0; i < path.length - 1; i++) {
            const folderKey = path.slice(0, i + 1).join("/");
            const ancestorKeys = path.slice(0, i).map((_, index) => `folder:${path.slice(0, index + 1).join("/")}`);
            if (!folders.has(folderKey)) {
                folders.add(folderKey);
                rows.push({
                    type: "folder",
                    key: `folder:${folderKey}`,
                    ancestorKeys,
                    depth: i,
                    label: path[i],
                });
            }
        }
        const tagAncestorKeys = path.slice(0, -1).map((_, index) => `folder:${path.slice(0, index + 1).join("/")}`);
        rows.push({
            type: "tag",
            key: `tag:${node.name || path.join("/")}`,
            ancestorKeys: tagAncestorKeys,
            depth: path.length - 1,
            label: tagLabel,
            tag: node,
        });
    }

    return rows;
}

function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function hasAssetHierarchy(assetHierarchy) {
    return Boolean(
        assetHierarchy &&
        Array.isArray(assetHierarchy.schema) &&
        assetHierarchy.schema.length > 0 &&
        assetHierarchy.schema.every((key) => typeof key === "string" && key.trim()) &&
        Array.isArray(assetHierarchy.tree)
    );
}

function assetPathKey(parts) {
    return parts.map((part) => `${part.key}=${part.value}`).join("/");
}

function collectAssetFolders(nodes = [], schema = [], folders = new Map(), path = [], depth = 0) {
    if (!Array.isArray(nodes) || depth >= schema.length) return folders;

    for (const node of nodes) {
        if (!isPlainObject(node)) continue;
        const key = String(node.key || "").trim();
        const value = String(node.value || "").trim();
        if (!key || !value || key !== schema[depth]) continue;
        const nextPath = [...path, { key, value }];
        folders.set(assetPathKey(nextPath), { node, path: nextPath, depth });
        collectAssetFolders(node.children || [], schema, folders, nextPath, depth + 1);
    }

    return folders;
}

function deepestAssetFolderKey(asset, schema, folders) {
    if (!isPlainObject(asset)) return "";
    const path = [];
    let deepest = "";
    let deepestFolder = null;

    for (const key of schema) {
        const value = String(asset[key] || "").trim();
        if (!value) break;
        path.push({ key, value });
        const folderKey = assetPathKey(path);
        if (!folders.has(folderKey)) {
            return Array.isArray(deepestFolder?.node?.children) && deepestFolder.node.children.length > 0 ? "" : deepest;
        }
        deepest = folderKey;
        deepestFolder = folders.get(folderKey);
    }

    return deepest;
}

export function buildAssetRows(assetHierarchy, tags = []) {
    if (!hasAssetHierarchy(assetHierarchy)) return [];
    const schema = assetHierarchy.schema.map((key) => String(key).trim());
    const folders = collectAssetFolders(assetHierarchy.tree, schema);
    const tagsByFolder = new Map();

    for (const tag of Array.isArray(tags) ? tags : []) {
        const name = tag?.name || tag?.NAME;
        if (!name) continue;
        const folderKey = deepestAssetFolderKey(tag.asset || tag.ASSET, schema, folders);
        if (!folderKey) continue;
        if (!tagsByFolder.has(folderKey)) tagsByFolder.set(folderKey, []);
        tagsByFolder.get(folderKey).push({ ...tag, name: String(name) });
    }

    const rows = [];
    const walk = (nodes = [], path = [], depth = 0) => {
        if (!Array.isArray(nodes) || depth >= schema.length) return;
        for (const node of nodes) {
            if (!isPlainObject(node)) continue;
            const key = String(node.key || "").trim();
            const value = String(node.value || "").trim();
            if (!key || !value || key !== schema[depth]) continue;
            const nextPath = [...path, { key, value }];
            const folderKey = assetPathKey(nextPath);
            const ancestorKeys = nextPath
                .slice(0, -1)
                .map((_, index) => `asset-folder:${assetPathKey(nextPath.slice(0, index + 1))}`);
            rows.push({
                type: "folder",
                key: `asset-folder:${folderKey}`,
                ancestorKeys,
                depth,
                label: value,
                assetPath: nextPath,
            });

            for (const tag of tagsByFolder.get(folderKey) || []) {
                rows.push({
                    type: "tag",
                    key: `asset-tag:${folderKey}:${tag.name}`,
                    ancestorKeys: [...ancestorKeys, `asset-folder:${folderKey}`],
                    depth: depth + 1,
                    label: tag.name,
                    tag,
                    selectable: true,
                });
            }

            walk(node.children || [], nextPath, depth + 1);
        }
    };

    walk(assetHierarchy.tree);
    return rows;
}

export function getVisibleTagRows(rows = [], collapsedKeys = new Set()) {
    const collapsed = collapsedKeys instanceof Set ? collapsedKeys : new Set(collapsedKeys || []);
    return rows.filter((row) => !(row.ancestorKeys || []).some((key) => collapsed.has(key)));
}

export function resolveTagNodes(configuredNodes = [], tableTags = []) {
    const nodes = Array.isArray(configuredNodes)
        ? configuredNodes.filter((node) => node && (node.name || node.nodeId))
        : [];
    if (nodes.length > 0) return nodes;

    if (!Array.isArray(tableTags)) return [];
    return tableTags
        .map((tag) => {
            if (typeof tag === "string") return { name: tag };
            const name = tag?.name || tag?.NAME;
            if (!name) return null;
            const node = { name: String(name) };
            const dataType = tag?.dataType || tag?.type || tag?.TYPE;
            if (dataType) node.dataType = String(dataType);
            return node;
        })
        .filter(Boolean);
}

function toEpochMs(value) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return Number.NaN;
        if (Math.abs(value) > 100000000000000) return value / 1000000;
        return value;
    }

    const text = String(value ?? "").trim();
    if (!text) return Number.NaN;
    const numeric = Number(text);
    if (Number.isFinite(numeric)) return toEpochMs(numeric);

    return Date.parse(text);
}

export function buildTagChartSeries(rows = []) {
    const seriesByName = new Map();

    rows.forEach((row) => {
        const name = String(row?.name ?? "");
        const x = toEpochMs(row?.time);
        const y = Number(row?.value);
        if (!name || !Number.isFinite(x) || !Number.isFinite(y)) return;
        if (!seriesByName.has(name)) {
            seriesByName.set(name, []);
        }
        seriesByName.get(name).push([x, y]);
    });

    return Array.from(seriesByName.entries()).map(([name, data]) => ({
        name,
        data: data.sort((a, b) => a[0] - b[0]),
    }));
}

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function chooseTimeTickInterval(duration) {
    if (!Number.isFinite(duration) || duration <= 0) return undefined;
    if (duration <= 10 * SECOND_MS) return SECOND_MS;
    if (duration <= MINUTE_MS) return 10 * SECOND_MS;
    if (duration <= 5 * MINUTE_MS) return MINUTE_MS;
    if (duration <= 10 * MINUTE_MS) return 2 * MINUTE_MS;
    if (duration <= HOUR_MS) return 10 * MINUTE_MS;
    if (duration <= 3 * HOUR_MS) return 30 * MINUTE_MS;
    if (duration <= DAY_MS) return 3 * HOUR_MS;
    if (duration <= 3 * DAY_MS) return 12 * HOUR_MS;
    if (duration <= 31 * DAY_MS) return 7 * DAY_MS;
    if (duration <= 366 * DAY_MS) return 30 * DAY_MS;
    return 90 * DAY_MS;
}

export function buildDataViewerChartXAxis(points = [], range = {}) {
    const rangeFrom = toEpochMs(range?.from);
    const rangeTo = toEpochMs(range?.to);

    let min = Number.isFinite(rangeFrom) ? rangeFrom : undefined;
    let max = Number.isFinite(rangeTo) ? rangeTo : undefined;

    if (min === undefined || max === undefined) {
        for (const point of points) {
            const value = Array.isArray(point) ? point[0] : point?.x;
            if (!Number.isFinite(value)) continue;
            if (min === undefined || value < min) min = value;
            if (max === undefined || value > max) max = value;
        }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) return {};

    if (min > max) {
        const tmp = min;
        min = max;
        max = tmp;
    }

    return {
        min,
        max,
        tickInterval: chooseTimeTickInterval(max - min),
    };
}

const PANEL_LEGEND_TOP = 6;
const PANEL_GRID_BOTTOM = 20;
const PANEL_GRID_SIDE = 35;
const PANEL_NAVIGATOR_GRID_SIDE = 58;
const PANEL_SLIDER_HEIGHT = 26;
const PANEL_MAIN_TOP_WITH_LEGEND = 40;
const PANEL_MAIN_HEIGHT = 178;
const PANEL_MAIN_SERIES_ID_PREFIX = "main-series-";
const PANEL_COLORS = ["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de", "#3ba272", "#fc8452", "#9a60b4", "#ea7ccc"];
const PANEL_MOUSE_WHEEL_ZOOM_IN_FACTOR = 0.82;
const PANEL_MOUSE_WHEEL_ZOOM_OUT_FACTOR = 1.22;

const AXIS_LINE_STYLE = { lineStyle: { color: "#323333" } };
const AXIS_SPLIT_LINE_STYLE = { color: "#323333", width: 1 };
const PANEL_AXIS_LABEL_STYLE = { color: "#f8f8f8", fontSize: 10 };
const Y_AXIS_LABEL_STYLE = {
    color: "#afb5bc",
    fontSize: 10,
    formatter: formatYAxisLabel,
};

function formatYAxisLabel(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return String(value);
    const units = [
        { value: 1_000_000_000_000, suffix: "T" },
        { value: 1_000_000_000, suffix: "B" },
        { value: 1_000_000, suffix: "M" },
        { value: 1_000, suffix: "K" },
    ];
    const normalized = Object.is(numeric, -0) ? 0 : numeric;
    const abs = Math.abs(normalized);
    const unit = units.find((item) => abs >= item.value);
    if (!unit) {
        return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(normalized);
    }
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(normalized / unit.value)}${unit.suffix}`;
}

function getPanelRange(points, timeRange) {
    const axis = buildDataViewerChartXAxis(points, timeRange);
    const now = Date.now();
    return {
        startTime: Number.isFinite(axis.min) ? axis.min : now - 60 * 60 * 1000,
        endTime: Number.isFinite(axis.max) ? axis.max : now,
    };
}

export function getDataViewerChartRangeMs(points = [], timeRange = {}) {
    return getPanelRange(points, timeRange);
}

function getPrimaryDataZoomEventItem(zoomData = {}) {
    return Array.isArray(zoomData?.batch) ? zoomData.batch[0] : zoomData;
}

function hasExplicitDataZoomRange(dataZoomState = {}) {
    return (
        (dataZoomState.startValue !== undefined && dataZoomState.endValue !== undefined) ||
        (dataZoomState.start !== undefined && dataZoomState.end !== undefined)
    );
}

function getExplicitDataZoomRange(zoomData = {}) {
    const startValue = zoomData.startValue;
    const endValue = zoomData.endValue;

    if (startValue === undefined || endValue === undefined) {
        return undefined;
    }

    const startTime = Number(startValue);
    const endTime = Number(endValue);

    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
        return undefined;
    }

    return {
        startTime,
        endTime,
    };
}

export function extractDataViewerDataZoomRange(params = {}, currentRange = {}, axisRange = currentRange) {
    const zoomData = getPrimaryDataZoomEventItem(params);
    if (!zoomData) return undefined;

    const explicitRange = getExplicitDataZoomRange(zoomData);
    if (explicitRange) return explicitRange;

    const axisStartTime = Number(axisRange.startTime);
    const axisEndTime = Number(axisRange.endTime);
    const axisSpan = axisEndTime - axisStartTime;
    if (
        typeof zoomData.start === "number" &&
        typeof zoomData.end === "number" &&
        Number.isFinite(axisSpan) &&
        axisSpan > 0
    ) {
        return {
            startTime: axisStartTime + (axisSpan * zoomData.start) / 100,
            endTime: axisStartTime + (axisSpan * zoomData.end) / 100,
        };
    }

    return undefined;
}

export function hasExplicitDataViewerDataZoomEventRange(params = {}) {
    const zoomData = getPrimaryDataZoomEventItem(params);
    return zoomData ? hasExplicitDataZoomRange(zoomData) : false;
}

export function isSameDataViewerChartRange(a = {}, b = {}) {
    const aStart = Number(a.startTime);
    const aEnd = Number(a.endTime);
    const bStart = Number(b.startTime);
    const bEnd = Number(b.endTime);
    if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite)) return false;
    return Math.floor(aStart) === Math.floor(bStart) && Math.ceil(aEnd) === Math.ceil(bEnd);
}

export function buildDataViewerZoomControlRange(action, currentRange = {}, navigatorRange = {}, zoom = 0.2) {
    const currentStart = Number(currentRange.startTime);
    const currentEnd = Number(currentRange.endTime);
    const navigatorStart = Number(navigatorRange.startTime);
    const navigatorEnd = Number(navigatorRange.endTime);
    if (![currentStart, currentEnd, navigatorStart, navigatorEnd].every(Number.isFinite)) return undefined;
    if (currentEnd <= currentStart || navigatorEnd <= navigatorStart) return undefined;

    const currentSpan = currentEnd - currentStart;
    const navigatorSpan = navigatorEnd - navigatorStart;
    const center = currentStart + currentSpan / 2;
    let nextStart = currentStart;
    let nextEnd = currentEnd;

    if (action === "zoom-in") {
        const offset = currentSpan * zoom;
        nextStart = currentStart + offset;
        nextEnd = currentEnd - offset;
    } else if (action === "zoom-out") {
        const offset = currentSpan * zoom;
        nextStart = currentStart - offset;
        nextEnd = currentEnd + offset;
    } else if (action === "focus") {
        const nextSpan = Math.max(currentSpan * 0.2, 1);
        nextStart = center - nextSpan / 2;
        nextEnd = center + nextSpan / 2;
    } else if (action === "pan-left") {
        nextStart = currentStart - currentSpan / 2;
        nextEnd = currentEnd - currentSpan / 2;
    } else if (action === "pan-right") {
        nextStart = currentStart + currentSpan / 2;
        nextEnd = currentEnd + currentSpan / 2;
    } else {
        return undefined;
    }

    if (nextStart < navigatorStart) {
        nextEnd += navigatorStart - nextStart;
        nextStart = navigatorStart;
    }
    if (nextEnd > navigatorEnd) {
        nextStart -= nextEnd - navigatorEnd;
        nextEnd = navigatorEnd;
    }
    nextStart = Math.max(nextStart, navigatorStart);
    nextEnd = Math.min(nextEnd, navigatorEnd);

    if (nextEnd <= nextStart) return undefined;
    return { startTime: nextStart, endTime: nextEnd };
}

export function buildDataViewerWheelZoomRange(deltaY, anchorTime, currentRange = {}, navigatorRange = {}) {
    const currentStart = Number(currentRange.startTime);
    const currentEnd = Number(currentRange.endTime);
    const navigatorStart = Number(navigatorRange.startTime);
    const navigatorEnd = Number(navigatorRange.endTime);
    const anchor = Number(anchorTime);
    if (![currentStart, currentEnd, navigatorStart, navigatorEnd, anchor, deltaY].every(Number.isFinite)) return undefined;
    if (deltaY === 0 || currentEnd <= currentStart || navigatorEnd <= navigatorStart) return undefined;

    const currentSpan = currentEnd - currentStart;
    const navigatorSpan = navigatorEnd - navigatorStart;
    const factor = deltaY < 0 ? PANEL_MOUSE_WHEEL_ZOOM_IN_FACTOR : PANEL_MOUSE_WHEEL_ZOOM_OUT_FACTOR;
    const nextSpan = Math.min(Math.max(currentSpan * factor, 1), navigatorSpan);
    const anchorRatio = Math.min(Math.max((anchor - currentStart) / currentSpan, 0), 1);
    let nextStart = anchor - nextSpan * anchorRatio;
    let nextEnd = nextStart + nextSpan;

    if (nextStart < navigatorStart) {
        nextEnd += navigatorStart - nextStart;
        nextStart = navigatorStart;
    }
    if (nextEnd > navigatorEnd) {
        nextStart -= nextEnd - navigatorEnd;
        nextEnd = navigatorEnd;
    }
    nextStart = Math.max(nextStart, navigatorStart);
    nextEnd = Math.min(nextEnd, navigatorEnd);

    if (nextEnd <= nextStart) return undefined;
    return { startTime: nextStart, endTime: nextEnd };
}

function getRoundedAxisStep(axisRangeValue) {
    const reference = Math.max(Math.abs(axisRangeValue) / 5, Number.MIN_VALUE);
    const exponent = Math.floor(Math.log10(reference));
    const magnitude = 10 ** exponent;
    const fraction = reference / magnitude;
    if (fraction <= 1) return magnitude;
    if (fraction <= 2) return 2 * magnitude;
    if (fraction <= 5) return 5 * magnitude;
    return 10 * magnitude;
}

function getYAxisRange(series, panelRange) {
    let rawMin;
    let rawMax;
    series.forEach((item) => {
        (item.data || []).forEach(([x, y]) => {
            if (x >= panelRange.startTime && x <= panelRange.endTime && typeof y === "number" && Number.isFinite(y)) {
                if (rawMin === undefined || y < rawMin) rawMin = y;
                if (rawMax === undefined || y > rawMax) rawMax = y;
            }
        });
    });
    if (rawMin === undefined || rawMax === undefined) return { min: undefined, max: undefined };
    const range = rawMax - rawMin;
    const fallback = Math.max(Math.abs(rawMax), Math.abs(rawMin), 1);
    const step = getRoundedAxisStep(range > 0 ? range : fallback);
    const min = Math.floor(rawMin / step) * step;
    const max = Math.ceil(rawMax / step) * step;
    return {
        min: Number(min.toPrecision(12)),
        max: Number((max > min ? max : min + step).toPrecision(12)),
    };
}

function buildNeoLikeTooltipFormatter(params, timeFormat, timeZone) {
    const items = (Array.isArray(params) ? params : [params])
        .filter((item) => String(item?.seriesId || "").startsWith(PANEL_MAIN_SERIES_ID_PREFIX));
    if (items.length === 0) return "";
    const firstValue = Array.isArray(items[0].value) ? items[0].value : [];
    const time = formatDataViewerTime(Number(firstValue[0] ?? items[0].axisValue), timeFormat, timeZone);
    return `<div>
        <div style="min-width:0;padding-left:10px;font-size:10px;color:#afb5bc">${time}</div>
        <div style="padding:6px 0 0 10px">
        ${items.map((item) => {
            const value = Array.isArray(item.value) ? item.value[1] : "";
            const colorStyle = typeof item.color === "string" ? `color:${item.color};` : "";
            return `<div style="${colorStyle}margin:0;padding:0;white-space:nowrap">${item.seriesName} : ${value ?? ""}</div>`;
        }).join("")}
        </div>
    </div>`;
}

export function buildDataViewerEChartOption({
    series = [],
    timeRange = {},
    displayRange,
    timeFormat = DEFAULT_TIME_FORMAT,
    timeZone = DEFAULT_TIME_ZONE,
} = {}) {
    const allPoints = series.flatMap((item) => Array.isArray(item?.data) ? item.data : []);
    const panelRange = getPanelRange(allPoints, displayRange || timeRange);
    const navigatorRange = getPanelRange(allPoints, timeRange);
    const yAxisRange = getYAxisRange(series, panelRange);

    return {
        backgroundColor: "#252525",
        animation: false,
        textStyle: {
            fontFamily: "Open Sans, Helvetica, Arial, sans-serif",
        },
        color: PANEL_COLORS,
        grid: [
            {
                id: "panel-main-grid",
                left: PANEL_GRID_SIDE,
                right: PANEL_GRID_SIDE,
                top: PANEL_MAIN_TOP_WITH_LEGEND,
                height: PANEL_MAIN_HEIGHT,
                containLabel: true,
            },
            {
                id: "panel-navigator-grid",
                left: PANEL_NAVIGATOR_GRID_SIDE,
                right: PANEL_NAVIGATOR_GRID_SIDE,
                bottom: PANEL_GRID_BOTTOM,
                height: PANEL_SLIDER_HEIGHT,
            },
        ],
        legend: {
            show: true,
            left: 10,
            top: PANEL_LEGEND_TOP,
            itemGap: 15,
            textStyle: {
                color: "#e7e8ea",
                fontSize: 10,
            },
        },
        tooltip: {
            trigger: "axis",
            confine: true,
            backgroundColor: "#1f1d1d",
            borderColor: "#292929",
            borderWidth: 1,
            textStyle: {
                color: "#afb5bc",
                fontSize: 10,
            },
            axisPointer: { type: "line", snap: false },
            formatter: (params) => buildNeoLikeTooltipFormatter(params, timeFormat, timeZone),
        },
        xAxis: [
            {
                id: "panel-main-x-axis",
                type: "time",
                gridIndex: 0,
                min: panelRange.startTime,
                max: panelRange.endTime,
                axisLine: AXIS_LINE_STYLE,
                axisTick: AXIS_LINE_STYLE,
                axisLabel: {
                    ...PANEL_AXIS_LABEL_STYLE,
                    formatter: (value) => formatDataViewerAxisTime(value, { min: panelRange.startTime, max: panelRange.endTime }, timeZone),
                },
                splitLine: {
                    show: true,
                    lineStyle: AXIS_SPLIT_LINE_STYLE,
                },
                axisPointer: {
                    label: { show: false },
                },
            },
            {
                id: "panel-navigator-x-axis",
                type: "time",
                gridIndex: 1,
                min: navigatorRange.startTime,
                max: navigatorRange.endTime,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { show: false },
                splitLine: { show: false },
                axisPointer: { show: false, label: { show: false } },
            },
            {
                id: "panel-navigator-data-x-axis",
                type: "time",
                gridIndex: 1,
                min: navigatorRange.startTime,
                max: navigatorRange.endTime,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { show: false },
                splitLine: { show: false },
                axisPointer: { show: false, label: { show: false } },
            },
        ],
        yAxis: [
            {
                id: "panel-left-y-axis",
                type: "value",
                gridIndex: 0,
                min: yAxisRange.min,
                max: yAxisRange.max,
                axisLine: AXIS_LINE_STYLE,
                axisLabel: Y_AXIS_LABEL_STYLE,
                splitLine: {
                    show: true,
                    lineStyle: AXIS_SPLIT_LINE_STYLE,
                },
                minInterval: 0,
                scale: true,
            },
            {
                id: "panel-right-y-axis",
                type: "value",
                gridIndex: 0,
                position: "left",
                axisLine: AXIS_LINE_STYLE,
                axisLabel: { ...Y_AXIS_LABEL_STYLE, show: false },
                splitLine: {
                    show: true,
                    lineStyle: AXIS_SPLIT_LINE_STYLE,
                },
                minInterval: 0,
                scale: true,
            },
            {
                id: "panel-navigator-y-axis",
                type: "value",
                gridIndex: 1,
                boundaryGap: ["18%", "18%"],
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { show: false },
                splitLine: { show: false },
                axisPointer: { show: false, label: { show: false } },
                scale: true,
            },
        ],
        dataZoom: [
            {
                id: "panel-inside-data-zoom",
                type: "inside",
                xAxisIndex: [1],
                filterMode: "none",
                startValue: panelRange.startTime,
                endValue: panelRange.endTime,
                zoomOnMouseWheel: false,
                moveOnMouseMove: false,
                moveOnMouseWheel: false,
                preventDefaultMouseMove: true,
            },
            {
                id: "panel-slider-data-zoom",
                type: "slider",
                xAxisIndex: [1],
                filterMode: "none",
                startValue: panelRange.startTime,
                endValue: panelRange.endTime,
                realtime: false,
                left: PANEL_NAVIGATOR_GRID_SIDE,
                right: PANEL_NAVIGATOR_GRID_SIDE,
                bottom: PANEL_GRID_BOTTOM,
                height: PANEL_SLIDER_HEIGHT,
                showDetail: false,
                brushSelect: false,
                backgroundColor: "rgba(0, 0, 0, 0)",
                borderColor: "#7a828c",
                fillerColor: "rgba(104, 119, 138, 0.28)",
                showDataShadow: false,
                dataBackground: {
                    lineStyle: { color: "#c0c7d0", opacity: 0.8 },
                    areaStyle: { color: "#a8b0ba", opacity: 0.28 },
                },
                selectedDataBackground: {
                    lineStyle: { color: "#a8b3c1", opacity: 0.62 },
                    areaStyle: { color: "#7f8da0", opacity: 0.18 },
                },
                handleSize: 24,
                handleStyle: {
                    color: "rgba(245, 247, 250, 0.78)",
                    borderColor: "#8a939e",
                },
                moveHandleStyle: {
                    color: "rgba(245, 247, 250, 0.32)",
                    opacity: 0.75,
                },
            },
        ],
        brush: {
            toolbox: [],
            xAxisIndex: 0,
            brushMode: "single",
            throttleType: "debounce",
            throttleDelay: 150,
            brushStyle: {
                color: "rgba(68, 170, 213, 0.28)",
                borderColor: "rgba(68, 170, 213, 0.85)",
                borderWidth: 2,
            },
        },
        toolbox: { show: false },
        title: { show: false },
        series: [
            ...series.map((item, index) => ({
                id: `${PANEL_MAIN_SERIES_ID_PREFIX}${index}`,
                name: item.name,
                type: "line",
                legendHoverLink: false,
                data: Array.isArray(item.data) ? item.data : [],
                xAxisIndex: 0,
                yAxisIndex: 0,
                symbol: "circle",
                showSymbol: false,
                symbolSize: 6,
                animation: false,
                sampling: item.data?.length > 1000 ? "lttb" : undefined,
                lineStyle: {
                    width: 1,
                    color: PANEL_COLORS[index % PANEL_COLORS.length],
                    opacity: 1,
                },
                itemStyle: {
                    color: PANEL_COLORS[index % PANEL_COLORS.length],
                    opacity: 1,
                },
                connectNulls: false,
                triggerEvent: true,
                z: 2,
            })),
            ...series.map((item, index) => ({
                id: `navigator-series-${index}`,
                name: item.name,
                type: "line",
                legendHoverLink: false,
                data: Array.isArray(item.data) ? item.data : [],
                xAxisIndex: 2,
                yAxisIndex: 2,
                showSymbol: false,
                silent: true,
                tooltip: { show: false },
                animation: false,
                sampling: item.data?.length > 1000 ? "lttb" : undefined,
                lineStyle: {
                    width: 1,
                    color: PANEL_COLORS[index % PANEL_COLORS.length],
                    opacity: 0.85,
                },
                itemStyle: {
                    color: PANEL_COLORS[index % PANEL_COLORS.length],
                    opacity: 0.85,
                },
                emphasis: { disabled: true },
                z: 1,
            })),
        ],
    };
}

export function defaultSelectedTag(rows = []) {
    return rows.find((row) => row.type === "tag")?.tag || null;
}

function cleanTagName(name) {
    return String(name ?? "").trim();
}

function getSelectableTagNames(rows = []) {
    const names = [];
    const seen = new Set();

    for (const row of rows) {
        if (row?.type !== "tag" || row.selectable === false) continue;
        const name = cleanTagName(row?.tag?.name);
        if (!name || seen.has(name)) continue;
        seen.add(name);
        names.push(name);
    }

    return names;
}

export function normalizeSelectedTagNames(selectedNames = [], selectableRows = []) {
    const selectableNames = getSelectableTagNames(selectableRows);
    if (selectableNames.length === 0) return [];

    const selectable = new Set(selectableNames);
    const seen = new Set();
    const normalized = (Array.isArray(selectedNames) ? selectedNames : [])
        .map(cleanTagName)
        .filter((name) => {
            if (!name || !selectable.has(name) || seen.has(name)) return false;
            seen.add(name);
            return true;
        });

    return normalized.length > 0 ? normalized : [selectableNames[0]];
}

export function toggleSelectedTagName(selectedNames = [], tagName = "") {
    const name = cleanTagName(tagName);
    const current = (Array.isArray(selectedNames) ? selectedNames : [])
        .map(cleanTagName)
        .filter(Boolean);

    if (!name) return current;
    if (current.includes(name)) {
        return current.filter((selectedName) => selectedName !== name);
    }
    return [...current, name];
}

function pad(value, len = 2) {
    return String(value).padStart(len, "0");
}

function formatDateTimeText(date) {
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const mi = pad(date.getMinutes());
    const ss = pad(date.getSeconds());
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

export function formatTimeRangeInput(value) {
    if (!value) return "";
    const text = String(value).trim();
    if (text.includes("now") || text.includes("last")) return text;
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? text : formatDateTimeText(date);
}

function applyRelativeTime(value, baseDate) {
    const text = String(value || "").trim();
    if (text === "now" || text === "last") return new Date(baseDate.getTime());

    const match = text.match(/^(?:now|last)-(\d+)([smhdMy])$/);
    if (!match) return null;

    const amount = Number(match[1]);
    const unit = match[2];
    const date = new Date(baseDate.getTime());
    if (unit === "s") date.setSeconds(date.getSeconds() - amount);
    if (unit === "m") date.setMinutes(date.getMinutes() - amount);
    if (unit === "h") date.setHours(date.getHours() - amount);
    if (unit === "d") date.setDate(date.getDate() - amount);
    if (unit === "M") date.setMonth(date.getMonth() - amount);
    if (unit === "y") date.setFullYear(date.getFullYear() - amount);
    return date;
}

export function resolveTimeRangeInput(value, baseDate = new Date()) {
    const text = String(value || "").trim();
    if (!text) return "";

    const relativeDate = applyRelativeTime(text, baseDate);
    if (relativeDate) return relativeDate.toISOString();

    const date = new Date(text.includes("T") ? text : text.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
}

function toDate(value) {
    if (value instanceof Date) return value;
    const epochMs = toEpochMs(value);
    if (!Number.isFinite(epochMs)) return null;
    const date = new Date(epochMs);
    return Number.isNaN(date.getTime()) ? null : date;
}

function getDateParts(date, timeZone = DEFAULT_TIME_ZONE) {
    if (!timeZone || timeZone === "LOCAL") {
        return {
            yyyy: String(date.getFullYear()),
            yy: pad(date.getFullYear() % 100),
            mm: pad(date.getMonth() + 1),
            dd: pad(date.getDate()),
            hh: pad(date.getHours()),
            mi: pad(date.getMinutes()),
            ss: pad(date.getSeconds()),
            ms: pad(date.getMilliseconds(), 3),
        };
    }

    try {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone,
            hourCycle: "h23",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        }).formatToParts(date);
        const partValue = (type) => parts.find((part) => part.type === type)?.value || "00";
        const yyyy = partValue("year");
        return {
            yyyy,
            yy: yyyy.slice(-2),
            mm: partValue("month"),
            dd: partValue("day"),
            hh: partValue("hour"),
            mi: partValue("minute"),
            ss: partValue("second"),
            ms: pad(date.getMilliseconds(), 3),
        };
    } catch {
        return getDateParts(date, DEFAULT_TIME_ZONE);
    }
}

export function formatDataViewerTime(value, format = DEFAULT_TIME_FORMAT, timeZone = DEFAULT_TIME_ZONE) {
    const epochMs = toEpochMs(value);
    if (!Number.isFinite(epochMs)) return value == null ? "" : String(value);

    if (format === "ns" || format === "EPOCH_NS") return String(BigInt(Math.trunc(epochMs)) * 1000000n);
    if (format === "us") return String(Math.trunc(epochMs * 1000));
    if (format === "ms" || format === "EPOCH_MS") return String(Math.trunc(epochMs));
    if (format === "s") return String(Math.trunc(epochMs / 1000));

    const date = toDate(value);
    if (!date) return value == null ? "" : String(value);

    if (format === "ISO") return date.toISOString();

    const { yyyy, yy, mm, dd, hh, mi, ss, ms } = getDateParts(date, timeZone);

    if (format === "2006-01-02") return `${yyyy}-${mm}-${dd}`;
    if (format === "2006-02-01") return `${yyyy}-${dd}-${mm}`;
    if (format === "02-01-2006") return `${dd}-${mm}-${yyyy}`;
    if (format === "01-02-2006") return `${mm}-${dd}-${yyyy}`;
    if (format === "06-02-01") return `${yy}-${dd}-${mm}`;
    if (format === "06-01-02") return `${yy}-${mm}-${dd}`;
    if (format === "01-02-06") return `${mm}-${dd}-${yy}`;
    if (format === "02-01-06") return `${dd}-${mm}-${yy}`;
    if (format === "2006-01-02 15:04:05") return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
    if (format === "2006-01-02 15:04:05.000") return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}.${ms}`;
    if (format === "2006-01-02 15:04:05.000000") return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}.${ms}000`;
    if (format === "2006-01-02 15:04:05.000000000") return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}.${ms}000000`;
    if (format === "2006-01-02 15") return `${yyyy}-${mm}-${dd} ${hh}`;
    if (format === "2006-01-02 15:04") return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    if (format === "03:04:05") return `${hh}:${mi}:${ss}`;

    // Keep old Data Viewer formats readable for old saved state/tests.
    if (format === "YYYY-MM-DD HH24:MI:SS") return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
    if (format === "HH24:MI:SS.mmm") return `${hh}:${mi}:${ss}.${ms}`;
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}.${ms}`;
}

export function formatDataViewerAxisTime(value, range = {}, timeZone = DEFAULT_TIME_ZONE) {
    const startTime = toEpochMs(range?.min ?? range?.from ?? range?.startTime);
    const endTime = toEpochMs(range?.max ?? range?.to ?? range?.endTime);
    const span = Number.isFinite(startTime) && Number.isFinite(endTime)
        ? endTime - startTime
        : 0;

    if (span <= HOUR_MS) {
        return formatDataViewerTime(value, "03:04:05", timeZone);
    }

    if (span <= DAY_MS) {
        return formatDataViewerTime(value, "2006-01-02 15:04", timeZone).slice(11);
    }

    if (span <= 30 * DAY_MS) {
        return formatDataViewerTime(value, "2006-01-02 15:04", timeZone).slice(5);
    }

    return formatDataViewerTime(value, "2006-01-02", timeZone);
}

export function formatTimeRangeLabel(from, to) {
    const formatPart = (value, fallback) => {
        const text = String(value || "").trim();
        if (!text) return fallback;
        if (text.includes("now") || text.includes("last")) return text;
        return formatDataViewerTime(text, "YYYY-MM-DD HH24:MI:SS");
    };

    if (!from && !to) return "Time range not set";
    return `${formatPart(from, "Start")} ~ ${formatPart(to, "End")}`;
}
