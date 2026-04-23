const TestRunner = require("./runner.js");
const { MachbaseStream } = require("../src/db/stream.js");
const { FLAG_BASETIME, FLAG_PRIMARY, FLAG_SUMMARIZED } = require("../src/db/types.js");

const runner = new TestRunner();

function makeColumn(name, type, flag, length) {
    return {
        NAME: name,
        TYPE: type == null ? 20 : type,
        ID: 0,
        LENGTH: length || 0,
        FLAG: flag || 0,
    };
}

function makeColumns(defs) {
    return defs.map((def, i) => {
        const col = Array.isArray(def)
            ? makeColumn(def[0], def[1], def[2], def[3])
            : makeColumn(def, 20, 0, 0);
        col.ID = i;
        return col;
    });
}

function makeMockClient({ appendError, flushError, columns } = {}) {
    const cols = columns || makeColumns([
        ['NAME', 5, 0, 80],
        ['TIME', 6],
        ['VALUE', 20, FLAG_SUMMARIZED],
    ]);
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
    "open() sets stream and metadata on numeric value column": (t) => {
        const mock = makeMockClient();
        const stream = new MachbaseStream();
        const err = stream.open(mock, "TAG", "VALUE");
        t.assertNull(err, "should return null on success");
        t.assertNotNull(stream.stream, "stream should be set after open");
        t.assertEqual(stream.valueColumnName, "VALUE");
        t.assertEqual(stream.valueColumnFamily, "NUMERIC");
        t.assertEqual(stream.valueColumnType, "DOUBLE");
    },

    "open() supports optional VARCHAR stringValueColumn": (t) => {
        const mock = makeMockClient({
            columns: makeColumns([
                ['NAME', 5, 0, 80],
                ['TIME', 6],
                ['VALUE', 20, FLAG_SUMMARIZED],
                ['TEXT_VALUE', 5, 0, 400],
            ]),
        });
        const stream = new MachbaseStream();
        const err = stream.open(mock, "TAG", "VALUE", "TEXT_VALUE");
        t.assertNull(err, "should return null on success");
        t.assertEqual(stream.stringValueColumnName, "TEXT_VALUE");
        t.assertEqual(stream.stringValueColumnFamily, "VARCHAR");
        t.assertEqual(stream.stringValueColumnType, "VARCHAR(400)");
    },

    "open() supports stringOnly with only VARCHAR value storage": (t) => {
        const mock = makeMockClient({
            columns: makeColumns([
                ['TAG_ID', 5, FLAG_PRIMARY, 80],
                ['TS', 6, FLAG_BASETIME],
                ['TEXT_VALUE', 5, 0, 400],
            ]),
        });
        const stream = new MachbaseStream();
        const err = stream.open(mock, "TAG", null, "TEXT_VALUE", { stringOnly: true });
        t.assertNull(err, "should return null on success");
        t.assert(stream.stringOnly, "stringOnly should be set");
        t.assertNull(stream.valueColumnName, "valueColumn should not be required");
        t.assertEqual(stream.primaryColumnName, "TAG_ID");
        t.assertEqual(stream.baseTimeColumnName, "TS");
        t.assertEqual(stream.stringValueColumnName, "TEXT_VALUE");

        const ts = new Date(1000);
        stream.appendNamedRows([{ TAG_ID: "sensor.a", TS: ts, TEXT_VALUE: "123.456" }]);
        const row = mock._appender.appended[0];
        t.assertEqual(row[0], "sensor.a", "primary value should be written");
        t.assertEqual(row[1], ts, "basetime value should be written");
        t.assertEqual(row[2], "123.456", "string value should be written");
    },

    "open() allows empty valueColumn when stringOnly is true": (t) => {
        const mock = makeMockClient({
            columns: makeColumns([
                ['TAG_ID', 5, FLAG_PRIMARY, 80],
                ['TS', 6, FLAG_BASETIME],
                ['TEXT_VALUE', 5, 0, 400],
            ]),
        });
        const stream = new MachbaseStream();
        const err = stream.open(mock, "TAG", "", "TEXT_VALUE", { stringOnly: true });
        t.assertNull(err, "empty valueColumn should be treated as omitted");
        t.assert(stream.stringOnly, "stringOnly should be set");
        t.assertNull(stream.valueColumnName, "valueColumn should not be required");
        t.assertEqual(stream.stringValueColumnName, "TEXT_VALUE");
    },

    "open() returns error when stringOnly table has summarized value columns": (t) => {
        const mock = makeMockClient({
            columns: makeColumns([
                ['NAME', 5, 0, 80],
                ['TIME', 6],
                ['VALUE', 20, FLAG_SUMMARIZED],
                ['TEXT_VALUE', 5, 0, 400],
            ]),
        });
        const stream = new MachbaseStream();
        const err = stream.open(mock, "TAG", null, "TEXT_VALUE", { stringOnly: true });
        t.assertNotNull(err, "should return error");
        t.assert(err.message.indexOf("stringOnly") >= 0, "error should mention stringOnly");
    },

    "open() supports JSON value column": (t) => {
        const mock = makeMockClient({
            columns: makeColumns([
                ['NAME', 5, 0, 80],
                ['TIME', 6],
                ['PAYLOAD', 61],
            ]),
        });
        const stream = new MachbaseStream();
        const err = stream.open(mock, "TAG", "PAYLOAD");
        t.assertNull(err, "should return null on success");
        t.assertEqual(stream.valueColumnFamily, "JSON");
        t.assertEqual(stream.valueColumnType, "JSON");
    },

    "open() detects primary and basetime columns by flags": (t) => {
        const mock = makeMockClient({
            columns: makeColumns([
                ['TAG_ID', 5, FLAG_PRIMARY, 80],
                ['TS', 6, FLAG_BASETIME],
                ['VALUE', 20, FLAG_SUMMARIZED],
            ]),
        });
        const stream = new MachbaseStream();
        const err = stream.open(mock, "TAG", "VALUE");
        t.assertNull(err, "should return null on success");
        t.assertEqual(stream.primaryColumnName, "TAG_ID");
        t.assertEqual(stream.baseTimeColumnName, "TS");
        t.assertEqual(stream.primaryIdx, 0);
        t.assertEqual(stream.baseTimeIdx, 1);

        const ts = new Date(1000);
        stream.append([["sensor.a", ts, 1.5]]);
        const row = mock._appender.appended[0];
        t.assertEqual(row[0], "sensor.a", "primary value should be written to TAG_ID");
        t.assertEqual(row[1], ts, "basetime value should be written to TS");
        t.assertEqual(row[2], 1.5, "value should be written to VALUE");
    },

    "open() returns error when column not found": (t) => {
        const mock = makeMockClient({
            columns: makeColumns([
                ['NAME', 5, 0, 80],
                ['TIME', 6],
                ['VALUE', 20, FLAG_SUMMARIZED],
            ]),
        });
        const stream = new MachbaseStream();
        const err = stream.open(mock, "TAG", "VALUE2");
        t.assertNotNull(err, "should return error when valueColumn not found");
        t.assert(err.message.indexOf('VALUE2') >= 0, "error should mention missing column");
    },

    "open() returns error when valueColumn type is not numeric or JSON": (t) => {
        const mock = makeMockClient({
            columns: makeColumns([
                ['NAME', 5, 0, 80],
                ['TIME', 6],
                ['VALUE', 5, 0, 200],
            ]),
        });
        const stream = new MachbaseStream();
        const err = stream.open(mock, "TAG", "VALUE");
        t.assertNotNull(err, "should return error");
        t.assert(err.message.indexOf("numeric or JSON") >= 0, "error should mention supported types");
    },

    "open() returns error when stringValueColumn is missing": (t) => {
        const mock = makeMockClient();
        const stream = new MachbaseStream();
        const err = stream.open(mock, "TAG", "VALUE", "TEXT_VALUE");
        t.assertNotNull(err, "should return error");
        t.assert(err.message.indexOf("TEXT_VALUE") >= 0, "error should mention missing string column");
    },

    "open() returns error when stringValueColumn matches valueColumn": (t) => {
        const mock = makeMockClient();
        const stream = new MachbaseStream();
        const err = stream.open(mock, "TAG", "VALUE", "VALUE");
        t.assertNotNull(err, "should return error");
        t.assert(err.message.indexOf("different") >= 0, "error should mention different column");
    },

    "open() returns error when stringValueColumn is not VARCHAR": (t) => {
        const mock = makeMockClient({
            columns: makeColumns([
                ['NAME', 5, 0, 80],
                ['TIME', 6],
                ['VALUE', 20, FLAG_SUMMARIZED],
                ['TEXT_VALUE', 20],
            ]),
        });
        const stream = new MachbaseStream();
        const err = stream.open(mock, "TAG", "VALUE", "TEXT_VALUE");
        t.assertNotNull(err, "should return error");
        t.assert(err.message.indexOf("VARCHAR") >= 0, "error should mention VARCHAR");
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

    "appendNamedRows() writes rows with correct column positions": (t) => {
        const mock = makeMockClient({
            columns: makeColumns([
                ['NAME', 5, 0, 80],
                ['TIME', 6],
                ['META', 5, 0, 40],
                ['VALUE', 20, FLAG_SUMMARIZED],
                ['TEXT_VALUE', 5, 0, 400],
            ]),
        });
        const stream = new MachbaseStream();
        stream.open(mock, "TAG", "VALUE", "TEXT_VALUE");
        const ts = new Date();
        stream.appendNamedRows([{
            NAME: "sensor.tag1",
            TIME: ts,
            VALUE: 3.14,
            TEXT_VALUE: "ok",
        }]);
        const row = mock._appender.appended[0];
        t.assertEqual(row[0], "sensor.tag1", "NAME at index 0");
        t.assertEqual(row[1], ts,            "TIME at index 1");
        t.assertNull(row[2],                 "META at index 2 should be null");
        t.assertEqual(row[3], 3.14,          "VALUE at index 3");
        t.assertEqual(row[4], "ok",          "TEXT_VALUE at index 4");
    },

    "append() uses valueColumn index correctly": (t) => {
        const mock = makeMockClient({
            columns: makeColumns([
                ['NAME', 5, 0, 80],
                ['TIME', 6],
                ['VALUE2', 20, FLAG_SUMMARIZED],
            ]),
        });
        const stream = new MachbaseStream();
        stream.open(mock, "TAG", "VALUE2");
        const ts = new Date();
        stream.append([["tag", ts, 9.9]]);
        const row = mock._appender.appended[0];
        t.assertEqual(row[2], 9.9, "VALUE2 at index 2");
    },

    "appendNamedRows() flushes after writing": (t) => {
        const mock = makeMockClient();
        const stream = new MachbaseStream();
        stream.open(mock, "TAG", "VALUE");
        stream.appendNamedRows([{ NAME: "sensor", TIME: new Date(), VALUE: 1.0 }]);
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

    "append() writes multiple rows in order": (t) => {
        const mock = makeMockClient();
        const stream = new MachbaseStream();
        stream.open(mock, "TAG", "VALUE");
        const ts1 = new Date(1000);
        const ts2 = new Date(2000);
        stream.append([
            ["sensor.a", ts1, 1.1],
            ["sensor.b", ts2, 2.2],
        ]);
        t.assertEqual(mock._appender.appended.length, 2, "two rows should be written");
        t.assertEqual(mock._appender.appended[0][0], "sensor.a", "first row NAME");
        t.assertEqual(mock._appender.appended[0][2], 1.1,        "first row VALUE");
        t.assertEqual(mock._appender.appended[1][0], "sensor.b", "second row NAME");
        t.assertEqual(mock._appender.appended[1][2], 2.2,        "second row VALUE");
    },

    "append() returns error when stream is not open": (t) => {
        const stream = new MachbaseStream();
        const err = stream.append([["tag", new Date(), 1.0]]);
        t.assertNotNull(err, "should return error when stream is not open");
        t.assert(err.message.indexOf("before open") >= 0, "error message should mention open");
    },

    "appendNamedRows() returns error when stream is not open": (t) => {
        const stream = new MachbaseStream();
        const err = stream.appendNamedRows([{ NAME: "tag", TIME: new Date(), VALUE: 1.0 }]);
        t.assertNotNull(err, "should return error when stream is not open");
        t.assert(err.message.indexOf("before open") >= 0, "error message should mention open");
    },
});

runner.summary();
