const TestRunner = require("./runner.js");
const Collector = require("../src/collector.js");

class MockOpcuaClient {
    constructor() {
        this.opened = false;
        this.closed = false;
        this.readResult = [
            { value: 1.0, sourceTimestamp: Date.now() },
            { value: 2.0, sourceTimestamp: Date.now() },
        ];
        this.readError = null;
    }
    open() { this.opened = true; return true; }
    read() {
        if (this.readError) {
            throw new Error(this.readError);
        }
        return this.readResult;
    }
    close() { this.closed = true; }
}

class MockMachbaseClient {
    constructor() {
        this.closed = false;
    }
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
    }
    open(_client, _table, columns) {
        if (this.openError) {
            return new Error(this.openError);
        }
        this.stream = {};
        this.openedColumns = columns;
        return null;
    }
    append(matrix) {
        if (this.appendError) {
            return new Error(this.appendError);
        }
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

const testConfig = {
    opcua: {
        endpoint: "opc.tcp://localhost:4840",
        readRetryInterval: 100,
        interval: 5000,
        nodes: [
            { nodeId: "ns=1;s=Tag1", name: "sensor.tag1" },
            { nodeId: "ns=1;s=Tag2", name: "sensor.tag2" },
        ],
    },
    db: "my-server",
    dbTable: "TAG",
};

function makeCollector() {
    const opcuaClient = new MockOpcuaClient();
    const dbClient = new MockMachbaseClient();
    const dbStream = new MockMachbaseStream();
    const detailWrites = [];
    const c = new Collector(testConfig, {
        opcuaClient,
        db: { client: dbClient, stream: dbStream },
        collectorName: "collector-a",
        lastCollectedAtWriter: (name, value, callback) => {
            detailWrites.push({ name, value });
            if (callback) {
                callback(null);
            }
        },
    });
    c._detailWrites = detailWrites;
    return { c, opcuaClient, dbClient, dbStream, detailWrites };
}

const runner = new TestRunner();

runner.run("Collector", {
    "constructor initializes nodes and nodeIds": (t) => {
        const { c } = makeCollector();
        t.assertEqual(c.nodes.length, 2);
        t.assertEqual(c.nodeIds.length, 2);
        t.assertEqual(c.nodeIds[0], "ns=1;s=Tag1");
        t.assertEqual(c.interval, 5000);
    },

    "start() opens db stream": (t) => {
        const { c, dbStream } = makeCollector();
        c.start();
        clearInterval(c.timer);
        t.assert(dbStream.stream !== null, "db stream should be opened");
    },

    "start() does not start again if already running": (t) => {
        const { c } = makeCollector();
        c.start();
        const firstTimer = c.timer;
        c.start();
        t.assertEqual(c.timer, firstTimer, "timer should not be replaced");
        clearInterval(c.timer);
    },

    "close() clears timer and closes resources": (t) => {
        const { c, opcuaClient, dbStream } = makeCollector();
        c.start();
        c.close();
        t.assertNull(c.timer, "timer should be null");
        t.assert(opcuaClient.closed, "opcua should be closed");
        t.assert(dbStream.closed, "db stream should be closed");
    },

    "collect() appends and flushes all nodes": (t) => {
        const { c, dbStream, detailWrites } = makeCollector();
        c.start();
        dbStream.appended = [];
        dbStream.flushed = false;
        c.collect();
        t.assertEqual(dbStream.appended.length, 2);
        t.assertEqual(dbStream.appended[0].name, "sensor.tag1");
        t.assertEqual(dbStream.appended[1].name, "sensor.tag2");
        t.assert(dbStream.flushed, "flush should have been called");
        t.assertEqual(detailWrites.length, 1, "lastCollectedAt should be updated once");
        t.assertEqual(detailWrites[0].name, "collector-a");
        t.assert(typeof detailWrites[0].value === "number", "lastCollectedAt should be stored as epoch milliseconds");
        clearInterval(c.timer);
    },

    "collect() uses Date when sourceTimestamp is falsy": (t) => {
        const { c, opcuaClient, dbStream } = makeCollector();
        c.start();
        opcuaClient.readResult = [
            { value: 9.9, sourceTimestamp: null },
            { value: 8.8, sourceTimestamp: 0 },
        ];
        c.collect();
        t.assert(dbStream.appended[0].time instanceof Date, "time should be a Date");
        t.assert(dbStream.appended[1].time instanceof Date, "time should be a Date");
        clearInterval(c.timer);
    },

    "collect() converts boolean values to 1 or 0": (t) => {
        const { c, opcuaClient, dbStream, detailWrites } = makeCollector();
        c.start();
        opcuaClient.readResult = [
            { value: true, sourceTimestamp: Date.now() },
            { value: false, sourceTimestamp: Date.now() },
        ];
        c.collect();
        t.assertEqual(dbStream.appended.length, 2, "two rows should be appended");
        t.assertEqual(dbStream.appended[0].value, 1, "true should be stored as 1");
        t.assertEqual(dbStream.appended[1].value, 0, "false should be stored as 0");
        t.assert(dbStream.flushed, "flush should be called for converted boolean values");
        t.assertEqual(detailWrites.length, 1, "lastCollectedAt should be updated on successful boolean conversion");
        clearInterval(c.timer);
    },

    "collect() does nothing and closes opcua when read throws": (t) => {
        const { c, opcuaClient, dbStream, detailWrites } = makeCollector();
        c.start();
        dbStream.appended = [];
        dbStream.flushed = false;
        opcuaClient.readError = "simulated read error";
        c.collect();
        t.assertEqual(dbStream.appended.length, 0, "nothing should be appended");
        t.assert(!dbStream.flushed, "flush should not be called");
        t.assert(opcuaClient.closed, "opcua should be closed on error");
        t.assertEqual(detailWrites.length, 0, "lastCollectedAt should not be updated on failure");
        clearInterval(c.timer);
    },

    "collect() retries db open when not open": (t) => {
        const { c, dbStream } = makeCollector();
        c.start();
        dbStream.stream = null;
        c.collect();
        t.assert(dbStream.stream !== null, "db should be reopened");
        t.assertEqual(dbStream.appended.length, 2, "should append after reopen");
        clearInterval(c.timer);
    },

    "collect() skips when db reopen fails": (t) => {
        const { c, dbStream, detailWrites } = makeCollector();
        c.start();
        dbStream.stream = null;
        dbStream.openError = "db unavailable";
        c.collect();
        t.assertEqual(dbStream.appended.length, 0, "nothing should be appended");
        t.assertEqual(detailWrites.length, 0, "lastCollectedAt should not be updated when db reopen fails");
        clearInterval(c.timer);
    },

    "collect() closes opcua on append error": (t) => {
        const { c, opcuaClient, detailWrites } = makeCollector();
        c.start();
        c._dbStream.appendError = "append failed";
        c.collect();
        t.assert(opcuaClient.closed, "opcua should be closed on error");
        t.assertEqual(detailWrites.length, 0, "lastCollectedAt should not be updated on append failure");
        clearInterval(c.timer);
    },

    "constructor uses VALUE column by default": (t) => {
        const { dbStream } = makeCollector();
        const cols = dbStream.openedColumns;
        t.assert(cols && cols[2] && cols[2].name === "VALUE", "default column should be VALUE");
    },

    "constructor uses valueColumn when specified": (t) => {
        const opcuaClient = new MockOpcuaClient();
        const dbClient = new MockMachbaseClient();
        const dbStream = new MockMachbaseStream();
        const config = {
            ...testConfig,
            valueColumn: "TEMPERATURE",
        };
        const c = new Collector(config, {
            opcuaClient,
            db: { client: dbClient, stream: dbStream },
            collectorName: "collector-a",
        });
        c.start();
        t.assert(dbStream.openedColumns && dbStream.openedColumns[2].name === "TEMPERATURE", "should use TEMPERATURE column");
        clearInterval(c.timer);
    },
});

runner.run("Collector._normalizeValue", (() => {
    function norm(value, add, multiply) {
        const c = makeCollector().c;
        return c._normalizeValue(value, { add, multiply });
    }

    const cases = {
        // boolean
        "boolean true → 1": (t) => t.assertEqual(norm(true), 1),
        "boolean false → 0": (t) => t.assertEqual(norm(false), 0),
        "boolean true + add/multiply": (t) => t.assertEqual(norm(true, 10, 2), 22),
        "boolean false + add/multiply": (t) => t.assertEqual(norm(false, 10, 2), 20),

        // float32 / float64
        "float32 value": (t) => t.assertEqual(norm(3.14, 0, 1), 3.14),
        "float64 value": (t) => t.assertEqual(norm(1.7976931348623157e+308, 0, 1), 1.7976931348623157e+308),
        "float with add": (t) => t.assertEqual(norm(1.5, 10000, 1), 10001.5),
        "float with multiply": (t) => t.assertEqual(norm(2.0, 0, 3.5), 7.0),
        "float with add and multiply": (t) => t.assertEqual(norm(1.0, 1.0, 2.0), 4.0),

        // int8 (-128 ~ 127)
        "int8 min": (t) => t.assertEqual(norm(-128, 0, 1), -128),
        "int8 max": (t) => t.assertEqual(norm(127, 0, 1), 127),

        // int16 (-32768 ~ 32767)
        "int16 min": (t) => t.assertEqual(norm(-32768, 0, 1), -32768),
        "int16 max": (t) => t.assertEqual(norm(32767, 0, 1), 32767),

        // int32 (-2147483648 ~ 2147483647)
        "int32 min": (t) => t.assertEqual(norm(-2147483648, 0, 1), -2147483648),
        "int32 max": (t) => t.assertEqual(norm(2147483647, 0, 1), 2147483647),

        // int64 (JS number 정밀도 한계 내)
        "int64 large positive": (t) => t.assertEqual(norm(9007199254740991, 0, 1), 9007199254740991),
        "int64 large negative": (t) => t.assertEqual(norm(-9007199254740991, 0, 1), -9007199254740991),

        // uint8 (0 ~ 255)
        "uint8 min": (t) => t.assertEqual(norm(0, 0, 1), 0),
        "uint8 max": (t) => t.assertEqual(norm(255, 0, 1), 255),

        // uint16 (0 ~ 65535)
        "uint16 max": (t) => t.assertEqual(norm(65535, 0, 1), 65535),

        // uint32 (0 ~ 4294967295)
        "uint32 max": (t) => t.assertEqual(norm(4294967295, 0, 1), 4294967295),

        // uint64 (JS number 정밀도 한계 내)
        "uint64 large": (t) => t.assertEqual(norm(9007199254740991, 0, 1), 9007199254740991),

        // add/multiply 적용 검증
        "add=10000 is applied": (t) => t.assertEqual(norm(5, 10000, 1), 10005),
        "multiply=0.001 is applied": (t) => t.assertEqual(norm(1000, 0, 0.001), 1.0),
        "add and multiply order: (value + add) * multiply": (t) => t.assertEqual(norm(2, 3, 4), 20),

        // add/multiply 미지정 시 기본값
        "add null uses 0": (t) => t.assertEqual(norm(5, null, null), 5),
        "add undefined uses 0": (t) => t.assertEqual(norm(5, undefined, undefined), 5),

        // numeric string (OPC UA에서 string으로 넘어오는 경우)
        "numeric string is coerced": (t) => t.assertEqual(norm("42", 0, 1), 42),
        "numeric string with add": (t) => t.assertEqual(norm("5", 10000, 1), 10005),
    };
    return cases;
})());

runner.summary();
