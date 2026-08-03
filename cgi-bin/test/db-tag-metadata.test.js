'use strict';

const Module = require('module');
const TestRunner = require('./runner.js');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === 'machcli') return { Client: function() {} };
    return originalLoad.call(this, request, parent, isMain);
};
const { MachbaseClient } = require('../src/db/client.js');
Module._load = originalLoad;

const { TagTable, TagDataTable } = require('../src/db/table.js');
const {
    Column,
    ColumnType,
    TableSchema,
    FLAG_BASETIME,
    FLAG_METADATA,
    FLAG_PRIMARY,
} = require('../src/db/types.js');

const runner = new TestRunner();

function customSchema() {
    return new TableSchema('TAG', 'TAG', [
        new Column('TAG_ID', ColumnType.VARCHAR, 0, FLAG_PRIMARY, 100),
        new Column('TS', ColumnType.DATETIME, 1, FLAG_BASETIME),
        new Column('READING', ColumnType.DOUBLE, 2, 0),
        new Column('ASSET', ColumnType.JSON, 3, FLAG_METADATA),
    ]);
}

runner.run('MachbaseClient TAG metadata columns', {
    'discovers custom primary column and normalizes selectTagNames rows': (t) => {
        const calls = [];
        const client = new MachbaseClient({});
        client._conn = {
            query(sql) {
                calls.push(sql);
                if (sql.includes('M$SYS_COLUMNS')) {
                    return [
                        { NAME: 'TAG_ID', FLAG: FLAG_PRIMARY },
                        { NAME: 'TS', FLAG: FLAG_BASETIME },
                    ];
                }
                return [{ _ID: 1, TAG_ID: 'sensor.a' }];
            },
        };

        const rows = client.selectTagNames('TAG');
        t.assertEqual(rows[0].name, 'sensor.a');
        t.assert(calls[1].includes('SELECT _ID, TAG_ID FROM _TAG_META'), 'metadata query should use discovered primary');
    },

    'uses explicit custom primary for select and update helpers without another catalog query': (t) => {
        const queries = [];
        const executions = [];
        const client = new MachbaseClient({});
        client._conn = {
            query(sql) {
                queries.push(sql);
                return [{ _ID: 2, TAG_ID: 'sensor.b', ASSET: '{"site":"A"}' }];
            },
            exec(sql) {
                executions.push(sql);
            },
        };

        const rows = client.selectTagMeta('TAG', ['ASSET'], 'TAG_ID');
        const row = client.selectTagMetaById('TAG', 2, ['ASSET'], 'TAG_ID');
        client.updateTagMeta('TAG', 'sensor.b', [{ name: 'ASSET', value: '{"site":"B"}' }], 'TAG_ID');

        t.assertEqual(rows[0].name, 'sensor.b');
        t.assertEqual(row.name, 'sensor.b');
        t.assert(queries[0].includes('SELECT _ID, TAG_ID, ASSET FROM _TAG_META'), 'bulk select should use custom primary');
        t.assert(queries[1].includes('SELECT _ID, TAG_ID, ASSET FROM _TAG_META WHERE _ID = ?'), 'id select should use custom primary');
        t.assert(executions[0].includes("WHERE TAG_ID = 'sensor.b'"), 'metadata update should use custom primary');
        t.assert(!queries.some(sql => sql.includes('M$SYS_COLUMNS')), 'explicit primary should avoid catalog lookup');
    },
});

runner.run('TagTable metadata cache columns', {
    'uses schema primary column in metadata filters and cache values': (t) => {
        const queries = [];
        const table = new TagTable({}, 'TAG');
        table.setSchema(customSchema());
        table.client = {
            query(sql, values) {
                queries.push({ sql, values });
                return [{ _ID: 1, TAG_ID: 'sensor.a', ASSET: '{"site":"A"}' }];
            },
        };

        const cache = table.loadTagMetaCache({ in: ['sensor.a'], like: 'sensor.%' });
        const resolved = cache.resolve(1, null);
        t.assert(queries[0].sql.includes('SELECT _ID, TAG_ID, ASSET FROM _TAG_META'), 'select should use schema primary');
        t.assert(queries[0].sql.includes('TAG_ID IN (?)'), 'IN filter should use schema primary');
        t.assert(queries[0].sql.includes('TAG_ID LIKE ?'), 'LIKE filter should use schema primary');
        t.assertEqual(resolved.name, 'sensor.a');
        t.assertEqual(resolved.meta.ASSET, '{"site":"A"}');
    },

    'passes schema primary to TagDataTable bulk and cache-miss helpers': (t) => {
        const calls = [];
        const table = new TagDataTable('_TAG_DATA_0', {});
        table.setSchema(customSchema());
        table.client = {
            selectTagMeta(logicalTable, metaColumns, primaryColumn) {
                calls.push({ method: 'all', logicalTable, metaColumns, primaryColumn });
                return [{ _ID: 1, name: 'sensor.a', ASSET: '{}' }];
            },
            selectTagMetaById(logicalTable, tagId, metaColumns, primaryColumn) {
                calls.push({ method: 'id', logicalTable, tagId, metaColumns, primaryColumn });
                return { _ID: tagId, name: 'sensor.b', ASSET: '{}' };
            },
        };

        t.assertNull(table.cacheTagMetaAll());
        t.assert(table.cacheTagMetaByTagID(2), 'cache miss row should be loaded');
        t.assertEqual(calls[0].primaryColumn, 'TAG_ID');
        t.assertEqual(calls[1].primaryColumn, 'TAG_ID');
        t.assertEqual(table.aliasCache.get(2), 'sensor.b');
    },
});

if (!runner.summary()) process.exit(1);
