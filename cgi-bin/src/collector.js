const OpcuaClient = require("./opcua/opcua-client.js");
const { MachbaseClient } = require("./db/client.js");
const { MachbaseStream } = require("./db/stream.js");
const Service = require("./cgi/service.js");
const { CGI } = require("./cgi/cgi_util.js");
const { getInstance } = require("./lib/logger.js");

const logger = getInstance();

class Collector {
    constructor(config, { opcuaClient, db, collectorName, lastCollectedAtWriter } = {}) {
        const dbConf = CGI.getServerConfig(config.db);
        const table = config.dbTable;
        const valueColumn = config.valueColumn || "VALUE";
        this.nodes = config.opcua.nodes;
        this.nodeIds = this.nodes.map(n => n.nodeId);
        this.interval = config.opcua.interval;
        this.opcua = opcuaClient || new OpcuaClient(config.opcua.endpoint, config.opcua.readRetryInterval);
        this._dbConf = dbConf;
        this._table = table;
        this._valueColumn = valueColumn;
        this._injectedDb = db || null;
        this._dbClient = db ? db.client : null;
        this._dbStream = db ? db.stream : null;
        this.collectorName = collectorName || config.name || "";
        this._lastCollectedAtWriter = lastCollectedAtWriter || ((name, value, callback) => {
            Service.setValue(name, "lastCollectedAt", value, callback);
        });
        this.timer = null;
        this._opcuaConnected = false;
    }

    _normalizeValue(value, node) {
        if (typeof value === "boolean") {
            value = value ? 1 : 0;
        }
        value = (value + (node.add != null ? node.add : 0)) * (node.multiply != null ? node.multiply : 1);
        return value;
    }

    _isDbOpen() {
        return this._dbStream !== null && this._dbStream.stream !== null;
    }

    _openDb() {
        if (this._injectedDb) {
            const { client, stream } = this._injectedDb;
            const err = stream.open(client, this._table, this._valueColumn);
            if (err) {
                logger.error("db open failed", { error: err.message });
                return;
            }
            this._dbClient = client;
            this._dbStream = stream;
            logger.debug("db opened", { table: this._table, columns: this._dbStream.columnNames.join(', '), nameIdx: this._dbStream.nameIdx, timeIdx: this._dbStream.timeIdx, valueIdx: this._dbStream.valueIdx });
            return;
        }
        try {
            const client = new MachbaseClient(this._dbConf);
            client.connect();
            const stream = new MachbaseStream();
            const err = stream.open(client, this._table, this._valueColumn);
            if (err) {
                logger.error("db open failed", { error: err.message });
                try {
                    client.close();
                } catch (_) {}
                return;
            }
            this._dbClient = client;
            this._dbStream = stream;
            logger.debug("db opened", { table: this._table, columns: this._dbStream.columnNames.join(', '), nameIdx: this._dbStream.nameIdx, timeIdx: this._dbStream.timeIdx, valueIdx: this._dbStream.valueIdx });
        } catch (e) {
            logger.error("db open failed", { error: e.message });
        }
    }

    _closeDb() {
        const wasOpen = this._dbStream !== null;
        if (this._dbStream) {
            this._dbStream.close();
            this._dbStream = null;
        }
        if (this._dbClient) {
            try {
                this._dbClient.close();
            } catch (_) {}
            this._dbClient = null;
        }
        if (wasOpen) {
            logger.debug("db closed", { table: this._table });
        }
    }

    close() {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
        try {
            this.opcua.close();
        } catch (_) {}
        this._closeDb();
    }

    _recordLastCollectedAt(ts) {
        if (!this.collectorName || !ts) {
            return;
        }
        try {
            this._lastCollectedAtWriter(this.collectorName, ts.getTime(), (err) => {
                if (err) {
                    logger.warn("failed to update service detail", {
                        name: this.collectorName,
                        error: err.message,
                    });
                }
            });
        } catch (e) {
            logger.warn("failed to update service detail", {
                name: this.collectorName,
                error: e.message,
            });
        }
    }

    collect() {
        logger.trace("cycle");
        try {
            if (!this._isDbOpen()) {
                this._openDb();
                if (!this._isDbOpen()) {
                    return;
                }
            }

            if (!this.opcua.open()) {
                this._opcuaConnected = false;
                logger.warn("opcua connect failed, will retry", { endpoint: this.opcua.endpoint });
                return;
            }
            if (!this._opcuaConnected) {
                logger.info("opcua connected", { endpoint: this.opcua.endpoint });
                this._opcuaConnected = true;
            }

            const results = this.opcua.read(this.nodeIds);
            let lastTs = null;
            const matrix = [];

            this.nodes.forEach((node, idx) => {
                const r = results[idx];
                if (r.statusCode !== undefined && r.statusCode !== 0) {
                    logger.warn("opcua bad status", { nodeId: node.nodeId, name: node.name, statusCode: r.statusCode });
                }
                const ts = r.sourceTimestamp ? new Date(r.sourceTimestamp) : new Date();
                const rawValue = r.value;
                const value = this._normalizeValue(rawValue, node);
                if (lastTs === null || ts.getTime() > lastTs.getTime()) {
                    lastTs = ts;
                }
                const fields = { nodeId: node.nodeId, name: node.name, value, ts: ts.toISOString() };
                if (rawValue !== value) fields.rawValue = rawValue;
                logger.debug("read", fields);
                matrix.push([node.name, ts, value]);
            });

            for (const row of matrix) {
                logger.trace("append", { name: row[0], time: row[1] instanceof Date ? row[1].toISOString() : String(row[1]), value: row[2] });
            }
            const appendErr = this._dbStream.append(matrix);
            if (appendErr) {
                throw appendErr;
            }

            this._recordLastCollectedAt(lastTs);
            logger.debug("collected", { count: this.nodes.length });
        } catch (e) {
            logger.error("collect error", { error: e.message });
            if (this._opcuaConnected) {
                logger.debug("opcua disconnected", { endpoint: this.opcua.endpoint });
            }
            this.opcua.close();
            this._opcuaConnected = false;
            this._closeDb();
        }
    }

    start() {
        if (this.timer !== null) {
            return;
        }
        logger.info("starting", { table: this._table, valueColumn: this._valueColumn, host: this._dbConf.host, port: this._dbConf.port, user: this._dbConf.user, interval: this.interval, nodes: this.nodes.length, endpoint: this.opcua.endpoint });
        this._openDb();
        this.timer = setInterval(() => {
            try {
                this.collect();
            } catch (e) {
                logger.error("interval error", { error: e.message });
            }
        }, this.interval);
    }
}

module.exports = Collector;
