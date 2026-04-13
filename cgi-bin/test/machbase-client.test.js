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
});

runner.summary();
