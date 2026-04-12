const OpcuaClient = require("./opcua/opcua-client.js");
const MachbaseAppender = require("./db/machbase-appender.js");
const Service = require("./cgi/service.js");
const { getInstance } = require("./lib/logger.js");

const logger = getInstance();

class Collector {
    constructor(config, { opcuaClient, machbaseAppender, collectorName, lastCollectedAtWriter } = {}) {
        const dbConf = config.db || {
            host: '127.0.0.1',
            port: 5656,
            user: 'sys',
            password: 'manager',
        };
        this.nodes = config.opcua.nodes;
        this.nodeIds = this.nodes.map(n => n.nodeId);
        this.interval = config.opcua.interval;
        this.opcua = opcuaClient || new OpcuaClient(config.opcua.endpoint, config.opcua.readRetryInterval);
        this.db = machbaseAppender || new MachbaseAppender(dbConf, config.db.table);
        this.collectorName = collectorName || config.name || "";
        this._lastCollectedAtWriter = lastCollectedAtWriter || ((name, value, callback) => {
            Service.setValue(name, "lastCollectedAt", value, callback);
        });
        this.timer = null;
    }

    _normalizeValue(value) {
        if (typeof value === "boolean") {
            return value ? 1 : 0;
        }
        return value;
    }

    _openDb() {
        try {
            this.db.open();
        } catch (e) {
            logger.error("db open failed", { error: e.message });
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
        try {
            this.db.close();
        } catch (_) {}
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
            if (!this.db.isOpen()) {
                this._openDb();
                if (!this.db.isOpen()) {
                    return;
                }
            }

            if (!this.opcua.open()) {
                logger.warn("opcua connect failed, will retry");
                return;
            }
            const results = this.opcua.read(this.nodeIds);
            let lastTs = null;
            this.nodes.forEach((node, idx) => {
                const r = results[idx];
                const ts = r.sourceTimestamp ? new Date(r.sourceTimestamp) : new Date();
                const value = this._normalizeValue(r.value);
                if (lastTs === null || ts.getTime() > lastTs.getTime()) {
                    lastTs = ts;
                }
                logger.debug("read", {
                    nodeId: node.nodeId,
                    name: node.name,
                    value,
                    ts: ts.toISOString(),
                });
                this.db.append(node.name, ts, value);
                logger.debug("appended", {
                    name: node.name,
                    value,
                    ts: ts.toISOString(),
                });
            });
            this.db.flush();
            this._recordLastCollectedAt(lastTs);
            logger.info("collected", { count: this.nodes.length });
        } catch (e) {
            logger.error("collect error", { error: e.message });
            this.opcua.close();
        }
    }

    start() {
        if (this.timer !== null) {
            return;
        }
        this.opcua.open();
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
