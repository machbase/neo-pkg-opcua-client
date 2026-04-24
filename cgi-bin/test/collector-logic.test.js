'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const TestRunner = require('./runner.js');

const ROOT = path.resolve(__dirname, '..');

// ── Mock classes ───────────────────────────────────────────────────────────────

class MockOpcuaClient {
    constructor() {
        this.endpoint = 'opc.tcp://localhost:4840';
        this.opened = false;
        this.closed = false;
        this.readResult = [];
        this.readError = null;
    }
    open() { this.opened = true; return true; }
    read() {
        if (this.readError) throw new Error(this.readError);
        return this.readResult;
    }
    close() { this.closed = true; }
}

let mockDbQueryRows = [];
let mockDbQueries = [];

class MockMachbaseClient {
    constructor() {
        this.closed = false;
        this.connected = false;
        this.queryRows = [];
    }
    connect() { this.connected = true; }
    query() { return this.queryRows; }
    close() { this.closed = true; }
}

class MockMachbaseStream {
    constructor() {
        this.stream = null;
        this.closed = false;
        this.appended = [];
        this.flushed = false;
        this.openError = null;
        this.appendError = null;
        this.columnNames = [];
        this.nameIdx = -1;
        this.timeIdx = -1;
        this.primaryIdx = -1;
        this.baseTimeIdx = -1;
        this.primaryColumnName = 'NAME';
        this.baseTimeColumnName = 'TIME';
        this.valueIdx = -1;
        this.openedValueColumn = null;
        this.openedStringValueColumn = null;
        this.valueColumnFamily = 'NUMERIC';
        this.valueColumnType = 'DOUBLE';
        this.stringValueColumnType = null;
        this.stringOnly = false;
    }
    open(_client, _table, valueColumn, stringValueColumn, options) {
        if (this.openError) return new Error(this.openError);
        this.stringOnly = !!(options && options.stringOnly);
        if (this.stringOnly && valueColumn) return new Error('valueColumn must not be set when stringOnly is true');
        if (this.stringOnly && !stringValueColumn) return new Error('stringValueColumn is required when stringOnly is true');
        this.stream = {};
        this.openedValueColumn = this.stringOnly ? null : (valueColumn || 'VALUE');
        this.openedStringValueColumn = stringValueColumn || null;
        this.columnNames = [this.primaryColumnName, this.baseTimeColumnName];
        if (!this.stringOnly) {
            this.columnNames.push(this.openedValueColumn);
        }
        this.nameIdx = 0;
        this.timeIdx = 1;
        this.primaryIdx = 0;
        this.baseTimeIdx = 1;
        this.valueIdx = this.stringOnly ? -1 : 2;
        this.valueColumnType = this.stringOnly ? null : (this.valueColumnFamily === 'JSON' ? 'JSON' : 'DOUBLE');
        if (this.openedStringValueColumn) {
            this.columnNames.push(this.openedStringValueColumn);
            this.stringValueColumnType = 'VARCHAR(400)';
        } else {
            this.stringValueColumnType = null;
        }
        return null;
    }
    appendNamedRows(rows) {
        if (this.appendError) return new Error(this.appendError);
        for (const row of rows) {
            this.appended.push(Object.assign({}, row, {
                name: row[this.primaryColumnName],
                time: row[this.baseTimeColumnName],
                value: row[this.openedValueColumn],
                stringValue: this.openedStringValueColumn ? row[this.openedStringValueColumn] : undefined,
            }));
        }
        this.flushed = true;
        return null;
    }
    append(matrix) {
        return this.appendNamedRows(matrix.map((row) => ({
            [this.primaryColumnName]: row[0],
            [this.baseTimeColumnName]: row[1],
            [this.openedValueColumn || 'VALUE']: row[2],
        })));
    }
    close() {
        this.stream = null;
        this.closed = true;
        return null;
    }
}

class MockLogger {
    constructor() {
        this.entries = [];
    }
    _push(level, stage, fields) {
        this.entries.push({
            level,
            stage,
            fields: fields ? { ...fields } : {},
        });
    }
    trace(stage, fields) { this._push('trace', stage, fields); }
    debug(stage, fields) { this._push('debug', stage, fields); }
    info(stage, fields)  { this._push('info', stage, fields); }
    warn(stage, fields)  { this._push('warn', stage, fields); }
    error(stage, fields) { this._push('error', stage, fields); }
}

// ── require.cache injection ────────────────────────────────────────────────────

const mockDbConf = { host: 'localhost', port: 5656, user: 'sys', password: 'manager' };

function loadCollector() {
    const opcuaClientPath = require.resolve(path.join(ROOT, 'src/opcua/opcua-client.js'));
    const clientPath      = require.resolve(path.join(ROOT, 'src/db/client.js'));
    const servicePath     = require.resolve(path.join(ROOT, 'src/cgi/service.js'));
    const cgiUtilPath     = require.resolve(path.join(ROOT, 'src/cgi/cgi_util.js'));
    const collectorPath   = require.resolve(path.join(ROOT, 'src/collector.js'));

    require.cache[opcuaClientPath] = {
        id: opcuaClientPath, filename: opcuaClientPath, loaded: true,
        exports: function MockOpcua() {
            this.endpoint = '';
            this.open = () => true;
            this.read = () => [];
            this.close = () => {};
        },
    };
    require.cache[clientPath] = {
        id: clientPath, filename: clientPath, loaded: true,
        exports: { MachbaseClient: function() {
            this.connect = () => {};
            this.query = (sql, values) => {
                mockDbQueries.push({ sql, values });
                return mockDbQueryRows;
            };
            this.close = () => {};
        } },
    };
    require.cache[servicePath] = {
        id: servicePath, filename: servicePath, loaded: true,
        exports: { setValue: (_n, _k, _v, cb) => { if (cb) cb(null); } },
    };
    require.cache[cgiUtilPath] = {
        id: cgiUtilPath, filename: cgiUtilPath, loaded: true,
        exports: { CGI: { getServerConfig: () => mockDbConf }, DATA_DIR: os.tmpdir() },
    };

    delete require.cache[collectorPath];
    const Collector = require(collectorPath);

    delete require.cache[opcuaClientPath];
    delete require.cache[clientPath];
    delete require.cache[servicePath];
    delete require.cache[cgiUtilPath];

    return Collector;
}

