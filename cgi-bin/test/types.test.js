'use strict';

const TestRunner = require('./runner.js');
const {
    ColumnType,
    Column,
    TableSchema,
    FLAG_BASETIME,
    FLAG_SUMMARIZED,
    FLAG_METADATA,
    FLAG_PRIMARY,
} = require('../src/db/types.js');

const runner = new TestRunner();

// ── ColumnType.fromCode ────────────────────────────────────────────────────────

runner.run('ColumnType.fromCode', {
    'code 4 → SHORT': (t) => {
        t.assertEqual(ColumnType.fromCode(4), ColumnType.SHORT);
    },
    'code 104 → USHORT': (t) => {
        t.assertEqual(ColumnType.fromCode(104), ColumnType.USHORT);
    },
    'code 8 → INTEGER': (t) => {
        t.assertEqual(ColumnType.fromCode(8), ColumnType.INTEGER);
    },
    'code 108 → UINTEGER': (t) => {
        t.assertEqual(ColumnType.fromCode(108), ColumnType.UINTEGER);
    },
    'code 12 → LONG': (t) => {
        t.assertEqual(ColumnType.fromCode(12), ColumnType.LONG);
    },
    'code 112 → ULONG': (t) => {
        t.assertEqual(ColumnType.fromCode(112), ColumnType.ULONG);
    },
    'code 6 → DATETIME': (t) => {
        t.assertEqual(ColumnType.fromCode(6), ColumnType.DATETIME);
    },
    'code 16 → FLOAT': (t) => {
        t.assertEqual(ColumnType.fromCode(16), ColumnType.FLOAT);
    },
    'code 20 → DOUBLE': (t) => {
        t.assertEqual(ColumnType.fromCode(20), ColumnType.DOUBLE);
    },
    'code 5 → VARCHAR': (t) => {
        t.assertEqual(ColumnType.fromCode(5), ColumnType.VARCHAR);
    },
    'code 49 → TEXT': (t) => {
        t.assertEqual(ColumnType.fromCode(49), ColumnType.TEXT);
    },
    'code 53 → CLOB': (t) => {
        t.assertEqual(ColumnType.fromCode(53), ColumnType.CLOB);
    },
    'code 57 → BLOB': (t) => {
        t.assertEqual(ColumnType.fromCode(57), ColumnType.BLOB);
    },
    'code 97 → BINARY': (t) => {
        t.assertEqual(ColumnType.fromCode(97), ColumnType.BINARY);
    },
    'code 32 → IPV4': (t) => {
        t.assertEqual(ColumnType.fromCode(32), ColumnType.IPV4);
    },
    'code 36 → IPV6': (t) => {
        t.assertEqual(ColumnType.fromCode(36), ColumnType.IPV6);
    },
    'code 61 → JSON': (t) => {
        t.assertEqual(ColumnType.fromCode(61), ColumnType.JSON);
    },
    'unknown code → UNKNOWN': (t) => {
        t.assertEqual(ColumnType.fromCode(9999), ColumnType.UNKNOWN);
    },
    'code 0 → UNKNOWN': (t) => {
        t.assertEqual(ColumnType.fromCode(0), ColumnType.UNKNOWN);
    },
    'SHORT and USHORT both have ddlType "SHORT"': (t) => {
        t.assertEqual(ColumnType.SHORT.ddlType, 'SHORT');
        t.assertEqual(ColumnType.USHORT.ddlType, 'SHORT');
    },
    'INTEGER and UINTEGER both have ddlType "INTEGER"': (t) => {
        t.assertEqual(ColumnType.INTEGER.ddlType, 'INTEGER');
        t.assertEqual(ColumnType.UINTEGER.ddlType, 'INTEGER');
    },
    'LONG and ULONG both have ddlType "LONG"': (t) => {
        t.assertEqual(ColumnType.LONG.ddlType, 'LONG');
        t.assertEqual(ColumnType.ULONG.ddlType, 'LONG');
    },
});

// ── Column.sqlType ─────────────────────────────────────────────────────────────

