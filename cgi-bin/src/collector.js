const fs = require("fs");
const path = require("path");
const OpcuaClient = require("./opcua/opcua-client.js");
const { MachbaseClient } = require("./db/client.js");
const { MachbaseStream } = require("./db/stream.js");
const Service = require("./cgi/service.js");
const { CGI, DATA_DIR } = require("./cgi/cgi_util.js");
const { Logger } = require("./lib/logger.js");
const Expression = require("./expression/evaluator.js");

function _configuredColumn(value) {
    return value === undefined || value === null || value === '' ? null : value;
}

function _resolveOpcuaConfig(config) {
    const opcua = config && config.opcua ? config.opcua : {};
    if (opcua.server !== undefined && opcua.server !== null && String(opcua.server).trim() !== '') {
        const serverName = String(opcua.server).trim();
        const serverConfig = CGI.getOpcuaServerConfig(serverName);
        const endpoint = serverConfig && serverConfig.endpoint ? String(serverConfig.endpoint).trim() : '';
        if (!endpoint) {
            throw new Error(`opcua server '${serverName}' not found`);
        }
        return {
            ...serverConfig,
            endpoint,
        };
    }

    const endpoint = opcua.endpoint !== undefined && opcua.endpoint !== null
        ? String(opcua.endpoint).trim()
        : '';
    if (!endpoint) {
        throw new Error('config.opcua.server or config.opcua.endpoint is required');
    }
    return {
        endpoint,
        security: { enabled: false },
    };
}

const WARN_SUMMARY_EVERY = 60;
const WARN_SUMMARY_INTERVAL_MS = 5 * 60 * 1000;
const NUMERIC_DATA_TYPES = new Set([
    'Boolean',
    'SByte', 'Byte',
    'Int16', 'UInt16',
    'Int32', 'UInt32',
    'Int64', 'UInt64',
    'Float', 'Double',
    'Integer', 'UInteger', 'Number',
]);
const STRING_DATA_TYPES = new Set(['String']);
const TIME_POLICY_SOURCE = 'sourceTime';
const TIME_POLICY_REQUEST = 'requestTime';
const BAD_STATUS_POLICY_SKIP = 'skip';
const BAD_STATUS_POLICY_IGNORE = 'ignore';

function _hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function _normalizeText(value) {
    return value === undefined || value === null ? '' : String(value).trim();
}

function _isValidDate(value) {
    return value instanceof Date && Number.isFinite(value.getTime());
}

function _finiteNumber(value) {
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
        return null;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function _utf8ByteLength(text) {
    let bytes = 0;
    for (let i = 0; i < text.length; i++) {
        const code = text.codePointAt(i);
        if (code <= 0x7f) {
            bytes += 1;
        } else if (code <= 0x7ff) {
            bytes += 2;
        } else if (code <= 0xffff) {
            bytes += 3;
        } else {
            bytes += 4;
            i++;
        }
    }
    return bytes;
}

function _truncateUtf8Bytes(text, maxBytes) {
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
        return '';
    }
    let bytes = 0;
    let out = '';
    for (let i = 0; i < text.length; i++) {
        const code = text.codePointAt(i);
        const size = code <= 0x7f ? 1 : (code <= 0x7ff ? 2 : (code <= 0xffff ? 3 : 4));
        if (bytes + size > maxBytes) {
            break;
        }
        out += String.fromCodePoint(code);
        bytes += size;
        if (code > 0xffff) {
            i++;
        }
    }
    return out;
}

