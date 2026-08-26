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
    const start = normalizeTagAnalyzerRangeValue(range.from ?? range.start ?? range.startTime ?? range.startIso ?? range.startEpochMs, "start");
    const end = normalizeTagAnalyzerRangeValue(range.to ?? range.end ?? range.endTime ?? range.endIso ?? range.endEpochMs, "end");
    if (Object.keys(start).length === 0 || Object.keys(end).length === 0) return undefined;

    const startMs = start.startEpochMs ?? Date.parse(start.startIso);
    const endMs = end.endEpochMs ?? Date.parse(end.endIso);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return undefined;
    return { ...start, ...end };
}

/**
 * The table's PRIMARY KEY and BASETIME column names, for the Tag Analyzer bridge.
 *
 * Every other layer already resolves these from the catalog — the tag data API overwrites
 * whatever the client sends with the real columns (`resolveTagKeyColumnNames` in
 * cgi-bin/src/db/types.js), and the collector takes the base column name from the append
 * stream. The bridge payload was the last place still assuming NAME/TIME, and neo-web puts
 * `colName.name`/`colName.time` straight into SQL, so a table that names them otherwise
 * queries columns that do not exist.
 *
 * Returns "" for a column the flags do not identify; the message builder's NAME/TIME
 * defaults then apply, which matches the backend's legacy fallback.
 *
 * @param {Array<{ name?: string, primaryKey?: boolean, basetime?: boolean }>} columns - columns API payload
 * @returns {{ nameColumn: string, timeColumn: string }}
 */
export function resolveTagAnalyzerKeyColumns(columns) {
    const rows = Array.isArray(columns) ? columns : [];
    const nameByFlag = (flag) => String(rows.find((col) => col?.[flag])?.name ?? "").trim();

    return {
        nameColumn: nameByFlag("primaryKey"),
        timeColumn: nameByFlag("basetime"),
    };
}

// neo-web rejects the WHOLE payload when it carries more than this many tags — it does not
// truncate — so the viewer has to stop before sending. (tagAnalyzer PANEL_TAG_LIMIT)
export const TAG_ANALYZER_MAX_TAGS = 12;
// neo-web 의 Tag Analyzer 브리지 어댑터가 받는 모든 텍스트 필드를 이 길이에서 말없이 자른다
// (neo-web src/components/tagAnalyzer/integration/adapters.ts 의 MAX_TEXT_LENGTH — tagName,
// jsonKey, table, alias 가 모두 optionalText/requiredText 를 지난다). 잘린 이름이나 경로는 다른
// 태그를 가리키므로 자르는 대신 보내지 않는다.
//
// 이 제한은 여기에만 있다. 저장·조회는 영향을 받지 않는다 — Machbase 는 NAME 컬럼을
// VARCHAR(1000) 으로도 만들 수 있고 300자 태그가 정상 저장·조회되는 것을 실측으로 확인했다.
// 그래서 이름을 만드는 시점(tagName.js)이 아니라 넘기는 시점에서 본다.
const TAG_ANALYZER_MAX_TEXT = 256;

/**
 * Wraps a payload key as a Machbase json path for neo-web's Tag Analyzer.
 *
 * Bracket form is required, not cosmetic. Verified against a live Machbase with a payload holding
 * BOTH a literal dotted key and a nested object:
 *     JSON_EXTRACT('{"a.b":11,"a":{"b":22}}', '$[a.b]') -> 11   (literal key)
 *     JSON_EXTRACT('{"a.b":11,"a":{"b":22}}', '$.a.b')  -> 22   (nested traversal)
 * OPC UA node names routinely contain dots (Plant1.Line1.Temperature), so the dot form would send
 * neo-web looking for a nested path that does not exist and the series would come back silently
 * empty. 이건 핸드오프 전용 경로다 — Data Viewer 의 자체 조회는 handler.js 의 tagDataJsonPath 가
 * 서버측에서 만들고, `]` 를 담을 수 있는 따옴표 형태($["key"])를 쓴다. neo-web 은 그 형태를 못
 * 읽으므로 둘은 의도적으로 다르다. 아래 대괄호 검사 참고.
 *
 * @param {string} key
 * @returns {{ ok: true, path: string } | { ok: false, reason: string }}
 */
