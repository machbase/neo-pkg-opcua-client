import { request } from "./client.js";
import { encodeDataViewerQuery } from "./dataViewerQuery.js";
import { webRequest } from "./webClient.js";

export function listTableTags({ server, table }) {
    const params = encodeDataViewerQuery({ server, table });

    return request("GET", `/cgi-bin/api/db/table/tags?${params}`);
}

export function queryTagData({
    server,
    table,
    names,
    valueColumn,
    stringValueColumn,
    direction,
    from,
    to,
    page,
    pageSize,
}) {
    const params = encodeDataViewerQuery({
        server,
        table,
        names,
        valueColumn,
        stringValueColumn,
        direction,
        from,
        to,
        page,
        pageSize,
    });

    return request("GET", `/cgi-bin/api/db/table/data?${params}`);
}

export function buildDataViewerChartQueryPath({
    server,
    table,
    names,
    valueColumn,
    stringValueColumn,
    from,
    to,
}) {
    const params = encodeDataViewerQuery({
        server,
        table,
        names,
        valueColumn,
        stringValueColumn,
        from,
        to,
    });

    return `/cgi-bin/api/db/table/chart?${params}`;
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

export function buildSeriesFromChartRows(rows = []) {
    const seriesByName = new Map();

    rows.forEach((row) => {
        if (!Array.isArray(row) || row.length < 3) return;
        const x = toEpochMs(row[0]);
        const name = String(row[1] ?? "").trim();
        const y = row[2] === null || row[2] === "" ? null : Number(row[2]);
        if (!name || !Number.isFinite(x)) return;
        if (y !== null && !Number.isFinite(y)) return;
        if (!seriesByName.has(name)) seriesByName.set(name, []);
        seriesByName.get(name).push([x, y]);
    });

    return Array.from(seriesByName.entries()).map(([name, data]) => ({
        name,
        data: data.sort((a, b) => a[0] - b[0]),
    }));
}

async function requestWebQueryRows(query) {
    const data = await webRequest(`/api/query?q=${encodeURIComponent(query)}`);
    return Array.isArray(data?.rows) ? data.rows : [];
}

export async function queryTagChartData(params) {
    const chart = await request("GET", buildDataViewerChartQueryPath(params));
    const rows = await requestWebQueryRows(chart.query);
    return {
        ...chart,
        rows,
        series: buildSeriesFromChartRows(rows),
    };
}

export function queryTagDataTotal({
    server,
    table,
    names,
    valueColumn,
    stringValueColumn,
    direction,
    from,
    to,
    pageSize,
}) {
    const params = encodeDataViewerQuery({
        server,
        table,
        names,
        includeTotal: "true",
        valueColumn,
        stringValueColumn,
        direction,
        from,
        to,
        pageSize,
    });

    return request("GET", `/cgi-bin/api/db/table/data?${params}`);
}
