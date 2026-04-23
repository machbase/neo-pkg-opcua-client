const fs = require("fs");
const path = require("path");
const OpcuaClient = require("./opcua/opcua-client.js");
const { MachbaseClient } = require("./db/client.js");
const { MachbaseStream } = require("./db/stream.js");
const Service = require("./cgi/service.js");
const { CGI, DATA_DIR } = require("./cgi/cgi_util.js");
const { Logger } = require("./lib/logger.js");

function _configuredColumn(value) {
    return value === undefined || value === null || value === '' ? null : value;
}

class Collector {
    constructor(config, { opcuaClient, db, collectorName, lastCollectedAtWriter, logger } = {}) {
        const dbConf = CGI.getServerConfig(config.db);
        const table = config.dbTable;
        const stringOnly = config.stringOnly === true;
        const configuredValueColumn = _configuredColumn(config.valueColumn);
        const valueColumn = stringOnly ? null : (configuredValueColumn || "VALUE");
        const stringValueColumn = config.stringValueColumn || null;
        this.nodes = config.opcua.nodes;
        this.nodeIds = this.nodes.map(n => n.nodeId);
        this.interval = config.opcua.interval;
        this.opcua = opcuaClient || new OpcuaClient(config.opcua.endpoint, config.opcua.readRetryInterval);
        this._dbConf = dbConf;
        this._table = table;
        this._configuredValueColumn = configuredValueColumn;
        this._valueColumn = valueColumn;
        this._stringValueColumn = stringValueColumn;
        this._stringOnly = stringOnly;
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
        this._valueColumnFamily = null;
        this._valueColumnType = null;
        this._stringValueColumnType = null;
        this._primaryColumnName = 'NAME';
        this._baseTimeColumnName = 'TIME';
    }

    _storageMode() {
        if (this._stringOnly) {
            return 'string';
        }
        return this._valueColumnFamily === 'JSON' ? 'json' : 'default';
    }

    _isJsonMode() {
        return this._storageMode() === 'json';
    }

    _isBadStatus(result) {
        return result && result.statusCode !== undefined && result.statusCode !== 0 && result.statusCode !== 'StatusGood';
    }

    _timestampOf(result) {
        return result && result.sourceTimestamp ? new Date(result.sourceTimestamp) : new Date();
    }

    _advanceLastTs(lastTs, ts) {
        if (lastTs === null || ts.getTime() > lastTs.getTime()) {
            return ts;
        }
        return lastTs;
    }

    _snapshotValue(value) {
        if (value && typeof value === 'object') {
            try {
                return JSON.stringify(value);
            } catch (_) {
                return String(value);
            }
        }
        return value;
    }

    _hasPreviousValue(name, value) {
        return name in this._previousValues && Object.is(this._previousValues[name], this._snapshotValue(value));
    }

    _rememberPreviousValue(name, value) {
        this._previousValues[name] = this._snapshotValue(value);
    }

    _coerceStringValue(value) {
        if (value === undefined || value === null) {
            return null;
        }
        return String(value);
    }