const baseConfig = {
    opcua: {
        endpoint: 'opc.tcp://localhost:4840',
        readRetryInterval: 100,
        interval: 5000,
        nodes: [
            { nodeId: 'ns=1;s=Tag1', name: 'sensor.tag1' },
            { nodeId: 'ns=1;s=Tag2', name: 'sensor.tag2' },
        ],
    },
    db: 'my-server',
    dbTable: 'TAG',
};

function makeCollector(configOverride, options = {}) {
    const collectorName = options.collectorName || 'collector-a';
    try { fs.unlinkSync(path.join(os.tmpdir(), `${collectorName}.last-time.json`)); } catch (_) {}
    mockDbQueryRows = options.queryRows || [];
    mockDbQueries = [];
    const Collector = loadCollector();
    const opcuaClient = new MockOpcuaClient();
    const dbClient    = new MockMachbaseClient();
    dbClient.queryRows = options.queryRows || [];
    const dbStream    = options.dbStream || new MockMachbaseStream();
    const logger      = options.logger || null;
    const detailWrites = [];
    const config = configOverride || baseConfig;
    const c = new Collector(config, {
        opcuaClient,
        db: { client: dbClient, stream: dbStream },
        collectorName,

        lastCollectedAtWriter: (name, value, cb) => {
            detailWrites.push({ name, value });
            if (cb) cb(null);
        },
        logger,
    });
    c._detailWrites = detailWrites;
    return { c, opcuaClient, dbClient, dbStream, detailWrites, dbQueries: mockDbQueries };
}

function makeOnChangedCollector(nodes, readResults) {
    const config = { ...baseConfig, opcua: { ...baseConfig.opcua, nodes } };
    const { c, opcuaClient, dbStream, detailWrites } = makeCollector(config);
    if (readResults) opcuaClient.readResult = readResults;
    return { c, opcuaClient, dbStream, detailWrites };
}

const runner = new TestRunner();

// ── Constructor ────────────────────────────────────────────────────────────────

runner.run('Collector constructor', {
    'nodes and nodeIds are initialized from config': (t) => {
        const { c } = makeCollector();
        t.assertEqual(c.nodes.length, 2);
        t.assertEqual(c.nodeIds.length, 2);
        t.assertEqual(c.nodeIds[0], 'ns=1;s=Tag1');
        t.assertEqual(c.nodeIds[1], 'ns=1;s=Tag2');
    },
    'interval is initialized from config': (t) => {
        const { c } = makeCollector();
        t.assertEqual(c.interval, 5000);
    },
    '_previousValues starts as empty object': (t) => {
        const { c } = makeCollector();
        t.assertDeepEqual(c._previousValues, {});
    },
    'timer starts as null': (t) => {
        const { c } = makeCollector();
        t.assertNull(c.timer);
    },
    '_opcuaConnected starts as false': (t) => {
        const { c } = makeCollector();
        t.assert(!c._opcuaConnected, '_opcuaConnected should be false initially');
    },
    'collectorName is set from options': (t) => {
        const { c } = makeCollector();
        t.assertEqual(c.collectorName, 'collector-a');
    },
    'valueColumn defaults to VALUE': (t) => {
        const Collector = loadCollector();
        const dbStream2 = new MockMachbaseStream();
        const c = new Collector(baseConfig, {
            opcuaClient: new MockOpcuaClient(),
            db: { client: new MockMachbaseClient(), stream: dbStream2 },
        });
        c.start();
        clearInterval(c.timer);
        t.assertEqual(dbStream2.openedValueColumn, 'VALUE', 'default value column should be VALUE');
    },
});

runner.run('Collector.collect — stringValueColumn', {
    'start() passes stringValueColumn to stream.open': (t) => {
        const config = { ...baseConfig, stringValueColumn: 'TEXT_VALUE' };
        const { c, dbStream } = makeCollector(config);
        c.start();
        t.assertEqual(dbStream.openedStringValueColumn, 'TEXT_VALUE');
        clearInterval(c.timer);
    },

    'string values go to auxiliary column when configured': (t) => {
        const config = {
            ...baseConfig,
            stringValueColumn: 'TEXT_VALUE',
            opcua: {
                ...baseConfig.opcua,
                nodes: [{ nodeId: 'ns=1;s=ServerTime', name: 'sensor.time' }],
            },
        };
        const { c, dbStream, detailWrites } = makeCollector(config);
        c.start();
        c.opcua.readResult = [{ value: '2026-04-22T10:00:00Z', sourceTimestamp: Date.now() }];
        dbStream.appended = [];
        c.collect();
        t.assertEqual(dbStream.appended.length, 1, 'string row should be appended');
        t.assertEqual(dbStream.appended[0].value, 0, 'numeric column should use placeholder 0');
        t.assertEqual(dbStream.appended[0].stringValue, '2026-04-22T10:00:00Z');
        t.assertEqual(dbStream.appended[0].TEXT_VALUE, '2026-04-22T10:00:00Z');
        t.assertEqual(detailWrites.length, 1, 'lastCollectedAt should be updated');
        clearInterval(c.timer);
    },

    'unsupported string values are skipped without auxiliary column': (t) => {
        const config = {
            ...baseConfig,
            opcua: {
                ...baseConfig.opcua,
                nodes: [{ nodeId: 'ns=1;s=ServerTime', name: 'sensor.time' }],
            },
        };
        const { c, dbStream, detailWrites } = makeCollector(config);
        c.start();
        c.opcua.readResult = [{ value: '2026-04-22T10:00:00Z', sourceTimestamp: Date.now() }];
        dbStream.appended = [];
        detailWrites.length = 0;
        c.collect();
        t.assertEqual(dbStream.appended.length, 0, 'string row should be skipped');
        t.assertEqual(detailWrites.length, 0, 'lastCollectedAt should not be updated');
        clearInterval(c.timer);
    },

    'boolean values stay in numeric column even when auxiliary column exists': (t) => {
        const config = {
            ...baseConfig,
            stringValueColumn: 'TEXT_VALUE',
            opcua: {
                ...baseConfig.opcua,
                nodes: [{ nodeId: 'ns=1;s=Status', name: 'sensor.status' }],
            },
        };
        const { c, dbStream } = makeCollector(config);
        c.start();
        c.opcua.readResult = [{ value: true, sourceTimestamp: Date.now() }];
        dbStream.appended = [];
        c.collect();
        t.assertEqual(dbStream.appended.length, 1, 'boolean row should be appended');
        t.assertEqual(dbStream.appended[0].value, 1, 'boolean should stay numeric');
        t.assertNull(dbStream.appended[0].stringValue, 'string column should remain empty');
        clearInterval(c.timer);
    },
});

