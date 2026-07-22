const path = require('path');
const Module = require('module');
const TestRunner = require('./runner.js');

const ROOT = path.resolve(__dirname, '..');
const runner = new TestRunner();

const _origResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
    if (request === 'opcua') return 'opcua';
    return _origResolve.call(this, request, parent, isMain, options);
};

class MockNativeClient {
    constructor(options) {
        this.options = options;
        this.readCalls = [];
        this.closed = false;
        MockNativeClient.instances.push(this);
    }

    read(request) {
        this.readCalls.push(request.nodes.slice());
        if (MockNativeClient.throwOnReadCall === this.readCalls.length) {
            throw new Error('read failed');
        }
        return request.nodes.map((nodeId) => ({
            nodeId,
            value: nodeId + ':value',
            statusCode: 'StatusGood',
        }));
    }

    close() {
        this.closed = true;
    }
}

MockNativeClient.instances = [];
MockNativeClient.throwOnReadCall = 0;

require.cache['opcua'] = {
    id: 'opcua',
    filename: 'opcua',
    loaded: true,
    exports: {
        Client: MockNativeClient,
        TimestampsToReturn: { Both: 3 },
        MessageSecurityMode: { None: 0, Sign: 1, SignAndEncrypt: 2 },
        AuthMode: { Anonymous: 0, UserName: 1, Certificate: 2 },
    },
};

const opcuaClientPath = require.resolve(path.join(ROOT, 'src/opcua/opcua-client.js'));
delete require.cache[opcuaClientPath];
const OpcuaClient = require(opcuaClientPath);

function resetNativeMock() {
    MockNativeClient.instances.length = 0;
    MockNativeClient.throwOnReadCall = 0;
}

function makeClient(config) {
    const client = new OpcuaClient({
        endpoint: 'opc.tcp://127.0.0.1:4840',
        ...(config || {}),
    });
    if (!client.open()) {
        throw new Error('open failed');
    }
    return client;
}

runner.run('OpcuaClient read batching', {
    'splits read request by readBatchSize and preserves result order': (t) => {
        resetNativeMock();
        const client = makeClient({ readBatchSize: 2 });
        const result = client.read(['n1', 'n2', 'n3', 'n4', 'n5']);
        const nativeClient = MockNativeClient.instances[0];

        t.assertDeepEqual(nativeClient.readCalls, [
            ['n1', 'n2'],
            ['n3', 'n4'],
            ['n5'],
        ]);
        t.assertDeepEqual(result.map((r) => r.nodeId), ['n1', 'n2', 'n3', 'n4', 'n5']);
        t.assertDeepEqual(result.map((r) => r.value), [
            'n1:value',
            'n2:value',
            'n3:value',
            'n4:value',
            'n5:value',
        ]);
    },

    'uses one read request when node count is within readBatchSize': (t) => {
        resetNativeMock();
        const client = makeClient({ readBatchSize: 3 });
        const result = client.read(['n1', 'n2', 'n3']);
        const nativeClient = MockNativeClient.instances[0];

        t.assertDeepEqual(nativeClient.readCalls, [['n1', 'n2', 'n3']]);
        t.assertDeepEqual(result.map((r) => r.nodeId), ['n1', 'n2', 'n3']);
    },

    'falls back to default readBatchSize when config is invalid': (t) => {
        resetNativeMock();
        const client = makeClient({ readBatchSize: 0 });
        const nodes = [];
        for (let i = 0; i < 301; i++) {
            nodes.push('n' + i);
        }

        client.read(nodes);
        const nativeClient = MockNativeClient.instances[0];
        t.assertEqual(nativeClient.readCalls.length, 2);
        t.assertEqual(nativeClient.readCalls[0].length, 300);
        t.assertEqual(nativeClient.readCalls[1].length, 1);
    },

    'fails the whole read when any batch read fails': (t) => {
        resetNativeMock();
        MockNativeClient.throwOnReadCall = 2;
        const client = makeClient({ readBatchSize: 2 });

        t.assertThrows(() => client.read(['n1', 'n2', 'n3']), 'read failed');
        const nativeClient = MockNativeClient.instances[0];
        t.assertDeepEqual(nativeClient.readCalls, [
            ['n1', 'n2'],
            ['n3'],
        ]);
    },

    'passes UserName authMode with username credentials': (t) => {
        resetNativeMock();
        const client = makeClient({
            security: {
                enabled: true,
                securityPolicy: 'None',
                messageSecurityMode: 'None',
                authMode: 'UserName',
                username: 'test',
                password: 'machbasemachbase',
            },
        });
        const nativeClient = MockNativeClient.instances[0];
        t.assertEqual(nativeClient.options.authMode, require.cache['opcua'].exports.AuthMode.UserName);
        t.assertEqual(nativeClient.options.username, 'test');
        t.assertEqual(nativeClient.options.password, 'machbasemachbase');
        client.close();
    },

    'passes username credentials when native AuthMode enum is unavailable': (t) => {
        resetNativeMock();
        const originalAuthMode = require.cache['opcua'].exports.AuthMode;
        delete require.cache['opcua'].exports.AuthMode;
        try {
            const client = makeClient({
                security: {
                    enabled: true,
                    securityPolicy: 'None',
                    messageSecurityMode: 'None',
                    authMode: 'UserName',
                    username: 'test',
                    password: 'machbasemachbase',
                },
            });
            const nativeClient = MockNativeClient.instances[0];
            t.assertEqual(nativeClient.options.authMode, undefined);
            t.assertEqual(nativeClient.options.username, 'test');
            t.assertEqual(nativeClient.options.password, 'machbasemachbase');
            client.close();
        } finally {
            require.cache['opcua'].exports.AuthMode = originalAuthMode;
        }
    },
});

delete require.cache[opcuaClientPath];
delete require.cache['opcua'];
Module._resolveFilename = _origResolve;

if (!runner.summary()) process.exit(1);
