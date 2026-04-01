const TestRunner = require("./runner.js");
const OpcuaClient = require("../src/opcua/opcua-client.js");

class MockOpcuaClient extends OpcuaClient {
    constructor({ readResult, readError, connectError } = {}) {
        super("opc.tcp://localhost:4840", 100);
        this._readResult = readResult || [];
        this._readError = readError || null;
        this._connectError = connectError || null;
        this.innerClosed = false;
    }

    open() {
        if (this.client !== null) return true;
        if (this._connectError) return false;
        this.client = {
            read: () => {
                if (this._readError) throw new Error(this._readError);
                return this._readResult;
            },
            close: () => { this.innerClosed = true; },
        };
        return true;
    }
}

const runner = new TestRunner();

runner.run("OpcuaClient", {
    "open() returns true and sets client on success": (t) => {
        const client = new MockOpcuaClient();
        t.assert(client.open(), "open() should return true");
        t.assertNotNull(client.client, "client should be set");
    },

    "open() returns false on connect error": (t) => {
        const client = new MockOpcuaClient({ connectError: true });
        t.assert(!client.open(), "open() should return false");
        t.assertNull(client.client, "client should be null on failure");
    },

    "open() is no-op when already connected": (t) => {
        const client = new MockOpcuaClient();
        client.open();
        const first = client.client;
        client.open();
        t.assert(client.client === first, "client reference should not change");
    },

    "read() throws when not connected": (t) => {
        const client = new MockOpcuaClient();
        t.assertThrows(() => client.read(["ns=1;s=Tag1"]), "not connected");
    },

    "read() returns results on success": (t) => {
        const fakeResults = [{ value: 42, sourceTimestamp: 1000 }];
        const client = new MockOpcuaClient({ readResult: fakeResults });
        client.open();
        const result = client.read(["ns=1;s=Tag1"]);
        t.assertNotNull(result, "result should not be null");
        t.assertEqual(result[0].value, 42);
    },

    "read() throws on read error": (t) => {
        const client = new MockOpcuaClient({ readError: "read error" });
        client.open();
        t.assertThrows(() => client.read(["ns=1;s=Tag1"]), "read error");
    },

    "close() clears client": (t) => {
        const client = new MockOpcuaClient();
        client.open();
        client.close();
        t.assertNull(client.client, "client should be null after close");
        t.assert(client.innerClosed, "inner close() should have been called");
    },
});

runner.summary();