runner.run('Collector.collect — stringOnly', {
    'start() passes stringOnly to stream.open without valueColumn': (t) => {
        const config = { ...baseConfig, stringOnly: true, stringValueColumn: 'TEXT_VALUE' };
        const { c, dbStream } = makeCollector(config);
        c.start();
        t.assert(dbStream.stringOnly, 'stream should be opened in stringOnly mode');
        t.assertNull(dbStream.openedValueColumn, 'valueColumn should not be used');
        t.assertEqual(dbStream.openedStringValueColumn, 'TEXT_VALUE');
        clearInterval(c.timer);
    },

    'empty valueColumn is allowed when stringOnly is true': (t) => {
        const config = { ...baseConfig, stringOnly: true, valueColumn: '', stringValueColumn: 'TEXT_VALUE' };
        const { c, dbStream } = makeCollector(config);
        c.start();
        t.assert(dbStream.stringOnly, 'stream should be opened in stringOnly mode');
        t.assertNull(dbStream.openedValueColumn, 'empty valueColumn should be treated as omitted');
        t.assertEqual(dbStream.openedStringValueColumn, 'TEXT_VALUE');
        clearInterval(c.timer);
    },

    'all collected values are stored as strings': (t) => {
        const config = {
            ...baseConfig,
            stringOnly: true,
            stringValueColumn: 'TEXT_VALUE',
            opcua: {
                ...baseConfig.opcua,
                nodes: [
                    { nodeId: 'ns=1;s=Temp', name: 'sensor.temp' },
                    { nodeId: 'ns=1;s=Status', name: 'sensor.status' },
                    { nodeId: 'ns=1;s=ServerTime', name: 'sensor.time' },
                ],
            },
        };
        const { c, dbStream } = makeCollector(config);
        c.start();
        c.opcua.readResult = [
            { value: 12.5, sourceTimestamp: 1000 },
            { value: true, sourceTimestamp: 2000 },
            { value: '2026-04-22T10:00:00Z', sourceTimestamp: 3000 },
        ];
        dbStream.appended = [];
        c.collect();
        t.assertEqual(dbStream.appended.length, 3, 'all rows should be appended');
        t.assertEqual(dbStream.appended[0].TEXT_VALUE, '12.5');
        t.assertEqual(dbStream.appended[1].TEXT_VALUE, 'true');
        t.assertEqual(dbStream.appended[2].TEXT_VALUE, '2026-04-22T10:00:00Z');
        t.assertEqual(dbStream.appended[0].value, undefined, 'numeric value column should not be used');
        t.assert(!Object.prototype.hasOwnProperty.call(dbStream.appended[0], 'VALUE'), 'VALUE should not be present');
        clearInterval(c.timer);
    },

    'valueColumn is rejected when stringOnly is true': (t) => {
        const config = { ...baseConfig, stringOnly: true, valueColumn: 'VALUE', stringValueColumn: 'TEXT_VALUE' };
        const { c, dbStream } = makeCollector(config);
        c.start();
        t.assert(!dbStream.stream, 'db stream should not open');
        clearInterval(c.timer);
    },

    'onChanged initial load uses string column': (t) => {
        const config = {
            ...baseConfig,
            stringOnly: true,
            stringValueColumn: 'TEXT_VALUE',
            opcua: {
                ...baseConfig.opcua,
                nodes: [{ nodeId: 'ns=1;s=ServerTime', name: 'sensor.time', onChanged: true }],
            },
        };
        const { c, dbQueries } = makeCollector(config, {
            queryRows: [{ NAME: 'sensor.time', TEXT_VALUE: 'same' }],
        });
        fs.writeFileSync(path.join(os.tmpdir(), `${c.collectorName}.last-time.json`), JSON.stringify({ ts: 1000 }));
        c.start();
        t.assertEqual(dbQueries.length, 1, 'initial load should query db once');
        t.assert(dbQueries[0].sql.indexOf('SELECT NAME, TEXT_VALUE') >= 0, 'query should select string column');
        t.assertEqual(c._previousValues['sensor.time'], 'same');
        clearInterval(c.timer);
    },
});

