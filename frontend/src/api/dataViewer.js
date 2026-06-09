import { request } from "./client";

export function listTableTags({ server, table }) {
    const params = new URLSearchParams();
    params.set("server", server);
    params.set("table", table);

    return request("GET", `/cgi-bin/api/db/table/tags?${params.toString()}`);
}

export function queryTagData({
    server,
    table,
    name,
    valueColumn,
    stringValueColumn,
    direction,
    from,
    to,
    page,
    pageSize,
}) {
    const params = new URLSearchParams();
    params.set("server", server);
    params.set("table", table);
    params.set("name", name);
    if (valueColumn) params.set("valueColumn", valueColumn);
    if (stringValueColumn) params.set("stringValueColumn", stringValueColumn);
    if (direction) params.set("direction", direction);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (page) params.set("page", String(page));
    if (pageSize) params.set("pageSize", String(pageSize));

    return request("GET", `/cgi-bin/api/db/table/data?${params.toString()}`);
}

export function queryTagDataTotal({
    server,
    table,
    name,
    valueColumn,
    stringValueColumn,
    direction,
    from,
    to,
    pageSize,
}) {
    const params = new URLSearchParams();
    params.set("server", server);
    params.set("table", table);
    params.set("name", name);
    params.set("includeTotal", "true");
    if (valueColumn) params.set("valueColumn", valueColumn);
    if (stringValueColumn) params.set("stringValueColumn", stringValueColumn);
    if (direction) params.set("direction", direction);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (pageSize) params.set("pageSize", String(pageSize));

    return request("GET", `/cgi-bin/api/db/table/data?${params.toString()}`);
}
