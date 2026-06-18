const path = require('path');
const Module = require('module');
const TestRunner = require('./runner.js');

const ROOT = path.resolve(__dirname, '..');

// opcua는 JSH 내장 모듈이라 Node.js에서 resolve되지 않음. require.cache 주입을 위해 패치.
const _origResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
    if (request === 'opcua') return 'opcua';
    return _origResolve.call(this, request, parent, isMain, options);
};

// ── Mocks ────────────────────────────────────────────────────────────────────

class MockCGI {
    constructor() {
        this._configs = {};
        this._servers = {};
        this._opcuaServers = {};
        this._opcuaCredentialWrites = {};
        this._opcuaCredentialRemoves = [];
    }
    getConfigList() { return Object.keys(this._configs); }
    getConfig(name) { return this._configs[name] || null; }
    writeConfig(name, cfg) { this._configs[name] = cfg; }
    removeConfig(name) { delete this._configs[name]; return null; }
    existsConfig(name) { return !!this._configs[name]; }
    getServerConfigList() { return Object.keys(this._servers); }
    getServerConfig(name) { return this._servers[name] || null; }
    writeServerConfig(name, cfg) { this._servers[name] = cfg; }
    removeServerConfig(name) {
        if (!this._servers[name]) return null;
        delete this._servers[name];
        return null;
    }
    getOpcuaServerConfigList() { return Object.keys(this._opcuaServers); }
    getOpcuaServerConfig(name) { return this._opcuaServers[name] || null; }
    writeOpcuaServerConfig(name, cfg) { this._opcuaServers[name] = cfg; }
    removeOpcuaServerConfig(name) {
        if (!this._opcuaServers[name]) return null;
        delete this._opcuaServers[name];
        return null;
    }
    writeOpcuaServerCredentialFiles(name, certificatePem, keyPem) {
        this._opcuaCredentialWrites[name] = { certificatePem, keyPem };
        return {
            certificateFile: `/mock/opcua-certs/${name}/client_cert.pem`,
            keyFile: `/mock/opcua-certs/${name}/client_key.pem`,
        };
    }
    getOpcuaServerCredentialFileInfo(name) {
        if (!this._opcuaCredentialWrites[name]) return {};
        return {
            certificate: { exists: true, updatedAt: '2026-06-05T06:00:00.000Z' },
            key: { exists: true, updatedAt: '2026-06-05T06:00:01.000Z' },
        };
    }
    removeOpcuaServerCredentialFiles(name) {
        this._opcuaCredentialRemoves.push(name);
        return null;
    }
}

class MockService {
    constructor() {
        this._values = {};
        this._installed = {};
        // status map: name -> 'RUNNING' | 'STOPPED'
        this._statusMap = {};
        this.installError = null;
        this.uninstallError = null;
        this.startError = null;
        this.stopError = null;
        this.getValueError = null;
        this.missingService = false;
        this.getServiceMapError = false;
        this.listError = null;
        this.listResult = null;
    }
    isMissingServiceError(err) {
        return err && err.message === '__missing__';
    }
    installed(name) { return !!this._installed[name]; }
    remove(name) { delete this._installed[name]; delete this._statusMap[name]; }
    status(name, cb) {
        if (this.missingService) { cb(new Error('__missing__')); return; }
        if (!this._installed[name]) { cb(new Error('__missing__')); return; }
        cb(null, { status: this._statusMap[name] || 'STOPPED' });
    }
    getServiceMap(cb) {
        if (this.getServiceMapError) { cb(new Error('map unavailable')); return; }
        const map = {};
        for (const n of Object.keys(this._installed)) {
            map[n] = { status: this._statusMap[n] || 'STOPPED' };
        }
        cb(null, map);
    }
    list(cb) {
        if (this.listError) { cb(new Error(this.listError)); return; }
        if (this.listResult) { cb(null, this.listResult); return; }
        const list = [];
        for (const n of Object.keys(this._installed)) {
            list.push({ status: this._statusMap[n] || 'STOPPED', config: { name: n } });
        }
        cb(null, list);
    }
    install(name, cb) {
        if (this.installError) { cb(new Error(this.installError)); return; }
        this._installed[name] = true;
        this._statusMap[name] = 'STOPPED';
        cb(null);
    }
    uninstall(name, cb) {
        if (this.uninstallError) { cb(new Error(this.uninstallError)); return; }
        delete this._installed[name];
        delete this._statusMap[name];
        cb(null);
    }
    start(name, cb) {
        if (this.startError) { cb(new Error(this.startError)); return; }
        this._statusMap[name] = 'RUNNING';
        cb(null);
    }
    stop(name, cb) {
        if (this.stopError) { cb(new Error(this.stopError)); return; }
        this._statusMap[name] = 'STOPPED';
        cb(null);
    }
    getValue(name, key, cb) {
        if (this.getValueError) { cb(new Error(this.getValueError)); return; }
        if (this.missingService) { cb(new Error('__missing__')); return; }
        const val = this._values[name + ':' + key];
        cb(null, val !== undefined ? val : null);
    }
    setValue(name, key, value, cb) {
        this._values[name + ':' + key] = value;
        if (cb) cb(null);
    }
}

class MockMachbaseClient {
    constructor() {
        this.connected = false;
        this.closed = false;
        this.connectError = null;
        this.tableType = 'UNSUPPORTED';
        this.tableMeta = null;
        this.columns = [];
        this.tables = [];
        this.users = [{ USER_ID: 1, NAME: 'SYS' }];
        this.createError = null;
        this.rowCount = 0;
        this.createdTables = [];
        this.droppedTables = [];
        this.queries = [];
        this.queryResults = [];
    }
    connect() {
        if (this.connectError) throw new Error(this.connectError);
        this.connected = true;
    }
    close() { this.closed = true; }
    selectTableType(_table) { return { type: this.tableType }; }
    selectUsers() { return this.users; }
    selectAllTables() { return this.tables; }
    selectTableMeta(_table, _userId) { return this.tableMeta; }
    selectColumnsByTableId(_tableId) { return this.columns; }
    selectColumnsByTableName(_table) { return this.columns; }
    selectTagNames(_table) { return this.queryResults.shift() || []; }
    createTagTable(table, schema, options) {
        if (this.createError) throw new Error(this.createError);
        this.createdTables.push({ table, schema, options: options || {} });
    }
    selectRowCount(_table) {
        return this.rowCount;
    }
    query(sql, values) {
        this.queries.push({ sql, values: values || [] });
        return this.queryResults.shift() || [];
    }
    dropTableCascade(table) {
        this.droppedTables.push(table);
    }
}

class MockOpcuaClient {
    constructor() {
        this.options = null;
        this.endpoint = null;
        this.readRetryInterval = null;
        this.opened = false;
        this.closed = false;
        this.openResult = true;
        this.readResult = null;
        this.readError = null;
        this.lastError = null;
        this.readCalls = [];
        this.writeResult = null;
        this.writeError = null;
        this.browseResult = {};
        this.browseError = null;
        this.browseCalls = [];
        this.attributesResult = [];
    }
    open() { this.opened = true; return this.openResult; }
    close() { this.closed = true; }
    read(_nodeIds) {
        this.readCalls.push(_nodeIds);
        if (this.readError) throw new Error(this.readError);
        return this.readResult || [];
    }
    write(..._args) {
        if (this.writeError) throw new Error(this.writeError);
        return this.writeResult;
    }
    browse(req) {
        this.browseCalls.push(req);
        if (this.browseError) throw new Error(this.browseError);
        const nodeId = req.nodes && req.nodes[0];
        const refs = (this.browseResult[nodeId] || []).map((r) => ({
            ReferenceTypeId: '',
            IsForward: true,
            NodeId: r.NodeId,
            BrowseName: r.BrowseName || '',
            DisplayName: r.DisplayName || '',
            NodeClass: r.NodeClass || 0,
            TypeDefinition: '',
        }));
        return [{ references: refs, continuationPoint: '' }];
    }
    browseNext(_req) {
        return [{ references: [], continuationPoint: '' }];
    }
    attributes(_req) { return this.attributesResult; }
}

// ── Module injection ─────────────────────────────────────────────────────────

let mockCGI, mockService, mockMachbaseClient, mockOpcuaClient;

function makeHandler() {
    mockCGI = new MockCGI();
    mockService = new MockService();
    mockMachbaseClient = new MockMachbaseClient();
    mockOpcuaClient = new MockOpcuaClient();

    const cgiUtilPath = require.resolve(path.join(ROOT, 'src/cgi/cgi_util.js'));
    const servicePath = require.resolve(path.join(ROOT, 'src/cgi/service.js'));
    const clientPath = require.resolve(path.join(ROOT, 'src/db/client.js'));
    const opcuaPath = require.resolve(path.join(ROOT, 'src/opcua/opcua-client.js'));
    const handlerPath = require.resolve(path.join(ROOT, 'src/cgi/handler.js'));

    require.cache[cgiUtilPath] = {
        id: cgiUtilPath, filename: cgiUtilPath, loaded: true,
        exports: { CGI: mockCGI },
    };
    require.cache[servicePath] = {
        id: servicePath, filename: servicePath, loaded: true,
        exports: mockService,
    };
    require.cache[clientPath] = {
        id: clientPath, filename: clientPath, loaded: true,
        exports: { MachbaseClient: function() { return mockMachbaseClient; } },
    };
    require.cache[opcuaPath] = {
        id: opcuaPath, filename: opcuaPath, loaded: true,
        exports: function(endpointOrConfig, readRetryInterval) {
            mockOpcuaClient.options = endpointOrConfig;
            if (endpointOrConfig && typeof endpointOrConfig === 'object') {
                mockOpcuaClient.endpoint = endpointOrConfig.endpoint;
                mockOpcuaClient.readRetryInterval = endpointOrConfig.readRetryInterval || readRetryInterval;
            } else {
                mockOpcuaClient.endpoint = endpointOrConfig;
                mockOpcuaClient.readRetryInterval = readRetryInterval;
            }
            return mockOpcuaClient;
        },
    };
    require.cache['opcua'] = {
        id: 'opcua', filename: 'opcua', loaded: true,
        exports: { NodeClass: { Variable: 2 }, AttributeID: { DataType: 14 }, StatusCode: { Good: 0 } },
    };

    delete require.cache[handlerPath];
    const Handler = require(handlerPath);

    delete require.cache[cgiUtilPath];
    delete require.cache[servicePath];
    delete require.cache[clientPath];
    delete require.cache[opcuaPath];
    delete require.cache['opcua'];

    return Handler;
}

// ── Tests ────────────────────────────────────────────────────────────────────

const runner = new TestRunner();

// ── collectorPost ────────────────────────────────────────────────────────────

