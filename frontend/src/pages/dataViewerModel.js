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

const RAW_COLUMN_ORDER = ["time", "name", "value"];
const INTERNAL_RAW_RESULT_KEYS = new Set(["buffer", "names"]);

function formatRawColumnLabel(key) {
    return String(key || "")
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ");
}

export function buildRawResultColumns(rows = []) {
    const keys = [];
    const seen = new Set();

    for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        for (const key of Object.keys(row)) {
            if (INTERNAL_RAW_RESULT_KEYS.has(String(key).toLowerCase())) continue;
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

export function defaultSelectedTag(rows = []) {
    return rows.find((row) => row.type === "tag")?.tag || null;
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
