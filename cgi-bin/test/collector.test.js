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

runner.summary();
