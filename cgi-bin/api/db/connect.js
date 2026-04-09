/**
 * POST /cgi-bin/api/db/connect
 *
 * body: {
 *   host: string,
 *   port: number,
 *   user: string,
 *   password: string
 * }
 */

const path = require("path");
const process = require("process");
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf("/cgi-bin/") + "/cgi-bin".length);
const CGI = require(path.join(ROOT, "src", "cgi", "cgi_util.js"));
const MachbaseClient = require(path.join(ROOT, "src", "db", "machbase-client.js"));

function errorMessage(err) {
    return err && err.message ? err.message : String(err);
}

function validateDb(body, requireTable) {
    const db = body && body.db && typeof body.db === "object" ? body.db : body;
    if (!db || typeof db !== "object") return { error: "db config is required" };
    if (!db.host) return { error: "db.host is required" };
    if (db.port === undefined || db.port === null || db.port === "") return { error: "db.port is required" };
    if (!db.user) return { error: "db.user is required" };
    if (db.password === undefined || db.password === null) return { error: "db.password is required" };
    if (requireTable && !db.table) return { error: "db.table is required" };
    return {
        db: {
            host: db.host,
            port: Number(db.port),
            user: db.user,
            password: db.password,
            table: db.table,
        },
    };
}

function POST() {
    const checked = validateDb(CGI.readBody(), false);
    if (checked.error) {
        CGI.reply({ ok: false, reason: checked.error });
        return;
    }

    const client = new MachbaseClient(checked.db);
    try {
        client.connect();
        CGI.reply({
            ok: true,
            data: {
                connected: true,
                host: checked.db.host,
                port: checked.db.port,
                user: checked.db.user,
            },
        });
    } catch (err) {
        CGI.reply({ ok: false, reason: errorMessage(err) });
    } finally {
        client.close();
    }
}

const handlers = { POST };
const method = (process.env.get("REQUEST_METHOD") || "GET").toUpperCase();
try {
    (handlers[method] || (() => CGI.reply({ ok: false, reason: "method not allowed" })))();
} catch (err) {
    CGI.reply({ ok: false, reason: errorMessage(err) });
}