    _normalizeJsonValue(value, node) {
        if (value === undefined || value === null) {
            return null;
        }
        if (typeof value === 'number') {
            return this._normalizeValue(value, node);
        }
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'string') {
            return value;
        }
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (_) {
            return String(value);
        }
    }

    _parseStoredJson(value) {
        if (value === undefined || value === null) {
            return null;
        }
        if (typeof value === 'string') {
            try {
                return JSON.parse(value);
            } catch (_) {
                return null;
            }
        }
        if (typeof value === 'object') {
            return value;
        }
        return null;
    }

    _buildStandardRow(node, result) {
        const ts = this._timestampOf(result);
        const rawValue = result ? result.value : null;
        let numericValue = null;
        let stringValue = null;
        let storedValue;

        if (this._stringOnly) {
            stringValue = this._coerceStringValue(rawValue);
            if (stringValue === null) {
                this._logger.warn("unsupported empty value for string-only column", {
                    nodeId: node.nodeId,
                    name: node.name,
                });
                return { skipped: true, ts, rawValue, value: null, stringValue: null, reason: 'empty-string' };
            }
            storedValue = stringValue;
        } else if (typeof rawValue === 'boolean' || typeof rawValue === 'number') {
            numericValue = this._normalizeValue(rawValue, node);
            storedValue = numericValue;
        } else if (this._stringValueColumn) {
            stringValue = this._coerceStringValue(rawValue);
            if (stringValue === null) {
                this._logger.warn("unsupported empty value for string column", {
                    nodeId: node.nodeId,
                    name: node.name,
                });
                return { skipped: true, ts, rawValue, value: null, stringValue: null, reason: 'empty-string' };
            }
            // TAG tables reject NULL in the selected value column, so string rows
            // keep a numeric placeholder and store the actual value in stringValueColumn.
            numericValue = 0;
            storedValue = stringValue;
        } else {
            this._logger.warn("unsupported value without string column", {
                nodeId: node.nodeId,
                name: node.name,
                type: rawValue === null ? 'null' : typeof rawValue,
            });
            return { skipped: true, ts, rawValue, value: null, stringValue: null, reason: 'unsupported' };
        }

        const fields = { nodeId: node.nodeId, name: node.name, ts: ts.toISOString() };
        if (numericValue !== null || typeof rawValue === 'boolean' || typeof rawValue === 'number') {
            fields.value = numericValue;
        }
        if (stringValue !== null) {
            fields.stringValue = stringValue;
        }
        if (rawValue !== storedValue && rawValue !== stringValue) {
            fields.rawValue = rawValue;
        }
        this._logger.trace("read", fields);

        if (node.onChanged === true) {
            if (this._hasPreviousValue(node.name, storedValue)) {
                this._logger.trace("skip unchanged", { name: node.name, value: storedValue });
                return { skipped: true, ts, rawValue, value: numericValue, stringValue, reason: 'unchanged' };
            }
            this._rememberPreviousValue(node.name, storedValue);
        }

        const row = {
            [this._primaryColumnName]: node.name,
            [this._baseTimeColumnName]: ts,
        };
        if (!this._stringOnly) {
            row[this._valueColumn] = numericValue;
        }
        if (this._stringValueColumn) {
            row[this._stringValueColumn] = stringValue;
        }
        return { skipped: false, ts, row, rawValue, value: numericValue, stringValue };
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
            if (this._stringOnly && this._configuredValueColumn) {
                this._logger.warn("db open failed", { error: "valueColumn must not be set when stringOnly is true" });
                return;
            }
            const { client, stream } = this._injectedDb;
            const err = stream.open(client, this._table, this._valueColumn, this._stringValueColumn, { stringOnly: this._stringOnly });
            if (err) {
                this._logger.warn("db open failed", { error: err.message });
                return;
            }
            this._dbClient = client;
            this._dbStream = stream;
            this._valueColumnFamily = this._dbStream.valueColumnFamily || null;
            this._valueColumnType = this._dbStream.valueColumnType || null;
            this._stringValueColumnType = this._dbStream.stringValueColumnType || null;
            this._primaryColumnName = this._dbStream.primaryColumnName || 'NAME';
            this._baseTimeColumnName = this._dbStream.baseTimeColumnName || 'TIME';
            this._logger.debug("db opened", {
                table: this._table,
                columns: this._dbStream.columnNames.join(', '),
                nameIdx: this._dbStream.nameIdx,
                timeIdx: this._dbStream.timeIdx,
                primaryColumn: this._primaryColumnName,
                baseTimeColumn: this._baseTimeColumnName,
                valueIdx: this._dbStream.valueIdx,
                valueColumn: this._valueColumn,
                valueColumnType: this._valueColumnType,
                stringValueColumn: this._stringValueColumn,
                stringValueColumnType: this._stringValueColumnType,
                stringOnly: this._stringOnly,
                storageMode: this._storageMode(),
            });
            return;
        }
        try {
            if (this._stringOnly && this._configuredValueColumn) {
                this._logger.warn("db open failed", { error: "valueColumn must not be set when stringOnly is true" });
                return;
            }
            const client = new MachbaseClient(this._dbConf);
            client.connect();
            const stream = new MachbaseStream();
            const err = stream.open(client, this._table, this._valueColumn, this._stringValueColumn, { stringOnly: this._stringOnly });
            if (err) {
                this._logger.warn("db open failed", { error: err.message });
                try {
                    client.close();
                } catch (_) {}
                return;
            }
            this._dbClient = client;
            this._dbStream = stream;
            this._valueColumnFamily = this._dbStream.valueColumnFamily || null;
            this._valueColumnType = this._dbStream.valueColumnType || null;
            this._stringValueColumnType = this._dbStream.stringValueColumnType || null;
            this._primaryColumnName = this._dbStream.primaryColumnName || 'NAME';
            this._baseTimeColumnName = this._dbStream.baseTimeColumnName || 'TIME';
            this._logger.debug("db opened", {
                table: this._table,
                columns: this._dbStream.columnNames.join(', '),
                nameIdx: this._dbStream.nameIdx,
                timeIdx: this._dbStream.timeIdx,
                primaryColumn: this._primaryColumnName,
                baseTimeColumn: this._baseTimeColumnName,
                valueIdx: this._dbStream.valueIdx,
                valueColumn: this._valueColumn,
                valueColumnType: this._valueColumnType,
                stringValueColumn: this._stringValueColumn,
                stringValueColumnType: this._stringValueColumnType,
                stringOnly: this._stringOnly,
                storageMode: this._storageMode(),
            });
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
        this._valueColumnFamily = null;
        this._valueColumnType = null;
        this._stringValueColumnType = null;
        this._primaryColumnName = 'NAME';
        this._baseTimeColumnName = 'TIME';
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
        } catch (e) {
            this._logger.warn("failed to persist last-time", { file, error: e && e.message ? e.message : String(e) });
        }
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
            if (this._isJsonMode()) {
                const rows = client.query(
                    `SELECT ${this._primaryColumnName}, ${this._valueColumn} FROM ${this._table} WHERE ${this._primaryColumnName} = ? AND ${this._baseTimeColumnName} >= ? ORDER BY ${this._baseTimeColumnName} DESC`,
                    [this.collectorName, new Date(ts)]
                );
                const first = rows && rows[0] ? rows[0] : null;
                const payload = first ? this._parseStoredJson(first[this._valueColumn]) : null;
                if (payload && typeof payload === 'object') {
                    for (const node of onChangedNodes) {
                        if (Object.prototype.hasOwnProperty.call(payload, node.name)) {
                            this._rememberPreviousValue(node.name, payload[node.name]);
                        }
                    }
                }
            } else if (this._stringOnly) {
                const names = onChangedNodes.map(n => n.name);
                const placeholders = names.map(() => '?').join(', ');
                const rows = client.query(
                    `SELECT ${this._primaryColumnName}, ${this._stringValueColumn} FROM ${this._table} WHERE ${this._primaryColumnName} IN (${placeholders}) AND ${this._baseTimeColumnName} >= ? ORDER BY ${this._baseTimeColumnName} DESC`,
                    [...names, new Date(ts)]
                );
                for (const row of rows) {
                    const tagName = row[this._primaryColumnName];
                    if (tagName in this._previousValues) {
                        continue;
                    }
                    const val = row[this._stringValueColumn];
                    if (val !== undefined && val !== null) {
                        this._rememberPreviousValue(tagName, val);
                    }
                }
            } else {
                const names = onChangedNodes.map(n => n.name);
                const placeholders = names.map(() => '?').join(', ');
                const columns = [this._primaryColumnName, this._valueColumn];
                if (this._stringValueColumn) {
                    columns.push(this._stringValueColumn);
                }
                const rows = client.query(
                    `SELECT ${columns.join(', ')} FROM ${this._table} WHERE ${this._primaryColumnName} IN (${placeholders}) AND ${this._baseTimeColumnName} >= ? ORDER BY ${this._baseTimeColumnName} DESC`,
                    [...names, new Date(ts)]
                );
                for (const row of rows) {
                    const tagName = row[this._primaryColumnName];
                    if (tagName in this._previousValues) {
                        continue;
                    }
                    let val = row[this._valueColumn];
                    if (this._stringValueColumn && row[this._stringValueColumn] !== undefined && row[this._stringValueColumn] !== null) {
                        val = row[this._stringValueColumn];
                    }
                    if (val !== undefined && val !== null) {
                        this._rememberPreviousValue(tagName, val);
                    }
                }
            }
            const count = Object.keys(this._previousValues).length;
            this._logger.debug("loaded initial values from db", { count });
        } catch (e) {
            this._logger.warn("failed to load initial values from db", { error: e && e.message ? e.message : String(e) });
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
        this._persistLastCollectedAt();
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
            let appendErr = null;
            let collectedCount = 0;

            if (this._isJsonMode()) {
                const payload = {};
                let shouldAppend = false;

                this.nodes.forEach((node, idx) => {
                    const result = results[idx] || {};
                    const ts = this._timestampOf(result);
                    lastTs = this._advanceLastTs(lastTs, ts);

                    if (this._isBadStatus(result)) {
                        this._logger.warn("opcua bad status", { nodeId: node.nodeId, name: node.name, statusCode: result.statusCode });
                    }

                    const rawValue = result.value;
                    const jsonValue = this._isBadStatus(result) ? null : this._normalizeJsonValue(rawValue, node);
                    const fields = { nodeId: node.nodeId, name: node.name, ts: ts.toISOString(), jsonValue };
                    if (rawValue !== jsonValue) {
                        fields.rawValue = rawValue;
                    }
                    this._logger.trace("read", fields);

                    payload[node.name] = jsonValue;

                    if (node.onChanged === true) {
                        if (this._hasPreviousValue(node.name, jsonValue)) {
                            this._logger.trace("skip unchanged", { name: node.name, value: jsonValue });
                            return;
                        }
                        this._rememberPreviousValue(node.name, jsonValue);
                    }
                    shouldAppend = true;
                });

                if (!shouldAppend) {
                    this._logger.trace("all nodes skipped, nothing to append");
                    return;
                }

                const payloadText = JSON.stringify(payload);
                const row = {
                    [this._primaryColumnName]: this.collectorName,
                    [this._baseTimeColumnName]: lastTs || new Date(),
                    [this._valueColumn]: payloadText,
                };
                this._logger.trace("append", {
                    name: row[this._primaryColumnName],
                    time: row[this._baseTimeColumnName] instanceof Date ? row[this._baseTimeColumnName].toISOString() : String(row[this._baseTimeColumnName]),
                    jsonValue: payloadText,
                });
                appendErr = this._dbStream.appendNamedRows([row]);
                collectedCount = 1;
            } else {
                const rows = [];

                this.nodes.forEach((node, idx) => {
                    const result = results[idx] || {};
                    if (this._isBadStatus(result)) {
                        this._logger.warn("opcua bad status", { nodeId: node.nodeId, name: node.name, statusCode: result.statusCode });
                    }
                    const built = this._buildStandardRow(node, result);
                    if (built.skipped) {
                        return;
                    }
                    lastTs = this._advanceLastTs(lastTs, built.ts);
                    rows.push(built.row);
                });

                if (rows.length === 0) {
                    this._logger.trace("all nodes skipped, nothing to append");
                    return;
                }

                for (const row of rows) {
                    this._logger.trace("append", {
                        name: row[this._primaryColumnName],
                        time: row[this._baseTimeColumnName] instanceof Date ? row[this._baseTimeColumnName].toISOString() : String(row[this._baseTimeColumnName]),
                        value: this._stringOnly ? undefined : row[this._valueColumn],
                        stringValue: this._stringValueColumn ? row[this._stringValueColumn] : undefined,
                    });
                }
                appendErr = this._dbStream.appendNamedRows(rows);
                collectedCount = rows.length;
            }

            if (appendErr) {
                throw appendErr;
            }

            this._recordLastCollectedAt(lastTs);
            this._logger.debug("collected", { count: collectedCount, storageMode: this._storageMode() });
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
        this._logger.info("starting", {
            table: this._table,
            valueColumn: this._valueColumn,
            stringValueColumn: this._stringValueColumn,
            stringOnly: this._stringOnly,
            host: this._dbConf.host,
            port: this._dbConf.port,
            user: this._dbConf.user,
            interval: this.interval,
            nodes: this.nodes.length,
            endpoint: this.opcua.endpoint,
        });
        this._openDb();
        if (this._isDbOpen()) {
            this._loadInitialValuesFromDb();
        }
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
