const TestRunner = require("./runner.js");
const { MachbaseClient } = require("../src/db/client.js");
const { Column, TableSchema, ColumnType, FLAG_PRIMARY, FLAG_BASETIME, FLAG_SUMMARIZED } = require("../src/db/types.js");

const runner = new TestRunner();

function createMock(overrides) {
    const state = {
        connectCalled: 0,
        execSql: [],
        queryArgs: [],
        connClosed: 0,
        clientClosed: 0,
    };

    const conn = {
        exec(sql) {
            state.execSql.push(sql);
            if (overrides && overrides.exec) {
                return overrides.exec(sql, state);
            }
            return { rowsAffected: 0 };
        },
        query(sql) {
            const params = Array.prototype.slice.call(arguments, 1);
            state.queryArgs.push({ sql, params });
            if (overrides && overrides.query) {
                return overrides.query(sql, params, state);
            }
            return {
                close() {},
                [Symbol.iterator]: function* () {},
            };
        },
        close() {
            state.connClosed++;
        },
    };

    const client = {
        connect() {
            state.connectCalled++;
            if (overrides && overrides.connect) {
                return overrides.connect(conn, state);
            }
            return conn;
        },
        close() {
            state.clientClosed++;
        },
    };

    return { state, client };
}

runner.run("MachbaseClient", {
    "connect() opens a connection": (t) => {
        const mock = createMock();
        const client = new MachbaseClient({}, { clientFactory: () => mock.client });
        client.connect();
        t.assertEqual(mock.state.connectCalled, 1);
        client.close();
    },

    "connect() closes resources on failure": (t) => {
        const mock = createMock({
            connect() {
                throw new Error("connect failed");
            },
        });
        const client = new MachbaseClient({}, { clientFactory: () => mock.client });
        t.assertThrows(() => client.connect(), "connect failed");
        t.assertEqual(mock.state.clientClosed, 1, "client should be closed on connect failure");
    },

    "close() closes connection and client": (t) => {
        const mock = createMock();
        const client = new MachbaseClient({}, { clientFactory: () => mock.client });
        client.connect();
        client.close();
        t.assertEqual(mock.state.connClosed, 1);
        t.assertEqual(mock.state.clientClosed, 1);
    },

    "execute() runs DDL sql": (t) => {
        const mock = createMock();
        const client = new MachbaseClient({}, { clientFactory: () => mock.client });
        client.connect();
        client.execute("DROP TABLE FOO");
        t.assertEqual(mock.state.execSql[0], "DROP TABLE FOO");
        client.close();
    },

    "createTagTable() executes correct create SQL": (t) => {
        const mock = createMock();
        const client = new MachbaseClient({}, { clientFactory: () => mock.client });
        client.connect();
        const schema = new TableSchema("TAG", "TAGDATA", [
            new Column("NAME", ColumnType.VARCHAR, 0, FLAG_PRIMARY, 100),
            new Column("TIME", ColumnType.DATETIME, 1, FLAG_BASETIME, 0),
            new Column("VALUE", ColumnType.DOUBLE, 2, FLAG_SUMMARIZED, 0),
        ]);
        client.createTagTable("TAGDATA", schema);
        t.assert(mock.state.execSql[0].indexOf("CREATE TAG TABLE TAGDATA") >= 0, "should create target table");
        t.assert(mock.state.execSql[0].indexOf("NAME VARCHAR(100) PRIMARY KEY") >= 0, "should include NAME column");
        t.assert(mock.state.execSql[0].indexOf("TIME DATETIME BASETIME") >= 0, "should include TIME column");
        t.assert(mock.state.execSql[0].indexOf("VALUE DOUBLE SUMMARIZED") >= 0, "should include VALUE column");
        client.close();
    },

    "selectTableType() returns TAG for type code 6": (t) => {
        const mock = createMock({
            query(_sql, _params) {
                return {
                    close() {},
                    [Symbol.iterator]: function* () {
                        yield { TYPE: 6 };
                    },
                };
            },
        });
        const client = new MachbaseClient({}, { clientFactory: () => mock.client });
        client.connect();
        const result = client.selectTableType("TAGDATA");
        t.assertEqual(result.type, "TAG");
        t.assert(mock.state.queryArgs[0].sql.indexOf("M$SYS_TABLES") >= 0, "should query system table");
        client.close();
    },

    "selectTableType() returns UNSUPPORTED when not found": (t) => {
        const mock = createMock();
        const client = new MachbaseClient({}, { clientFactory: () => mock.client });
        client.connect();
        const result = client.selectTableType("MISSING");
        t.assertEqual(result.type, "UNSUPPORTED");
        client.close();
    },

    "selectTableType() returns LOG for type code 0": (t) => {
        const mock = createMock({
            query(_sql, _params) {
                return {
                    close() {},
                    [Symbol.iterator]: function* () {
                        yield { TYPE: 0 };
                    },
                };
            },
        });
        const client = new MachbaseClient({}, { clientFactory: () => mock.client });
        client.connect();
        const result = client.selectTableType("LOGDATA");
        t.assertEqual(result.type, "LOG");
        client.close();
    },

    "query() returns rows": (t) => {
        const mock = createMock({
            query(_sql, _params) {
                return {
                    close() {},
                    [Symbol.iterator]: function* () {
                        yield { NAME: "TAG1" };
                        yield { NAME: "TAG2" };
                    },
                };
            },
        });
        const client = new MachbaseClient({}, { clientFactory: () => mock.client });
        client.connect();
        const rows = client.query("SELECT NAME FROM TAG");
        t.assertEqual(rows.length, 2);
        t.assertEqual(rows[0].NAME, "TAG1");
        t.assertEqual(rows[1].NAME, "TAG2");
        client.close();
    },

    "query() passes bind parameters": (t) => {
        const mock = createMock();
        const client = new MachbaseClient({}, { clientFactory: () => mock.client });
        client.connect();
        client.query("SELECT * FROM T WHERE NAME = ?", ["sensor1"]);
        t.assertEqual(mock.state.queryArgs[0].params[0], "sensor1");
        client.close();
    },

    "selectColumnsByTableName() queries M$SYS_COLUMNS": (t) => {
        const mock = createMock();
        const client = new MachbaseClient({}, { clientFactory: () => mock.client });
        client.connect();
        client.selectColumnsByTableName("TAG");
        t.assert(mock.state.queryArgs[0].sql.indexOf("M$SYS_COLUMNS") >= 0, "should query M$SYS_COLUMNS");
        t.assertEqual(mock.state.queryArgs[0].params[0], "TAG");
        client.close();
    },

    "selectAllTables() queries M$SYS_TABLES for TAG and LOG types with USER_ID": (t) => {
        const mock = createMock();
        const client = new MachbaseClient({}, { clientFactory: () => mock.client });
        client.connect();
        client.selectAllTables();
        const sql = mock.state.queryArgs[0].sql;
        t.assert(sql.indexOf("M$SYS_TABLES") >= 0, "should query M$SYS_TABLES");
        t.assert(sql.indexOf("TYPE IN (0, 6)") >= 0, "should filter TAG (6) and LOG (0) types");
        t.assert(sql.indexOf("USER_ID") >= 0, "should include USER_ID in SELECT");
        client.close();
    },

    "selectUsers() queries M$SYS_USERS": (t) => {
        const mock = createMock({
            query(_sql, _params) {
                return {
                    close() {},
                    [Symbol.iterator]: function* () {
                        yield { USER_ID: 1, NAME: "SYS" };
                        yield { USER_ID: 2, NAME: "ADMIN" };
                    },
                };
            },
        });
        const client = new MachbaseClient({}, { clientFactory: () => mock.client });
        client.connect();
        const rows = client.selectUsers();
        const sql = mock.state.queryArgs[0].sql;
        t.assert(sql.indexOf("M$SYS_USERS") >= 0, "should query M$SYS_USERS");
        t.assert(sql.indexOf("USER_ID") >= 0, "should include USER_ID");
        t.assert(sql.indexOf("NAME") >= 0, "should include NAME");
        t.assertEqual(rows.length, 2);
        t.assertEqual(rows[0].USER_ID, 1);
        t.assertEqual(rows[0].NAME, "SYS");
        client.close();
    },

    "createLogTable() executes correct create SQL": (t) => {
        const mock = createMock();
        const client = new MachbaseClient({}, { clientFactory: () => mock.client });
        client.connect();
        const { TableSchema: TS, Column: Col, ColumnType: CT } = require("../src/db/types.js");
        const schema = new TS("LOG", "LOGDATA", [
            new Col("TIME", CT.DATETIME, 0, 0, 0),
            new Col("MSG", CT.VARCHAR, 1, 0, 200),
        ]);
        client.createLogTable("LOGDATA", schema);
        t.assert(mock.state.execSql[0].indexOf("CREATE TABLE LOGDATA") >= 0, "should create LOG table");
        t.assert(mock.state.execSql[0].indexOf("DATETIME") >= 0, "should include DATETIME column");
        t.assert(mock.state.execSql[0].indexOf("VARCHAR(200)") >= 0, "should include VARCHAR column");
        client.close();
    },

    "createTagTable() with METADATA columns appends METADATA clause": (t) => {
        const mock = createMock();
        const client = new MachbaseClient({}, { clientFactory: () => mock.client });
        client.connect();
        const { TableSchema: TS, Column: Col, ColumnType: CT, FLAG_PRIMARY, FLAG_BASETIME, FLAG_SUMMARIZED, FLAG_METADATA } = require("../src/db/types.js");
        const schema = new TS("TAG", "TAGDATA", [
            new Col("NAME", CT.VARCHAR, 0, FLAG_PRIMARY, 100),
            new Col("TIME", CT.DATETIME, 1, FLAG_BASETIME, 0),
            new Col("VALUE", CT.DOUBLE, 2, FLAG_SUMMARIZED, 0),
            new Col("LOCATION", CT.VARCHAR, 3, FLAG_METADATA, 64),
        ]);
        client.createTagTable("TAGDATA", schema);
        const sql = mock.state.execSql[0];
        t.assert(sql.indexOf("METADATA") >= 0, "should include METADATA clause");
        t.assert(sql.indexOf("LOCATION VARCHAR(64)") >= 0, "should include metadata column definition");
        client.close();
    },
});

runner.summary();
