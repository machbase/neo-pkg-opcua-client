import { request } from "./client.js";
import { encodeDataViewerQuery } from "./dataViewerQuery.js";

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