runner.run('Column.sqlType', {
    'DOUBLE returns "DOUBLE"': (t) => {
        const col = new Column('VALUE', ColumnType.DOUBLE, 0, 0, 0);
        t.assertEqual(col.sqlType(), 'DOUBLE');
    },
    'DATETIME returns "DATETIME"': (t) => {
        const col = new Column('TIME', ColumnType.DATETIME, 1, 0, 0);
        t.assertEqual(col.sqlType(), 'DATETIME');
    },
    'FLOAT returns "FLOAT"': (t) => {
        const col = new Column('F', ColumnType.FLOAT, 0, 0, 0);
        t.assertEqual(col.sqlType(), 'FLOAT');
    },
    'INTEGER returns "INTEGER"': (t) => {
        const col = new Column('N', ColumnType.INTEGER, 0, 0, 0);
        t.assertEqual(col.sqlType(), 'INTEGER');
    },
    'LONG returns "LONG"': (t) => {
        const col = new Column('N', ColumnType.LONG, 0, 0, 0);
        t.assertEqual(col.sqlType(), 'LONG');
    },
    'TEXT returns "TEXT"': (t) => {
        const col = new Column('MSG', ColumnType.TEXT, 0, 0, 0);
        t.assertEqual(col.sqlType(), 'TEXT');
    },
    'IPV4 returns "IPV4"': (t) => {
        const col = new Column('IP', ColumnType.IPV4, 0, 0, 0);
        t.assertEqual(col.sqlType(), 'IPV4');
    },
    'VARCHAR(100) returns "VARCHAR(100)"': (t) => {
        const col = new Column('NAME', ColumnType.VARCHAR, 0, 0, 100);
        t.assertEqual(col.sqlType(), 'VARCHAR(100)');
    },
    'VARCHAR(64) returns "VARCHAR(64)"': (t) => {
        const col = new Column('TAG', ColumnType.VARCHAR, 0, 0, 64);
        t.assertEqual(col.sqlType(), 'VARCHAR(64)');
    },
    'VARCHAR(0) returns "VARCHAR(0)"': (t) => {
        const col = new Column('X', ColumnType.VARCHAR, 0, 0, 0);
        t.assertEqual(col.sqlType(), 'VARCHAR(0)');
    },
});

// ── Column constructor ─────────────────────────────────────────────────────────

runner.run('Column constructor', {
    'stores name, columnType, id, flag, length': (t) => {
        const col = new Column('VALUE', ColumnType.DOUBLE, 2, FLAG_SUMMARIZED, 0);
        t.assertEqual(col.name, 'VALUE');
        t.assertEqual(col.columnType, ColumnType.DOUBLE);
        t.assertEqual(col.id, 2);
        t.assertEqual(col.flag, FLAG_SUMMARIZED);
        t.assertEqual(col.length, 0);
    },
    'length defaults to 0 when omitted': (t) => {
        const col = new Column('X', ColumnType.DOUBLE, 0, 0);
        t.assertEqual(col.length, 0);
    },
});

// ── FLAG constants ─────────────────────────────────────────────────────────────

runner.run('FLAG constants', {
    'FLAG_BASETIME is 0x1000000': (t) => {
        t.assertEqual(FLAG_BASETIME, 0x1000000);
    },
    'FLAG_SUMMARIZED is 0x2000000': (t) => {
        t.assertEqual(FLAG_SUMMARIZED, 0x2000000);
    },
    'FLAG_METADATA is 0x4000000': (t) => {
        t.assertEqual(FLAG_METADATA, 0x4000000);
    },
    'FLAG_PRIMARY is 0x8000000': (t) => {
        t.assertEqual(FLAG_PRIMARY, 0x8000000);
    },
    'flags are distinct bits': (t) => {
        t.assertEqual(FLAG_BASETIME & FLAG_SUMMARIZED, 0);
        t.assertEqual(FLAG_BASETIME & FLAG_METADATA, 0);
        t.assertEqual(FLAG_BASETIME & FLAG_PRIMARY, 0);
        t.assertEqual(FLAG_SUMMARIZED & FLAG_METADATA, 0);
        t.assertEqual(FLAG_SUMMARIZED & FLAG_PRIMARY, 0);
        t.assertEqual(FLAG_METADATA & FLAG_PRIMARY, 0);
    },
    'FLAG_PRIMARY bit test works on raw flag value': (t) => {
        const flag = 0x8000000;
        t.assert((flag & FLAG_PRIMARY) !== 0, 'primary bit should be set');
        t.assert((flag & FLAG_BASETIME) === 0, 'basetime bit should not be set');
    },
    'FLAG_SUMMARIZED bit test works on raw flag value': (t) => {
        const flag = 0x2000000;
        t.assert((flag & FLAG_SUMMARIZED) !== 0, 'summarized bit should be set');
        t.assert((flag & FLAG_PRIMARY) === 0, 'primary bit should not be set');
    },
});

// ── TableSchema ────────────────────────────────────────────────────────────────

runner.run('TableSchema', {
    'stores tableType, logicalTable, columns': (t) => {
        const cols = [new Column('NAME', ColumnType.VARCHAR, 0, FLAG_PRIMARY, 100)];
        const schema = new TableSchema('TAG', 'TAGDATA', cols);
        t.assertEqual(schema.tableType, 'TAG');
        t.assertEqual(schema.logicalTable, 'TAGDATA');
        t.assertEqual(schema.columns.length, 1);
        t.assertEqual(schema.columns[0].name, 'NAME');
    },
    'columns defaults to empty array when omitted': (t) => {
        const schema = new TableSchema('TAG', 'TAGDATA');
        t.assertNotNull(schema.columns);
        t.assertEqual(schema.columns.length, 0);
    },
});

runner.summary();