runner.run('Collector.collect — json mode', {
    'aggregates all nodes into one JSON row using collector name': (t) => {
        const config = {
            ...baseConfig,
            valueColumn: 'PAYLOAD',
            opcua: {
                ...baseConfig.opcua,
                nodes: [
                    { nodeId: 'ns=1;s=Temp', name: 'temp', bias: 10, multiplier: 2 },
                    { nodeId: 'ns=1;s=Status', name: 'status' },
                    { nodeId: 'ns=1;s=ServerTime', name: 'serverTime' },
                ],
            },
        };
        const dbStream = new MockMachbaseStream();
        dbStream.valueColumnFamily = 'JSON';
        const { c, detailWrites } = makeCollector(config, { dbStream });
        c.start();
        c.opcua.readResult = [
            { value: 5, sourceTimestamp: 1000 },
            { value: true, sourceTimestamp: 2000 },
            { value: '2026-04-22T10:00:00Z', sourceTimestamp: 3000 },
        ];
        dbStream.appended = [];
        c.collect();
        t.assertEqual(dbStream.appended.length, 1, 'json mode should append one row');
        t.assertEqual(dbStream.appended[0].NAME, 'collector-a');
        const payload = JSON.parse(dbStream.appended[0].PAYLOAD);
        t.assertEqual(payload.temp, 30);
        t.assertEqual(payload.status, true);
        t.assertEqual(payload.serverTime, '2026-04-22T10:00:00Z');
        t.assertEqual(detailWrites.length, 1, 'lastCollectedAt should be updated');
        clearInterval(c.timer);
    },

    'stores failed node values as null in JSON payload': (t) => {
        const config = {
            ...baseConfig,
            valueColumn: 'PAYLOAD',
            opcua: {
                ...baseConfig.opcua,
                nodes: [
                    { nodeId: 'ns=1;s=Status', name: 'status' },
                    { nodeId: 'ns=1;s=ServerTime', name: 'serverTime' },
                ],
            },
        };
        const dbStream = new MockMachbaseStream();
        dbStream.valueColumnFamily = 'JSON';
        const { c } = makeCollector(config, { dbStream });
        c.start();
        c.opcua.readResult = [
            { value: true, statusCode: 123, sourceTimestamp: 1000 },
            { value: '2026-04-22T10:00:00Z', sourceTimestamp: 2000 },
        ];
        dbStream.appended = [];
        c.collect();
        t.assertEqual(dbStream.appended.length, 1, 'json mode should still append');
        const payload = JSON.parse(dbStream.appended[0].PAYLOAD);
        t.assertNull(payload.status, 'bad status should become null');
        t.assertEqual(payload.serverTime, '2026-04-22T10:00:00Z');
        clearInterval(c.timer);
    },

    'skips second collect when all onChanged values are unchanged in JSON mode': (t) => {
        const config = {
            ...baseConfig,
            valueColumn: 'PAYLOAD',
            opcua: {
                ...baseConfig.opcua,
                nodes: [
                    { nodeId: 'ns=1;s=Status', name: 'status', onChanged: true },
                    { nodeId: 'ns=1;s=ServerTime', name: 'serverTime', onChanged: true },
                ],
            },
        };
        const dbStream = new MockMachbaseStream();
        dbStream.valueColumnFamily = 'JSON';
        const { c, detailWrites } = makeCollector(config, { dbStream });
        c.start();
        c.opcua.readResult = [
            { value: false, sourceTimestamp: 1000 },
            { value: 'same', sourceTimestamp: 2000 },
        ];
        c.collect();
        dbStream.appended = [];
        dbStream.flushed = false;
        detailWrites.length = 0;
        c.collect();
        t.assertEqual(dbStream.appended.length, 0, 'unchanged json payload should be skipped');
        t.assert(!dbStream.flushed, 'append should not be called');
        t.assertEqual(detailWrites.length, 0, 'lastCollectedAt should not be updated');
        clearInterval(c.timer);
    },
});

runner.run('Collector.collect — tag key columns', {
    'standard rows use primary and basetime column names from stream metadata': (t) => {
        const dbStream = new MockMachbaseStream();
        dbStream.primaryColumnName = 'TAG_ID';
        dbStream.baseTimeColumnName = 'TS';
        const config = {
            ...baseConfig,
            opcua: {
                ...baseConfig.opcua,
                nodes: [{ nodeId: 'ns=1;s=Temp', name: 'sensor.temp' }],
            },
        };
        const { c } = makeCollector(config, { dbStream });
        c.start();
        c.opcua.readResult = [{ value: 12.5, sourceTimestamp: 1000 }];
        dbStream.appended = [];
        c.collect();
        t.assertEqual(dbStream.appended.length, 1, 'row should be appended');
        t.assertEqual(dbStream.appended[0].TAG_ID, 'sensor.temp');
        t.assert(dbStream.appended[0].TS instanceof Date, 'basetime should be written to TS');
        t.assertEqual(dbStream.appended[0].VALUE, 12.5);
        t.assertEqual(dbStream.appended[0].name, 'sensor.temp');
        clearInterval(c.timer);
    },

    'json rows use primary and basetime column names from stream metadata': (t) => {
        const dbStream = new MockMachbaseStream();
        dbStream.primaryColumnName = 'TAG_ID';
        dbStream.baseTimeColumnName = 'TS';
        dbStream.valueColumnFamily = 'JSON';
        const config = {
            ...baseConfig,
            valueColumn: 'PAYLOAD',
            opcua: {
                ...baseConfig.opcua,
                nodes: [{ nodeId: 'ns=1;s=Status', name: 'status' }],
            },
        };
        const { c } = makeCollector(config, { dbStream });
        c.start();
        c.opcua.readResult = [{ value: true, sourceTimestamp: 1000 }];
        dbStream.appended = [];
        c.collect();
        t.assertEqual(dbStream.appended.length, 1, 'json row should be appended');
        t.assertEqual(dbStream.appended[0].TAG_ID, 'collector-a');
        t.assert(dbStream.appended[0].TS instanceof Date, 'basetime should be written to TS');
        t.assertEqual(JSON.parse(dbStream.appended[0].PAYLOAD).status, true);
        clearInterval(c.timer);
    },

    'onChanged initial load queries primary and basetime column names': (t) => {
        const dbStream = new MockMachbaseStream();
        dbStream.primaryColumnName = 'TAG_ID';
        dbStream.baseTimeColumnName = 'TS';
        const config = {
            ...baseConfig,
            opcua: {
                ...baseConfig.opcua,
                nodes: [{ nodeId: 'ns=1;s=Temp', name: 'sensor.temp', onChanged: true }],
            },
        };
        const { c, dbQueries } = makeCollector(config, {
            dbStream,
            queryRows: [{ TAG_ID: 'sensor.temp', VALUE: 11 }],
        });
        fs.writeFileSync(path.join(os.tmpdir(), `${c.collectorName}.last-time.json`), JSON.stringify({ ts: 1000 }));
        c.start();
        t.assertEqual(dbQueries.length, 1, 'initial load should query db once');
        t.assert(dbQueries[0].sql.indexOf('SELECT TAG_ID, VALUE') >= 0, 'query should select custom primary column');
        t.assert(dbQueries[0].sql.indexOf('WHERE TAG_ID IN') >= 0, 'query should filter custom primary column');
        t.assert(dbQueries[0].sql.indexOf('TS >=') >= 0, 'query should filter custom basetime column');
        t.assertEqual(c._previousValues['sensor.temp'], 11);
        clearInterval(c.timer);
    },
});

