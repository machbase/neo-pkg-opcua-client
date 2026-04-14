const TestRunner = require("./runner.js");
const { MachbaseStream } = require("../src/db/stream.js");

const runner = new TestRunner();

function makeMockClient({ appendError, flushError } = {}) {
    const appender = {
        appended: [],
        flushed: false,
        closed: false,
        append: function() {
            if (appendError) {
                throw new Error(appendError);
            }
            this.appended.push(Array.prototype.slice.call(arguments));
        },
        flush: function() {
            if (flushError) {
                throw new Error(flushError);
            }
            this.flushed = true;
        },
        close: function() {
            this.closed = true;
        },
    };
    return {
        openAppender: function(_table, _columns) {
            return appender;
        },
        _appender: appender,
    };
}

runner.run("MachbaseStream", {
    "open() sets stream and returns null on success": (t) => {
        const mock = makeMockClient();
        const stream = new MachbaseStream();
        const err = stream.open(mock, "TAG", [{ name: "NAME" }, { name: "TIME" }, { name: "VALUE" }]);
        t.assertNull(err, "should return null on success");
        t.assertNotNull(stream.stream, "stream should be set after open");
    },

    "open() returns error on failure": (t) => {
        const mock = {
            openAppender: function() {
                throw new Error("open failed");
            },
        };
        const stream = new MachbaseStream();
        const err = stream.open(mock, "TAG", []);
        t.assertNotNull(err, "should return error");
        t.assert(err.message.indexOf("open failed") >= 0, "error message should match");
        t.assertNull(stream.stream, "stream should remain null on failure");
    },

    "append() writes rows and flushes": (t) => {
        const mock = makeMockClient();
        const stream = new MachbaseStream();
        stream.open(mock, "TAG", [{ name: "NAME" }, { name: "TIME" }, { name: "VALUE" }]);
        const ts = new Date();
        const err = stream.append([["sensor.tag1", ts, 3.14]]);
        t.assertNull(err, "should return null on success");
        t.assertEqual(mock._appender.appended.length, 1);
        t.assert(mock._appender.flushed, "flush should be called after append");
    },

    "append() returns null for empty matrix": (t) => {
        const mock = makeMockClient();
        const stream = new MachbaseStream();
        stream.open(mock, "TAG", []);
        const err = stream.append([]);
        t.assertNull(err, "should return null for empty matrix");
    },

    "append() returns error on append failure": (t) => {
        const mock = makeMockClient({ appendError: "append failed" });
        const stream = new MachbaseStream();
        stream.open(mock, "TAG", [{ name: "NAME" }]);
        const err = stream.append([["tag", new Date(), 1.0]]);
        t.assertNotNull(err, "should return error");
        t.assert(err.message.indexOf("append failed") >= 0, "error message should match");
    },

    "append() returns error on flush failure": (t) => {
        const mock = makeMockClient({ flushError: "flush failed" });
        const stream = new MachbaseStream();
        stream.open(mock, "TAG", [{ name: "NAME" }]);
        const err = stream.append([["tag", new Date(), 1.0]]);
        t.assertNotNull(err, "should return error on flush failure");
        t.assert(err.message.indexOf("flush failed") >= 0, "error message should match");
    },

    "close() clears stream and closes inner appender": (t) => {
        const mock = makeMockClient();
        const stream = new MachbaseStream();
        stream.open(mock, "TAG", []);
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
        stream.open(mock, "TAG", []);
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
