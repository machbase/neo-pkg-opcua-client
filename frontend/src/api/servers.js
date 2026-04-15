import { request } from "./client";

export const listServers = () => request("GET", "/cgi-bin/api/db/server/list");
export const getServer = (name) =>
    request("GET", `/cgi-bin/api/db/server?name=${encodeURIComponent(name)}`);
export const createServer = (body) => request("POST", "/cgi-bin/api/db/server", body);
export const updateServer = (name, body) =>
    request("PUT", `/cgi-bin/api/db/server?name=${encodeURIComponent(name)}`, body);
export const deleteServer = (name) =>
    request("DELETE", `/cgi-bin/api/db/server?name=${encodeURIComponent(name)}`);
export const checkConnection = (name) =>
    request("GET", `/cgi-bin/api/db/connect?server=${encodeURIComponent(name)}`);
export const listTables = (server) =>
    request("GET", `/cgi-bin/api/db/table/list?server=${encodeURIComponent(server)}`);
export const listColumns = (server, table) =>
    request(
        "GET",
        `/cgi-bin/api/db/table/columns?server=${encodeURIComponent(server)}&table=${encodeURIComponent(table)}`
    );
