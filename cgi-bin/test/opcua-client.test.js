const TestRunner = require("./runner.js");
const OpcuaClient = require("../src/opcua/opcua-client.js");

function makeMockInnerClient({ readResult, readError } = {}) {
    return {
        closed: false,
        read: () => {
            if (readError) throw new Error(readError);
            return readResult || [];
        },
        close: function() { this.closed = true; },
    };
}

const runner = new TestRunner();

runner.run("OpcuaClient", {
    "open() sets client on success": (t) => {
        const inner = makeMockInnerClient();
        const client = new OpcuaClient("opc.tcp://localhost:4840", 100, {
            clientFactory: () => inner,
        });
        client.open();
        t.assertNotNull(client.client, "client should be set");
    },

    "open() sets client to null when factory throws": (t) => {
        const client = new OpcuaClient("opc.tcp://bad:9999", 100, {
            clientFactory: () => { throw new Error("connection refused"); },
        });
        client.open();
        t.assertNull(client.client, "client should be null on failure");
    },

    "read() returns null when open fails": (t) => {
        const client = new OpcuaClient("opc.tcp://bad:9999", 100, {
            clientFactory: () => { throw new Error("connection refused"); },
        });
        const result = client.read(["ns=1;s=Tag1"]);
        t.assertNull(result, "should return null");
    },

    "read() returns results on success": (t) => {
        const fakeResults = [{ value: 42, sourceTimestamp: 1000 }];
        const inner = makeMockInnerClient({ readResult: fakeResults });
        const client = new OpcuaClient("opc.tcp://localhost:4840", 100, {
            clientFactory: () => inner,
        });
        const result = client.read(["ns=1;s=Tag1"]);
        t.assertNotNull(result, "result should not be null");
        t.assertEqual(result[0].value, 42);
    },

    "read() resets client to null on read error": (t) => {
        const inner = makeMockInnerClient({ readError: "read error" });
        const client = new OpcuaClient("opc.tcp://localhost:4840", 100, {
            clientFactory: () => inner,
        });
        client.open();
        const result = client.read(["ns=1;s=Tag1"]);
        t.assertNull(result, "should return null on error");
        t.assertNull(client.client, "client should be reset to null");
        t.assert(inner.closed, "inner client.close() should have been called");
    },

    "close() clears client": (t) => {
        const inner = makeMockInnerClient();
        const client = new OpcuaClient("opc.tcp://localhost:4840", 100, {
            clientFactory: () => inner,
        });
        client.open();
        client.close();
        t.assertNull(client.client, "client should be null after close");
        t.assert(inner.closed, "inner close() should have been called");
    },
});

runner.summary();