// ── _isDbOpen ──────────────────────────────────────────────────────────────────

runner.run('Collector._isDbOpen', {
    'returns false before db is opened': (t) => {
        const { c } = makeCollector();
        t.assert(!c._isDbOpen(), 'should be false before open');
    },
    'returns true after db is opened': (t) => {
        const { c } = makeCollector();
        c.start();
        clearInterval(c.timer);
        t.assert(c._isDbOpen(), 'should be true after start() opens db');
    },
    'returns false after db is closed': (t) => {
        const { c } = makeCollector();
        c.start();
        c.close();
        t.assert(!c._isDbOpen(), 'should be false after close()');
    },
});

// ── _normalizeValue ────────────────────────────────────────────────────────────

runner.run('Collector._normalizeValue', (() => {
    function norm(value, bias, multiplier, calcOrder) {
        const { c } = makeCollector();
        return c._normalizeValue(value, { bias, multiplier, calcOrder });
    }

    return {
        // boolean — clamped to 0 or 1 after calculation
        'boolean true → 1': (t) => t.assertEqual(norm(true), 1),
        'boolean false → 0': (t) => t.assertEqual(norm(false), 0),
        'boolean true with bias and multiplier → result > 1, clamped to 1': (t) => t.assertEqual(norm(true, 10, 2), 1),
        'boolean false with positive bias → result > 1, clamped to 1': (t) => t.assertEqual(norm(false, 10, 2), 1),
        'boolean true with large negative bias → result < 0, clamped to 0': (t) => t.assertEqual(norm(true, -5, 2), 0),
        'boolean false with negative bias → result < 0, clamped to 0': (t) => t.assertEqual(norm(false, -1, 2), 0),

        // float
        'float value passes through': (t) => t.assertEqual(norm(3.14, 0, 1), 3.14),
        'float with bias': (t) => t.assertEqual(norm(1.5, 10000, 1), 10001.5),
        'float with multiplier': (t) => t.assertEqual(norm(2.0, 0, 3.5), 7.0),
        'bias and multiplier order: (value + bias) * multiplier': (t) => t.assertEqual(norm(2, 3, 4), 20),

        // int8
        'int8 min (-128)': (t) => t.assertEqual(norm(-128, 0, 1), -128),
        'int8 max (127)': (t) => t.assertEqual(norm(127, 0, 1), 127),

        // int16
        'int16 min (-32768)': (t) => t.assertEqual(norm(-32768, 0, 1), -32768),
        'int16 max (32767)': (t) => t.assertEqual(norm(32767, 0, 1), 32767),

        // int32
        'int32 min': (t) => t.assertEqual(norm(-2147483648, 0, 1), -2147483648),
        'int32 max': (t) => t.assertEqual(norm(2147483647, 0, 1), 2147483647),

        // int64 (JS safe integer range)
        'int64 large positive': (t) => t.assertEqual(norm(9007199254740991, 0, 1), 9007199254740991),
        'int64 large negative': (t) => t.assertEqual(norm(-9007199254740991, 0, 1), -9007199254740991),

        // uint
        'uint8 max (255)': (t) => t.assertEqual(norm(255, 0, 1), 255),
        'uint16 max (65535)': (t) => t.assertEqual(norm(65535, 0, 1), 65535),
        'uint32 max (4294967295)': (t) => t.assertEqual(norm(4294967295, 0, 1), 4294967295),

        // bias/multiplier defaults
        'bias null treated as 0': (t) => t.assertEqual(norm(5, null, null), 5),
        'bias undefined treated as 0': (t) => t.assertEqual(norm(5, undefined, undefined), 5),
        'bias=10000 applied correctly': (t) => t.assertEqual(norm(5, 10000, 1), 10005),
        'multiplier=0.001 applied correctly': (t) => t.assertEqual(norm(1000, 0, 0.001), 1.0),

        // numeric string coercion
        'numeric string is coerced to number': (t) => t.assertEqual(norm('42', 0, 1), 42),
        'numeric string with bias': (t) => t.assertEqual(norm('5', 10000, 1), 10005),

        // NaN
        'non-numeric string produces NaN': (t) => t.assert(isNaN(norm('abc', 0, 1)), 'should be NaN'),
        'null produces 0 (Number(null) === 0)': (t) => t.assertEqual(norm(null, 0, 1), 0),

        // calcOrder
        'calcOrder bm (default): (value + bias) * multiplier': (t) => t.assertEqual(norm(2, 3, 4, 'bm'), 20),
        'calcOrder mb: value * multiplier + bias': (t) => t.assertEqual(norm(2, 3, 4, 'mb'), 11),
        'calcOrder undefined defaults to bm': (t) => t.assertEqual(norm(2, 3, 4), 20),
        'calcOrder mb with boolean true → result > 1, clamped to 1': (t) => t.assertEqual(norm(true, 10, 2, 'mb'), 1),
        'calcOrder mb with boolean false with positive bias → result > 1, clamped to 1': (t) => t.assertEqual(norm(false, 10, 2, 'mb'), 1),
    };
})());

