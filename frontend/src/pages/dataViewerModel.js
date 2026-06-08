export const TIME_FORMATS = [
    { value: "YYYY-MM-DD HH24:MI:SS.mmm", label: "YYYY-MM-DD HH24:MI:SS.mmm" },
    { value: "YYYY-MM-DD HH24:MI:SS", label: "YYYY-MM-DD HH24:MI:SS" },
    { value: "HH24:MI:SS.mmm", label: "HH24:MI:SS.mmm" },
    { value: "ISO", label: "ISO" },
    { value: "EPOCH_MS", label: "Epoch ms" },
    { value: "EPOCH_NS", label: "Epoch ns" },
];

export const DATA_VIEWER_ROUTE_BASE = "/data-viewer";

export function buildDataViewerPath(collectorId) {
    return `${DATA_VIEWER_ROUTE_BASE}/${encodeURIComponent(String(collectorId || ""))}`;
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

export function getTagTreePath(node) {
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
            if (!folders.has(folderKey)) {
                folders.add(folderKey);
                rows.push({
                    type: "folder",
                    key: `folder:${folderKey}`,
                    depth: i,
                    label: path[i],
                });
            }
        }
        rows.push({
            type: "tag",
            key: `tag:${node.name || path.join("/")}`,
            depth: path.length - 1,
            label: tagLabel,
            tag: node,
        });
    }

    return rows;
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
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDataViewerTime(value, format = "YYYY-MM-DD HH24:MI:SS.mmm") {
    const date = toDate(value);
    if (!date) return value == null ? "" : String(value);

    if (format === "ISO") return date.toISOString();
    if (format === "EPOCH_MS") return String(date.getTime());
    if (format === "EPOCH_NS") return String(BigInt(date.getTime()) * 1000000n);

    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const mi = pad(date.getMinutes());
    const ss = pad(date.getSeconds());
    const ms = pad(date.getMilliseconds(), 3);

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