export function toTagAnalyzerJsonKey(key) {
    const name = String(key ?? "").trim();
    if (!name) return { ok: false, reason: "A payload key is required." };
    // Machbase 자체는 따옴표 형태($["a]b"])로 `]` 를 담을 수 있고 Data Viewer 의 자체 조회도
    // 그 형태를 쓴다. neo-web 은 못 받는다 — dashboardJsonValue.ts 의 normalizeBracketPath 가
    // /\[([^\]]+)\]/g 로 경로를 다시 파싱해서 첫 대괄호에서 키가 잘리고, 시리즈가 엉뚱한 곳을
    // 가리키게 된다. 이 제약은 DB 가 아니라 받는 쪽의 것이다.
    if (name.includes("]")) {
        return { ok: false, reason: `Payload key '${name}' contains ']', which Tag Analyzer cannot address.` };
    }
    const path = `[${name}]`;
    if (path.length > TAG_ANALYZER_MAX_TEXT) {
        return { ok: false, reason: `Payload key '${name}' is too long for Tag Analyzer (max ${TAG_ANALYZER_MAX_TEXT - 2} characters).` };
    }
    return { ok: true, path };
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
    jsonValueColumn = false,
    collectorName = "",
} = {}) {
    const tableName = String(table || "").trim();
    if (!tableName) return { ok: false, reason: "Database table is required." };
    if (stringOnly) return { ok: false, reason: "Tag Analyzer requires a numeric value column." };

    const value = String(valueColumn || "VALUE").trim();
    const name = String(nameColumn || "NAME").trim();
    const time = String(timeColumn || "TIME").trim();
    if (!value || !name || !time) return { ok: false, reason: "Tag Analyzer column mapping is incomplete." };

    // A JSON collector stores every cycle under one tag, so the series differ only by json path.
    // Deduping by tagName the way a scalar table does would collapse them all into one.
    const collector = String(collectorName || "").trim();
    if (jsonValueColumn && !collector) {
        return { ok: false, reason: "Tag Analyzer needs the collector name for a JSON value column." };
    }

    const seen = new Set();
    const tags = [];
    for (const rawName of tagNames || []) {
        const entryName = String(rawName || "").trim();
        if (!entryName || seen.has(entryName)) continue;
        seen.add(entryName);

        let jsonKey = "";
        let alias = "";
        if (jsonValueColumn) {
            // The selection identifies a (record, key) pair, so the record has to come off before the
            // key is turned into a json path — wrapping the whole pair asks for a key that does not
            // exist and the series comes back silently empty.
            const { keys } = splitPayloadKeySelection([entryName], [collector]);
            const payloadKey = keys[0] || entryName;
            const built = toTagAnalyzerJsonKey(payloadKey);
            if (!built.ok) return { ok: false, reason: built.reason };
            jsonKey = built.path;
            alias = payloadKey;
        }

        // tagName 도 어댑터의 절단 대상이다. jsonKey 는 toTagAnalyzerJsonKey 가 이미 보지만
        // 이름 쪽은 여기서만 볼 수 있다 — 잘린 이름은 다른 태그를 조회한다.
        const outboundTagName = jsonValueColumn ? collector : entryName;
        if (outboundTagName.length > TAG_ANALYZER_MAX_TEXT) {
            return {
                ok: false,
                reason: `Tag '${outboundTagName.slice(0, 24)}…' is too long for Tag Analyzer (max ${TAG_ANALYZER_MAX_TEXT} characters).`,
            };
        }

        tags.push({
            tagName: outboundTagName,
            table: tableName,
            calculationMode: "avg",
            alias,
            weight: 1,
            colName: {
                name,
                time,
                value,
                timeType: TAG_ANALYZER_DATETIME_COLUMN_TYPE,
                timeBaseTime: true,
                jsonKey,
            },
        });
    }

    if (tags.length === 0) return { ok: false, reason: "Cannot open Tag Analyzer because there is no tag." };
    if (tags.length > TAG_ANALYZER_MAX_TAGS) {
        return {
            ok: false,
            reason: `Tag Analyzer supports up to ${TAG_ANALYZER_MAX_TAGS} ${jsonValueColumn ? "keys" : "tags"} — ${tags.length} selected.`,
        };
    }

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

// Walks PANEL_COLORS in name order, which is how ECharts assigns colours to a panel's series.
// One map built from the main panel's order is then handed to every panel and to the raw table,
// so a tag keeps its colour when it is split into its own chart — a split panel holds a single
// series and would otherwise always take the first palette entry.
export function buildSeriesColorMap(names = []) {
    const colors = {};
    let index = 0;

    for (const raw of Array.isArray(names) ? names : []) {
        const name = String(raw ?? "");
        if (!name || colors[name]) continue;
        colors[name] = PANEL_COLORS[index % PANEL_COLORS.length];
        index += 1;
    }

    return colors;
}

// Colour per tag name for the raw table's name dot. buildTagChartSeries keys its series off the
// order names first appear in the rows, so feeding the same order here makes a tag's dot match
// the line it gets in the chart.
export function buildRawRowNameColors(rows = []) {
    return buildSeriesColorMap((Array.isArray(rows) ? rows : []).map((row) => getRawRowNameValue(row)));
}

// Measured for the raw table's fonts: D2Coding 14px cells, bold 14px sans headers.
const RAW_MONO_CHAR_WIDTH = 8.401;
// 한글·전각 문장부호는 모노스페이스에서도 두 칸을 차지한다. 글자 수로만 재면 실제 렌더 폭의
// 절반으로 잡혀서, 폭주 값만 막으려던 RAW_COLUMN_MAX_WIDTH 에 닿기 한참 전에 평범한 이름이
// 잘린다. 범위는 유니코드 East Asian Wide/Fullwidth 구간이다.
const WIDE_CHAR = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;

/**
 * 모노스페이스 기준 표시 칸 수. 전각 문자는 2칸으로 센다.
 *
 * @param {string} value
 * @returns {number}
 */
export function monoDisplayWidth(value) {
    let cells = 0;
    for (const ch of String(value ?? "")) cells += WIDE_CHAR.test(ch) ? 2 : 1;
    return cells;
}
const RAW_HEADER_CHAR_WIDTH = 7;
// .data-viewer-raw-table td { padding: 0 16px }
const RAW_CELL_PADDING = 32;
const RAW_COLUMN_MIN_WIDTH = 90;
// Generous, since the body scrolls sideways — this only guards against a runaway string value,
// it is not meant to clip ordinary tag names (a full OPC UA path can run past 50 characters).
const RAW_COLUMN_MAX_WIDTH = 640;
// Char width is an estimate, so round up and leave a couple of pixels: landing 0.2px short is
// enough for the browser to ellipsize a value that otherwise fits exactly.
const RAW_COLUMN_SLACK = 2;

// Column widths derived from the whole result set, not from the rows currently mounted.
// `table-layout: fixed` is required by the virtualised body, and fixed layout otherwise sizes
// columns to the ~40 visible rows — content gets clipped and the table can never exceed its
// container, which is what removed the horizontal scrollbar. Measuring every row instead keeps
// the widths stable while scrolling and lets the table overflow when the data is genuinely wide.
export function buildRawColumnWidths(rows = [], columns = [], options = {}) {
    const { timeSample = "", extra = {} } = options;
    const safeRows = Array.isArray(rows) ? rows : [];
    const widths = {};

    for (const column of columns || []) {
        if (!column || !column.key) continue;
        let chars = 0;
        if (column.key === "time") {
            // Timestamps render at a fixed width, so one formatted sample stands for all rows.
            chars = monoDisplayWidth(timeSample);
        } else {
            for (const row of safeRows) {
                const length = monoDisplayWidth(row?.[column.key]);
                if (length > chars) chars = length;
            }
        }

        const headerPx = String(column.label ?? "").length * RAW_HEADER_CHAR_WIDTH;
        const cellPx = chars * RAW_MONO_CHAR_WIDTH + (extra[column.key] || 0);
        const px = Math.ceil(Math.max(headerPx, cellPx) + RAW_CELL_PADDING + RAW_COLUMN_SLACK);
        widths[column.key] = Math.min(RAW_COLUMN_MAX_WIDTH, Math.max(RAW_COLUMN_MIN_WIDTH, px));
    }

    return widths;
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

export function shouldFetchDataViewerRowsForMode(mode) {
    return mode === "raw" || mode === "chart";
}

export const DEFAULT_DATA_VIEWER_ROWS_PER_TAG = 500;

export function normalizeDataViewerRowsPerTag(value, fallback = DEFAULT_DATA_VIEWER_ROWS_PER_TAG) {
    const fallbackValue = Math.max(1, Math.floor(Number(fallback) || DEFAULT_DATA_VIEWER_ROWS_PER_TAG));
    if (value === "" || value === null || value === undefined) return fallbackValue;
    const next = Math.floor(Number(value));
    return Number.isFinite(next) && next > 0 ? next : fallbackValue;
}

export function getDataViewerRawPageSize(selectedTagNames = [], rowsPerTag = DEFAULT_DATA_VIEWER_ROWS_PER_TAG) {
    const tagCount = Array.isArray(selectedTagNames) ? selectedTagNames.length : 0;
    return Math.max(1, tagCount) * normalizeDataViewerRowsPerTag(rowsPerTag);
}

export function buildDataViewerRawRowsPerTagChange({
    value,
    currentRowsPerTag = DEFAULT_DATA_VIEWER_ROWS_PER_TAG,
    selectedTagNames = [],
} = {}) {
    const rowsPerTag = normalizeDataViewerRowsPerTag(value, currentRowsPerTag);
    if (rowsPerTag === normalizeDataViewerRowsPerTag(currentRowsPerTag)) return null;
    return {
        rowsPerTag,
        pageSize: getDataViewerRawPageSize(selectedTagNames, rowsPerTag),
        page: 1,
        rawPageRequest: { page: 1 },
    };
}

export function buildDataViewerDefaultChartShiftRawPageUpdate({
    direction,
    backwardScan = true,
    currentPage = 1,
    pageSize = DEFAULT_DATA_VIEWER_ROWS_PER_TAG,
    rowCount = pageSize,
    forceNextPage = false,
    currentBounds,
} = {}) {
    const page = Number(currentPage);
    if (!Number.isFinite(page) || page < 1) return null;
    const backward = Boolean(backwardScan);
    const nextPage = direction === "backward" ? (backward ? page + 1 : page - 1) : direction === "forward" ? (backward ? page - 1 : page + 1) : page;
    if (nextPage < 1 || nextPage === page) return null;
    if (nextPage > page && !hasDataViewerRawNextPage({ rowCount, pageSize, forceOpen: forceNextPage })) return null;
    const rawPageRequest = buildDataViewerRawPageRequest({
        currentPage: page,
        nextPage,
        pageSize,
        currentBounds,
        reason: "page",
    });
    return {
        page: rawPageRequest.page,
        rawPageRequest,
    };
}

function getRawRowTimeValue(row) {
    if (Array.isArray(row)) return row[0];
    if (!row || typeof row !== "object") return undefined;
    return row.time ?? row.TIME ?? row.Time;
}

function getRawRowNameValue(row) {
    if (Array.isArray(row)) return row[1];
    if (!row || typeof row !== "object") return undefined;
    return row.name ?? row.NAME ?? row.Name;
}

function getRawRowValueValue(row) {
    if (Array.isArray(row)) return row[2];
    if (!row || typeof row !== "object") return undefined;
    return row.value ?? row.VALUE ?? row.Value;
}

export function buildDataViewerRawPageBounds(rows = []) {
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const normalized = rows
        .map((row) => {
            const time = getRawRowTimeValue(row);
            const epochMs = toEpochMs(time);
            if (!Number.isFinite(epochMs)) return null;
            return {
                time: new Date(epochMs).toISOString(),
                name: String(getRawRowNameValue(row) ?? ""),
                epochMs,
            };
        })
        .filter(Boolean);

    if (normalized.length === 0) return null;

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const row of normalized) {
        if (row.epochMs < min) min = row.epochMs;
        if (row.epochMs > max) max = row.epochMs;
    }

    return {
        pageStart: {
            time: normalized[0].time,
            name: normalized[0].name,
        },
        pageEnd: {
            time: normalized[normalized.length - 1].time,
            name: normalized[normalized.length - 1].name,
        },
        pageBounds: {
            from: new Date(min).toISOString(),
            to: new Date(max).toISOString(),
        },
    };
}

export function buildDataViewerRawPageRequest({
    currentPage = 1,
    nextPage = 1,
    pageSize = 1,
    currentBounds,
    reason = "page",
} = {}) {
    const page = Math.max(1, Math.floor(Number(nextPage) || 1));
    const previousPage = Math.max(1, Math.floor(Number(currentPage) || 1));
    const safePageSize = Math.max(1, Math.floor(Number(pageSize) || 1));

    if (reason === "tags" && currentBounds?.pageBounds) {
        return {
            page,
            from: currentBounds.pageBounds.from,
            to: currentBounds.pageBounds.to,
            boundedRange: true,
        };
    }

    if (!currentBounds || page === previousPage) {
        return { page };
    }

    if (Math.abs(page - previousPage) !== 1) {
        return { page };
    }

    const movingForward = page > previousPage;
    const boundary = movingForward ? currentBounds.pageEnd : currentBounds.pageStart;
    if (!boundary?.time) return { page };

    return {
        page,
        cursorSide: movingForward ? "next" : "prev",
        cursorTime: boundary.time,
        cursorName: boundary.name || "",
        cursorOffset: Math.max(0, Math.abs(page - previousPage) - 1) * safePageSize,
    };
}

export function hasDataViewerRawNextPage({ rowCount = 0, pageSize = 1, forceOpen = false } = {}) {
    if (forceOpen) return true;
    const safePageSize = Math.max(1, Math.floor(Number(pageSize) || 1));
    return Math.max(0, Math.floor(Number(rowCount) || 0)) >= safePageSize;
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
    const defaultNames = selected;
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

export function buildDataViewerSplitRangeUpdate({
    nextGroups = [],
    chartViewRanges = {},
    chartNavigatorRanges = {},
    splitRanges = {},
    sourceGroupId = "default",
} = {}) {
    const nextViewRanges = { ...chartViewRanges };
    const nextNavigatorRanges = { ...chartNavigatorRanges };
    const nextSplitRanges = { ...splitRanges };
    const sourceViewRange = chartViewRanges?.[sourceGroupId];
    const sourceNavigatorRange = chartNavigatorRanges?.[sourceGroupId];

    for (const group of nextGroups || []) {
        const id = String(group?.id || "").trim();
        if (!id) continue;
        if (sourceViewRange && !nextViewRanges[id]) nextViewRanges[id] = sourceViewRange;
        if (sourceNavigatorRange && !nextNavigatorRanges[id]) nextNavigatorRanges[id] = sourceNavigatorRange;
    }

    return {
        chartViewRanges: nextViewRanges,
        chartNavigatorRanges: nextNavigatorRanges,
        splitRanges: nextSplitRanges,
    };
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

// Default query window. Leaving the range empty means there is no bounded window to query, so pagination has no fixed basis either.
export const DEFAULT_DATA_VIEWER_TIME_RANGE = { from: "now-1h", to: "now" };

/**
 * Whether the collector's value column is a JSON column.
 *
 * @param {Array<{ name?: string, type?: string }>} columns - the columns API payload
 * @param {string} valueColumn - the collector's configured value column
 * @returns {boolean}
 */
export function isJsonValueColumn(columns, valueColumn) {
    const target = String(valueColumn ?? "").trim().toUpperCase();
    if (!target) return false;
    const column = (columns || []).find(
        (col) => String(col?.name ?? "").trim().toUpperCase() === target
    );
    return String(column?.type ?? "").trim().toUpperCase() === "JSON";
}

/**
 * Whether a range is anchored on the selected tags' latest data time (last, last-5m, ...)
 * rather than on the wall clock (now, now-1h, ...).
 *
 * @param {{ from?: string, to?: string }} range
 * @returns {boolean}
 */
export function usesLastDataAnchor(range = {}) {
    const startsWithLast = (value) => String(value ?? "").trim().startsWith("last");
    return startsWithLast(range.from) || startsWithLast(range.to);
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

// Builds the tree first, then emits it depth-first. Emitting in node order instead would break
// whenever the node list moves between branches and comes back — config order does exactly that
// (Functions..., _System, Functions...). A folder already emitted was skipped the second time,
// so its later children were left hanging under whichever folder happened to precede them.
// Children keep first-seen order within each parent, so nothing is re-sorted.
export function buildTagRows(nodes = []) {
    const root = { children: [], index: new Map() };

    for (const node of nodes) {
        const path = getTagTreePath(node);
        if (!path) {
            root.children.push({
                type: "tag",
                key: `tag:${node.name}`,
                label: node.name || node.nodeId || "-",
                tag: node,
            });
            continue;
        }

        let parent = root;
        for (let i = 0; i < path.length - 1; i++) {
            const key = `folder:${path.slice(0, i + 1).join("/")}`;
            let folder = parent.index.get(key);
            if (!folder) {
                folder = { type: "folder", key, label: path[i], children: [], index: new Map() };
                parent.index.set(key, folder);
                parent.children.push(folder);
            }
            parent = folder;
        }
        // 라벨은 보통 경로의 마지막 조각이다 — 폴더가 앞을 설명하므로 짧게 읽힌다. 다만 이름을
        // 바꾼 노드까지 그러면 화면(노드 이름)과 DB(태그 이름)가 달라 어느 행인지 알 수 없다.
        // 노드를 담을 때 붙는 기본 이름은 경로를 "_" 로 이은 값이므로, 그와 다르면 바뀐 것이다.
        const leaf = path[path.length - 1];
        // tagName.js 의 normalizeTagName 과 같은 규칙(trim). 이 모델은 컴포넌트를 import 하지 않는다.
        const defaultName = path.map((segment) => String(segment ?? "").trim()).join("_");
        const renamed = Boolean(node.name) && node.name !== defaultName;
        parent.children.push({
            type: "tag",
            key: `tag:${node.name || path.join("/")}`,
            label: renamed ? node.name : leaf,
            // 바뀐 이름을 보여줄 때만 원래 노드가 무엇이었는지 흐리게 덧붙인다.
            secondaryLabel: renamed ? leaf : "",
            tag: node,
        });
    }

    const rows = [];
    const walk = (entries, depth, ancestorKeys) => {
        for (const entry of entries) {
            if (entry.type === "folder") {
                rows.push({ type: "folder", key: entry.key, ancestorKeys, depth, label: entry.label });
                walk(entry.children, depth + 1, [...ancestorKeys, entry.key]);
                continue;
            }
            rows.push({
                type: "tag", key: entry.key, ancestorKeys, depth,
                label: entry.label, secondaryLabel: entry.secondaryLabel || "", tag: entry.tag,
            });
        }
    };
    walk(root.children, 0, []);

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

// A payload key only means something together with the record it sits in: the same key name can
// exist under several NAME values in one table. One readable string carries both, and it is used as
// the identity everywhere — selection, chart series, grid Name cell — so nothing has to translate
// between an internal id and a label.
export const PAYLOAD_KEY_SEP = " / ";

export function encodePayloadKeyId(record, key) {
    return `${String(record ?? "").trim()}${PAYLOAD_KEY_SEP}${String(key ?? "").trim()}`;
}

/**
 * The distinct records and keys a selection spans — exactly what the query needs.
 *
 * The record is recovered by matching against the records the table actually has rather than by
 * splitting on the separator, because a payload key is free to contain it too.
 */
export function splitPayloadKeySelection(selectedIds = [], knownRecords = []) {
    const records = [];
    const keys = [];
    const seenRecord = new Set();
    const seenKey = new Set();
    // Longest first, so a record named "a" cannot claim a label belonging to "a / b".
    const candidates = (Array.isArray(knownRecords) ? knownRecords : [])
        .map((name) => String(name ?? "").trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);

    for (const id of Array.isArray(selectedIds) ? selectedIds : []) {
        const text = String(id ?? "");
        const record = candidates.find((name) => text.startsWith(name + PAYLOAD_KEY_SEP)) || "";
        const key = record ? text.slice(record.length + PAYLOAD_KEY_SEP.length).trim() : text.trim();
        if (record && !seenRecord.has(record)) { seenRecord.add(record); records.push(record); }
        if (key && !seenKey.has(key)) { seenKey.add(key); keys.push(key); }
    }
    return { records, keys };
}

/**
 * Long-format rows from a server-projected response.
 *
 * The backend extracted each key with the json operator and returned the values positionally under
 * `values`, in jsonKeys order — no payload document is sent and the client parses nothing. Each row
 * still carries its record in `name`, which is what lets several records be charted at once without
 * their shared key names colliding.
 *
 * Only the selected pairs are emitted: the query asks for the cross product of the selected records
 * and keys, which is a superset of what the user actually ticked.
 */
export function expandProjectedRows(rows = [], jsonKeys = [], selectedIds = null) {
    const keys = (Array.isArray(jsonKeys) ? jsonKeys : [])
        .map((key) => String(key ?? "").trim())
        .filter(Boolean);
    if (keys.length === 0) return [];

    const wanted = Array.isArray(selectedIds) && selectedIds.length > 0 ? new Set(selectedIds) : null;

    const out = [];
    for (const row of Array.isArray(rows) ? rows : []) {
        // `values` is the transport, not a column. The raw grid derives its columns from the row's
        // own keys, so leaving it in adds a "Values" column holding the whole projection array.
        const { values: projected, ...rest } = row || {};
        const values = Array.isArray(projected) ? projected : [];
        const record = String(rest.name ?? "").trim();
        keys.forEach((key, index) => {
            const id = encodePayloadKeyId(record, key);
            if (wanted && !wanted.has(id)) return;
            out.push({ ...rest, name: id, value: index < values.length ? values[index] : null });
        });
    }
    return out;
}

/**
 * 보이는 행을 소속 record 별로 묶는다. record 마다 키 목록을 따로 스크롤시키려던 함수다.
 *
 * ⚠️ 현재 호출부가 없다. 패널은 visibleTagRows 를 buildTagRowTree 로 중첩해 렌더하므로 이 결과를
 * 쓰지 않는다. 삭제하거나, record 별 스크롤을 다시 도입할 때 연결해야 한다.
 *
 * record 가 없는 행(스칼라 collector 의 트리)은 폴더 없는 선두 그룹 하나로 나온다.
 *
 * @param {Array<{type?: string, record?: string}>} rows
 * @returns {Array<{ folder: object|null, keys: object[] }>}
 */
export function groupTagRowsByRecord(rows = []) {
    const groups = [];
    let current = null;
    for (const row of Array.isArray(rows) ? rows : []) {
        if (row?.type === "folder" && row?.record) {
            current = { folder: row, keys: [] };
            groups.push(current);
            continue;
        }
        if (!current) {
            current = { folder: null, keys: [] };
            groups.push(current);
        }
        current.keys.push(row);
    }
    return groups;
}

/**
 * Nests the flat visible rows back into the tree their depth describes.
 *
 * The rows arrive flat because collapse and filtering are easier to reason about that way, but a
 * flat list cannot produce stacked sticky headers: a sticky element is bounded by its own parent, so
 * a folder only slides away when its subtree does. Nesting restores that boundary, and each header
 * pins at its depth so the ancestors stack up and read as a path while scrolling a deep subtree.
 *
 * @param {Array<{type?: string, depth?: number}>} rows in tree order
 * @returns {Array<{row: object, children: Array}>}
 */
export function buildTagRowTree(rows = []) {
    const roots = [];
    const openFolders = [];

    for (const row of Array.isArray(rows) ? rows : []) {
        const depth = Number(row?.depth) || 0;
        while (openFolders.length > depth) openFolders.pop();

        const node = { row, children: [] };
        const parent = openFolders[openFolders.length - 1];
        (parent ? parent.children : roots).push(node);

        if (row?.type === "folder") openFolders.push(node);
    }

    return roots;
}

// A JSON collector stores one row per cycle under the COLLECTOR's name, with the node values inside
// the payload. So the tag the table holds and the things a user wants to plot sit at different
// levels, and the panel shows both: the collector as the parent row, its payload keys beneath it.
// Selecting a child means "project this key", never "filter NAME by it".
/**
 * The left panel's rows for a JSON collector: its own record, with the payload keys beneath it.
 *
 * Only this collector's record is listed. The table may well hold others — a record this job wrote
 * under a previous name, or one written by a different job — but the keys can only come from THIS
 * collector's config, so listing another record would put this job's key list under someone else's
 * data. That is not a display quirk: for a record written by a different job the keys would simply
 * be wrong. A viewer opened on job A shows job A's stream.
 *
 * Two levels, deliberately: record then key. The OPC UA node path is not drawn even though the
 * config carries it — the payload is a flat map, so a path would assert a structure the data does
 * not have, and the path's one real job elsewhere (telling apart two nodes with the same short name)
 * cannot arise here, because such nodes collapse onto one payload key before the viewer sees them.
 * The nodeId travels on the row instead, as provenance rather than as structure.
 *
 * Keys are deduplicated by name for that same reason: two configured nodes sharing a name are one
 * key, and a row each would put two rows on one identity.
 */
export function buildPayloadKeyRows({
    collectorName = "",
    configuredNodes = [],
    derivedTags = [],
} = {}) {
    const record = String(collectorName ?? "").trim() || "-";
    const parentKey = `payload:${record}`;
    const rows = [{
        type: "folder",
        key: parentKey,
        ancestorKeys: [],
        depth: 0,
        label: record,
        record,
    }];

    const seenKey = new Set();
    const addKey = (name, extra) => {
        const key = String(name ?? "").trim();
        if (!key || seenKey.has(key)) return;
        seenKey.add(key);
        rows.push({
            type: "tag",
            key: `key:${record}:${key}`,
            ancestorKeys: [parentKey],
            depth: 1,
            label: key,
            tag: {
                name: encodePayloadKeyId(record, key),
                ...(extra?.dataType ? { dataType: extra.dataType } : {}),
                ...(extra?.nodeId ? { nodeId: extra.nodeId } : {}),
            },
            ...(extra?.derived ? { derived: true } : {}),
            record,
        });
    };

    for (const node of Array.isArray(configuredNodes) ? configuredNodes : []) {
        if (!node) continue;
        addKey(node.name, { dataType: node.dataType, nodeId: node.nodeId });
    }
    for (const item of Array.isArray(derivedTags) ? derivedTags : []) {
        addKey(typeof item === "string" ? item : item?.name, { derived: true });
    }

    return rows;
}


// Derived tags live in `config.derivedTags`, never in `config.opcua.nodes`, so buildTagRows
// never sees them. They also have no OPC UA tree path, so they cannot sit in the node tree —
// they are appended as flat rows below it, each marked so the list can badge them.
// `takenNames` drops the ones already listed: when a collector has no configured nodes,
// resolveTagNodes falls back to the DB tag list, which already contains derived names.
export function buildDerivedTagRows(derivedTags = [], takenNames = []) {
    if (!Array.isArray(derivedTags)) return [];
    const seen = new Set(
        (Array.isArray(takenNames) ? takenNames : [])
            .map((name) => String(name ?? "").trim())
            .filter(Boolean)
    );

    const rows = [];
    for (const item of derivedTags) {
        const raw = typeof item === "string" ? item : item?.name;
        const name = String(raw ?? "").trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        rows.push({
            type: "tag",
            key: `derived:${name}`,
            depth: 0,
            label: name,
            derived: true,
            tag: { name, derived: true },
        });
    }

    return rows;
}

/**
 * 스칼라 테이블의 태그 이름. 태그 패널의 행이자 조회 IN 필터에 들어가는 값이다.
 *
 * 보통은 collector 에 설정된 노드가 곧 태그 이름이라 그쪽을 우선한다. 테이블 메타데이터에는 없는
 * nodeId 와 dataType 을 갖고 있기 때문이다. JSON value column 은 그 등식을 깬다 — collector 가 한
 * 사이클을 collector 이름으로 키잉된 한 행에 합치고, 노드 이름은 payload 안으로 들어간다
 * (cgi-bin/src/collector.js). 그 상태로 노드를 제시하면 어느 행과도 안 맞아 수집이 없었던 것처럼
 * 빈 결과가 나온다. 그래서 JSON 일 때는 `payloadKeyedNodes` 를 넘겨 설정 노드를 태그 이름으로
 * 내놓지 않게 한다. JSON 패널 자체는 buildPayloadKeyRows 가 따로 만들고, 이 함수의 결과는 쓰이지
 * 않는다.
 *
 * @param {Array<{name?: string, nodeId?: string}>} configuredNodes
 * @param {Array<{name?: string, dataType?: string}|string>} tableTags
 * @param {{ payloadKeyedNodes?: boolean }} [options]
 */
export function resolveTagNodes(configuredNodes = [], tableTags = [], options = {}) {
    const nodes = options.payloadKeyedNodes || !Array.isArray(configuredNodes)
        ? []
        : configuredNodes.filter((node) => node && (node.name || node.nodeId));
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

/**
 * 차트에 쓸 y 값 하나. boolean 문자열만 1/0 으로 바꾸고 나머지는 Number 에 맡긴다.
 *
 * 서버는 payload 키 값을 VARCHAR 그대로 내려준다 — 저장된 문자열 "3" 과 숫자 3 을 구분할 수 없어
 * 숫자로 강제 변환하면 그리드가 저장된 값을 보여주지 못하기 때문이다(handler.js 의 projectedValue).
 * 그 대가로 boolean 이 "true"/"false" 문자열로 오는데, Number("true") 는 NaN 이고 아래에서 유한
 * 숫자가 아닌 점을 버리므로 그냥 두면 boolean 키의 시리즈가 통째로 사라진다. 숫자가 필요한 곳은
 * 차트뿐이라 변환도 여기서만 한다.
 */
export function buildTagChartSeries(rows = []) {
    const seriesByName = new Map();

    rows.forEach((row) => {
        const name = String(getRawRowNameValue(row) ?? "");
        const x = toEpochMs(getRawRowTimeValue(row));
        const y = Number(getRawRowValueValue(row));
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

export function buildDataViewerChartResultsFromRawRows({
    rows = [],
    rowsByGroup = {},
    chartGroups = [],
} = {}) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const safeRowsByGroup = rowsByGroup && typeof rowsByGroup === "object" ? rowsByGroup : {};
    const results = {};

    for (const group of chartGroups || []) {
        if (!group?.id) continue;
        const sourceRows = Array.isArray(safeRowsByGroup[group.id]) ? safeRowsByGroup[group.id] : safeRows;
        const tagSet = new Set((group.tagNames || []).map((name) => String(name || "").trim()).filter(Boolean));
        const groupRows = tagSet.size > 0
            ? sourceRows.filter((row) => tagSet.has(String(getRawRowNameValue(row) ?? "")))
            : [];
        results[group.id] = {
            range: group.range || { from: "", to: "" },
            series: buildTagChartSeries(groupRows),
        };
    }

    return results;
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
const PANEL_LEGEND_ROW_HEIGHT = 18;
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

const PANEL_MAIN_RANGE_SHIFT_FRACTION = 0.3;

export function buildDataViewerShiftMainRangeUpdate({ direction, currentRange = {}, navigatorRange = {} } = {}) {
    const currentStart = Number(currentRange.startTime);
    const currentEnd = Number(currentRange.endTime);
    const navigatorStart = Number(navigatorRange.startTime);
    const navigatorEnd = Number(navigatorRange.endTime);
    if (![currentStart, currentEnd, navigatorStart, navigatorEnd].every(Number.isFinite)) return null;
    if (currentEnd <= currentStart || navigatorEnd <= navigatorStart) return null;

    const shiftDirection = direction === "backward" ? -1 : direction === "forward" ? 1 : 0;
    if (shiftDirection === 0) return null;

    const offset = (navigatorEnd - navigatorStart) * PANEL_MAIN_RANGE_SHIFT_FRACTION * shiftDirection;
    const nextStart = currentStart + offset;
    const nextEnd = currentEnd + offset;
    const nextNavigatorStart = navigatorStart + offset;
    const nextNavigatorEnd = navigatorEnd + offset;

    if (nextEnd <= nextStart || nextNavigatorEnd <= nextNavigatorStart) return null;

    return {
        range: {
            from: new Date(nextStart).toISOString(),
            to: new Date(nextEnd).toISOString(),
        },
        navigatorRange: {
            from: new Date(nextNavigatorStart).toISOString(),
            to: new Date(nextNavigatorEnd).toISOString(),
        },
    };
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

export function buildDataViewerDragRangeUpdate({
    mode,
    dragStartTime,
    dragEndTime,
    currentRange = {},
    navigatorRange = {},
} = {}) {
    const currentStart = Number(currentRange.startTime);
    const currentEnd = Number(currentRange.endTime);
    const navigatorStart = Number(navigatorRange.startTime);
    const navigatorEnd = Number(navigatorRange.endTime);
    const dragStart = Number(dragStartTime);
    const dragEnd = Number(dragEndTime);
    if (![currentStart, currentEnd, navigatorStart, navigatorEnd, dragStart, dragEnd].every(Number.isFinite)) return undefined;
    if (currentEnd <= currentStart || navigatorEnd <= navigatorStart || dragStart === dragEnd) return undefined;

    const currentSpan = currentEnd - currentStart;
    const navigatorSpan = navigatorEnd - navigatorStart;
    let nextStart;
    let nextEnd;

    if (mode === "zoom-in") {
        nextStart = Math.max(Math.min(dragStart, dragEnd), navigatorStart);
        nextEnd = Math.min(Math.max(dragStart, dragEnd), navigatorEnd);
    } else if (mode === "pan") {
        if (currentSpan >= navigatorSpan) return undefined;
        const offset = dragStart - dragEnd;
        nextStart = currentStart + offset;
        nextEnd = currentEnd + offset;
    } else if (mode === "zoom-out") {
        if (currentSpan >= navigatorSpan) return undefined;
        const dragSpan = Math.abs(dragEnd - dragStart);
        const nextSpan = Math.min(currentSpan + dragSpan, navigatorSpan);
        const center = Math.min(Math.max((dragStart + dragEnd) / 2, navigatorStart), navigatorEnd);
        nextStart = center - nextSpan / 2;
        nextEnd = center + nextSpan / 2;
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

    if (nextEnd <= nextStart || isSameDataViewerChartRange({ startTime: nextStart, endTime: nextEnd }, currentRange)) return undefined;
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

// The legend is `type: "scroll"`, so it renders on one line and paginates however many series
// there are. Reserving a row per four series therefore bought empty space: at 39 tags it pushed
// the plot down 188px and clamped it to a 96px floor, which is the chart looking
// squashed. The plot now keeps its full height regardless of how many tags are selected.
function getPanelLegendLayout() {
    return {
        rowCount: 1,
        mainTop: PANEL_MAIN_TOP_WITH_LEGEND,
        mainHeight: PANEL_MAIN_HEIGHT,
        legendHeight: Math.max(PANEL_LEGEND_ROW_HEIGHT, PANEL_MAIN_TOP_WITH_LEGEND - PANEL_LEGEND_TOP - 8),
    };
}

export function buildDataViewerEChartOption({
    series = [],
    timeRange = {},
    displayRange,
    timeFormat = DEFAULT_TIME_FORMAT,
    timeZone = DEFAULT_TIME_ZONE,
    // Tag-name keyed colours, so a split panel keeps the colour the tag has in the main chart.
    // Falls back to this panel's own palette position for names the map does not cover.
    seriesColors = {},
} = {}) {
    const colorFor = (item, index) => seriesColors[String(item?.name ?? "")] || PANEL_COLORS[index % PANEL_COLORS.length];
    const allPoints = series.flatMap((item) => Array.isArray(item?.data) ? item.data : []);
    const panelRange = getPanelRange(allPoints, displayRange || timeRange);
    const navigatorRange = getPanelRange(allPoints, timeRange);
    const yAxisRange = getYAxisRange(series, panelRange);
    const legendLayout = getPanelLegendLayout();

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
                top: legendLayout.mainTop,
                height: legendLayout.mainHeight,
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
            type: "scroll",
            left: 10,
            right: 10,
            top: PANEL_LEGEND_TOP,
            height: legendLayout.legendHeight,
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
                    color: colorFor(item, index),
                    opacity: 1,
                },
                itemStyle: {
                    color: colorFor(item, index),
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
                    color: colorFor(item, index),
                    opacity: 0.85,
                },
                itemStyle: {
                    color: colorFor(item, index),
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

export function buildDataViewerTagSelectionUpdate({
    selectedTagNames = [],
    tagName = "",
    currentPage = 1,
    pageSize,
    currentBounds,
} = {}) {
    const nextSelectedTagNames = toggleSelectedTagName(selectedTagNames, tagName);
    return {
        selectedTagNames: nextSelectedTagNames,
        rawPageRequest: buildDataViewerRawPageRequest({
            currentPage,
            nextPage: currentPage,
            pageSize: pageSize ?? getDataViewerRawPageSize(nextSelectedTagNames),
            currentBounds,
            reason: "tags",
        }),
        preserveChartRanges: true,
    };
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

function ceilDateToNextMillisecond(date) {
    return new Date(date.getTime() + 1);
}

export function resolveTimeRangeInput(value, baseDate = new Date(), boundary = "from") {
    const formatResolvedDate = (date) => (boundary === "to" ? ceilDateToNextMillisecond(date) : date).toISOString();
    const text = String(value || "").trim();
    if (!text) return "";

    const relativeDate = applyRelativeTime(text, baseDate);
    if (relativeDate) return formatResolvedDate(relativeDate);

    const date = new Date(text.includes("T") ? text : text.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return null;
    return formatResolvedDate(date);
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

export function formatDataViewerNavigatorRangeLabels(range = {}, timeFormat = DEFAULT_TIME_FORMAT, timeZone = DEFAULT_TIME_ZONE) {
    const startTime = toEpochMs(range?.startTime ?? range?.from);
    const endTime = toEpochMs(range?.endTime ?? range?.to);
    return {
        start: Number.isFinite(startTime) ? formatDataViewerTime(startTime, "YYYY-MM-DD HH24:MI:SS", timeZone) : "",
        end: Number.isFinite(endTime) ? formatDataViewerTime(endTime, "YYYY-MM-DD HH24:MI:SS", timeZone) : "",
    };
}

export function formatTimeRangeLabel(from, to, timeZone = DEFAULT_TIME_ZONE) {
    const formatPart = (value, fallback) => {
        const text = String(value || "").trim();
        if (!text) return fallback;
        if (text.includes("now") || text.includes("last")) return text;
        return formatDataViewerTime(text, "YYYY-MM-DD HH24:MI:SS", timeZone);
    };

    if (!from && !to) return "Time range not set";
    return `${formatPart(from, "Start")} ~ ${formatPart(to, "End")}`;
}
