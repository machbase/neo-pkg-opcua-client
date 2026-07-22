'use strict';

const path = require('path');
const fs = require('fs');
const TestRunner = require('./runner.js');
const { CGI } = require('../src/cgi/cgi_util.js');
const { obfuscateSecret, revealSecret } = require('../src/cgi/secret.js');

const runner = new TestRunner();

runner.run('CGI util', {
    'collector config overlays legacy values on fresh defaults': (t) => {
        const name = 'unit_legacy_config_' + Date.now();
        const configDir = path.resolve(__dirname, '..', 'conf.d');
        const filePath = path.join(configDir, name + '.json');
        try {
            fs.mkdirSync(configDir, { recursive: true });
            fs.writeFileSync(filePath, JSON.stringify({
                opcua: { endpoint: 'opc.tcp://127.0.0.1:4840' },
                db: 'localhost',
                dbTable: 'TAG',
            }), 'utf8');
            const config = CGI.getConfig(name);
            t.assertEqual(config.timePolicy, 'sourceTime');
            t.assertEqual(config.badStatusPolicy, 'skip');
            t.assertDeepEqual(config.derivedTags, []);
            t.assertEqual(config.opcua.interval, 1000);
            t.assertEqual(config.opcua.readRetryInterval, 100);
            t.assertDeepEqual(config.opcua.nodes, []);
            t.assertEqual(config.opcua.endpoint, 'opc.tcp://127.0.0.1:4840');
            t.assertEqual(config.db, 'localhost');
            t.assertEqual(config.log.level, 'info');
            t.assertEqual(config.log.maxFiles, 10);
        } finally {
            CGI.removeConfig(name);
        }
    },

    'collector config write persists backend defaults': (t) => {
        const name = 'unit_write_defaults_' + Date.now();
        const configDir = path.resolve(__dirname, '..', 'conf.d');
        const filePath = path.join(configDir, name + '.json');
        try {
            CGI.writeConfig(name, {
                opcua: { endpoint: 'opc.tcp://127.0.0.1:4840' },
            });
            const stored = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            t.assertEqual(stored.timePolicy, 'sourceTime');
            t.assertEqual(stored.badStatusPolicy, 'skip');
            t.assertDeepEqual(stored.derivedTags, []);
            t.assertEqual(stored.stringOnly, false);
            t.assertEqual(stored.opcua.interval, 1000);
            t.assertEqual(stored.opcua.readRetryInterval, 100);
            t.assertDeepEqual(stored.opcua.nodes, []);
            t.assertEqual(stored.log.level, 'info');
            t.assertEqual(stored.log.maxFiles, 10);
        } finally {
            CGI.removeConfig(name);
        }
    },

    'parseQuery decodes plus as space and preserves encoded plus': (t) => {
        const query = CGI.parseQuery({
            queryString: 'name=Simulation+Examples_Functions_Ramp4&literal=A%2BB&space=A%20B&tag+name=value+1',
        });
        t.assertEqual(query.name, 'Simulation Examples_Functions_Ramp4');
        t.assertEqual(query.literal, 'A+B');
        t.assertEqual(query.space, 'A B');
        t.assertEqual(query['tag name'], 'value 1');
    },

    'parseQuery uses the last value for repeated keys by default': (t) => {
        const query = CGI.parseQuery({ queryString: 'names=area%2C1&names=sensor.b' });
        t.assertEqual(query.names, 'sensor.b');
    },

    'parseQuery preserves repeated array keys when requested': (t) => {
        const query = CGI.parseQuery({
            queryString: 'names=area%2C1&names=sensor.b',
            arrayKeys: ['names'],
        });
        t.assertDeepEqual(query.names, ['area,1', 'sensor.b']);
    },

    'resolveLogFilePath returns absolute log path': (t) => {
        const filePath = CGI.resolveLogFilePath('collector-a.log');
        t.assert(path.isAbsolute(filePath), 'path should be absolute');
        t.assert(filePath.endsWith(path.join('logs', 'collector-a.log')), 'path should point to logs/collector-a.log');
    },

    'resolveLogFilePath rejects missing name': (t) => {
        let message = '';
        try {
            CGI.resolveLogFilePath('');
        } catch (err) {
            message = err.message;
        }
        t.assertEqual(message, 'name is required');
    },

    'resolveLogFilePath rejects path traversal': (t) => {
        let message = '';
        try {
            CGI.resolveLogFilePath('../etc/passwd');
        } catch (err) {
            message = err.message;
        }
        t.assertEqual(message, 'invalid file name');
    },

    'resolveActiveLogFilePath maps collector name to active file': (t) => {
        const filePath = CGI.resolveActiveLogFilePath('collector-a');
        t.assert(filePath.endsWith(path.join('logs', 'collector-a.log')), 'active log file should be {name}.log');
    },

    'resolveActiveLogFilePath trims surrounding spaces': (t) => {
        const filePath = CGI.resolveActiveLogFilePath('  collector-a  ');
        t.assert(filePath.endsWith(path.join('logs', 'collector-a.log')), 'trimmed name should resolve to active file');
    },

    'resolveActiveLogFilePath rejects invalid log name': (t) => {
        let message = '';
        try {
            CGI.resolveActiveLogFilePath('../collector-a');
        } catch (err) {
            message = err.message;
        }
        t.assertEqual(message, 'invalid log name');
    },

    'server config stores obfuscated password and reads plain password': (t) => {
        const name = 'unit_secret_' + Date.now();
        const serverDir = path.resolve(__dirname, '..', 'conf.d', 'servers');
        const filePath = path.join(serverDir, name + '.json');
        try {
            CGI.writeServerConfig(name, { host: '127.0.0.1', port: 5656, user: 'sys', password: 'manager' });
            const raw = fs.readFileSync(filePath, 'utf8');
            t.assert(raw.indexOf('"manager"') < 0, 'stored file should not contain plain password');
            t.assert(raw.indexOf('jsh-obf-v1:') >= 0, 'stored file should contain obfuscated marker');
            const cfg = CGI.getServerConfig(name);
            t.assertEqual(cfg.password, 'manager');
        } finally {
            CGI.removeServerConfig(name);
        }
    },

    'server config reads legacy plain password': (t) => {
        const name = 'unit_plain_' + Date.now();
        const serverDir = path.resolve(__dirname, '..', 'conf.d', 'servers');
        const filePath = path.join(serverDir, name + '.json');
        try {
            fs.mkdirSync(serverDir, { recursive: true });
            fs.writeFileSync(filePath, JSON.stringify({ host: 'h', port: 5656, user: 'sys', password: 'plain-pw' }), 'utf8');
            const cfg = CGI.getServerConfig(name);
            t.assertEqual(cfg.password, 'plain-pw');
        } finally {
            CGI.removeServerConfig(name);
        }
    },

    'opcua server config stores obfuscated nested password and reads plain password': (t) => {
        const name = 'unit_opcua_secret_' + Date.now();
        const serverDir = path.resolve(__dirname, '..', 'conf.d', 'opcua-servers');
        const filePath = path.join(serverDir, name + '.json');
        try {
            CGI.writeOpcuaServerConfig(name, {
                endpoint: 'opc.tcp://127.0.0.1:4840',
                security: {
                    enabled: true,
                    securityPolicy: 'None',
                    messageSecurityMode: 'None',
                    authMode: 'UserName',
                    username: 'user1',
                    password: 'secret',
                },
            });
            const raw = fs.readFileSync(filePath, 'utf8');
            t.assert(raw.indexOf('"secret"') < 0, 'stored file should not contain plain password');
            t.assert(raw.indexOf('jsh-obf-v1:') >= 0, 'stored file should contain obfuscated marker');
            const cfg = CGI.getOpcuaServerConfig(name);
            t.assertEqual(cfg.security.password, 'secret');
        } finally {
            CGI.removeOpcuaServerConfig(name);
        }
    },

    'secret obfuscation preserves values that start with marker': (t) => {
        const value = 'jsh-obf-v1:actual-password';
        const encoded = obfuscateSecret(value);
        t.assert(encoded.indexOf('jsh-obf-v1:') === 0, 'encoded value should have marker');
        t.assert(encoded !== value, 'encoded value should not be treated as already encoded');
        t.assertEqual(revealSecret(encoded), value);
    },
});

if (!runner.summary()) process.exit(1);