// ── collect — onChanged ────────────────────────────────────────────────────────

runner.run('Collector.collect — onChanged', {
    'onChanged: true — first collect always appends': (t) => {
        const { c, dbStream } = makeOnChangedCollector(
            [{ nodeId: 'ns=1;s=Tag1', name: 'sensor.tag1', onChanged: true }],
            [{ value: 5.0, sourceTimestamp: Date.now() }]
        );
        c.start();
        dbStream.appended = [];
        c.collect();
        t.assertEqual(dbStream.appended.length, 1, 'first collect should append');
        t.assertEqual(dbStream.appended[0].value, 5.0);
        clearInterval(c.timer);
    },

    'onChanged: true — same value on second collect is skipped': (t) => {
        const { c, dbStream, detailWrites } = makeOnChangedCollector(
            [{ nodeId: 'ns=1;s=Tag1', name: 'sensor.tag1', onChanged: true }],
            [{ value: 5.0, sourceTimestamp: Date.now() }]
        );
        c.start();
        c.collect();
        dbStream.appended = [];
        dbStream.flushed = false;
        detailWrites.length = 0;
        c.collect();
        t.assertEqual(dbStream.appended.length, 0, 'same value should be skipped');
        t.assert(!dbStream.flushed, 'append should not be called');
        t.assertEqual(detailWrites.length, 0, 'lastCollectedAt should not be updated');
        clearInterval(c.timer);
    },

    'onChanged: true — changed value on second collect is appended': (t) => {
        const { c, opcuaClient, dbStream } = makeOnChangedCollector(
            [{ nodeId: 'ns=1;s=Tag1', name: 'sensor.tag1', onChanged: true }],
            [{ value: 5.0, sourceTimestamp: Date.now() }]
        );
        c.start();
        c.collect();
        dbStream.appended = [];
        opcuaClient.readResult = [{ value: 9.9, sourceTimestamp: Date.now() }];
        c.collect();
        t.assertEqual(dbStream.appended.length, 1, 'changed value should be appended');
        t.assertEqual(dbStream.appended[0].value, 9.9);
        clearInterval(c.timer);
    },

    'onChanged absent — always appends regardless of value': (t) => {
        const { c, dbStream } = makeOnChangedCollector(
            [{ nodeId: 'ns=1;s=Tag1', name: 'sensor.tag1' }],
            [{ value: 5.0, sourceTimestamp: Date.now() }]
        );
        c.start();
        c.collect();
        dbStream.appended = [];
        c.collect();
        t.assertEqual(dbStream.appended.length, 1, 'node without onChanged should always append');
        clearInterval(c.timer);
    },

    'all nodes onChanged:true and all skipped — append and lastCollectedAt not called': (t) => {
        const { c, dbStream, detailWrites } = makeOnChangedCollector(
            [
                { nodeId: 'ns=1;s=Tag1', name: 'sensor.tag1', onChanged: true },
                { nodeId: 'ns=1;s=Tag2', name: 'sensor.tag2', onChanged: true },
            ],
            [
                { value: 1.0, sourceTimestamp: Date.now() },
                { value: 2.0, sourceTimestamp: Date.now() },
            ]
        );
        c.start();
        c.collect();
        dbStream.appended = [];
        dbStream.flushed = false;
        detailWrites.length = 0;
        c.collect();
        t.assertEqual(dbStream.appended.length, 0, 'nothing should be appended');
        t.assert(!dbStream.flushed, 'append should not be called');
        t.assertEqual(detailWrites.length, 0, 'lastCollectedAt should not be updated');
        clearInterval(c.timer);
    },

    'onChanged: true — consecutive NaN values are treated as equal (Object.is)': (t) => {
        const { c, dbStream } = makeOnChangedCollector(
            [{ nodeId: 'ns=1;s=Tag1', name: 'sensor.tag1', onChanged: true }],
            [{ value: NaN, sourceTimestamp: Date.now() }]
        );
        c.start();
        c.collect();
        dbStream.appended = [];
        dbStream.flushed = false;
        c.collect();
        t.assertEqual(dbStream.appended.length, 0, 'second NaN should be skipped');
        t.assert(!dbStream.flushed, 'append should not be called for repeated NaN');
        clearInterval(c.timer);
    },

    'onChanged: true — _previousValues reset after error allows re-append': (t) => {
        const { c, opcuaClient, dbStream } = makeOnChangedCollector(
            [{ nodeId: 'ns=1;s=Tag1', name: 'sensor.tag1', onChanged: true }],
            [{ value: 5.0, sourceTimestamp: Date.now() }]
        );
        c.start();
        c.collect(); // first: appends and caches 5.0
        // change value so it differs → matrix is non-empty → append is called → triggers error → catch resets _previousValues
        opcuaClient.readResult = [{ value: 9.9, sourceTimestamp: Date.now() }];
        dbStream.appendError = 'append failed';
        c.collect(); // 9.9 != 5.0 → appended → error → catch → _previousValues = {}
        // restore: same value 5.0 should now append because _previousValues was reset
        opcuaClient.readResult = [{ value: 5.0, sourceTimestamp: Date.now() }];
        dbStream.appendError = null;
        dbStream.appended = [];
        c.collect(); // 5.0 not in _previousValues → appends
        t.assertEqual(dbStream.appended.length, 1, 'should append after _previousValues reset');
        t.assertEqual(dbStream.appended[0].value, 5.0);
        clearInterval(c.timer);
    },
});

