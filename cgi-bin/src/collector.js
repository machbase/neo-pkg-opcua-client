const fs = require("fs");
const path = require("path");
const OpcuaClient = require("./opcua/opcua-client.js");
const { MachbaseClient } = require("./db/client.js");
const { MachbaseStream } = require("./db/stream.js");
const Service = require("./cgi/service.js");
const { CGI, DATA_DIR } = require("./cgi/cgi_util.js");
const { Logger } = require("./lib/logger.js");

class Collector {
    constructor(config, { opcuaClient, db, collectorName, lastCollectedAtWriter, logger } = {}) {
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
        this._previousValues = {};
        this._lastCollectedAt = null;
        this._logger = logger || new Logger();
    }

    _normalizeValue(value, node) {
        const isBoolean = typeof value === "boolean";
        const num = isBoolean ? (value ? 1 : 0) : Number(value);
        const add = node.bias != null ? node.bias : 0;
        const multiply = node.multiplier != null ? node.multiplier : 1;
        const result = node.calcOrder === 'mb' ? num * multiply + add : (num + add) * multiply;
        if (isBoolean) {
            return result >= 1 ? 1 : (result <= 0 ? 0 : result);
        }
        return result;
    }

    _isDbOpen() {
        return this._dbStream !== null && this._dbStream.stream !== null;
    }

    _openDb() {
        if (this._injectedDb) {
            const { client, stream } = this._injectedDb;
            const err = stream.open(client, this._table, this._valueColumn);
            if (err) {
                this._logger.warn("db open failed", { error: err.message });
                return;
            }
            this._dbClient = client;
            this._dbStream = stream;
            this._logger.debug("db opened", { table: this._table, columns: this._dbStream.columnNames.join(', '), nameIdx: this._dbStream.nameIdx, timeIdx: this._dbStream.timeIdx, valueIdx: this._dbStream.valueIdx });
            return;
        }
        try {
            const client = new MachbaseClient(this._dbConf);
            client.connect();
            const stream = new MachbaseStream();
            const err = stream.open(client, this._table, this._valueColumn);
            if (err) {
                this._logger.warn("db open failed", { error: err.message });
                try {
                    client.close();
                } catch (_) {}
                return;
            }
            this._dbClient = client;
            this._dbStream = stream;
            this._logger.debug("db opened", { table: this._table, columns: this._dbStream.columnNames.join(', '), nameIdx: this._dbStream.nameIdx, timeIdx: this._dbStream.timeIdx, valueIdx: this._dbStream.valueIdx });
        } catch (e) {
            this._logger.warn("db open failed", { error: e.message });
        }
    }

    _closeDb() {
        const wasOpen = this._dbStream !== null;
        if (this._dbStream) {
            const closeErr = this._dbStream.close();
            if (closeErr) {
                this._logger.warn("db stream close failed", { error: closeErr.message, table: this._table });
            }
            this._dbStream = null;
        }
        if (this._dbClient) {
            try {
                this._dbClient.close();
            } catch (_) {}
            this._dbClient = null;
        }
        if (wasOpen) {
            this._logger.debug("db closed", { table: this._table });
        }
    }

    _persistLastCollectedAt() {
        if (!this.collectorName || !this._lastCollectedAt) {
            return;
        }
        const file = path.join(DATA_DIR, `${this.collectorName}.last-time.json`);
        try {
            fs.writeFileSync(file, JSON.stringify({ ts: this._lastCollectedAt.getTime() }));
        } catch (_) {}
    }