runner.run('Handler: collectorPost', {
    'creates config and installs service': (t) => {
        const H = makeHandler();
        let result;
        H.collectorPost('col-a', { opcua: { endpoint: 'opc.tcp://h:4840' }, db: {} }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.name, 'col-a');
        t.assertNotNull(mockCGI._configs['col-a'], 'config should be written');
        t.assertEqual(mockCGI._configs['col-a'].opcua.server, 'col-a-opcua');
        t.assertEqual(mockCGI._configs['col-a'].opcua.endpoint, undefined, 'legacy endpoint should be removed');
        t.assertEqual(mockCGI._opcuaServers['col-a-opcua'].endpoint, 'opc.tcp://h:4840');
        t.assert(mockService._installed['col-a'], 'service should be installed');
    },

    'returns error when collector already exists': (t) => {
        const H = makeHandler();
        mockCGI._configs['col-a'] = {};
        let result;
        H.collectorPost('col-a', { opcua: { endpoint: 'opc.tcp://h:4840' } }, (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('already exists'));
    },

    'rollbacks config when install fails': (t) => {
        const H = makeHandler();
        mockService.installError = 'install failed';
        let result;
        H.collectorPost('col-a', { opcua: { endpoint: 'opc.tcp://h:4840' } }, (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(!mockCGI._configs['col-a'], 'config should be removed on install failure');
        t.assert(!mockCGI._opcuaServers['col-a-opcua'], 'auto-created opcua server should be removed on install failure');
    },

    'auto-creates TAG table and stores normalized columns': (t) => {
        const H = makeHandler();
        const longName = 'TAG_' + 'X'.repeat(90);
        mockCGI._servers['server-a'] = { host: 'h', port: 5656, user: 'sys', password: 'pw' };

        let result;
        H.collectorPost('col-a', {
            autoCreateTable: true,
            db: 'server-a',
            dbTable: 'auto_tag',
            opcua: {
                interval: 1000,
                endpoint: 'opc.tcp://h:4840',
                nodes: [{ nodeId: 'ns=1;s=a', name: longName }],
            },
        }, (r) => { result = r; });

        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockMachbaseClient.createdTables.length, 1, 'table should be created');
        const created = mockMachbaseClient.createdTables[0];
        t.assertEqual(created.table, 'AUTO_TAG');
        t.assertEqual(created.options.rollup, undefined, 'rollup should not be enabled');
        t.assertEqual(created.schema.columns[0].name, 'NAME');
        t.assertEqual(created.schema.columns[0].length, 95);
        t.assertEqual(created.schema.columns[2].name, 'VALUE');
        t.assertEqual(created.schema.columns[2].flag, 0x2000000);
        t.assertEqual(created.schema.columns[3].name, 'STR_VALUE');
        t.assertEqual(created.schema.columns[3].length, 1024);
        t.assertEqual(mockCGI._configs['col-a'].dbTable, 'AUTO_TAG');
        t.assertEqual(mockCGI._configs['col-a'].valueColumn, 'VALUE');
        t.assertEqual(mockCGI._configs['col-a'].stringValueColumn, 'STR_VALUE');
        t.assertEqual(mockCGI._configs['col-a'].stringOnly, false);
        t.assertEqual(mockCGI._configs['col-a'].autoCreateTable, undefined);
        t.assert(mockService._installed['col-a'], 'service should be installed');
    },

    'rejects existing table when tag name exceeds primary column length': (t) => {
        const H = makeHandler();
        mockCGI._servers['server-a'] = { host: 'h', port: 5656, user: 'SYS', password: 'pw' };
        mockMachbaseClient.tableMeta = { ID: 10, TYPE: 6, NAME: 'TAG' };
        mockMachbaseClient.columns = [
            { NAME: 'NAME', TYPE: 5, ID: 0, FLAG: 0x8000000, LENGTH: 5 },
            { NAME: 'TIME', TYPE: 6, ID: 1, FLAG: 0x1000000, LENGTH: 8 },
            { NAME: 'VALUE', TYPE: 20, ID: 2, FLAG: 0x2000000, LENGTH: 8 },
        ];

        let result;
        H.collectorPost('col-a', {
            db: 'server-a',
            dbTable: 'TAG',
            opcua: {
                interval: 1000,
                endpoint: 'opc.tcp://h:4840',
                nodes: [{ nodeId: 'ns=1;s=too-long', name: 'TOO_LONG' }],
            },
        }, (r) => { result = r; });

        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('tag name length 8 exceeds NAME VARCHAR(5)'), 'reason should explain tag name length');
        t.assert(!mockCGI._configs['col-a'], 'config should not be written');
        t.assert(!mockCGI._opcuaServers['col-a-opcua'], 'auto-created opcua server should be rolled back');
    },

    'allows long node names in JSON mode when collector name fits primary column': (t) => {
        const H = makeHandler();
        mockCGI._servers['server-a'] = { host: 'h', port: 5656, user: 'SYS', password: 'pw' };
        mockMachbaseClient.tableMeta = { ID: 10, TYPE: 6, NAME: 'TAG' };
        mockMachbaseClient.columns = [
            { NAME: 'NAME', TYPE: 5, ID: 0, FLAG: 0x8000000, LENGTH: 10 },
            { NAME: 'TIME', TYPE: 6, ID: 1, FLAG: 0x1000000, LENGTH: 8 },
            { NAME: 'PAYLOAD', TYPE: 61, ID: 2, FLAG: 0, LENGTH: 0 },
        ];

        let result;
        H.collectorPost('col-a', {
            db: 'server-a',
            dbTable: 'TAG',
            valueColumn: 'PAYLOAD',
            opcua: {
                interval: 1000,
                endpoint: 'opc.tcp://h:4840',
                nodes: [{ nodeId: 'ns=1;s=long', name: 'NODE_' + 'X'.repeat(100) }],
            },
        }, (r) => { result = r; });

        t.assert(result.ok, 'should be ok');
        t.assert(mockCGI._configs['col-a'], 'config should be written');
    },

    'update rejects existing table when tag name exceeds primary column length': (t) => {
        const H = makeHandler();
        mockCGI._configs['col-a'] = {
            db: 'server-a',
            dbTable: 'TAG',
            opcua: { server: 'opc-main', nodes: [{ nodeId: 'ns=1;s=a', name: 'OK' }] },
        };
        mockCGI._opcuaServers['opc-main'] = { endpoint: 'opc.tcp://profile:4840' };
        mockCGI._servers['server-a'] = { host: 'h', port: 5656, user: 'SYS', password: 'pw' };
        mockMachbaseClient.tableMeta = { ID: 10, TYPE: 6, NAME: 'TAG' };
        mockMachbaseClient.columns = [
            { NAME: 'NAME', TYPE: 5, ID: 0, FLAG: 0x8000000, LENGTH: 5 },
            { NAME: 'TIME', TYPE: 6, ID: 1, FLAG: 0x1000000, LENGTH: 8 },
            { NAME: 'VALUE', TYPE: 20, ID: 2, FLAG: 0x2000000, LENGTH: 8 },
        ];

        let result;
        H.collectorPut('col-a', {
            db: 'server-a',
            dbTable: 'TAG',
            opcua: {
                server: 'opc-main',
                nodes: [{ nodeId: 'ns=1;s=too-long', name: 'TOO_LONG' }],
            },
        }, (r) => { result = r; });

        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('tag name length 8 exceeds NAME VARCHAR(5)'), 'reason should explain tag name length');
        t.assertEqual(mockCGI._configs['col-a'].opcua.nodes[0].name, 'OK', 'existing config should remain unchanged');
    },

    'auto-create fails when current user already has the table': (t) => {
        const H = makeHandler();
        mockCGI._servers['server-a'] = { host: 'h', port: 5656, user: 'SYS', password: 'pw' };
        mockMachbaseClient.tableMeta = { ID: 10, TYPE: 6, NAME: 'AUTO_TAG' };

        let result;
        H.collectorPost('col-a', {
            autoCreateTable: true,
            db: 'server-a',
            dbTable: 'AUTO_TAG',
            opcua: { interval: 1000, endpoint: 'opc.tcp://h:4840', nodes: [] },
        }, (r) => { result = r; });

        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('already exists'), 'reason should explain existing table');
        t.assertEqual(mockMachbaseClient.createdTables.length, 0, 'table should not be created');
        t.assert(!mockCGI._configs['col-a'], 'config should not be written');
    },

    'auto-create drops created table when install fails': (t) => {
        const H = makeHandler();
        mockCGI._servers['server-a'] = { host: 'h', port: 5656, user: 'SYS', password: 'pw' };
        mockService.installError = 'install failed';
        mockMachbaseClient.rowCount = 0;

        let result;
        H.collectorPost('col-a', {
            autoCreateTable: true,
            db: 'server-a',
            dbTable: 'AUTO_TAG',
            opcua: { interval: 1000, endpoint: 'opc.tcp://h:4840', nodes: [] },
        }, (r) => { result = r; });

        t.assert(!result.ok, 'should not be ok');
        t.assert(!mockCGI._configs['col-a'], 'config should be removed');
        t.assertEqual(mockMachbaseClient.droppedTables[0], 'AUTO_TAG');
    },

    'uses existing OPC UA server profile when provided': (t) => {
        const H = makeHandler();
        mockCGI._opcuaServers['opc-main'] = { endpoint: 'opc.tcp://profile:4840' };
        let result;
        H.collectorPost('col-a', {
            opcua: { server: 'opc-main', endpoint: 'opc.tcp://legacy:4840' },
            db: 'server-a',
        }, (r) => { result = r; });

        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockCGI._configs['col-a'].opcua.server, 'opc-main');
        t.assertEqual(mockCGI._configs['col-a'].opcua.endpoint, undefined, 'endpoint should be removed when server is provided');
        t.assertEqual(Object.keys(mockCGI._opcuaServers).length, 1, 'should not create another profile');
    },

    'returns error when referenced OPC UA server is missing': (t) => {
        const H = makeHandler();
        let result;
        H.collectorPost('col-a', {
            opcua: { server: 'missing' },
            db: 'server-a',
        }, (r) => { result = r; });

        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes("opcua server 'missing' not found"));
        t.assert(!mockCGI._configs['col-a'], 'config should not be written');
    },
});

// ── collectorGet ─────────────────────────────────────────────────────────────

