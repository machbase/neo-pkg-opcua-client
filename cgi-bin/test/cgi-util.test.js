'use strict';

const path = require('path');
const TestRunner = require('./runner.js');
const { CGI } = require('../src/cgi/cgi_util.js');

const runner = new TestRunner();

runner.run('CGI util', {
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
});

runner.summary();
