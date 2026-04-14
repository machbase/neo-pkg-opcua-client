const TestRunner = require("./runner.js");
const { MachbaseStream } = require("../src/db/stream.js");

const runner = new TestRunner();

// columns: [{ NAME, TYPE, ID, LENGTH, FLAG }, ...]
function makeColumns(names) {
    return names.map((n, i) => ({ NAME: n, TYPE: 20, ID: i, LENGTH: 0, FLAG: 0 }));
}

function makeMockClient({ appendError, flushError, columns } = {}) {
    const cols = columns || makeColumns(['NAME', 'TIME', 'VALUE']);
    const appender = {
        appended: [],
        flushed: false,
        closed: false,
        append: function() {
            if (appendError) throw new Error(appendError);
            this.appended.push(Array.prototype.slice.call(arguments));
        },
        flush: function() {
            if (flushError) throw new Error(flushError);
            this.flushed = true;
        },
        close: function() { this.closed = true; },
    };
    return {
        selectColumnsByTableName: function() { return cols; },
        openAppender: function() { return appender; },
        _appender: appender,
    };
}

runner.run("MachbaseStream", {
    "open() sets stream and returns null on success": (t) => {
        const mock = makeMockClient();
        const stream = new MachbaseStream();
        const err = stream.open(mock, "TAG", "VALUE");
        t.assertNull(err, "should return null on success");
        t.assertNotNull(stream.stream, "stream should be set after open");
    },

    "open() returns error when column not found": (t) => {
        const mock = makeMockClient({ columns: makeColumns(['NAME', 'TIME', 'VALUE']) });
        const stream = new MachbaseStream();
        const err = stream.open(mock, "TAG", "VALUE2");
        t.assertNotNull(err, "should return error when valueColumn not found");
        t.assert(err.message.indexOf('VALUE2') >= 0, "error should mention missing column");
    },

    "open() returns error on failure": (t) => {
        const mock = {
            selectColumnsByTableName: function() { throw new Error("open failed"); },
        };
        const stream = new MachbaseStream();
        const err = stream.open(mock, "TAG", "VALUE");
        t.assertNotNull(err, "should return error");
        t.assert(err.message.indexOf("open failed") >= 0, "error message should match");
        t.assertNull(stream.stream, "stream should remain null on failure");
    },

    "append() writes rows with correct column positions": (t) => {
        // NAME, TIME, META, VALUE 순서 테이블 — VALUE는 index 3
        const mock = makeMockClient({ columns: makeColumns(['NAME', 'TIME', 'META', 'VALUE']) });
        const stream = new MachbaseStream();
        stream.open(mock, "TAG", "VALUE");
        const ts = new Date();
        stream.append([["sensor.tag1", ts, 3.14]]);
        const row = mock._appender.appended[0];
        t.assertEqual(row[0], "sensor.tag1", "NAME at index 0");
        t.assertEqual(row[1], ts,            "TIME at index 1");
        t.assertNull(row[2],                 "META at index 2 should be null");
        t.assertEqual(row[3], 3.14,          "VALUE at index 3");
    },

    "append() uses valueColumn index correctly": (t) => {
        const mock = makeMockClient({ columns: makeColumns(['NAME', 'TIME', 'VALUE2']) });
        const stream = new MachbaseStream();
        stream.open(mock, "TAG", "VALUE2");
        const ts = new Date();
        stream.append([["tag", ts, 9.9]]);
        const row = mock._appender.appended[0];
        t.assertEqual(row[2], 9.9, "VALUE2 at index 2");
    },

    "append() flushes after writing": (t) => {
        const mock = makeMockClient();
        const stream = new MachbaseStream();
        stream.open(mock, "TAG", "VALUE");
        stream.append([["sensor", new Date(), 1.0]]);
        t.assert(mock._appender.flushed, "flush should be called after append");
    },

    "append() returns null for empty matrix": (t) => {
        const mock = makeMockClient();
        const stream = new MachbaseStream();
        stream.open(mock, "TAG", "VALUE");
        const err = stream.append([]);
        t.assertNull(err, "should return null for empty matrix");
    },

    "append() returns error on append failure": (t) => {
        const mock = makeMockClient({ appendError: "append failed" });
        const stream = new MachbaseStream();
        stream.open(mock, "TAG", "VALUE");
        const err = stream.append([["tag", new Date(), 1.0]]);
        t.assertNotNull(err, "should return error");
        t.assert(err.message.indexOf("append failed") >= 0, "error message should match");
    },

    "append() returns error on flush failure": (t) => {
        const mock = makeMockClient({ flushError: "flush failed" });
        const stream = new MachbaseStream();
        stream.open(mock, "TAG", "VALUE");
        const err = stream.append([["tag", new Date(), 1.0]]);
        t.assertNotNull(err, "should return error on flush failure");
        t.assert(err.message.indexOf("flush failed") >= 0, "error message should match");
    },

    "close() clears stream and closes inner appender": (t) => {
        const mock = makeMockClient();
        const stream = new MachbaseStream();
        stream.open(mock, "TAG", "VALUE");
        const err = stream.close();
        t.assertNull(err, "close should return null");
        t.assertNull(stream.stream, "stream should be null after close");
        t.assert(mock._appender.closed, "inner appender should be closed");
    },

    "close() does nothing if not open": (t) => {
        const stream = new MachbaseStream();
        const err = stream.close();
        t.assertNull(err, "close should return null when not open");
        t.assertNull(stream.stream, "stream should remain null");
    },

    "close() returns error when flush throws": (t) => {
        const mock = makeMockClient({ flushError: "flush on close failed" });
        const stream = new MachbaseStream();
        stream.open(mock, "TAG", "VALUE");
        const err = stream.close();
        t.assertNotNull(err, "should return error when flush throws");
        t.assert(err.message.indexOf("flush on close failed") >= 0, "error message should match");
        t.assertNull(stream.stream, "stream should be null even after flush error");
    },

    "append() returns error when stream is not open": (t) => {
        const stream = new MachbaseStream();
        const err = stream.append([["tag", new Date(), 1.0]]);
        t.assertNotNull(err, "should return error when stream is not open");
        t.assert(err.message.indexOf("before open") >= 0, "error message should mention open");
    },
});

runner.summary();