runner.run('Handler: collectorGet', {
    'returns config': (t) => {
        const H = makeHandler();
        mockCGI._configs['col-a'] = { opcua: {}, db: 'server-a' };
        let result;
        H.collectorGet('col-a', (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.config.db, 'server-a');
        t.assertEqual(result.data.name, 'col-a');
    },

    'returns error when not found': (t) => {
        const H = makeHandler();
        let result;
        H.collectorGet('missing', (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
    },
});

// ── collectorPut ─────────────────────────────────────────────────────────────

runner.run('Handler: collectorPut', {
    'updates config when not running': (t) => {
        const H = makeHandler();
        mockCGI._configs['col-a'] = { db: 'server-a', opcua: {} };
        let result;
        H.collectorPut('col-a', { db: 'server-b', opcua: { endpoint: 'opc.tcp://h:4840' } }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockCGI._configs['col-a'].db, 'server-b');
        t.assertEqual(mockCGI._configs['col-a'].opcua.server, 'col-a-opcua');
    },

    'stops and restarts service when running': (t) => {
        const H = makeHandler();
        mockCGI._configs['col-a'] = { db: {}, opcua: { endpoint: 'opc.tcp://old:4840' } };
        mockService._installed['col-a'] = true;
        mockService._statusMap['col-a'] = 'RUNNING';
        let result;
        H.collectorPut('col-a', { db: {}, opcua: { endpoint: 'opc.tcp://h:4840' } }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockService._statusMap['col-a'], 'RUNNING', 'service should be restarted');
    },

    'returns error when collector not found': (t) => {
        const H = makeHandler();
        let result;
        H.collectorPut('missing', {}, (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
    },
});

// ── collectorDelete ──────────────────────────────────────────────────────────

runner.run('Handler: collectorDelete', {
    'deletes config and uninstalls service': (t) => {
        const H = makeHandler();
        mockCGI._configs['col-a'] = {};
        mockService._installed['col-a'] = true;
        mockService._statusMap['col-a'] = 'STOPPED';
        let result;
        H.collectorDelete('col-a', (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assert(!mockCGI._configs['col-a'], 'config should be removed');
        t.assert(!mockService._installed['col-a'], 'service should be uninstalled');
    },

    'stops running service before uninstall': (t) => {
        const H = makeHandler();
        mockCGI._configs['col-a'] = {};
        mockService._installed['col-a'] = true;
        mockService._statusMap['col-a'] = 'RUNNING';
        let result;
        H.collectorDelete('col-a', (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assert(!mockCGI._configs['col-a'], 'config should be removed');
    },

    'returns error when collector not found': (t) => {
        const H = makeHandler();
        let result;
        H.collectorDelete('missing', (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
    },
});

// ── collectorList ────────────────────────────────────────────────────────────

runner.run('Handler: collectorList', {
    'returns list with installed and running status': (t) => {
        const H = makeHandler();
        mockCGI._configs['col-a'] = {};
        mockCGI._configs['col-b'] = {};
        mockService._installed['col-a'] = true;
        mockService._statusMap['col-a'] = 'RUNNING';
        let result;
        H.collectorList((r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.length, 2);
        const a = result.data.find((d) => d.name === 'col-a');
        const b = result.data.find((d) => d.name === 'col-b');
        t.assert(a.installed, 'col-a should be installed');
        t.assert(a.running, 'col-a should be running');
        t.assert(!b.installed, 'col-b should not be installed');
        t.assert(!b.running, 'col-b should not be running');
    },

    'returns empty list when no configs': (t) => {
        const H = makeHandler();
        let result;
        H.collectorList((r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.length, 0);
    },
});

// ── health service summary ───────────────────────────────────────────────────

runner.run('Handler: health service summary', {
    'summarizes OPC UA client services from service list': (t) => {
        const H = makeHandler();
        const executable = path.join(ROOT, 'neo-collector.js');
        mockService.listResult = [
            { status: 'RUNNING', config: { name: '_opc_col-a', executable } },
            { status: 'STOPPED', config: { name: '_opc_col-b', executable } },
            { status: 'RUNNING', config: { name: '_opc_legacy' } },
            { status: 'RUNNING', config: { name: '_rpl_other', executable: path.join(ROOT, 'other.js') } },
        ];

        let err;
        let summary;
        H.getOpcuaClientServiceSummary((e, s) => { err = e; summary = s; });

        t.assert(!err, 'should not return error');
        t.assertEqual(summary.scope, 'opcua-client');
        t.assertEqual(summary.total, 3);
        t.assertEqual(summary.running, 2);
        t.assertEqual(summary.errors.length, 0);
    },
});

// ── collectorInstall ─────────────────────────────────────────────────────────

runner.run('Handler: collectorInstall', {
    'installs service for config-only collector': (t) => {
        const H = makeHandler();
        mockCGI._configs['col-a'] = {};
        let result;
        H.collectorInstall('col-a', (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assert(mockService._installed['col-a'], 'service should be installed');
    },

    'returns error when config not found': (t) => {
        const H = makeHandler();
        let result;
        H.collectorInstall('missing', (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
    },

    'returns error when already installed': (t) => {
        const H = makeHandler();
        mockCGI._configs['col-a'] = {};
        mockService._installed['col-a'] = true;
        let result;
        H.collectorInstall('col-a', (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('already installed'));
    },
});

// ── collectorLastTime ────────────────────────────────────────────────────────

runner.run('Handler: collectorLastTime', {
    'returns null when service not installed': (t) => {
        const H = makeHandler();
        mockCGI._configs['col-a'] = {};
        mockService.missingService = true;
        let result;
        H.collectorLastTime('col-a', (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertNull(result.data.lastCollectedAt);
    },

    'returns epoch number from stored number': (t) => {
        const H = makeHandler();
        mockCGI._configs['col-a'] = {};
        mockService._installed['col-a'] = true;
        mockService._values['col-a:lastCollectedAt'] = 1712345678000;
        let result;
        H.collectorLastTime('col-a', (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.lastCollectedAt, 1712345678000);
    },

    'returns parsed epoch from string number': (t) => {
        const H = makeHandler();
        mockCGI._configs['col-a'] = {};
        mockService._installed['col-a'] = true;
        mockService._values['col-a:lastCollectedAt'] = '1712345678000';
        let result;
        H.collectorLastTime('col-a', (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.lastCollectedAt, 1712345678000);
    },

    'returns null for empty string value': (t) => {
        const H = makeHandler();
        mockCGI._configs['col-a'] = {};
        mockService._installed['col-a'] = true;
        mockService._values['col-a:lastCollectedAt'] = '';
        let result;
        H.collectorLastTime('col-a', (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertNull(result.data.lastCollectedAt);
    },

    'returns error when collector not found': (t) => {
        const H = makeHandler();
        let result;
        H.collectorLastTime('missing', (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
    },
});

// ── collectorStart / collectorStop ───────────────────────────────────────────

runner.run('Handler: collectorStart / collectorStop', {
    'start() starts installed service': (t) => {
        const H = makeHandler();
        mockCGI._configs['col-a'] = {};
        mockService._installed['col-a'] = true;
        mockService._statusMap['col-a'] = 'STOPPED';
        let result;
        H.collectorStart('col-a', (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockService._statusMap['col-a'], 'RUNNING');
    },

    'start() returns error when collector not found': (t) => {
        const H = makeHandler();
        let result;
        H.collectorStart('missing', (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
    },

    'stop() stops running service': (t) => {
        const H = makeHandler();
        mockCGI._configs['col-a'] = {};
        mockService._installed['col-a'] = true;
        mockService._statusMap['col-a'] = 'RUNNING';
        let result;
        H.collectorStop('col-a', (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockService._statusMap['col-a'], 'STOPPED');
    },

    'stop() returns error when collector not found': (t) => {
        const H = makeHandler();
        let result;
        H.collectorStop('missing', (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
    },
});

// ── serverPost / serverGet / serverPut / serverDelete / serverList ────────────

runner.run('Handler: server CRUD', {
    'serverPost creates server config': (t) => {
        const H = makeHandler();
        let result;
        H.serverPost('db1', { host: 'h', port: 5656, user: 'sys', password: 'pw' }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.name, 'db1');
        t.assertNotNull(mockCGI._servers['db1']);
    },

    'serverPost returns error when server already exists': (t) => {
        const H = makeHandler();
        mockCGI._servers['db1'] = { host: 'h' };
        let result;
        H.serverPost('db1', {}, (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('already exists'));
    },

    'serverGet returns config without password': (t) => {
        const H = makeHandler();
        mockCGI._servers['db1'] = { host: 'h', port: 5656, user: 'sys', password: 'secret' };
        let result;
        H.serverGet('db1', (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.config.password, undefined, 'password should be removed');
        t.assertEqual(result.data.config.host, 'h');
    },

    'serverGet returns error when not found': (t) => {
        const H = makeHandler();
        let result;
        H.serverGet('missing', (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
    },

    'serverPut preserves password when omitted': (t) => {
        const H = makeHandler();
        mockCGI._servers['db1'] = { host: 'h', password: 'secret' };
        let result;
        H.serverPut('db1', { host: 'h2' }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockCGI._servers['db1'].password, 'secret', 'password should be preserved');
        t.assertEqual(mockCGI._servers['db1'].host, 'h2');
    },

    'serverPut replaces password when provided': (t) => {
        const H = makeHandler();
        mockCGI._servers['db1'] = { host: 'h', password: 'old' };
        let result;
        H.serverPut('db1', { host: 'h', password: 'new' }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockCGI._servers['db1'].password, 'new');
    },

    'serverDelete removes server config': (t) => {
        const H = makeHandler();
        mockCGI._servers['db1'] = { host: 'h' };
        let result;
        H.serverDelete('db1', (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assert(!mockCGI._servers['db1'], 'server config should be removed');
    },

    'serverDelete returns error when not found': (t) => {
        const H = makeHandler();
        let result;
        H.serverDelete('missing', (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
    },

    'serverList returns all servers without passwords': (t) => {
        const H = makeHandler();
        mockCGI._servers['db1'] = { host: 'h1', password: 's1' };
        mockCGI._servers['db2'] = { host: 'h2', password: 's2' };
        let result;
        H.serverList((r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.length, 2);
        for (const item of result.data) {
            t.assertEqual(item.config.password, undefined, 'password should not be in list');
        }
    },
});

// ── opcuaServerPost / opcuaServerGet / opcuaServerPut / opcuaServerDelete / opcuaServerList ──

runner.run('Handler: OPC UA server CRUD', {
    'opcuaServerPost creates profile with default disabled security': (t) => {
        const H = makeHandler();
        let result;
        H.opcuaServerPost('opc1', { endpoint: 'opc.tcp://h:4840' }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.name, 'opc1');
        t.assertEqual(mockCGI._opcuaServers['opc1'].endpoint, 'opc.tcp://h:4840');
        t.assertEqual(mockCGI._opcuaServers['opc1'].security.enabled, false);
        t.assertEqual(mockCGI._opcuaServers['opc1'].readBatchSize, 300);
        t.assertEqual(mockCGI._opcuaServers['opc1'].capabilities.maxNodesPerRead, null);
        t.assertEqual(mockCGI._opcuaServers['opc1'].capabilities.maxNodesPerReadSource, 'default');
    },

    'opcuaServerPost stores readBatchSize and server maxNodesPerRead capability': (t) => {
        const H = makeHandler();
        let result;
        H.opcuaServerPost('opc1', {
            endpoint: 'opc.tcp://h:4840',
            readBatchSize: 16,
            capabilities: {
                maxNodesPerRead: 32,
                maxNodesPerReadSource: 'server',
                checkedAt: '2026-06-08T00:00:00.000Z',
            },
        }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockCGI._opcuaServers['opc1'].readBatchSize, 16);
        t.assertEqual(mockCGI._opcuaServers['opc1'].capabilities.maxNodesPerRead, 32);
        t.assertEqual(mockCGI._opcuaServers['opc1'].capabilities.maxNodesPerReadSource, 'server');
        t.assertEqual(mockCGI._opcuaServers['opc1'].capabilities.checkedAt, '2026-06-08T00:00:00.000Z');
    },

    'opcuaServerPost allows any readBatchSize when server maxNodesPerRead is unlimited': (t) => {
        const H = makeHandler();
        let result;
        H.opcuaServerPost('opc1', {
            endpoint: 'opc.tcp://h:4840',
            readBatchSize: 1000,
            capabilities: {
                maxNodesPerRead: 0,
                maxNodesPerReadSource: 'server',
            },
        }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockCGI._opcuaServers['opc1'].readBatchSize, 1000);
        t.assertEqual(mockCGI._opcuaServers['opc1'].capabilities.maxNodesPerRead, 0);
        t.assertEqual(mockCGI._opcuaServers['opc1'].capabilities.maxNodesPerReadSource, 'server');
    },

    'opcuaServerPost rejects readBatchSize greater than maxNodesPerRead': (t) => {
        const H = makeHandler();
        let result;
        H.opcuaServerPost('opc1', {
            endpoint: 'opc.tcp://h:4840',
            readBatchSize: 33,
            capabilities: {
                maxNodesPerRead: 32,
                maxNodesPerReadSource: 'server',
            },
        }, (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('readBatchSize must be <= 32'));
    },

    'opcuaServerPost treats null maxNodesPerRead as unlimited but preserves null': (t) => {
        const H = makeHandler();
        let result;
        H.opcuaServerPost('opc1', {
            endpoint: 'opc.tcp://h:4840',
            readBatchSize: 1000,
            capabilities: {
                maxNodesPerRead: null,
                maxNodesPerReadSource: 'default',
            },
        }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockCGI._opcuaServers['opc1'].readBatchSize, 1000);
        t.assertEqual(mockCGI._opcuaServers['opc1'].capabilities.maxNodesPerRead, null);
        t.assertEqual(mockCGI._opcuaServers['opc1'].capabilities.maxNodesPerReadSource, 'default');
    },

    'opcuaServerPost treats maxNodesPerRead zero as unlimited': (t) => {
        const H = makeHandler();
        let result;
        H.opcuaServerPost('opc1', {
            endpoint: 'opc.tcp://h:4840',
            readBatchSize: 1000,
            capabilities: {
                maxNodesPerRead: 0,
                maxNodesPerReadSource: 'server',
            },
        }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockCGI._opcuaServers['opc1'].readBatchSize, 1000);
        t.assertEqual(mockCGI._opcuaServers['opc1'].capabilities.maxNodesPerRead, 0);
        t.assertEqual(mockCGI._opcuaServers['opc1'].capabilities.maxNodesPerReadSource, 'server');
    },

    'opcuaServerPost stores username auth and masks password on get': (t) => {
        const H = makeHandler();
        let result;
        H.opcuaServerPost('opc1', {
            endpoint: 'opc.tcp://h:4840',
            security: {
                enabled: true,
                securityPolicy: 'None',
                messageSecurityMode: 'None',
                authMode: 'UserName',
                username: 'user1',
                password: 'secret',
            },
        }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockCGI._opcuaServers['opc1'].security.password, 'secret');

        H.opcuaServerGet('opc1', (r) => { result = r; });
        t.assert(result.ok, 'get should be ok');
        t.assertEqual(result.data.config.security.password, undefined, 'password should be masked');
        t.assertEqual(result.data.config.security.hasPassword, true);
        t.assertEqual(result.data.config.security.username, 'user1');
    },

    'opcuaServerPost stores certificate files for secure mode and masks paths': (t) => {
        const H = makeHandler();
        let result;
        H.opcuaServerPost('opc1', {
            endpoint: 'opc.tcp://h:4840',
            security: {
                enabled: true,
                securityPolicy: 'Basic256Sha256',
                messageSecurityMode: 'SignAndEncrypt',
                authMode: 'Anonymous',
                certificatePem: '-----BEGIN CERTIFICATE-----\nmock\n-----END CERTIFICATE-----\n',
                keyPem: '-----BEGIN PRIVATE KEY-----\nmock\n-----END PRIVATE KEY-----\n',
            },
        }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockCGI._opcuaCredentialWrites['opc1'].certificatePem.includes('BEGIN CERTIFICATE'), true);
        t.assertEqual(mockCGI._opcuaServers['opc1'].security.certificateFile, '/mock/opcua-certs/opc1/client_cert.pem');

        H.opcuaServerGet('opc1', (r) => { result = r; });
        t.assert(result.ok, 'get should be ok');
        t.assertEqual(result.data.config.security.certificateFile, undefined, 'certificate path should be masked');
        t.assertEqual(result.data.config.security.keyFile, undefined, 'key path should be masked');
        t.assertEqual(result.data.config.security.hasCertificateFile, true);
        t.assertEqual(result.data.config.security.hasKeyFile, true);
        t.assertEqual(result.data.config.security.certificateUpdatedAt, '2026-06-05T06:00:00.000Z');
        t.assertEqual(result.data.config.security.keyUpdatedAt, '2026-06-05T06:00:01.000Z');
    },

    'opcuaServerPost rejects certificate auth mode': (t) => {
        const H = makeHandler();
        let result;
        H.opcuaServerPost('opc1', {
            endpoint: 'opc.tcp://h:4840',
            security: {
                enabled: true,
                securityPolicy: 'Basic256Sha256',
                messageSecurityMode: 'SignAndEncrypt',
                authMode: 'Certificate',
                certificatePem: '-----BEGIN CERTIFICATE-----\nmock\n-----END CERTIFICATE-----\n',
                keyPem: '-----BEGIN PRIVATE KEY-----\nmock\n-----END PRIVATE KEY-----\n',
            },
        }, (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('security.authMode is invalid'));
    },

    'opcuaServerPost returns error when profile already exists': (t) => {
        const H = makeHandler();
        mockCGI._opcuaServers['opc1'] = { endpoint: 'opc.tcp://h:4840', security: { enabled: false } };
        let result;
        H.opcuaServerPost('opc1', { endpoint: 'opc.tcp://h2:4840' }, (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('already exists'));
    },

    'opcuaServerGet normalizes missing security': (t) => {
        const H = makeHandler();
        mockCGI._opcuaServers['opc1'] = { endpoint: 'opc.tcp://h:4840' };
        let result;
        H.opcuaServerGet('opc1', (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.config.security.enabled, false);
    },

    'opcuaServerPut updates profile': (t) => {
        const H = makeHandler();
        mockCGI._opcuaServers['opc1'] = { endpoint: 'opc.tcp://h:4840', security: { enabled: false } };
        let result;
        H.opcuaServerPut('opc1', { endpoint: 'opc.tcp://h2:4840', security: { enabled: true } }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockCGI._opcuaServers['opc1'].endpoint, 'opc.tcp://h2:4840');
        t.assertEqual(mockCGI._opcuaServers['opc1'].security.enabled, true);
    },

    'opcuaServerPut preserves readBatchSize and capability for same endpoint': (t) => {
        const H = makeHandler();
        mockCGI._opcuaServers['opc1'] = {
            endpoint: 'opc.tcp://h:4840',
            readBatchSize: 16,
            capabilities: {
                maxNodesPerRead: 64,
                maxNodesPerReadSource: 'server',
                checkedAt: '2026-06-08T00:00:00.000Z',
            },
            security: { enabled: false },
        };
        let result;
        H.opcuaServerPut('opc1', { endpoint: 'opc.tcp://h:4840', security: { enabled: false } }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockCGI._opcuaServers['opc1'].readBatchSize, 16);
        t.assertEqual(mockCGI._opcuaServers['opc1'].capabilities.maxNodesPerRead, 64);
        t.assertEqual(mockCGI._opcuaServers['opc1'].capabilities.maxNodesPerReadSource, 'server');
    },

    'opcuaServerPut resets readBatchSize and capability for changed endpoint': (t) => {
        const H = makeHandler();
        mockCGI._opcuaServers['opc1'] = {
            endpoint: 'opc.tcp://h:4840',
            readBatchSize: 16,
            capabilities: {
                maxNodesPerRead: 64,
                maxNodesPerReadSource: 'server',
                checkedAt: '2026-06-08T00:00:00.000Z',
            },
            security: { enabled: false },
        };
        let result;
        H.opcuaServerPut('opc1', { endpoint: 'opc.tcp://h2:4840', security: { enabled: false } }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockCGI._opcuaServers['opc1'].readBatchSize, 300);
        t.assertEqual(mockCGI._opcuaServers['opc1'].capabilities.maxNodesPerRead, null);
        t.assertEqual(mockCGI._opcuaServers['opc1'].capabilities.maxNodesPerReadSource, 'default');
    },

    'opcuaServerPut preserves existing secret fields when omitted': (t) => {
        const H = makeHandler();
        mockCGI._opcuaServers['opc1'] = {
            endpoint: 'opc.tcp://h:4840',
            security: {
                enabled: true,
                securityPolicy: 'Basic256',
                messageSecurityMode: 'Sign',
                authMode: 'UserName',
                username: 'user1',
                password: 'old-secret',
                certificateFile: '/old/client_cert.pem',
                keyFile: '/old/client_key.pem',
            },
        };
        let result;
        H.opcuaServerPut('opc1', {
            endpoint: 'opc.tcp://h2:4840',
            security: {
                enabled: true,
                securityPolicy: 'Basic256',
                messageSecurityMode: 'Sign',
                authMode: 'UserName',
                username: 'user2',
            },
        }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockCGI._opcuaServers['opc1'].security.password, 'old-secret');
        t.assertEqual(mockCGI._opcuaServers['opc1'].security.certificateFile, '/old/client_cert.pem');
        t.assertEqual(mockCGI._opcuaServers['opc1'].security.username, 'user2');
    },

    'opcuaServerPost rejects secure mode without certificate files': (t) => {
        const H = makeHandler();
        let result;
        H.opcuaServerPost('opc1', {
            endpoint: 'opc.tcp://h:4840',
            security: {
                enabled: true,
                securityPolicy: 'Basic256',
                messageSecurityMode: 'Sign',
                authMode: 'Anonymous',
            },
        }, (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('certificatePem'));
    },

    'opcuaServerDelete removes profile': (t) => {
        const H = makeHandler();
        mockCGI._opcuaServers['opc1'] = { endpoint: 'opc.tcp://h:4840' };
        let result;
        H.opcuaServerDelete('opc1', (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assert(!mockCGI._opcuaServers['opc1'], 'profile should be removed');
        t.assertEqual(mockCGI._opcuaCredentialRemoves[0], 'opc1');
    },

    'opcuaServerList returns sorted profiles': (t) => {
        const H = makeHandler();
        mockCGI._opcuaServers['opc-b'] = { endpoint: 'opc.tcp://b:4840' };
        mockCGI._opcuaServers['opc-a'] = { endpoint: 'opc.tcp://a:4840' };
        let result;
        H.opcuaServerList((r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.length, 2);
        t.assertEqual(result.data[0].name, 'opc-a');
        t.assertEqual(result.data[1].name, 'opc-b');
        t.assertEqual(result.data[0].config.readBatchSize, 300);
    },
});

// ── dbConnect ─────────────────────────────────────────────────────────────────

runner.run('Handler: dbConnect', {
    'returns connected info on success': (t) => {
        const H = makeHandler();
        let result;
        H.dbConnect({ host: 'localhost', port: 5656, user: 'sys', password: 'pw' }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assert(result.data.connected);
        t.assertEqual(result.data.host, 'localhost');
        t.assert(mockMachbaseClient.closed, 'client should be closed');
    },

    'returns error on connect failure': (t) => {
        const H = makeHandler();
        mockMachbaseClient.connectError = 'connection refused';
        let result;
        H.dbConnect({ host: 'bad', port: 1, user: 'u', password: 'p' }, (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('connection refused'));
        t.assert(mockMachbaseClient.closed, 'client should be closed even on error');
    },
});

// ── dbTableCreate ─────────────────────────────────────────────────────────────

runner.run('Handler: dbTableCreate', {
    'creates table and returns ok': (t) => {
        const H = makeHandler();
        let result;
        H.dbTableCreate({ host: 'h', port: 5656, user: 'u', password: 'p', table: 'TAG' }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assert(result.data.created);
        t.assert(mockMachbaseClient.closed, 'client should be closed');
    },

    'returns error when table already exists': (t) => {
        const H = makeHandler();
        mockMachbaseClient.tableType = 'TAG';
        let result;
        H.dbTableCreate({ host: 'h', port: 5656, user: 'u', password: 'p', table: 'TAG' }, (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('already exists'));
    },
});

// ── dbTableList ───────────────────────────────────────────────────────────────

runner.run('Handler: dbTableList', {
    'returns TAG tables with user name': (t) => {
        const H = makeHandler();
        mockMachbaseClient.users = [
            { USER_ID: 1, NAME: 'SYS' },
            { USER_ID: 2, NAME: 'ADMIN' },
        ];
        mockMachbaseClient.tables = [
            { NAME: 'TAG1', TYPE: 6, ID: 10, USER_ID: 1 },
            { NAME: 'TAG2', TYPE: 6, ID: 11, USER_ID: 2 },
            { NAME: 'LOG1', TYPE: 0, ID: 12, USER_ID: 1 },
        ];
        let result;
        H.dbTableList({ host: 'h', port: 5656, user: 'SYS', password: 'pw' }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.length, 2, 'only TAG tables');
        t.assertEqual(result.data[0].name, 'TAG1');
        t.assertEqual(result.data[0].user, 'SYS');
        t.assertEqual(result.data[1].name, 'TAG2');
        t.assertEqual(result.data[1].user, 'ADMIN');
        t.assert(mockMachbaseClient.closed, 'client should be closed');
    },

    'returns error when user not found': (t) => {
        const H = makeHandler();
        mockMachbaseClient.users = [{ USER_ID: 1, NAME: 'SYS' }];
        let result;
        H.dbTableList({ host: 'h', port: 5656, user: 'UNKNOWN', password: 'pw' }, (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('not found'));
    },

    'returns null user when USER_ID has no match': (t) => {
        const H = makeHandler();
        mockMachbaseClient.users = [{ USER_ID: 1, NAME: 'SYS' }];
        mockMachbaseClient.tables = [
            { NAME: 'TAG1', TYPE: 6, ID: 10, USER_ID: 99 },
        ];
        let result;
        H.dbTableList({ host: 'h', port: 5656, user: 'SYS', password: 'pw' }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertNull(result.data[0].user, 'user should be null when USER_ID unresolvable');
    },
});

// ── dbTableColumns ────────────────────────────────────────────────────────────

runner.run('Handler: dbTableColumns', {
    'returns columns for existing TAG table': (t) => {
        const H = makeHandler();
        mockMachbaseClient.users = [{ USER_ID: 1, NAME: 'SYS' }];
        mockMachbaseClient.tableMeta = { ID: 10, TYPE: 6, NAME: 'TAG' };
        mockMachbaseClient.columns = [
            { NAME: 'NAME', TYPE: 5, ID: 0, FLAG: 0x8000000, LENGTH: 100 },
            { NAME: 'TIME', TYPE: 6, ID: 1, FLAG: 0x1000000, LENGTH: 0 },
            { NAME: 'VALUE', TYPE: 20, ID: 2, FLAG: 0x2000000, LENGTH: 0 },
        ];
        let result;
        H.dbTableColumns({ host: 'h', port: 5656, user: 'SYS', password: 'p' }, 'TAG', (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.table, 'TAG');
        t.assertEqual(result.data.columns.length, 3);
        t.assert(result.data.columns[0].primaryKey, 'NAME should be primary key');
        t.assert(result.data.columns[1].basetime, 'TIME should be basetime');
        t.assert(result.data.columns[2].summarized, 'VALUE should be summarized');
        t.assert(mockMachbaseClient.closed, 'client should be closed');
    },

    'returns error when user not found': (t) => {
        const H = makeHandler();
        mockMachbaseClient.users = [{ USER_ID: 1, NAME: 'SYS' }];
        let result;
        H.dbTableColumns({ host: 'h', port: 5656, user: 'UNKNOWN', password: 'p' }, 'TAG', (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('not found'));
    },

    'returns error when table not found': (t) => {
        const H = makeHandler();
        mockMachbaseClient.users = [{ USER_ID: 1, NAME: 'SYS' }];
        mockMachbaseClient.tableMeta = null;
        let result;
        H.dbTableColumns({ host: 'h', port: 5656, user: 'SYS', password: 'p' }, 'MISSING', (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('not found'));
    },

    'returns error when table is not a TAG table': (t) => {
        const H = makeHandler();
        mockMachbaseClient.users = [{ USER_ID: 1, NAME: 'SYS' }];
        mockMachbaseClient.tableMeta = { ID: 12, TYPE: 0, NAME: 'LOG1' };
        let result;
        H.dbTableColumns({ host: 'h', port: 5656, user: 'SYS', password: 'p' }, 'LOG1', (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('is not a TAG table'));
    },
});

// ── dbTableTags ──────────────────────────────────────────────────────────────

runner.run('Handler: dbTableTags', {
    'returns tag names from TAG metadata when collector nodes are empty': (t) => {
        const H = makeHandler();
        mockMachbaseClient.users = [{ USER_ID: 1, NAME: 'SYS' }];
        mockMachbaseClient.tableMeta = { ID: 10, TYPE: 6, NAME: 'TAG' };
        mockMachbaseClient.queryResults = [
            [],
            [
                { _ID: 1, NAME: 'sensor.a' },
                { _ID: 2, name: 'sensor.b' },
            ],
        ];

        let result;
        H.dbTableTags({
            host: 'h',
            port: 5656,
            user: 'sys',
            password: 'p',
        }, {
            table: 'TAG',
        }, (r) => { result = r; });

        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.table, 'TAG');
        t.assertEqual(result.data.tags.length, 2);
        t.assertEqual(result.data.tags[0].name, 'sensor.a');
        t.assertEqual(result.data.tags[1].name, 'sensor.b');
        t.assert(mockMachbaseClient.closed, 'client should be closed');
    },

    'returns asset hierarchy using column declared in hierarchy row': (t) => {
        const H = makeHandler();
        mockMachbaseClient.users = [{ USER_ID: 1, NAME: 'SYS' }];
        mockMachbaseClient.tableMeta = { ID: 10, TYPE: 6, NAME: 'TAG' };
        mockMachbaseClient.columns = [
            { NAME: 'ASSET_PATH', TYPE: 0, ID: 3, FLAG: 0x4000000, LENGTH: 0 },
        ];
        mockMachbaseClient.queryResults = [
            [
                {
                    _ID: 1,
                    NAME: '__machbase_hierarchy__',
                    ASSET_PATH: JSON.stringify({
                        column: 'asset_path',
                        schema: ['country', 'city'],
                        tree: [{ key: 'country', value: 'Korea', children: [] }],
                    }),
                },
            ],
            [
                {
                    _ID: 1,
                    NAME: '__machbase_hierarchy__',
                    ASSET_PATH: JSON.stringify({ column: 'asset_path', schema: ['country'], tree: [] }),
                },
                {
                    _ID: 2,
                    NAME: 'sensor.a',
                    ASSET_PATH: '{"country":"Korea","city":"Seoul"}',
                },
            ],
        ];

        let result;
        H.dbTableTags({
            host: 'h',
            port: 5656,
            user: 'sys',
            password: 'p',
        }, {
            table: 'TAG',
        }, (r) => { result = r; });

        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.tags.length, 1);
        t.assertEqual(result.data.tags[0].name, 'sensor.a');
        t.assertEqual(result.data.tags[0].asset.city, 'Seoul');
        t.assertEqual(result.data.assetHierarchy.column, 'asset_path');
        t.assertEqual(result.data.assetHierarchy.schema[0], 'country');
        t.assertEqual(result.data.assetHierarchy.tree[0].value, 'Korea');
        t.assert(
            mockMachbaseClient.queries.some((q) => q.sql.includes('SELECT _ID, NAME, ASSET_PATH')),
            'should query the hierarchy-declared metadata column'
        );
    },

    'returns asset hierarchy when declared column is asset': (t) => {
        const H = makeHandler();
        mockMachbaseClient.users = [{ USER_ID: 1, NAME: 'SYS' }];
        mockMachbaseClient.tableMeta = { ID: 10, TYPE: 6, NAME: 'TAG' };
        mockMachbaseClient.columns = [
            { NAME: 'ASSET', TYPE: 0, ID: 3, FLAG: 0x4000000, LENGTH: 0 },
        ];
        mockMachbaseClient.queryResults = [
            [
                {
                    _ID: 1,
                    NAME: '__machbase_hierarchy__',
                    ASSET: JSON.stringify({
                        column: 'asset',
                        schema: ['country', 'city'],
                        tree: [{ key: 'country', value: 'Korea', children: [] }],
                    }),
                },
            ],
            [
                {
                    _ID: 1,
                    NAME: '__machbase_hierarchy__',
                    ASSET: JSON.stringify({ column: 'asset', schema: ['country'], tree: [] }),
                },
                {
                    _ID: 2,
                    NAME: 'sensor.a',
                    ASSET: '{"country":"Korea","city":"Seoul"}',
                },
            ],
        ];

        let result;
        H.dbTableTags({
            host: 'h',
            port: 5656,
            user: 'sys',
            password: 'p',
        }, {
            table: 'TAG',
        }, (r) => { result = r; });

        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.assetHierarchy.column, 'asset');
        t.assertEqual(result.data.tags[0].asset.country, 'Korea');
        t.assert(
            mockMachbaseClient.queries.some((q) => q.sql.includes('SELECT _ID, NAME, ASSET')),
            'should query the asset metadata column'
        );
    },

    'defaults hierarchy column to asset when column key is omitted': (t) => {
        const H = makeHandler();
        mockMachbaseClient.users = [{ USER_ID: 1, NAME: 'SYS' }];
        mockMachbaseClient.tableMeta = { ID: 10, TYPE: 6, NAME: 'TAG' };
        mockMachbaseClient.columns = [
            { NAME: 'ASSET', TYPE: 0, ID: 3, FLAG: 0x4000000, LENGTH: 0 },
        ];
        mockMachbaseClient.queryResults = [
            [
                {
                    _ID: 1,
                    NAME: '__machbase_hierarchy__',
                    ASSET: JSON.stringify({
                        schema: ['country', 'city'],
                        tree: [{ key: 'country', value: 'Korea', children: [] }],
                    }),
                },
            ],
            [
                {
                    _ID: 1,
                    NAME: '__machbase_hierarchy__',
                    ASSET: JSON.stringify({ schema: ['country'], tree: [] }),
                },
                {
                    _ID: 2,
                    NAME: 'sensor.a',
                    ASSET: '{"country":"Korea","city":"Seoul"}',
                },
            ],
        ];

        let result;
        H.dbTableTags({
            host: 'h',
            port: 5656,
            user: 'sys',
            password: 'p',
        }, {
            table: 'TAG',
        }, (r) => { result = r; });

        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.assetHierarchy.column, 'asset');
        t.assertEqual(result.data.tags[0].asset.city, 'Seoul');
        t.assert(
            mockMachbaseClient.queries.some((q) => q.sql.includes('SELECT _ID, NAME, ASSET')),
            'should query the default asset metadata column'
        );
    },

    'finds hierarchy JSON among multiple metadata JSON columns': (t) => {
        const H = makeHandler();
        mockMachbaseClient.users = [{ USER_ID: 1, NAME: 'SYS' }];
        mockMachbaseClient.tableMeta = { ID: 10, TYPE: 6, NAME: 'TAG' };
        mockMachbaseClient.columns = [
            { NAME: 'SPEC', TYPE: 0, ID: 3, FLAG: 0x4000000, LENGTH: 0 },
            { NAME: 'ASSET', TYPE: 0, ID: 4, FLAG: 0x4000000, LENGTH: 0 },
        ];
        mockMachbaseClient.queryResults = [
            [
                {
                    _ID: 1,
                    NAME: '__machbase_hierarchy__',
                    SPEC: '{"unit":"C"}',
                    ASSET: JSON.stringify({
                        schema: ['country', 'city'],
                        tree: [{ key: 'country', value: 'Korea', children: [] }],
                    }),
                },
            ],
            [
                {
                    _ID: 1,
                    NAME: '__machbase_hierarchy__',
                    ASSET: JSON.stringify({ schema: ['country'], tree: [] }),
                },
                {
                    _ID: 2,
                    NAME: 'sensor.a',
                    ASSET: '{"country":"Korea","city":"Seoul"}',
                },
            ],
        ];

        let result;
        H.dbTableTags({
            host: 'h',
            port: 5656,
            user: 'sys',
            password: 'p',
        }, {
            table: 'TAG',
        }, (r) => { result = r; });

        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.assetHierarchy.column, 'asset');
        t.assertEqual(result.data.assetHierarchy.schema[0], 'country');
        t.assertEqual(result.data.tags[0].asset.country, 'Korea');
    },

    'uses first valid hierarchy JSON when multiple candidates exist': (t) => {
        const H = makeHandler();
        mockMachbaseClient.users = [{ USER_ID: 1, NAME: 'SYS' }];
        mockMachbaseClient.tableMeta = { ID: 10, TYPE: 6, NAME: 'TAG' };
        mockMachbaseClient.columns = [
            { NAME: 'ASSET', TYPE: 0, ID: 3, FLAG: 0x4000000, LENGTH: 0 },
            { NAME: 'ASSET_PATH', TYPE: 0, ID: 4, FLAG: 0x4000000, LENGTH: 0 },
        ];
        mockMachbaseClient.queryResults = [
            [
                {
                    _ID: 1,
                    NAME: '__machbase_hierarchy__',
                    ASSET: JSON.stringify({
                        schema: ['country', 'city'],
                        tree: [
                            {
                                key: 'country',
                                value: 'Korea',
                                children: [],
                            },
                        ],
                    }),
                    ASSET_PATH: JSON.stringify({
                        column: 'asset_path',
                        schema: ['site', 'line'],
                        tree: [
                            {
                                key: 'site',
                                value: 'Plant-A',
                                children: [],
                            },
                        ],
                    }),
                },
            ],
            [
                {
                    _ID: 1,
                    NAME: '__machbase_hierarchy__',
                    ASSET: JSON.stringify({ schema: ['country', 'city'], tree: [] }),
                },
                {
                    _ID: 2,
                    NAME: 'sensor.a',
                    ASSET: '{"country":"Korea","city":"Seoul"}',
                },
            ],
        ];

        let result;
        H.dbTableTags({
            host: 'h',
            port: 5656,
            user: 'sys',
            password: 'p',
        }, {
            table: 'TAG',
        }, (r) => { result = r; });

        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.assetHierarchy.column, 'asset');
        t.assertEqual(result.data.assetHierarchy.schema[0], 'country');
        t.assert(
            mockMachbaseClient.queries.some((q) => q.sql.includes('SELECT _ID, NAME, ASSET FROM')),
            'should query the first valid hierarchy column'
        );
    },

    'accepts hierarchy JSON with leading whitespace': (t) => {
        const H = makeHandler();
        mockMachbaseClient.users = [{ USER_ID: 1, NAME: 'SYS' }];
        mockMachbaseClient.tableMeta = { ID: 10, TYPE: 6, NAME: 'TAG' };
        mockMachbaseClient.columns = [
            { NAME: 'ASSET', TYPE: 0, ID: 3, FLAG: 0x4000000, LENGTH: 0 },
        ];
        mockMachbaseClient.queryResults = [
            [
                {
                    _ID: 1,
                    NAME: '__machbase_hierarchy__',
                    ASSET: `  ${JSON.stringify({
                        schema: ['country', 'city'],
                        tree: [
                            {
                                key: 'country',
                                value: 'Korea',
                                children: [],
                            },
                        ],
                    })}`,
                },
            ],
            [
                {
                    _ID: 1,
                    NAME: '__machbase_hierarchy__',
                    ASSET: JSON.stringify({ schema: ['country', 'city'], tree: [] }),
                },
                {
                    _ID: 2,
                    NAME: 'sensor.a',
                    ASSET: '{"country":"Korea","city":"Seoul"}',
                },
            ],
        ];

        let result;
        H.dbTableTags({
            host: 'h',
            port: 5656,
            user: 'sys',
            password: 'p',
        }, {
            table: 'TAG',
        }, (r) => { result = r; });

        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.assetHierarchy.column, 'asset');
        t.assertEqual(result.data.assetHierarchy.schema[0], 'country');
    },

    'ignores hierarchy row when declared column does not exist': (t) => {
        const H = makeHandler();
        mockMachbaseClient.users = [{ USER_ID: 1, NAME: 'SYS' }];
        mockMachbaseClient.tableMeta = { ID: 10, TYPE: 6, NAME: 'TAG' };
        mockMachbaseClient.columns = [
            { NAME: 'ASSET', TYPE: 0, ID: 3, FLAG: 0x4000000, LENGTH: 0 },
        ];
        mockMachbaseClient.queryResults = [
            [
                {
                    _ID: 1,
                    NAME: '__machbase_hierarchy__',
                    ASSET: JSON.stringify({
                        column: 'asset_path',
                        schema: ['country'],
                        tree: [{ key: 'country', value: 'Korea', children: [] }],
                    }),
                },
            ],
            [
                { _ID: 1, NAME: '__machbase_hierarchy__' },
                { _ID: 2, NAME: 'sensor.a' },
            ],
        ];

        let result;
        H.dbTableTags({
            host: 'h',
            port: 5656,
            user: 'sys',
            password: 'p',
        }, {
            table: 'TAG',
        }, (r) => { result = r; });

        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.assetHierarchy, null);
        t.assertEqual(result.data.tags.length, 1);
        t.assertEqual(result.data.tags[0].asset, undefined);
        t.assert(
            mockMachbaseClient.queries.some((q) => q.sql.includes('SELECT _ID, NAME FROM')),
            'should not query a missing metadata column'
        );
    },

    'returns null asset hierarchy for invalid hierarchy metadata': (t) => {
        const H = makeHandler();
        mockMachbaseClient.users = [{ USER_ID: 1, NAME: 'SYS' }];
        mockMachbaseClient.tableMeta = { ID: 10, TYPE: 6, NAME: 'TAG' };
        mockMachbaseClient.columns = [
            { NAME: 'ASSET', TYPE: 0, ID: 3, FLAG: 0x4000000, LENGTH: 0 },
        ];
        mockMachbaseClient.queryResults = [
            [
                { _ID: 1, NAME: '__machbase_hierarchy__', ASSET: '{"world":{"city":{}}}' },
            ],
            [
                { _ID: 1, NAME: '__machbase_hierarchy__', ASSET: '{"world":{"city":{}}}' },
                { _ID: 2, NAME: 'sensor.a', ASSET: '{"country":"Korea"}' },
            ],
        ];

        let result;
        H.dbTableTags({
            host: 'h',
            port: 5656,
            user: 'sys',
            password: 'p',
        }, {
            table: 'TAG',
        }, (r) => { result = r; });

        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.assetHierarchy, null);
        t.assertEqual(result.data.tags.length, 1);
    },
});

// ── dbTableData ──────────────────────────────────────────────────────────────

runner.run('Handler: dbTableData', {
    'returns latest raw rows with backward scan and current page metadata': (t) => {
        const H = makeHandler();
        mockMachbaseClient.users = [{ USER_ID: 1, NAME: 'SYS' }];
        mockMachbaseClient.tableMeta = { ID: 10, TYPE: 6, NAME: 'TAG' };
        mockMachbaseClient.queryResults = [
            [
                {
                    TIME: new Date('2026-06-01T00:02:00Z'),
                    NAME: 'sensor.a',
                    VALUE: 12.5,
                    STR_VALUE: 'running',
                    QUALITY: 'GOOD',
                    buffer: ['internal'],
                    names: ['TIME', 'NAME', 'VALUE'],
                },
                { TIME: new Date('2026-06-01T00:01:00Z'), NAME: 'sensor.a', VALUE: 11.5 },
                { TIME: new Date('2026-06-01T00:00:00Z'), NAME: 'sensor.a', VALUE: 10.5 },
            ],
        ];

        let result;
        H.dbTableData({
            host: 'h',
            port: 5656,
            user: 'SYS',
            password: 'p',
        }, {
            table: 'TAG',
            name: 'sensor.a',
            valueColumn: 'VALUE',
            direction: 'latest',
            page: 1,
            pageSize: 2,
        }, (r) => { result = r; });

        t.assert(result.ok, 'should be ok');
        t.assert(!Object.prototype.hasOwnProperty.call(result.data, 'total'), 'total should not be calculated');
        t.assertEqual(result.data.page, 1);
        t.assertEqual(result.data.pageSize, 2);
        t.assertEqual(result.data.rows.length, 2, 'should return current page rows only');
        t.assertEqual(result.data.rows[0].name, 'sensor.a');
        t.assertEqual(result.data.rows[0].value, 12.5);
        t.assertEqual(result.data.rows[0].str_value, 'running');
        t.assertEqual(result.data.rows[0].quality, 'GOOD');
        t.assert(!Object.prototype.hasOwnProperty.call(result.data.rows[0], 'buffer'), 'internal row buffer should not be returned');
        t.assert(!Object.prototype.hasOwnProperty.call(result.data.rows[0], 'names'), 'internal row names should not be returned');
        t.assertEqual(mockMachbaseClient.queries.length, 1, 'should not run count query');
        t.assert(mockMachbaseClient.queries[0].sql.includes('SELECT /*+ SCAN_BACKWARD(TAG) */ *'), 'raw query should select every table field');
        t.assert(mockMachbaseClient.queries[0].sql.includes('SCAN_BACKWARD(TAG)'), 'latest should scan backward');
        t.assert(mockMachbaseClient.queries[0].sql.includes('ORDER BY TIME DESC'), 'latest should sort newest first');
        t.assertEqual(mockMachbaseClient.queries[0].values[0], 'sensor.a');
        t.assertEqual(mockMachbaseClient.queries[0].values[1], 2, 'first page fetch limit should equal page size');
        t.assert(mockMachbaseClient.closed, 'client should be closed');
    },

    'returns oldest raw rows with forward scan and time range': (t) => {
        const H = makeHandler();
        mockMachbaseClient.users = [{ USER_ID: 1, NAME: 'SYS' }];
        mockMachbaseClient.tableMeta = { ID: 10, TYPE: 6, NAME: 'TAG' };
        mockMachbaseClient.queryResults = [
            [{ TIME: new Date('2026-06-01T00:00:00Z'), NAME: 'sensor.a', VALUE: 10.5 }],
        ];

        let result;
        H.dbTableData({
            host: 'h',
            port: 5656,
            user: 'SYS',
            password: 'p',
        }, {
            table: 'TAG',
            name: 'sensor.a',
            valueColumn: 'VALUE',
            direction: 'oldest',
            from: '2026-06-01T00:00:00.000Z',
            to: '2026-06-01T00:30:00.000Z',
            page: 2,
            pageSize: 100,
        }, (r) => { result = r; });

        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockMachbaseClient.queries.length, 1, 'should not run count query');
        t.assert(mockMachbaseClient.queries[0].sql.includes('SCAN_FORWARD(TAG)'), 'oldest should scan forward');
        t.assert(mockMachbaseClient.queries[0].sql.includes('TIME >= ?'), 'from time should be applied');
        t.assert(mockMachbaseClient.queries[0].sql.includes('TIME <= ?'), 'to time should be applied');
        t.assert(mockMachbaseClient.queries[0].sql.includes('ORDER BY TIME ASC'), 'oldest should sort oldest first');
        t.assert(mockMachbaseClient.queries[0].values[1] instanceof Date, 'from should be bound as Date');
        t.assert(mockMachbaseClient.queries[0].values[2] instanceof Date, 'to should be bound as Date');
        t.assertEqual(mockMachbaseClient.queries[0].values[3], 200, 'second page fetches offset plus page size');
    },

    'matches db user case-insensitively': (t) => {
        const H = makeHandler();
        mockMachbaseClient.users = [{ USER_ID: 1, NAME: 'SYS' }];
        mockMachbaseClient.tableMeta = { ID: 10, TYPE: 6, NAME: 'TAG' };
        mockMachbaseClient.queryResults = [
            [{ ROW_COUNT: 0 }],
            [],
        ];

        let result;
        H.dbTableData({
            host: 'h',
            port: 5656,
            user: 'sys',
            password: 'p',
        }, {
            table: 'TAG',
            name: 'sensor.a',
            valueColumn: 'VALUE',
        }, (r) => { result = r; });

        t.assert(result.ok, 'should be ok');
    },

    'returns total from tag stat view for end-page navigation': (t) => {
        const H = makeHandler();
        mockMachbaseClient.users = [{ USER_ID: 1, NAME: 'SYS' }];
        mockMachbaseClient.tableMeta = { ID: 10, TYPE: 6, NAME: 'TAG' };
        mockMachbaseClient.queryResults = [[{ ROW_COUNT: 245 }]];

        let result;
        H.dbTableDataTotal({
            host: 'h',
            port: 5656,
            user: 'SYS',
            password: 'p',
        }, {
            table: 'TAG',
            name: 'sensor.a',
            pageSize: 100,
        }, (r) => { result = r; });

        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.total, 245);
        t.assertEqual(result.data.lastPage, 3);
        t.assert(mockMachbaseClient.queries[0].sql.includes('V$TAG_STAT'), 'should use tag stat view');
        t.assertEqual(mockMachbaseClient.queries[0].values[0], 'sensor.a');
    },

    'returns filtered total with count when time range is set': (t) => {
        const H = makeHandler();
        mockMachbaseClient.users = [{ USER_ID: 1, NAME: 'SYS' }];
        mockMachbaseClient.tableMeta = { ID: 10, TYPE: 6, NAME: 'TAG' };
        mockMachbaseClient.queryResults = [[{ ROW_COUNT: 45 }]];

        let result;
        H.dbTableDataTotal({
            host: 'h',
            port: 5656,
            user: 'SYS',
            password: 'p',
        }, {
            table: 'TAG',
            name: 'sensor.a',
            from: '2026-06-01T00:00:00.000Z',
            to: '2026-06-01T00:30:00.000Z',
            pageSize: 20,
        }, (r) => { result = r; });

        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.total, 45);
        t.assertEqual(result.data.lastPage, 3);
        t.assert(mockMachbaseClient.queries[0].sql.includes('COUNT(*)'), 'time range should use filtered count');
        t.assert(mockMachbaseClient.queries[0].sql.includes('TIME >= ?'), 'from time should be applied');
        t.assert(mockMachbaseClient.queries[0].sql.includes('TIME <= ?'), 'to time should be applied');
    },
});

// ── opcuaConnect ──────────────────────────────────────────────────────────────

runner.run('Handler: opcuaConnect', {
    'returns connected true on success': (t) => {
        const H = makeHandler();
        let result;
        H.opcuaConnect('opc.tcp://h:4840', 250, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.endpoint, 'opc.tcp://h:4840');
        t.assertEqual(result.data.connected, true);
        t.assertEqual(mockOpcuaClient.endpoint, 'opc.tcp://h:4840');
        t.assertEqual(mockOpcuaClient.readRetryInterval, 250);
        t.assert(mockOpcuaClient.opened, 'client should be opened');
        t.assert(mockOpcuaClient.closed, 'client should be closed');
        t.assertEqual(mockOpcuaClient.browseCalls[0].nodes[0], 'ns=0;i=85');
        t.assertEqual(result.data.readBatchSize, 300);
        t.assertEqual(result.data.capabilities.maxNodesPerRead, null);
        t.assertEqual(result.data.capabilities.maxNodesPerReadSource, 'default');
    },

    'returns maxNodesPerRead capability when server exposes it': (t) => {
        const H = makeHandler();
        mockOpcuaClient.readResult = [{ value: 64, sourceTimestamp: 100, serverTimestamp: 200 }];
        let result;
        H.opcuaConnect('opc.tcp://h:4840', undefined, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockOpcuaClient.readCalls[0][0], 'ns=0;i=11705');
        t.assertEqual(result.data.readBatchSize, 64);
        t.assertEqual(result.data.capabilities.maxNodesPerRead, 64);
        t.assertEqual(result.data.capabilities.maxNodesPerReadSource, 'server');
    },

    'returns unlimited maxNodesPerRead capability when server exposes zero': (t) => {
        const H = makeHandler();
        mockOpcuaClient.readResult = [{ value: 0, sourceTimestamp: 100, serverTimestamp: 200 }];
        let result;
        H.opcuaConnect('opc.tcp://h:4840', undefined, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockOpcuaClient.readCalls[0][0], 'ns=0;i=11705');
        t.assertEqual(result.data.readBatchSize, 300);
        t.assertEqual(result.data.capabilities.maxNodesPerRead, 0);
        t.assertEqual(result.data.capabilities.maxNodesPerReadSource, 'server');
    },

    'keeps default capability when maxNodesPerRead value is empty': (t) => {
        const H = makeHandler();
        mockOpcuaClient.readResult = [{ value: null, sourceTimestamp: 100, serverTimestamp: 200 }];
        let result;
        H.opcuaConnect('opc.tcp://h:4840', undefined, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.readBatchSize, 300);
        t.assertEqual(result.data.capabilities.maxNodesPerRead, null);
        t.assertEqual(result.data.capabilities.maxNodesPerReadSource, 'default');
    },

    'returns unlimited capability when server exposes maxNodesPerRead zero': (t) => {
        const H = makeHandler();
        mockOpcuaClient.readResult = [{ value: 0, sourceTimestamp: 100, serverTimestamp: 200 }];
        let result;
        H.opcuaConnect('opc.tcp://h:4840', undefined, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.readBatchSize, 300);
        t.assertEqual(result.data.capabilities.maxNodesPerRead, 0);
        t.assertEqual(result.data.capabilities.maxNodesPerReadSource, 'server');
    },

    'resolves endpoint from OPC UA server profile': (t) => {
        const H = makeHandler();
        mockCGI._opcuaServers['opc-main'] = {
            endpoint: 'opc.tcp://profile:4840',
            security: {
                enabled: true,
                securityPolicy: 'None',
                messageSecurityMode: 'None',
                authMode: 'Anonymous',
            },
        };
        let result;
        H.opcuaConnect({ server: 'opc-main' }, 250, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.server, 'opc-main');
        t.assertEqual(result.data.endpoint, 'opc.tcp://profile:4840');
        t.assertEqual(mockOpcuaClient.endpoint, 'opc.tcp://profile:4840');
        t.assertEqual(mockOpcuaClient.options.security.enabled, true);
        t.assertEqual(mockOpcuaClient.options.readRetryInterval, 250);
    },

    'resolves username credentials from OPC UA server profile': (t) => {
        const H = makeHandler();
        mockCGI._opcuaServers['opc-main'] = {
            endpoint: 'opc.tcp://profile:4840',
            security: {
                enabled: true,
                securityPolicy: 'None',
                messageSecurityMode: 'None',
                authMode: 'UserName',
                username: 'opcuser',
                password: 'secret',
            },
        };
        let result;
        H.opcuaConnect({ server: 'opc-main' }, undefined, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockOpcuaClient.endpoint, 'opc.tcp://profile:4840');
        t.assertEqual(mockOpcuaClient.options.security.authMode, 'UserName');
        t.assertEqual(mockOpcuaClient.options.security.username, 'opcuser');
        t.assertEqual(mockOpcuaClient.options.security.password, 'secret');
    },

    'preserves saved username password during profile form connection test': (t) => {
        const H = makeHandler();
        mockCGI._opcuaServers['opc-main'] = {
            endpoint: 'opc.tcp://old:4840',
            security: {
                enabled: true,
                securityPolicy: 'None',
                messageSecurityMode: 'None',
                authMode: 'UserName',
                username: 'opcuser',
                password: 'secret',
            },
        };
        let result;
        H.opcuaConnect({
            server: 'opc-main',
            endpoint: 'opc.tcp://new:4840',
            security: {
                enabled: true,
                securityPolicy: 'None',
                messageSecurityMode: 'None',
                authMode: 'UserName',
                username: 'opcuser',
            },
        }, undefined, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockOpcuaClient.endpoint, 'opc.tcp://new:4840');
        t.assertEqual(mockOpcuaClient.options.security.authMode, 'UserName');
        t.assertEqual(mockOpcuaClient.options.security.username, 'opcuser');
        t.assertEqual(mockOpcuaClient.options.security.password, 'secret');
    },

    'ignores undefined direct security and keeps saved server profile security': (t) => {
        const H = makeHandler();
        mockCGI._opcuaServers['opc-main'] = {
            endpoint: 'opc.tcp://profile:4840',
            security: {
                enabled: true,
                securityPolicy: 'Basic256Sha256',
                messageSecurityMode: 'SignAndEncrypt',
                authMode: 'UserName',
                username: 'opcuser',
                password: 'secret',
                certificateFile: '/cert.pem',
                keyFile: '/key.pem',
            },
        };
        let result;
        H.opcuaConnect({
            server: 'opc-main',
            security: undefined,
        }, undefined, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockOpcuaClient.options.security.enabled, true);
        t.assertEqual(mockOpcuaClient.options.security.messageSecurityMode, 'SignAndEncrypt');
        t.assertEqual(mockOpcuaClient.options.security.authMode, 'UserName');
        t.assertEqual(mockOpcuaClient.options.security.username, 'opcuser');
        t.assertEqual(mockOpcuaClient.options.security.password, 'secret');
    },

    'uses direct security config for unsaved endpoint connection test': (t) => {
        const H = makeHandler();
        let result;
        H.opcuaConnect({
            endpoint: 'opc.tcp://secure:4840',
            security: {
                enabled: true,
                securityPolicy: 'None',
                messageSecurityMode: 'None',
                authMode: 'UserName',
                username: 'opcuser',
                password: 'secret',
            },
        }, undefined, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockOpcuaClient.endpoint, 'opc.tcp://secure:4840');
        t.assertEqual(mockOpcuaClient.options.security.enabled, true);
        t.assertEqual(mockOpcuaClient.options.security.authMode, 'UserName');
        t.assertEqual(mockOpcuaClient.options.security.username, 'opcuser');
        t.assertEqual(mockOpcuaClient.options.security.password, 'secret');
    },

    'ignores direct PEM values for None security mode': (t) => {
        const H = makeHandler();
        let result;
        H.opcuaConnect({
            endpoint: 'opc.tcp://secure:4840',
            security: {
                enabled: true,
                securityPolicy: 'None',
                messageSecurityMode: 'None',
                authMode: 'UserName',
                username: 'opcuser',
                password: 'secret',
                certificatePem: '-----BEGIN CERTIFICATE-----\nCERT\n-----END CERTIFICATE-----\n',
                keyPem: '-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----\n',
            },
        }, undefined, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockOpcuaClient.options.security.certificateFile, undefined);
        t.assertEqual(mockOpcuaClient.options.security.keyFile, undefined);
        t.assertEqual(Object.keys(mockCGI._opcuaCredentialWrites).length, 0);
    },

    'uses temporary certificate files for direct secure connection test and cleans them up': (t) => {
        const H = makeHandler();
        let result;
        H.opcuaConnect({
            endpoint: 'opc.tcp://secure:4840',
            security: {
                enabled: true,
                securityPolicy: 'Basic256Sha256',
                messageSecurityMode: 'SignAndEncrypt',
                authMode: 'Anonymous',
                certificatePem: '-----BEGIN CERTIFICATE-----\nCERT\n-----END CERTIFICATE-----\n',
                keyPem: '-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----\n',
            },
        }, undefined, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        const tempNames = Object.keys(mockCGI._opcuaCredentialWrites);
        t.assertEqual(tempNames.length, 1);
        const tempName = tempNames[0];
        t.assert(tempName.indexOf('opcua-connect-test-') === 0, 'should use temp connect profile name');
        t.assertEqual(mockOpcuaClient.options.security.certificateFile, `/mock/opcua-certs/${tempName}/client_cert.pem`);
        t.assertEqual(mockOpcuaClient.options.security.keyFile, `/mock/opcua-certs/${tempName}/client_key.pem`);
        t.assert(mockCGI._opcuaCredentialRemoves.indexOf(tempName) >= 0, 'should remove temp credential files');
    },

    'does not write temporary certificate files when direct security validation fails': (t) => {
        const H = makeHandler();
        let result;
        H.opcuaConnect({
            endpoint: 'opc.tcp://secure:4840',
            security: {
                enabled: true,
                securityPolicy: 'Basic256Sha256',
                messageSecurityMode: 'SignAndEncrypt',
                authMode: 'UserName',
                username: 'opcuser',
                certificatePem: '-----BEGIN CERTIFICATE-----\nCERT\n-----END CERTIFICATE-----\n',
                keyPem: '-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----\n',
            },
        }, undefined, (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('security.password is required'));
        t.assertEqual(Object.keys(mockCGI._opcuaCredentialWrites).length, 0);
    },

    'rejects direct secure connection test when only one PEM value is provided': (t) => {
        const H = makeHandler();
        let result;
        H.opcuaConnect({
            endpoint: 'opc.tcp://secure:4840',
            security: {
                enabled: true,
                securityPolicy: 'Basic256Sha256',
                messageSecurityMode: 'SignAndEncrypt',
                authMode: 'Anonymous',
                certificatePem: '-----BEGIN CERTIFICATE-----\nCERT\n-----END CERTIFICATE-----\n',
            },
        }, undefined, (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('security.certificatePem and security.keyPem must be provided together'));
        t.assertEqual(Object.keys(mockCGI._opcuaCredentialWrites).length, 0);
    },

    'returns error when connect fails': (t) => {
        const H = makeHandler();
        mockOpcuaClient.openResult = false;
        let result;
        H.opcuaConnect('opc.tcp://bad:1', undefined, (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('connect failed'));
    },

    'returns native error detail when connect open fails': (t) => {
        const H = makeHandler();
        mockOpcuaClient.openResult = false;
        mockOpcuaClient.lastError = new Error('BadIdentityTokenRejected');
        let result;
        H.opcuaConnect('opc.tcp://bad:1', undefined, (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('connect failed'));
        t.assert(result.reason.includes('BadIdentityTokenRejected'));
    },

    'returns error when browse verification fails': (t) => {
        const H = makeHandler();
        mockOpcuaClient.browseError = 'x509: negative serial number';
        let result;
        H.opcuaConnect('opc.tcp://bad-cert:4840', undefined, (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('connect failed'));
        t.assert(result.reason.includes('x509: negative serial number'));
    },
});

// ── opcuaRead ─────────────────────────────────────────────────────────────────

runner.run('Handler: opcuaRead', {
    'returns values on success': (t) => {
        const H = makeHandler();
        mockOpcuaClient.readResult = [
            { value: 1.1, sourceTimestamp: 100, serverTimestamp: 200 },
        ];
        let result;
        H.opcuaRead('opc.tcp://h:4840', ['ns=1;s=T1'], (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data[0].nodeId, 'ns=1;s=T1');
        t.assertEqual(result.data[0].value, 1.1);
        t.assert(mockOpcuaClient.closed, 'client should be closed');
    },

    'resolves server profile before read': (t) => {
        const H = makeHandler();
        mockCGI._opcuaServers['opc-main'] = { endpoint: 'opc.tcp://profile:4840' };
        mockOpcuaClient.readResult = [
            { value: 1.1, sourceTimestamp: 100, serverTimestamp: 200 },
        ];
        let result;
        H.opcuaRead({ server: 'opc-main' }, ['ns=1;s=T1'], (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockOpcuaClient.endpoint, 'opc.tcp://profile:4840');
    },

    'returns error when connect fails': (t) => {
        const H = makeHandler();
        mockOpcuaClient.openResult = false;
        let result;
        H.opcuaRead('opc.tcp://bad:1', ['ns=1;s=T1'], (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('connect failed'));
    },

    'returns error when read throws': (t) => {
        const H = makeHandler();
        mockOpcuaClient.readError = 'read timeout';
        let result;
        H.opcuaRead('opc.tcp://h:4840', ['ns=1;s=T1'], (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('read timeout'));
        t.assert(mockOpcuaClient.closed, 'client should be closed on error');
    },
});

// ── opcuaWrite ────────────────────────────────────────────────────────────────

runner.run('Handler: opcuaWrite', {
    'returns result on success': (t) => {
        const H = makeHandler();
        mockOpcuaClient.writeResult = { written: true };
        let result;
        H.opcuaWrite('opc.tcp://h:4840', [{ node: 'ns=1;s=T1', value: 42 }], (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assert(mockOpcuaClient.closed, 'client should be closed');
    },

    'resolves server profile before write': (t) => {
        const H = makeHandler();
        mockCGI._opcuaServers['opc-main'] = { endpoint: 'opc.tcp://profile:4840' };
        mockOpcuaClient.writeResult = { written: true };
        let result;
        H.opcuaWrite({ server: 'opc-main' }, [{ node: 'ns=1;s=T1', value: 42 }], (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockOpcuaClient.endpoint, 'opc.tcp://profile:4840');
    },

    'returns error when connect fails': (t) => {
        const H = makeHandler();
        mockOpcuaClient.openResult = false;
        let result;
        H.opcuaWrite('opc.tcp://bad:1', [], (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('connect failed'));
    },

    'returns error when write throws': (t) => {
        const H = makeHandler();
        mockOpcuaClient.writeError = 'write denied';
        let result;
        H.opcuaWrite('opc.tcp://h:4840', [{ node: 'ns=1;s=T1', value: 1 }], (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('write denied'));
        t.assert(mockOpcuaClient.closed, 'client should be closed on error');
    },
});

// ── nodeDescendants ───────────────────────────────────────────────────────────

runner.run('Handler: nodeDescendants', {
    'returns error when connect fails': (t) => {
        const H = makeHandler();
        mockOpcuaClient.openResult = false;
        let result;
        H.nodeDescendants({ endpoint: 'opc.tcp://bad:1', node: 'ns=0;i=85' }, (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('connect failed'));
    },

    'returns all descendants via BFS': (t) => {
        const H = makeHandler();
        mockOpcuaClient.browseResult = {
            'ns=0;i=85': [{ NodeId: 'ns=1;s=C1', NodeClass: 1 }, { NodeId: 'ns=1;s=C2', NodeClass: 1 }],
        };
        let result;
        H.nodeDescendants({ endpoint: 'opc.tcp://h:4840', node: 'ns=0;i=85' }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.length, 2);
        t.assert(mockOpcuaClient.closed, 'client should be closed');
    },

    'resolves server profile before browsing': (t) => {
        const H = makeHandler();
        mockCGI._opcuaServers['opc-main'] = { endpoint: 'opc.tcp://profile:4840' };
        mockOpcuaClient.browseResult = {
            'ns=0;i=85': [{ NodeId: 'ns=1;s=C1', NodeClass: 1 }],
        };
        let result;
        H.nodeDescendants({ server: 'opc-main', node: 'ns=0;i=85' }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockOpcuaClient.endpoint, 'opc.tcp://profile:4840');
    },

    'does not revisit already-visited nodes': (t) => {
        const H = makeHandler();
        mockOpcuaClient.browseResult = {
            'ns=0;i=85': [{ NodeId: 'ns=0;i=85', NodeClass: 1 }, { NodeId: 'ns=1;s=C1', NodeClass: 1 }],
        };
        let result;
        H.nodeDescendants({ endpoint: 'opc.tcp://h:4840', node: 'ns=0;i=85' }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.length, 2, 'root not re-added');
    },

    'fills DataType for Variable nodes via attributes': (t) => {
        const H = makeHandler();
        mockOpcuaClient.browseResult = {
            'ns=0;i=85': [
                { NodeId: 'ns=1;s=Temp', NodeClass: 2 },
                { NodeId: 'ns=1;s=Folder', NodeClass: 1 },
            ],
        };
        mockOpcuaClient.attributesResult = [{ status: 0, value: 'Double' }];
        let result;
        H.nodeDescendants({ endpoint: 'opc.tcp://h:4840', node: 'ns=0;i=85' }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data[0].dataType, 'Double', 'Variable node gets DataType');
        t.assertEqual(result.data[1].dataType, '', 'non-Variable node has empty DataType');
    },

    'handles attributes failure gracefully': (t) => {
        const H = makeHandler();
        mockOpcuaClient.browseResult = {
            'ns=0;i=85': [{ NodeId: 'ns=1;s=Temp', NodeClass: 2 }],
        };
        mockOpcuaClient.attributesResult = [{ status: 2147483648, value: '' }];
        let result;
        H.nodeDescendants({ endpoint: 'opc.tcp://h:4840', node: 'ns=0;i=85' }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data[0].dataType, '', 'bad status yields empty DataType');
    },
});

runner.summary();