class Collector {
    constructor(config, { opcuaClient, db, collectorName, lastCollectedAtWriter, logger } = {}) {
        const dbConf = CGI.getServerConfig(config.db);
        const table = config.dbTable;
        const stringOnly = config.stringOnly === true;
        const configuredValueColumn = _configuredColumn(config.valueColumn);
        const valueColumn = stringOnly ? null : (configuredValueColumn || "VALUE");
        const stringValueColumn = config.stringValueColumn || null;
        this.nodes = config.opcua.nodes.map(node => Object.assign({}, node, {
            name: _normalizeText(node && node.name),
        }));
        this.nodeIds = this.nodes.map(n => n.nodeId);
        this.interval = config.opcua.interval;
        this._opcuaConfig = _resolveOpcuaConfig(config);
        this._opcuaEndpoint = this._opcuaConfig.endpoint;
        this.opcua = opcuaClient || new OpcuaClient(this._opcuaConfig, config.opcua.readRetryInterval);
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
        this._stringValueColumnLength = 0;
        this._primaryColumnName = 'NAME';
        this._baseTimeColumnName = 'TIME';
        this._warnStates = {};
        this._warnSummaryEvery = WARN_SUMMARY_EVERY;
        this._warnSummaryIntervalMs = WARN_SUMMARY_INTERVAL_MS;
        this._now = () => Date.now();
        this._timePolicy = this._normalizeTimePolicy(config.timePolicy);
        this._badStatusPolicy = this._normalizeBadStatusPolicy(config.badStatusPolicy);
        this._derivedLastValidValues = {};
        this._derivedTags = this._compileDerivedTags(config.derivedTags || []);
        this._schedulerActive = false;
        this._nextRunAt = null;
    }

    _normalizeTimePolicy(value) {
        const policy = _normalizeText(value) || TIME_POLICY_SOURCE;
        if (policy === TIME_POLICY_SOURCE || policy === TIME_POLICY_REQUEST) {
            return policy;
        }
        this._logger.warn("invalid timePolicy, using sourceTime", { timePolicy: value });
        return TIME_POLICY_SOURCE;
    }

    _normalizeBadStatusPolicy(value) {
        const policy = _normalizeText(value) || BAD_STATUS_POLICY_SKIP;
        if (policy === BAD_STATUS_POLICY_SKIP || policy === BAD_STATUS_POLICY_IGNORE) {
            return policy;
        }
        this._logger.warn("invalid badStatusPolicy, using skip", { badStatusPolicy: value });
        return BAD_STATUS_POLICY_SKIP;
    }

