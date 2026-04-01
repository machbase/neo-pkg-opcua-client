const TestRunner = require("./runner.js");
const Collector = require("../src/collector.js");

// Mock OpcuaClient
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
        if (this.readError) throw new Error(this.readError);
        return this.readResult;
    }
    close() { this.closed = true; }
}

// Mock MachbaseAppender
class MockMachbaseAppender {
    constructor() {
        this._open = false;
        this.closed = false;
        this.flushed = false;
        this.appended = [];
        this.openError = null;
        this.appendError = null;
    }
    open() {
        if (this.openError) throw new Error(this.openError);
        this._open = true;
    }
    isOpen() { return this._open; }
    append(name, time, value) {
        if (this.appendError) throw new Error(this.appendError);
        this.appended.push({ name, time, value });
    }
    flush() { this.flushed = true; }
    close() { this._open = false; this.closed = true; }
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
    db: { table: "TAG", host: "127.0.0.1", port: 5656, user: "sys", password: "manager" },
};

function makeCollector() {
    const opcuaClient = new MockOpcuaClient();
    const machbaseAppender = new MockMachbaseAppender();
    const c = new Collector(testConfig, { opcuaClient, machbaseAppender });
    return c;
}

const runner = new TestRunner();

runner.run("Collector", {
    "constructor initializes nodes and nodeIds": (t) => {
        const c = makeCollector();
        t.assertEqual(c.nodes.length, 2);
        t.assertEqual(c.nodeIds.length, 2);
        t.assertEqual(c.nodeIds[0], "ns=1;s=Tag1");
        t.assertEqual(c.interval, 5000);
    },

    "start() opens opcua and db": (t) => {
        const c = makeCollector();
        c.start();
        clearInterval(c.timer);
        t.assert(c.opcua.opened, "opcua should be opened");
        t.assert(c.db._open, "db should be opened");
    },

    "start() does not start again if already running": (t) => {
        const c = makeCollector();
        c.start();
        const firstTimer = c.timer;
        c.start();
        t.assertEqual(c.timer, firstTimer, "timer should not be replaced");
        clearInterval(c.timer);
    },

    "close() clears timer and closes resources": (t) => {
        const c = makeCollector();
        c.start();
        c.close();
        t.assertNull(c.timer, "timer should be null");
        t.assert(c.opcua.closed, "opcua should be closed");
        t.assert(c.db.closed, "db should be closed");
    },

    "collect() appends and flushes all nodes": (t) => {
        const c = makeCollector();
        c.start();
        c.db.appended = [];
        c.db.flushed = false;
        c.collect();
        t.assertEqual(c.db.appended.length, 2);
        t.assertEqual(c.db.appended[0].name, "sensor.tag1");
        t.assertEqual(c.db.appended[1].name, "sensor.tag2");
        t.assert(c.db.flushed, "flush should have been called");
        clearInterval(c.timer);
    },

    "collect() uses Date when sourceTimestamp is falsy": (t) => {
        const c = makeCollector();
        c.start();
        c.opcua.readResult = [
            { value: 9.9, sourceTimestamp: null },
            { value: 8.8, sourceTimestamp: 0 },
        ];
        c.collect();
        t.assert(c.db.appended[0].time instanceof Date, "time should be a Date");
        t.assert(c.db.appended[1].time instanceof Date, "time should be a Date");
        clearInterval(c.timer);
    },

    "collect() does nothing and closes opcua when read throws": (t) => {
        const c = makeCollector();
        c.start();
        c.db.appended = [];
        c.db.flushed = false;
        c.opcua.readError = "simulated read error";
        c.collect();
        t.assertEqual(c.db.appended.length, 0, "nothing should be appended");
        t.assert(!c.db.flushed, "flush should not be called");
        t.assert(c.opcua.closed, "opcua should be closed on error");
        clearInterval(c.timer);
    },

    "collect() retries db open when not open": (t) => {
        const c = makeCollector();
        c.start();
        c.db._open = false;
        c.db.closed = false;
        c.collect();
        t.assert(c.db._open, "db should be reopened");
        t.assertEqual(c.db.appended.length, 2, "should append after reopen");
        clearInterval(c.timer);
    },

    "collect() skips when db reopen fails": (t) => {
        const c = makeCollector();
        c.start();
        c.db._open = false;
        c.db.openError = "db unavailable";
        c.collect();
        t.assertEqual(c.db.appended.length, 0, "nothing should be appended");
        clearInterval(c.timer);
    },

    "collect() closes opcua on append error": (t) => {
        const c = makeCollector();
        c.start();
        c.db.appendError = "append failed";
        c.collect();
        t.assert(c.opcua.closed, "opcua should be closed on error");
        clearInterval(c.timer);
    },
});

runner.summary();