// ── collect — _persistLastCollectedAt ─────────────────────────────────────────

runner.run('Collector._persistLastCollectedAt', {
    'close() 후 last-time 파일 생성': (t) => {
        const collectorName = `test-last-time-a-${Date.now()}`;
        const lastTimeFile = path.join(os.tmpdir(), `${collectorName}.last-time.json`);
        try {
            const Collector = loadCollector();
            const node = { nodeId: 'ns=1;s=Tag1', name: 'sensor.tag1' };
            const config = { ...baseConfig, opcua: { ...baseConfig.opcua, nodes: [node] } };
            const opcuaClient = new MockOpcuaClient();
            opcuaClient.readResult = [{ value: 5.0, sourceTimestamp: Date.now() }];
            const dbStream = new MockMachbaseStream();
            const c = new Collector(config, {
                opcuaClient,
                db: { client: new MockMachbaseClient(), stream: dbStream },
                collectorName,
                lastCollectedAtWriter: (_n, _v, cb) => { if (cb) cb(null); },
            });
            c.start();
            c.collect();
            c.close();
            t.assert(fs.existsSync(lastTimeFile), 'last-time 파일이 생성되어야 한다');
            const saved = JSON.parse(fs.readFileSync(lastTimeFile, 'utf8'));
            t.assert(typeof saved.ts === 'number' && saved.ts > 0, 'ts는 양수 number여야 한다');
        } finally {
            try { fs.unlinkSync(lastTimeFile); } catch (_) {}
        }
    },

    '수집 없이 close()하면 파일 미생성': (t) => {
        const collectorName = `test-last-time-b-${Date.now()}`;
        const lastTimeFile = path.join(os.tmpdir(), `${collectorName}.last-time.json`);
        try {
            const Collector = loadCollector();
            const c = new Collector(baseConfig, {
                opcuaClient: new MockOpcuaClient(),
                db: { client: new MockMachbaseClient(), stream: new MockMachbaseStream() },
                collectorName,
                lastCollectedAtWriter: (_n, _v, cb) => { if (cb) cb(null); },
            });
            c.start();
            c.close();
            t.assert(!fs.existsSync(lastTimeFile), '_lastCollectedAt 없으면 파일 미생성');
        } finally {
            try { fs.unlinkSync(lastTimeFile); } catch (_) {}
        }
    },
});

// ── collect — general ──────────────────────────────────────────────────────────

runner.run('Collector.collect — general', {
    'appends all nodes every cycle by default': (t) => {
        const { c, dbStream, detailWrites } = makeCollector();
        c.start();
        const opcua = c.opcua;
        opcua.readResult = [
            { value: 1.0, sourceTimestamp: Date.now() },
            { value: 2.0, sourceTimestamp: Date.now() },
        ];
        dbStream.appended = [];
        c.collect();
        t.assertEqual(dbStream.appended.length, 2, 'both nodes should be appended');
        t.assertEqual(dbStream.appended[0].name, 'sensor.tag1');
        t.assertEqual(dbStream.appended[1].name, 'sensor.tag2');
        t.assertEqual(detailWrites.length, 1, 'lastCollectedAt should be updated once');
        clearInterval(c.timer);
    },

    'uses current Date when sourceTimestamp is falsy': (t) => {
        const { c, dbStream } = makeCollector();
        c.start();
        c.opcua.readResult = [
            { value: 1.0, sourceTimestamp: null },
            { value: 2.0, sourceTimestamp: 0 },
        ];
        dbStream.appended = [];
        c.collect();
        t.assert(dbStream.appended[0].time instanceof Date, 'time should be a Date');
        t.assert(dbStream.appended[1].time instanceof Date, 'time should be a Date');
        clearInterval(c.timer);
    },

    'converts boolean true to 1 and false to 0': (t) => {
        const { c, dbStream } = makeCollector();
        c.start();
        c.opcua.readResult = [
            { value: true,  sourceTimestamp: Date.now() },
            { value: false, sourceTimestamp: Date.now() },
        ];
        dbStream.appended = [];
        c.collect();
        t.assertEqual(dbStream.appended[0].value, 1, 'true should become 1');
        t.assertEqual(dbStream.appended[1].value, 0, 'false should become 0');
        clearInterval(c.timer);
    },

    'does not append and closes opcua on read error': (t) => {
        const { c, opcuaClient, dbStream, detailWrites } = makeCollector();
        c.start();
        opcuaClient.readError = 'simulated read error';
        dbStream.appended = [];
        c.collect();
        t.assertEqual(dbStream.appended.length, 0, 'nothing should be appended on error');
        t.assert(opcuaClient.closed, 'opcua should be closed on error');
        t.assertEqual(detailWrites.length, 0, 'lastCollectedAt should not be updated on error');
        clearInterval(c.timer);
    },

    'does not append and closes opcua on append error': (t) => {
        const { c, opcuaClient, dbStream, detailWrites } = makeCollector();
        c.start();
        c.opcua.readResult = [
            { value: 1.0, sourceTimestamp: Date.now() },
            { value: 2.0, sourceTimestamp: Date.now() },
        ];
        dbStream.appendError = 'append failed';
        c.collect();
        t.assert(opcuaClient.closed, 'opcua should be closed on append error');
        t.assertEqual(detailWrites.length, 0, 'lastCollectedAt should not be updated on append error');
        clearInterval(c.timer);
    },

    'reopens db if stream is closed before collect': (t) => {
        const { c, dbStream } = makeCollector();
        c.start();
        c.opcua.readResult = [
            { value: 1.0, sourceTimestamp: Date.now() },
            { value: 2.0, sourceTimestamp: Date.now() },
        ];
        dbStream.stream = null; // simulate closed stream
        dbStream.appended = [];
        c.collect();
        t.assertNotNull(dbStream.stream, 'db should be reopened');
        t.assertEqual(dbStream.appended.length, 2, 'should append after reopen');
        clearInterval(c.timer);
    },

    'skips cycle when db reopen fails': (t) => {
        const { c, dbStream, detailWrites } = makeCollector();
        c.start();
        dbStream.stream = null;
        dbStream.openError = 'db unavailable';
        dbStream.appended = [];
        c.collect();
        t.assertEqual(dbStream.appended.length, 0, 'nothing should be appended if db reopen fails');
        t.assertEqual(detailWrites.length, 0, 'lastCollectedAt should not be updated');
        clearInterval(c.timer);
    },
});