    _loadInitialValuesFromDb() {
        const onChangedNodes = this.nodes.filter(n => n.onChanged === true);
        if (onChangedNodes.length === 0 || !this.collectorName) {
            return;
        }

        const file = path.join(DATA_DIR, `${this.collectorName}.last-time.json`);
        let ts;
        try {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            ts = data.ts;
            if (!ts || typeof ts !== 'number') {
                return;
            }
        } catch (_) {
            return;
        }

        let client;
        try {
            client = new MachbaseClient(this._dbConf);
            client.connect();
            const names = onChangedNodes.map(n => n.name);
            const placeholders = names.map(() => '?').join(', ');
            const sql = `SELECT NAME, LAST(${this._valueColumn}) FROM ${this._table} WHERE NAME IN (${placeholders}) AND TIME >= ? GROUP BY NAME`;
            const rows = client.query(sql, [...names, new Date(ts)]);
            for (const row of rows) {
                const val = row[this._valueColumn];
                if (val !== undefined && val !== null) {
                    this._previousValues[row.NAME] = val;
                }
            }
            const count = Object.keys(this._previousValues).length;
            if (count > 0) {
                this._logger.debug("loaded initial values from db", { count });
            }
        } catch (_) {
        } finally {
            if (client) {
                try {
                    client.close();
                } catch (_) {}
            }
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
        this._opcuaConnected = false;
        this._closeDb();
        this._persistLastCollectedAt();
        this._logger.info("stopped");
    }

    _recordLastCollectedAt(ts) {
        if (!this.collectorName || !ts) {
            return;
        }
        this._lastCollectedAt = ts;
        try {
            this._lastCollectedAtWriter(this.collectorName, ts.getTime(), (err) => {
                if (err) {
                    this._logger.debug("failed to update service detail", {
                        name: this.collectorName,
                        error: err.message,
                    });
                }
            });
        } catch (e) {
            this._logger.warn("failed to update service detail", {
                name: this.collectorName,
                error: e.message,
            });
        }
    }

    collect() {
        this._logger.trace("cycle");
        try {
            if (!this._isDbOpen()) {
                this._openDb();
                if (!this._isDbOpen()) {
                    return;
                }
            }

            if (!this.opcua.open()) {
                this._opcuaConnected = false;
                this._logger.warn("opcua connect failed, will retry", { endpoint: this.opcua.endpoint });
                return;
            }
            if (!this._opcuaConnected) {
                this._logger.info("opcua connected", { endpoint: this.opcua.endpoint });
                this._opcuaConnected = true;
            }

            const results = this.opcua.read(this.nodeIds);
            let lastTs = null;
            const matrix = [];

            this.nodes.forEach((node, idx) => {
                const r = results[idx];
                if (r.statusCode !== undefined && r.statusCode !== 0 && r.statusCode !== 'StatusGood') {
                    this._logger.warn("opcua bad status", { nodeId: node.nodeId, name: node.name, statusCode: r.statusCode });
                }
                const ts = r.sourceTimestamp ? new Date(r.sourceTimestamp) : new Date();
                const rawValue = r.value;
                const value = this._normalizeValue(rawValue, node);
                const fields = { nodeId: node.nodeId, name: node.name, value, ts: ts.toISOString() };
                if (rawValue !== value) fields.rawValue = rawValue;
                this._logger.trace("read", fields);
                if (node.onChanged === true) {
                    if (node.name in this._previousValues && Object.is(this._previousValues[node.name], value)) {
                        this._logger.trace("skip unchanged", { name: node.name, value });
                        return;
                    }
                    this._previousValues[node.name] = value;
                }
                if (lastTs === null || ts.getTime() > lastTs.getTime()) {
                    lastTs = ts;
                }
                matrix.push([node.name, ts, value]);
            });

            if (matrix.length === 0) {
                this._logger.trace("all nodes skipped, nothing to append");
                return;
            }

            for (const row of matrix) {
                this._logger.trace("append", { name: row[0], time: row[1] instanceof Date ? row[1].toISOString() : String(row[1]), value: row[2] });
            }
            const appendErr = this._dbStream.append(matrix);
            if (appendErr) {
                throw appendErr;
            }

            this._recordLastCollectedAt(lastTs);
            this._logger.debug("collected", { count: this.nodes.length });
        } catch (e) {
            this._logger.error("collect error", { error: e.message });
            if (this._opcuaConnected) {
                this._logger.warn("opcua disconnected", { endpoint: this.opcua.endpoint });
            }
            this.opcua.close();
            this._opcuaConnected = false;
            this._closeDb();
            this._previousValues = {};
        }
    }

    start() {
        if (this.timer !== null) {
            return;
        }
        this._logger.info("starting", { table: this._table, valueColumn: this._valueColumn, host: this._dbConf.host, port: this._dbConf.port, user: this._dbConf.user, interval: this.interval, nodes: this.nodes.length, endpoint: this.opcua.endpoint });
        this._openDb();
        this._loadInitialValuesFromDb();
        this.timer = setInterval(() => {
            try {
                this.collect();
            } catch (e) {
                this._logger.error("interval error", { error: e.message });
            }
        }, this.interval);
    }
}

module.exports = Collector;
