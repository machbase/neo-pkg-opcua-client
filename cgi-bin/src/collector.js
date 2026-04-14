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
        const column = config.valueColumn || "VALUE";
        this.nodes = config.opcua.nodes;
        this.nodeIds = this.nodes.map(n => n.nodeId);
        this.interval = config.opcua.interval;
        this.opcua = opcuaClient || new OpcuaClient(config.opcua.endpoint, config.opcua.readRetryInterval);
        this._dbConf = dbConf;
        this._table = table;
        this._tagColumns = [{ name: "NAME" }, { name: "TIME" }, { name: column }];
        this._injectedDb = db || null;
        this._dbClient = db ? db.client : null;
        this._dbStream = db ? db.stream : null;
        this.collectorName = collectorName || config.name || "";
        this._lastCollectedAtWriter = lastCollectedAtWriter || ((name, value, callback) => {
            Service.setValue(name, "lastCollectedAt", value, callback);
        });
        this.timer = null;
    }

    _normalizeValue(value, node) {
        if (typeof value === "boolean") {
            value = value ? 1 : 0;
        }
        value = (value + (node.add ?? 0)) * (node.multiply ?? 1);
        return value;
    }

    _isDbOpen() {
        return this._dbStream !== null && this._dbStream.stream !== null;
    }

    _openDb() {
        if (this._injectedDb) {
            const { client, stream } = this._injectedDb;
            const err = stream.open(client, this._table, this._tagColumns);
            if (err) {
                logger.error("db open failed", { error: err.message });
                return;
            }
            this._dbClient = client;
            this._dbStream = stream;
            return;
        }
        try {
            const client = new MachbaseClient(this._dbConf);
            client.connect();
            const stream = new MachbaseStream();
            const err = stream.open(client, this._table, this._tagColumns);
            if (err) {
                logger.error("db open failed", { error: err.message });
                try {
                    client.close();
                } catch (_) {}
                return;
            }
            this._dbClient = client;
            this._dbStream = stream;
        } catch (e) {
            logger.error("db open failed", { error: e.message });
        }
    }

    _closeDb() {
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
        try {
            if (!this._isDbOpen()) {
                this._openDb();
                if (!this._isDbOpen()) {
                    return;
                }
            }

            if (!this.opcua.open()) {
                logger.warn("opcua connect failed, will retry");
                return;
            }

            const results = this.opcua.read(this.nodeIds);
            let lastTs = null;
            const matrix = [];

            this.nodes.forEach((node, idx) => {
                const r = results[idx];
                const ts = r.sourceTimestamp ? new Date(r.sourceTimestamp) : new Date();
                const value = this._normalizeValue(r.value, node);
                if (lastTs === null || ts.getTime() > lastTs.getTime()) {
                    lastTs = ts;
                }
                logger.debug("read", {
                    nodeId: node.nodeId,
                    name: node.name,
                    value,
                    ts: ts.toISOString(),
                });
                matrix.push([node.name, ts, value]);
            });

            const appendErr = this._dbStream.append(matrix);
            if (appendErr) {
                throw appendErr;
            }

            this._recordLastCollectedAt(lastTs);
            logger.info("collected", { count: this.nodes.length });
        } catch (e) {
            logger.error("collect error", { error: e.message });
            this.opcua.close();
            this._closeDb();
        }
    }

    start() {
        if (this.timer !== null) {
            return;
        }
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
