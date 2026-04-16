'use strict';

const path = require('path');
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

class MockMachbaseClient {
    constructor() { this.closed = false; }
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
        this.valueIdx = -1;
        this.openedValueColumn = null;
    }
    open(_client, _table, valueColumn) {
        if (this.openError) return new Error(this.openError);
        this.stream = {};
        this.openedValueColumn = valueColumn;
        this.columnNames = ['NAME', 'TIME', valueColumn || 'VALUE'];
        this.nameIdx = 0;
        this.timeIdx = 1;
        this.valueIdx = 2;
        return null;
    }
    append(matrix) {
        if (this.appendError) return new Error(this.appendError);
        for (const row of matrix) {
            this.appended.push({ name: row[0], time: row[1], value: row[2] });
        }
        this.flushed = true;
        return null;
    }
    close() {
        this.stream = null;
        this.closed = true;
        return null;
    }
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
        exports: { MachbaseClient: function() { this.close = () => {}; } },
    };
    require.cache[servicePath] = {
        id: servicePath, filename: servicePath, loaded: true,
        exports: { setValue: (_n, _k, _v, cb) => { if (cb) cb(null); } },
    };
    require.cache[cgiUtilPath] = {
        id: cgiUtilPath, filename: cgiUtilPath, loaded: true,
        exports: { CGI: { getServerConfig: () => mockDbConf } },
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

function makeCollector(configOverride) {
    const Collector = loadCollector();
    const opcuaClient = new MockOpcuaClient();
    const dbClient    = new MockMachbaseClient();
    const dbStream    = new MockMachbaseStream();
    const detailWrites = [];
    const config = configOverride || baseConfig;
    const c = new Collector(config, {
        opcuaClient,
        db: { client: dbClient, stream: dbStream },
        collectorName: 'collector-a',
        lastCollectedAtWriter: (name, value, cb) => {
            detailWrites.push({ name, value });
            if (cb) cb(null);
        },
    });
    c._detailWrites = detailWrites;
    return { c, opcuaClient, dbClient, dbStream, detailWrites };
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
    function norm(value, add, multiply) {
        const { c } = makeCollector();
        return c._normalizeValue(value, { add, multiply });
    }

    return {
        // boolean
        'boolean true → 1': (t) => t.assertEqual(norm(true), 1),
        'boolean false → 0': (t) => t.assertEqual(norm(false), 0),
        'boolean true with add and multiply': (t) => t.assertEqual(norm(true, 10, 2), 22),
        'boolean false with add and multiply': (t) => t.assertEqual(norm(false, 10, 2), 20),

        // float
        'float value passes through': (t) => t.assertEqual(norm(3.14, 0, 1), 3.14),
        'float with add': (t) => t.assertEqual(norm(1.5, 10000, 1), 10001.5),
        'float with multiply': (t) => t.assertEqual(norm(2.0, 0, 3.5), 7.0),
        'add and multiply order: (value + add) * multiply': (t) => t.assertEqual(norm(2, 3, 4), 20),

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

        // add/multiply defaults
        'add null treated as 0': (t) => t.assertEqual(norm(5, null, null), 5),
        'add undefined treated as 0': (t) => t.assertEqual(norm(5, undefined, undefined), 5),
        'add=10000 applied correctly': (t) => t.assertEqual(norm(5, 10000, 1), 10005),
        'multiply=0.001 applied correctly': (t) => t.assertEqual(norm(1000, 0, 0.001), 1.0),

        // numeric string coercion
        'numeric string is coerced to number': (t) => t.assertEqual(norm('42', 0, 1), 42),
        'numeric string with add': (t) => t.assertEqual(norm('5', 10000, 1), 10005),

        // NaN
        'non-numeric string produces NaN': (t) => t.assert(isNaN(norm('abc', 0, 1)), 'should be NaN'),
        'null produces 0 (Number(null) === 0)': (t) => t.assertEqual(norm(null, 0, 1), 0),
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