    _compileDerivedTags(tags) {
        if (!Array.isArray(tags) || tags.length === 0) {
            return [];
        }
        if (this._stringOnly) {
            this._logger.warn("derivedTags ignored in stringOnly mode", { count: tags.length });
            return [];
        }

        const compiled = [];
        for (const tag of tags) {
            const name = _normalizeText(tag && tag.name);
            try {
                const variables = tag && tag.variables && typeof tag.variables === 'object' && !Array.isArray(tag.variables)
                    ? Object.keys(tag.variables).reduce((result, alias) => {
                        result[alias] = _normalizeText(tag.variables[alias]);
                        return result;
                    }, {})
                    : {};
                const aliases = Object.keys(variables).sort();
                const expression = _normalizeText(tag && tag.expression);
                const compiledExpression = Expression.compile(expression, { variables: aliases });
                compiled.push({
                    name,
                    expression,
                    variables,
                    aliases,
                    usedVariables: compiledExpression.usedVariables,
                    compiled: compiledExpression,
                    timeSource: _normalizeText(tag && tag.timeSource) || 'latest',
                    onChanged: tag && tag.onChanged === true,
                    onError: _normalizeText(tag && tag.onError) || 'skip',
                    errorValue: tag && tag.errorValue,
                });
            } catch (e) {
                this._warnRepeated(`derived-compile-failed:${name}`, "derived tag compile failed", {
                    name,
                    error: e && e.message ? e.message : String(e),
                });
            }
        }
        return compiled;
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

    _shouldSkipBadStatus(result) {
        return this._isBadStatus(result) && this._badStatusPolicy === BAD_STATUS_POLICY_SKIP;
    }

    _sourceTimestampOf(result) {
        if (!result || result.sourceTimestamp === undefined || result.sourceTimestamp === null || result.sourceTimestamp === '') {
            return null;
        }
        const ts = new Date(result.sourceTimestamp);
        return _isValidDate(ts) ? ts : null;
    }

    _timestampOf(result, requestTs) {
        const fallbackTs = _isValidDate(requestTs) ? requestTs : new Date();
        if (this._timePolicy === TIME_POLICY_REQUEST) {
            return fallbackTs;
        }
        return this._sourceTimestampOf(result) || fallbackTs;
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

    _coerceStringValue(value, node) {
        if (value === undefined || value === null) {
            return null;
        }
        const text = String(value);
        const limit = Number(this._stringValueColumnLength || 0);
        if (!limit || _utf8ByteLength(text) <= limit) {
            return text;
        }
        const truncated = _truncateUtf8Bytes(text, limit);
        this._warnRepeated(this._nodeWarnKey('string-value-truncated', node), "string value truncated", {
            nodeId: node && node.nodeId,
            name: node && node.name,
            column: this._stringValueColumn,
            maxBytes: limit,
            originalBytes: _utf8ByteLength(text),
            storedBytes: _utf8ByteLength(truncated),
        });
        return truncated;
    }

    _nodeDataTypeHint(node) {
        const dataType = node && node.dataType !== undefined && node.dataType !== null
            ? String(node.dataType).trim()
            : '';
        if (!dataType) {
            return 'auto';
        }
        if (NUMERIC_DATA_TYPES.has(dataType)) {
            return 'numeric';
        }
        if (STRING_DATA_TYPES.has(dataType)) {
            return 'string';
        }
        return 'auto';
    }

    _canNormalizeNumericValue(value) {
        if (typeof value === 'boolean') {
            return true;
        }
        if (typeof value === 'number') {
            return Number.isFinite(value);
        }
        if (typeof value === 'string' && value.trim() !== '') {
            return Number.isFinite(Number(value));
        }
        return false;
    }

    _isRuntimeNumericValue(value) {
        return typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
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

    _nowMs() {
        const value = this._now();
        if (value instanceof Date) {
            return value.getTime();
        }
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : Date.now();
    }

    _warnRepeated(key, stage, fields) {
        const now = this._nowMs();
        const summaryEvery = this._warnSummaryEvery > 0 ? this._warnSummaryEvery : WARN_SUMMARY_EVERY;
        const summaryIntervalMs = this._warnSummaryIntervalMs > 0 ? this._warnSummaryIntervalMs : WARN_SUMMARY_INTERVAL_MS;
        const state = this._warnStates[key];
        if (!state) {
            this._warnStates[key] = {
                firstAt: now,
                lastWarnAt: now,
                suppressedCount: 0,
            };
            this._logger.warn(stage, fields);
            return;
        }

        state.suppressedCount += 1;
        const reachedCount = state.suppressedCount % summaryEvery === 0;
        const reachedTime = now - state.lastWarnAt >= summaryIntervalMs;
        if (!reachedCount && !reachedTime) {
            return;
        }

        state.lastWarnAt = now;
        this._logger.warn(stage, Object.assign({}, fields, {
            repeated: true,
            suppressedCount: state.suppressedCount,
            durationSec: Math.floor(Math.max(0, now - state.firstAt) / 1000),
        }));
    }

    _clearWarnState(key) {
        delete this._warnStates[key];
    }

    _recoverWarnState(key) {
        const state = this._warnStates[key];
        if (!state) {
            return null;
        }
        delete this._warnStates[key];
        if (state.suppressedCount <= 0) {
            return null;
        }
        const now = this._nowMs();
        return {
            recovered: true,
            suppressedCount: state.suppressedCount,
            durationSec: Math.floor(Math.max(0, now - state.firstAt) / 1000),
        };
    }

    _nodeWarnKey(prefix, node) {
        return `${prefix}:${node && node.nodeId ? node.nodeId : ''}:${node && node.name ? node.name : ''}`;
    }

    _clearUnsupportedValueWarnings(node) {
        this._clearWarnState(this._nodeWarnKey('unsupported-string-only-empty', node));
        this._clearWarnState(this._nodeWarnKey('unsupported-string-empty', node));
        this._clearWarnState(this._nodeWarnKey('unsupported-value-no-string', node));
        this._clearWarnState(this._nodeWarnKey('unsupported-numeric-value', node));
    }

    _buildStandardRow(node, result, requestTs) {
        const ts = this._timestampOf(result, requestTs);
        const rawValue = result ? result.value : null;
        const dataTypeHint = this._nodeDataTypeHint(node);
        let numericValue = null;
        let stringValue = null;
        let storedValue;

        if (this._shouldSkipBadStatus(result)) {
            return { skipped: true, ts, rawValue, value: null, stringValue: null, reason: 'bad-status' };
        }

        if (this._stringOnly) {
            stringValue = this._coerceStringValue(rawValue, node);
            if (stringValue === null) {
                this._warnRepeated(this._nodeWarnKey('unsupported-string-only-empty', node), "unsupported empty value for string-only column", {
                    nodeId: node.nodeId,
                    name: node.name,
                });
                return { skipped: true, ts, rawValue, value: null, stringValue: null, reason: 'empty-string' };
            }
            storedValue = stringValue;
        } else if (dataTypeHint === 'numeric') {
            if (!this._canNormalizeNumericValue(rawValue)) {
                this._warnRepeated(this._nodeWarnKey('unsupported-numeric-value', node), "unsupported value for numeric data type", {
                    nodeId: node.nodeId,
                    name: node.name,
                    dataType: node.dataType,
                    type: rawValue === null ? 'null' : typeof rawValue,
                });
                return { skipped: true, ts, rawValue, value: null, stringValue: null, reason: 'unsupported-numeric' };
            }
            numericValue = this._normalizeValue(rawValue, node);
            storedValue = numericValue;
        } else if (dataTypeHint === 'string') {
            if (!this._stringValueColumn) {
                this._warnRepeated(this._nodeWarnKey('unsupported-value-no-string', node), "unsupported value without string column", {
                    nodeId: node.nodeId,
                    name: node.name,
                    dataType: node.dataType,
                    type: rawValue === null ? 'null' : typeof rawValue,
                });
                return { skipped: true, ts, rawValue, value: null, stringValue: null, reason: 'unsupported' };
            }
            stringValue = this._coerceStringValue(rawValue, node);
            if (stringValue === null) {
                this._warnRepeated(this._nodeWarnKey('unsupported-string-empty', node), "unsupported empty value for string column", {
                    nodeId: node.nodeId,
                    name: node.name,
                    dataType: node.dataType,
                });
                return { skipped: true, ts, rawValue, value: null, stringValue: null, reason: 'empty-string' };
            }
            // TAG tables reject NULL in the selected value column, so string rows
            // keep a numeric placeholder and store the actual value in stringValueColumn.
            numericValue = 0;
            storedValue = stringValue;
        } else if (this._isRuntimeNumericValue(rawValue)) {
            numericValue = this._normalizeValue(rawValue, node);
            storedValue = numericValue;
        } else if (this._stringValueColumn) {
            stringValue = this._coerceStringValue(rawValue, node);
            if (stringValue === null) {
                this._warnRepeated(this._nodeWarnKey('unsupported-string-empty', node), "unsupported empty value for string column", {
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
            this._warnRepeated(this._nodeWarnKey('unsupported-value-no-string', node), "unsupported value without string column", {
                nodeId: node.nodeId,
                name: node.name,
                type: rawValue === null ? 'null' : typeof rawValue,
            });
            return { skipped: true, ts, rawValue, value: null, stringValue: null, reason: 'unsupported' };
        }

        this._clearUnsupportedValueWarnings(node);

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

    _buildSourceStates(results, requestTs) {
        const states = {};
        this.nodes.forEach((node, idx) => {
            const result = results[idx] || {};
            const rawValue = result.value;
            const badStatus = this._isBadStatus(result);
            const skipBadStatus = this._shouldSkipBadStatus(result);
            let numericValue = null;
            let numericAvailable = false;
            let numericReason = '';

            if (skipBadStatus) {
                numericReason = 'bad-status';
            } else if (this._canNormalizeNumericValue(rawValue)) {
                numericValue = this._normalizeValue(rawValue, node);
                if (Number.isFinite(numericValue)) {
                    numericAvailable = true;
                } else {
                    numericReason = 'non-finite';
                }
            } else {
                numericReason = 'non-numeric';
            }

            states[node.name] = {
                node,
                result,
                rawValue,
                badStatus,
                badStatusPolicy: this._badStatusPolicy,
                sourceTs: this._sourceTimestampOf(result),
                ts: this._timestampOf(result, requestTs),
                numericValue,
                numericAvailable,
                numericReason,
            };
        });
        return states;
    }

    _derivedWarnKey(prefix, tag) {
        return `${prefix}:${tag && tag.name ? tag.name : ''}`;
    }

    _derivedTimestamp(tag, sourceStates, requestTs) {
        const fallbackTs = _isValidDate(requestTs) ? requestTs : new Date();
        if (this._timePolicy === TIME_POLICY_REQUEST) {
            return fallbackTs;
        }

        const timeSource = tag.timeSource || 'latest';
        if (timeSource !== 'latest') {
            const sourceName = tag.variables[timeSource];
            const state = sourceName ? sourceStates[sourceName] : null;
            return (state && state.sourceTs) || fallbackTs;
        }

        let latest = null;
        for (const alias of tag.aliases) {
            const sourceName = tag.variables[alias];
            const state = sourceName ? sourceStates[sourceName] : null;
            if (state && state.sourceTs) {
                latest = this._advanceLastTs(latest, state.sourceTs);
            }
        }
        return latest || fallbackTs;
    }

    _fallbackDerivedValue(tag, error) {
        const policy = tag.onError || 'skip';
        if (policy === 'null') {
            return { skipped: false, value: null, policy };
        }
        if (policy === 'value') {
            const value = _finiteNumber(tag.errorValue);
            if (value === null) {
                return { skipped: true, policy, reason: 'invalid-error-value' };
            }
            return { skipped: false, value, policy };
        }
        if (policy === 'previous') {
            if (_hasOwn(this._derivedLastValidValues, tag.name)) {
                return { skipped: false, value: this._derivedLastValidValues[tag.name], policy };
            }
            return { skipped: true, policy, reason: 'previous-unavailable' };
        }
        if (policy !== 'skip') {
            this._warnRepeated(this._derivedWarnKey('derived-invalid-on-error', tag), "derived tag invalid onError policy", {
                name: tag.name,
                onError: policy,
            });
        }
        return { skipped: true, policy: 'skip', reason: error && error.message ? error.message : 'calculation-failed' };
    }

    _evaluateDerivedTags(sourceStates, requestTs) {
        const rows = [];
        for (const tag of this._derivedTags) {
            const values = {};
            let inputError = null;
            for (const alias of tag.usedVariables) {
                const sourceName = tag.variables[alias];
                const state = sourceName ? sourceStates[sourceName] : null;
                if (!state || !state.numericAvailable) {
                    inputError = new Error(`variable '${alias}' source '${sourceName || ''}' is ${state ? state.numericReason : 'missing'}`);
                    break;
                }
                values[alias] = state.numericValue;
            }

            let value;
            let calculated = false;
            let error = inputError;
            if (!error) {
                try {
                    value = tag.compiled.evaluate(values);
                    calculated = true;
                    this._derivedLastValidValues[tag.name] = value;
                    const recovery = this._recoverWarnState(this._derivedWarnKey('derived-eval-failed', tag));
                    if (recovery) {
                        this._logger.info("derived tag calculation recovered", Object.assign({ name: tag.name }, recovery));
                    }
                } catch (e) {
                    error = e;
                }
            }

            if (!calculated) {
                this._warnRepeated(this._derivedWarnKey('derived-eval-failed', tag), "derived tag calculation failed", {
                    name: tag.name,
                    expression: tag.expression,
                    onError: tag.onError,
                    error: error && error.message ? error.message : String(error),
                });
                const fallback = this._fallbackDerivedValue(tag, error);
                if (fallback.skipped) {
                    rows.push({
                        skipped: true,
                        name: tag.name,
                        reason: fallback.reason || 'calculation-failed',
                    });
                    continue;
                }
                value = fallback.value;
            }

            const ts = this._derivedTimestamp(tag, sourceStates, requestTs);
            if (tag.onChanged === true) {
                if (this._hasPreviousValue(tag.name, value)) {
                    this._logger.trace("skip unchanged", { name: tag.name, value });
                    rows.push({ skipped: true, name: tag.name, ts, value, reason: 'unchanged' });
                    continue;
                }
                this._rememberPreviousValue(tag.name, value);
            }

            this._logger.trace("derived", {
                name: tag.name,
                ts: ts.toISOString(),
                value,
            });
            rows.push({
                skipped: false,
                name: tag.name,
                ts,
                value,
                calculated,
            });
        }
        return rows;
    }

    _isDbOpen() {
        return this._dbStream !== null && this._dbStream.stream !== null;
    }

    _openDb() {
        if (this._injectedDb) {
            if (this._stringOnly && this._configuredValueColumn) {
                this._warnRepeated('db-open-failed', "db open failed", { error: "valueColumn must not be set when stringOnly is true" });
                return;
            }
            const { client, stream } = this._injectedDb;
            const err = stream.open(client, this._table, this._valueColumn, this._stringValueColumn, { stringOnly: this._stringOnly });
            if (err) {
                this._warnRepeated('db-open-failed', "db open failed", { error: err.message });
                return;
            }
            this._dbClient = client;
            this._dbStream = stream;
            this._valueColumnFamily = this._dbStream.valueColumnFamily || null;
            this._valueColumnType = this._dbStream.valueColumnType || null;
            this._stringValueColumnType = this._dbStream.stringValueColumnType || null;
            this._stringValueColumnLength = this._dbStream.stringValueColumnLength || 0;
            this._primaryColumnName = this._dbStream.primaryColumnName || 'NAME';
            this._baseTimeColumnName = this._dbStream.baseTimeColumnName || 'TIME';
            const openedFields = {
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
            };
            const recovery = this._recoverWarnState('db-open-failed');
            if (recovery) {
                this._logger.info("db opened", Object.assign({}, openedFields, recovery));
            } else {
                this._logger.debug("db opened", openedFields);
            }
            return;
        }
        try {
            if (this._stringOnly && this._configuredValueColumn) {
                this._warnRepeated('db-open-failed', "db open failed", { error: "valueColumn must not be set when stringOnly is true" });
                return;
            }
            const client = new MachbaseClient(this._dbConf);
            client.connect();
            const stream = new MachbaseStream();
            const err = stream.open(client, this._table, this._valueColumn, this._stringValueColumn, { stringOnly: this._stringOnly });
            if (err) {
                this._warnRepeated('db-open-failed', "db open failed", { error: err.message });
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
            this._stringValueColumnLength = this._dbStream.stringValueColumnLength || 0;
            this._primaryColumnName = this._dbStream.primaryColumnName || 'NAME';
            this._baseTimeColumnName = this._dbStream.baseTimeColumnName || 'TIME';
            const openedFields = {
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
            };
            const recovery = this._recoverWarnState('db-open-failed');
            if (recovery) {
                this._logger.info("db opened", Object.assign({}, openedFields, recovery));
            } else {
                this._logger.debug("db opened", openedFields);
            }
        } catch (e) {
            this._warnRepeated('db-open-failed', "db open failed", { error: e.message });
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
        this._stringValueColumnLength = 0;
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
            this._clearWarnState('persist-last-time-failed');
        } catch (e) {
            this._warnRepeated('persist-last-time-failed', "failed to persist last-time", { file, error: e && e.message ? e.message : String(e) });
        }
    }

    _loadInitialValuesFromDb() {
        const onChangedNodes = this.nodes.filter(n => n.onChanged === true);
        if (onChangedNodes.length === 0 || !this.collectorName) {
            return;
        }

        let client;
        try {
            client = new MachbaseClient(this._dbConf);
            client.connect();
            if (this._isJsonMode()) {
                const rows = client.query(
                    `SELECT /*+ SCAN_BACKWARD(${this._table}) */ ${this._primaryColumnName}, ${this._valueColumn} FROM ${this._table} WHERE ${this._primaryColumnName} = ? LIMIT 1`,
                    [this.collectorName]
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
                for (const node of onChangedNodes) {
                    const rows = client.query(
                        `SELECT /*+ SCAN_BACKWARD(${this._table}) */ ${this._primaryColumnName}, ${this._stringValueColumn} FROM ${this._table} WHERE ${this._primaryColumnName} = ? LIMIT 1`,
                        [node.name]
                    );
                    const first = rows && rows[0] ? rows[0] : null;
                    const val = first ? first[this._stringValueColumn] : null;
                    if (val !== undefined && val !== null) {
                        this._rememberPreviousValue(node.name, val);
                    }
                }
            } else {
                const columns = [this._primaryColumnName, this._valueColumn];
                if (this._stringValueColumn) {
                    columns.push(this._stringValueColumn);
                }
                for (const node of onChangedNodes) {
                    const rows = client.query(
                        `SELECT /*+ SCAN_BACKWARD(${this._table}) */ ${columns.join(', ')} FROM ${this._table} WHERE ${this._primaryColumnName} = ? LIMIT 1`,
                        [node.name]
                    );
                    const first = rows && rows[0] ? rows[0] : null;
                    let val = first ? first[this._valueColumn] : null;
                    if (first && this._stringValueColumn && first[this._stringValueColumn] !== undefined && first[this._stringValueColumn] !== null) {
                        val = first[this._stringValueColumn];
                    }
                    if (val !== undefined && val !== null) {
                        this._rememberPreviousValue(node.name, val);
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

    _derivedStateTags() {
        return this._derivedTags.filter(tag => tag.onError === 'previous' || tag.onChanged === true);
    }

    _rememberDerivedPreviousValue(name, value) {
        const num = _finiteNumber(value);
        if (num !== null) {
            this._derivedLastValidValues[name] = num;
        }
    }

    _restoreDerivedStoredValue(tag, value) {
        if (tag.onChanged === true) {
            this._rememberPreviousValue(tag.name, value);
        }
        if (tag.onError === 'previous') {
            this._rememberDerivedPreviousValue(tag.name, value);
        }
    }

    _loadInitialDerivedValuesFromDb() {
        const stateTags = this._derivedStateTags();
        if (stateTags.length === 0 || !this.collectorName || this._stringOnly) {
            return;
        }

        let client;
        try {
            client = new MachbaseClient(this._dbConf);
            client.connect();
            if (this._isJsonMode()) {
                const rows = client.query(
                    `SELECT /*+ SCAN_BACKWARD(${this._table}) */ ${this._primaryColumnName}, ${this._valueColumn} FROM ${this._table} WHERE ${this._primaryColumnName} = ? LIMIT 1`,
                    [this.collectorName]
                );
                const first = rows && rows[0] ? rows[0] : null;
                const payload = first ? this._parseStoredJson(first[this._valueColumn]) : null;
                if (payload && typeof payload === 'object') {
                    for (const tag of stateTags) {
                        if (_hasOwn(payload, tag.name)) {
                            this._restoreDerivedStoredValue(tag, payload[tag.name]);
                        }
                    }
                }
            } else {
                for (const tag of stateTags) {
                    const rows = client.query(
                        `SELECT /*+ SCAN_BACKWARD(${this._table}) */ ${this._primaryColumnName}, ${this._valueColumn} FROM ${this._table} WHERE ${this._primaryColumnName} = ? LIMIT 1`,
                        [tag.name]
                    );
                    const first = rows && rows[0] ? rows[0] : null;
                    if (first && _hasOwn(first, this._valueColumn)) {
                        this._restoreDerivedStoredValue(tag, first[this._valueColumn]);
                    }
                }
            }
            this._logger.debug("loaded initial derived values from db", {
                onChangedCount: stateTags.filter(tag => tag.onChanged === true && _hasOwn(this._previousValues, tag.name)).length,
                previousCount: Object.keys(this._derivedLastValidValues).length,
            });
        } catch (e) {
            this._logger.warn("failed to load initial derived values from db", { error: e && e.message ? e.message : String(e) });
        } finally {
            if (client) {
                try {
                    client.close();
                } catch (_) {}
            }
        }
    }

    close() {
        this._schedulerActive = false;
        this._nextRunAt = null;
        if (this.timer !== null) {
            clearTimeout(this.timer);
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
                    this._warnRepeated('service-detail-update-failed', "failed to update service detail", {
                        name: this.collectorName,
                        error: err.message,
                    });
                    return;
                }
                this._clearWarnState('service-detail-update-failed');
            });
        } catch (e) {
            this._warnRepeated('service-detail-update-failed', "failed to update service detail", {
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
                this._warnRepeated('opcua-connect-failed', "opcua connect failed, will retry", { endpoint: this.opcua.endpoint });
                return;
            }
            if (!this._opcuaConnected) {
                const connectedFields = { endpoint: this.opcua.endpoint };
                const recovery = this._recoverWarnState('opcua-connect-failed');
                if (recovery) {
                    Object.assign(connectedFields, recovery);
                }
                this._logger.info("opcua connected", connectedFields);
                this._opcuaConnected = true;
            }

            const requestTs = new Date();
            const results = this.opcua.read(this.nodeIds);
            const sourceStates = this._buildSourceStates(results, requestTs);
            let lastTs = null;
            let appendErr = null;
            let collectedCount = 0;

            if (this._isJsonMode()) {
                const payload = {};
                let shouldAppend = false;

                this.nodes.forEach((node, idx) => {
                    const result = results[idx] || {};
                    const state = sourceStates[node.name] || {};
                    const ts = state.ts || this._timestampOf(result, requestTs);
                    const badStatus = this._isBadStatus(result);
                    const skipBadStatus = this._shouldSkipBadStatus(result);

                    if (badStatus) {
                        this._warnRepeated(this._nodeWarnKey('opcua-bad-status', node), "opcua bad status", {
                            nodeId: node.nodeId,
                            name: node.name,
                            statusCode: result.statusCode,
                            badStatusPolicy: this._badStatusPolicy,
                        });
                    } else {
                        this._clearWarnState(this._nodeWarnKey('opcua-bad-status', node));
                    }
                    if (skipBadStatus) {
                        this._logger.trace("skip bad status", {
                            nodeId: node.nodeId,
                            name: node.name,
                            statusCode: result.statusCode,
                            badStatusPolicy: this._badStatusPolicy,
                        });
                        return;
                    }
                    lastTs = this._advanceLastTs(lastTs, ts);

                    const rawValue = result.value;
                    const jsonValue = this._normalizeJsonValue(rawValue, node);
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

                const derivedRows = this._evaluateDerivedTags(sourceStates, requestTs);
                for (const derived of derivedRows) {
                    if (derived.skipped) {
                        if (derived.reason === 'unchanged') {
                            lastTs = this._advanceLastTs(lastTs, derived.ts);
                            payload[derived.name] = derived.value;
                        }
                        continue;
                    }
                    lastTs = this._advanceLastTs(lastTs, derived.ts);
                    payload[derived.name] = derived.value;
                    shouldAppend = true;
                }

                if (!shouldAppend) {
                    this._logger.trace("all nodes skipped, nothing to append");
                    return;
                }

                const payloadText = JSON.stringify(payload);
                const row = {
                    [this._primaryColumnName]: this.collectorName,
                    [this._baseTimeColumnName]: lastTs || requestTs,
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
                        this._warnRepeated(this._nodeWarnKey('opcua-bad-status', node), "opcua bad status", {
                            nodeId: node.nodeId,
                            name: node.name,
                            statusCode: result.statusCode,
                            badStatusPolicy: this._badStatusPolicy,
                        });
                    } else {
                        this._clearWarnState(this._nodeWarnKey('opcua-bad-status', node));
                    }
                    const built = this._buildStandardRow(node, result, requestTs);
                    if (built.skipped) {
                        return;
                    }
                    lastTs = this._advanceLastTs(lastTs, built.ts);
                    rows.push(built.row);
                });

                const derivedRows = this._evaluateDerivedTags(sourceStates, requestTs);
                for (const derived of derivedRows) {
                    if (derived.skipped) {
                        continue;
                    }
                    const row = {
                        [this._primaryColumnName]: derived.name,
                        [this._baseTimeColumnName]: derived.ts,
                        [this._valueColumn]: derived.value,
                    };
                    rows.push(row);
                    lastTs = this._advanceLastTs(lastTs, derived.ts);
                }

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
            this._derivedLastValidValues = {};
        }
    }

    _scheduleNextRun() {
        if (!this._schedulerActive) {
            return;
        }
        const now = this._now();
        if (this._nextRunAt === null) {
            this._nextRunAt = now + this.interval;
        }

        let skipped = 0;
        while (this._nextRunAt <= now) {
            this._nextRunAt += this.interval;
            skipped++;
        }
        if (skipped > 0) {
            this._logger.trace("skipped overdue cycles", { skipped, interval: this.interval });
        }

        const delay = Math.max(0, this._nextRunAt - this._now());
        this.timer = setTimeout(() => {
            this.timer = null;
            if (!this._schedulerActive) {
                return;
            }
            try {
                this.collect();
            } catch (e) {
                this._logger.error("interval error", { error: e.message });
            }
            if (!this._schedulerActive) {
                return;
            }
            this._nextRunAt += this.interval;
            this._scheduleNextRun();
        }, delay);
    }

    start() {
        if (this._schedulerActive) {
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
            derivedTags: this._derivedTags.length,
            timePolicy: this._timePolicy,
            badStatusPolicy: this._badStatusPolicy,
            endpoint: this.opcua.endpoint,
        });
        this._openDb();
        if (this._isDbOpen()) {
            this._loadInitialValuesFromDb();
            this._loadInitialDerivedValuesFromDb();
        }
        this._schedulerActive = true;
        this._nextRunAt = this._now() + this.interval;
        this._scheduleNextRun();
    }
}

module.exports = Collector;
