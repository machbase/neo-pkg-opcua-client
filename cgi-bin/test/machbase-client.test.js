const TestRunner = require("./runner.js");
const MachbaseClient = require("../src/db/machbase-client.js");

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
        const conn = client.connect();
        t.assertEqual(mock.state.connectCalled, 1);
        t.assertNotNull(conn);
        client.close();
    },

    "createTagTable() executes fixed create SQL": (t) => {
        const mock = createMock();
        const client = new MachbaseClient({}, { clientFactory: () => mock.client });
        client.connect();
        client.createTagTable("TAGDATA");
        t.assert(mock.state.execSql[0].indexOf("CREATE TAG TABLE TAGDATA") >= 0, "should create target table");
        t.assert(mock.state.execSql[0].indexOf("NAME VARCHAR(100) PRIMARY KEY") >= 0, "should include NAME column");
        t.assert(mock.state.execSql[0].indexOf("TIME DATETIME BASETIME") >= 0, "should include TIME column");
        t.assert(mock.state.execSql[0].indexOf("VALUE DOUBLE SUMMARIZED") >= 0, "should include VALUE column");
        client.close();
    },

    "hasTable() queries system tables using uppercase name": (t) => {
        const mock = createMock({
            query(sql, params) {
                return {
                    close() {},
                    [Symbol.iterator]: function* () {
                        yield { NAME: "TAGDATA" };
                    },
                };
            },
        });
        const client = new MachbaseClient({}, { clientFactory: () => mock.client });
        client.connect();
        const exists = client.hasTable("tagdata");
        t.assertEqual(exists, true);
        t.assert(mock.state.queryArgs[0].sql.indexOf("M$SYS_TABLES") >= 0, "should query system table");
        t.assertEqual(mock.state.queryArgs[0].params[0], "TAGDATA");
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
});

runner.summary();
