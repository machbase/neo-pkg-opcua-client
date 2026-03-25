const TestRunner = require("./runner.js");
const MachbaseAppender = require("../src/db/machbase-appender.js");

function makeMockDbClient({ appendError, flushError } = {}) {
    const appender = {
        appended: [],
        flushed: false,
        closed: false,
        append: function(name, time, value) {
            if (appendError) throw new Error(appendError);
            this.appended.push({ name, time, value });
        },
        flush: function() {
            if (flushError) throw new Error(flushError);
            this.flushed = true;
        },
        close: function() { this.closed = true; },
    };
    const conn = {
        closed: false,
        append: () => appender,
        close: function() { this.closed = true; },
    };
    const dbClient = {
        closed: false,
        connect: () => conn,
        close: function() { this.closed = true; },
        _appender: appender,
        _conn: conn,
    };
    return dbClient;
}

const runner = new TestRunner();

runner.run("MachbaseAppender", {
    "open() connects and creates appender": (t) => {
        const mock = makeMockDbClient();
        const appender = new MachbaseAppender({}, "TAG", { clientFactory: () => mock });
        appender.open();
        t.assertNotNull(appender.dbClient, "dbClient should be set");
        t.assertNotNull(appender.conn, "conn should be set");
        t.assertNotNull(appender.appender, "appender should be set");
    },

    "isOpen() returns true after open and false after close": (t) => {
        const mock = makeMockDbClient();
        const appender = new MachbaseAppender({}, "TAG", { clientFactory: () => mock });
        t.assert(!appender.isOpen(), "should not be open before open()");
        appender.open();
        t.assert(appender.isOpen(), "should be open after open()");
        appender.close();
        t.assert(!appender.isOpen(), "should not be open after close()");
    },

    "append() delegates to internal appender": (t) => {
        const mock = makeMockDbClient();
        const appender = new MachbaseAppender({}, "TAG", { clientFactory: () => mock });
        appender.open();
        const ts = new Date();
        appender.append("sensor.tag1", ts, 3.14);
        t.assertEqual(mock._appender.appended.length, 1);
        t.assertEqual(mock._appender.appended[0].name, "sensor.tag1");
        t.assertEqual(mock._appender.appended[0].value, 3.14);
    },

    "flush() delegates to internal appender": (t) => {
        const mock = makeMockDbClient();
        const appender = new MachbaseAppender({}, "TAG", { clientFactory: () => mock });
        appender.open();
        appender.flush();
        t.assert(mock._appender.flushed, "flush should have been called");
    },

    "append() closes and throws on error": (t) => {
        const mock = makeMockDbClient({ appendError: "append failed" });
        const appender = new MachbaseAppender({}, "TAG", { clientFactory: () => mock });
        appender.open();
        let threw = false;
        try { appender.append("tag", new Date(), 1.0); } catch (_) { threw = true; }
        t.assert(threw, "should throw on append error");
        t.assert(!appender.isOpen(), "should be closed after append error");
    },

    "flush() closes and throws on error": (t) => {
        const mock = makeMockDbClient({ flushError: "flush failed" });
        const appender = new MachbaseAppender({}, "TAG", { clientFactory: () => mock });
        appender.open();
        let threw = false;
        try { appender.flush(); } catch (_) { threw = true; }
        t.assert(threw, "should throw on flush error");
        t.assert(!appender.isOpen(), "should be closed after flush error");
    },

    "close() clears all resources": (t) => {
        const mock = makeMockDbClient();
        const appender = new MachbaseAppender({}, "TAG", { clientFactory: () => mock });
        appender.open();
        appender.close();
        t.assertNull(appender.appender, "appender should be null");
        t.assertNull(appender.conn, "conn should be null");
        t.assertNull(appender.dbClient, "dbClient should be null");
        t.assert(mock._appender.closed, "inner appender.close() should be called");
        t.assert(mock._conn.closed, "conn.close() should be called");
        t.assert(mock.closed, "dbClient.close() should be called");
    },
});

runner.summary();
