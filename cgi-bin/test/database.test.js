const TestRunner = require('./runner.js');
const { normalizeDatabaseRows, assertWritableDatabase } = require('../src/db/database.js');

const runner = new TestRunner();

runner.run('Database metadata', {
    'normalizes native query rows': (t) => {
        const rows = normalizeDatabaseRows([{
            NAME: 'machbasedb', KIND: 'active', ACCESS_MODE: 'read_write',
            CAN_USE: 1, STATE: 'normal', IS_DEFAULT: 1,
        }]);
        t.assertEqual(rows[0].name, 'MACHBASEDB');
        t.assertEqual(rows[0].accessMode, 'READ_WRITE');
        t.assert(rows[0].canUse, 'CAN_USE should be true');
        t.assert(rows[0].writable, 'database should be writable');
    },

    'rejects READ_ONLY database for collector storage': (t) => {
        t.assertThrows(() => assertWritableDatabase({
            name: 'READ_DB', kind: 'ACTIVE', accessMode: 'READ_ONLY',
            canUse: true, writable: false,
        }, 'READ_DB'), 'READ_WRITE');
    },
});

if (!runner.summary()) throw new Error('database tests failed');
