const path = require('path');
const TestRunner = require('./runner.js');

const ROOT = path.resolve(__dirname, '..');

// ── Mocks ────────────────────────────────────────────────────────────────────

class MockCGI {
    constructor() {
        this._configs = {};
        this._servers = {};
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
    createTagTable(_table, _schema) {
        if (this.createError) throw new Error(this.createError);
    }
}

class MockOpcuaClient {
    constructor() {
        this.opened = false;
        this.closed = false;
        this.openResult = true;
        this.readResult = null;
        this.readError = null;
        this.writeResult = null;
        this.writeError = null;
        this.childrenResult = [];
    }
    open() { this.opened = true; return this.openResult; }
    close() { this.closed = true; }
    read(_nodeIds) {
        if (this.readError) throw new Error(this.readError);
        return this.readResult;
    }
    write(..._args) {
        if (this.writeError) throw new Error(this.writeError);
        return this.writeResult;
    }
    children(_req) { return this.childrenResult; }
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
        exports: function() { return mockOpcuaClient; },
    };

    delete require.cache[handlerPath];
    const Handler = require(handlerPath);

    delete require.cache[cgiUtilPath];
    delete require.cache[servicePath];
    delete require.cache[clientPath];
    delete require.cache[opcuaPath];

    return Handler;
}

// ── Tests ────────────────────────────────────────────────────────────────────

const runner = new TestRunner();

// ── collectorPost ────────────────────────────────────────────────────────────

runner.run('Handler: collectorPost', {
    'creates config and installs service': (t) => {
        const H = makeHandler();
        let result;
        H.collectorPost('col-a', { opcua: {}, db: {} }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.name, 'col-a');
        t.assertNotNull(mockCGI._configs['col-a'], 'config should be written');
        t.assert(mockService._installed['col-a'], 'service should be installed');
    },

    'returns error when collector already exists': (t) => {
        const H = makeHandler();
        mockCGI._configs['col-a'] = {};
        let result;
        H.collectorPost('col-a', { opcua: {} }, (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('already exists'));
    },

    'rollbacks config when install fails': (t) => {
        const H = makeHandler();
        mockService.installError = 'install failed';
        let result;
        H.collectorPost('col-a', { opcua: {} }, (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(!mockCGI._configs['col-a'], 'config should be removed on install failure');
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
        H.collectorPut('col-a', { db: 'server-b', opcua: {} }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(mockCGI._configs['col-a'].db, 'server-b');
    },

    'stops and restarts service when running': (t) => {
        const H = makeHandler();
        mockCGI._configs['col-a'] = { db: {} };
        mockService._installed['col-a'] = true;
        mockService._statusMap['col-a'] = 'RUNNING';
        let result;
        H.collectorPut('col-a', { db: {} }, (r) => { result = r; });
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

// ── nodeChildren (descendants) ────────────────────────────────────────────────

runner.run('Handler: nodeChildren', {
    'returns error when connect fails': (t) => {
        const H = makeHandler();
        mockOpcuaClient.openResult = false;
        let result;
        H.nodeChildren({ endpoint: 'opc.tcp://bad:1', node: 'ns=0;i=85' }, (r) => { result = r; });
        t.assert(!result.ok, 'should not be ok');
        t.assert(result.reason.includes('connect failed'));
    },

    'returns all descendants via BFS': (t) => {
        const H = makeHandler();
        let childrenCallCount = 0;
        mockOpcuaClient.children = (req) => {
            childrenCallCount++;
            if (req.node === 'ns=0;i=85') {
                return [{ NodeId: 'ns=1;s=C1' }, { NodeId: 'ns=1;s=C2' }];
            }
            return [];
        };
        let result;
        H.nodeChildren({ endpoint: 'opc.tcp://h:4840', node: 'ns=0;i=85' }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(result.data.length, 2);
        t.assertEqual(childrenCallCount, 3, 'root + 2 children');
        t.assert(mockOpcuaClient.closed, 'client should be closed');
    },

    'does not revisit already-visited nodes': (t) => {
        const H = makeHandler();
        let childrenCallCount = 0;
        mockOpcuaClient.children = (req) => {
            childrenCallCount++;
            if (req.node === 'ns=0;i=85') {
                return [{ NodeId: 'ns=0;i=85' }, { NodeId: 'ns=1;s=C1' }];
            }
            return [];
        };
        let result;
        H.nodeChildren({ endpoint: 'opc.tcp://h:4840', node: 'ns=0;i=85' }, (r) => { result = r; });
        t.assert(result.ok, 'should be ok');
        t.assertEqual(childrenCallCount, 2, 'root once, C1 once, root not revisited');
    },
});

runner.summary();
