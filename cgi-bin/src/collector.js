const OpcuaClient = require("./opcua/opcua-client.js");
const MachbaseAppender = require("./db/machbase-appender.js");
const { getLogger } = require("./logger.js");

const logger = getLogger("Collector");

class Collector {
    constructor(config, { opcuaClient, machbaseAppender } = {}) {
        const dbConf = config.db || { host: '127.0.0.1', port: 5656, user: 'sys', password: 'manager' };
        this.nodes = config.opcua.nodes;
        this.nodeIds = this.nodes.map(n => n.nodeId);
        this.interval = config.opcua.interval;
        this.opcua = opcuaClient || new OpcuaClient(config.opcua.endpoint, config.opcua.readRetryInterval);
        this.db = machbaseAppender || new MachbaseAppender(dbConf, config.db.table);
        this.timer = null;
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
        try { this.opcua.close(); } catch (_) {}
        try { this.db.close(); } catch (_) {}
    }

    collect() {
        try {
            if (!this.db.isOpen()) {
                this._openDb();
                if (!this.db.isOpen()) return;
            }

            const results = this.opcua.read(this.nodeIds);
            if (results === null) return;

            this.nodes.forEach((node, idx) => {
                const r = results[idx];
                const ts = r.sourceTimestamp ? new Date(r.sourceTimestamp) : new Date();
                this.db.append(node.name, ts, r.value);
            });
            this.db.flush();
            logger.info("collected", { count: this.nodes.length });
        } catch (e) {
            logger.error("collect error", { error: e.message });
        }
    }

    start() {
        if (this.timer !== null) return;
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