runner.run('Collector.collect — warn summary', {
    'repeated opcua connect warn emits summary and recovery info': (t) => {
        const logger = new MockLogger();
        const { c, opcuaClient } = makeCollector({
            ...baseConfig,
            opcua: {
                ...baseConfig.opcua,
                nodes: [{ nodeId: 'ns=1;s=Tag1', name: 'sensor.tag1' }],
            },
        }, { logger });
        let now = 0;
        c._now = () => now;
        c._warnSummaryEvery = 2;
        c._warnSummaryIntervalMs = 60 * 1000;
        opcuaClient.readResult = [{ value: 1.0, sourceTimestamp: Date.now() }];
        opcuaClient.open = () => false;

        c.collect();
        now += 1000;
        c.collect();
        now += 1000;
        c.collect();

        const warnLogs = logger.entries.filter((entry) => entry.level === 'warn' && entry.stage === 'opcua connect failed, will retry');
        t.assertEqual(warnLogs.length, 2, 'first warn and one repeated summary should be logged');
        t.assertEqual(warnLogs[1].fields.repeated, true, 'second warn should be marked as repeated');
        t.assertEqual(warnLogs[1].fields.suppressedCount, 2, 'suppressed count should be cumulative');
        t.assertEqual(warnLogs[1].fields.durationSec, 2, 'duration should reflect repeated warning span');

        opcuaClient.open = () => true;
        now += 1000;
        c.collect();

        const recoveryLogs = logger.entries.filter((entry) => entry.level === 'info' && entry.stage === 'opcua connected');
        t.assertEqual(recoveryLogs.length, 1, 'recovery info should be logged once');
        t.assertEqual(recoveryLogs[0].fields.recovered, true, 'recovery log should be marked');
        t.assertEqual(recoveryLogs[0].fields.suppressedCount, 2, 'recovery log should keep suppressed count');
        t.assertEqual(recoveryLogs[0].fields.durationSec, 3, 'recovery log should include full outage duration');
    },

    'repeated unsupported value warn is summarized and resets after recovery': (t) => {
        const logger = new MockLogger();
        const { c, opcuaClient } = makeCollector({
            ...baseConfig,
            opcua: {
                ...baseConfig.opcua,
                nodes: [{ nodeId: 'ns=1;s=ServerTime', name: 'sensor.time' }],
            },
        }, { logger });
        let now = 0;
        c._now = () => now;
        c._warnSummaryEvery = 2;
        c._warnSummaryIntervalMs = 60 * 1000;

        opcuaClient.readResult = [{ value: '2026-04-24T12:00:00Z', sourceTimestamp: Date.now() }];
        c.collect();
        now += 1000;
        c.collect();
        now += 1000;
        c.collect();

        let warnLogs = logger.entries.filter((entry) => entry.level === 'warn' && entry.stage === 'unsupported value without string column');
        t.assertEqual(warnLogs.length, 2, 'first warn and one repeated summary should be logged');
        t.assertEqual(warnLogs[1].fields.repeated, true, 'summary warn should be marked as repeated');
        t.assertEqual(warnLogs[1].fields.suppressedCount, 2, 'summary warn should report suppressed repeats');

        opcuaClient.readResult = [{ value: 10.5, sourceTimestamp: Date.now() }];
        now += 1000;
        c.collect();

        opcuaClient.readResult = [{ value: '2026-04-24T12:01:00Z', sourceTimestamp: Date.now() }];
        now += 1000;
        c.collect();

        warnLogs = logger.entries.filter((entry) => entry.level === 'warn' && entry.stage === 'unsupported value without string column');
        t.assertEqual(warnLogs.length, 3, 'recovered warning state should start a new incident');
        t.assert(!warnLogs[2].fields.repeated, 'new incident should start with a fresh warn');
    },
});

// ── start / close ──────────────────────────────────────────────────────────────

runner.run('Collector.start / close', {
    'start() opens db and sets timer': (t) => {
        const { c, dbStream } = makeCollector();
        c.start();
        t.assertNotNull(c.timer, 'timer should be set');
        t.assertNotNull(dbStream.stream, 'db should be opened');
        clearInterval(c.timer);
    },

    'start() is a no-op if already running': (t) => {
        const { c } = makeCollector();
        c.start();
        const first = c.timer;
        c.start();
        t.assertEqual(c.timer, first, 'timer should not be replaced');
        clearInterval(c.timer);
    },

    'close() clears timer and releases resources': (t) => {
        const { c, opcuaClient, dbStream } = makeCollector();
        c.start();
        c.close();
        t.assertNull(c.timer, 'timer should be null after close');
        t.assert(opcuaClient.closed, 'opcua should be closed');
        t.assert(dbStream.closed, 'db stream should be closed');
    },
});

runner.summary();
