'use strict';

const { FLAG_BASETIME, FLAG_PRIMARY, FLAG_SUMMARIZED, ColumnType } = require('./types.js');

const NUMERIC_COLUMN_TYPES = new Set([
  ColumnType.SHORT,
  ColumnType.USHORT,
  ColumnType.INTEGER,
  ColumnType.UINTEGER,
  ColumnType.LONG,
  ColumnType.ULONG,
  ColumnType.FLOAT,
  ColumnType.DOUBLE,
]);

function _columnFamily(col) {
  const columnType = ColumnType.fromCode(col.TYPE);
  if (NUMERIC_COLUMN_TYPES.has(columnType)) {
    return 'NUMERIC';
  }
  if (columnType === ColumnType.JSON) {
    return 'JSON';
  }
  if (columnType === ColumnType.VARCHAR) {
    return 'VARCHAR';
  }
  return columnType.ddlType || 'UNKNOWN';
}

function _columnSqlType(col) {
  return _columnFamily(col) === 'VARCHAR'
    ? `VARCHAR(${col.LENGTH || 0})`
    : (ColumnType.fromCode(col.TYPE).ddlType || 'UNKNOWN');
}

function _hasColumnName(value) {
  return value !== undefined && value !== null && value !== '';
}

/**
 * Machbase append 스트림 래퍼
 *
 * open() 시 테이블 컬럼 목록을 조회하여 PRIMARY / BASETIME / valueColumn 인덱스를 파악한다.
 * append() 시 해당 위치에만 값을 채우고 나머지는 null로 패딩한다.
 */
class MachbaseStream {
  constructor() {
    this.stream = null;
    this._colCount = 0;
    this._nameIdx = -1;
    this._timeIdx = -1;
    this._valueIdx = -1;
    /** @type {string[]} open() 성공 후 채워지는 컬럼명 배열 */
    this.columnNames = [];
    this.nameIdx  = -1;
    this.timeIdx  = -1;
    this.primaryIdx = -1;
    this.baseTimeIdx = -1;
    this.valueIdx = -1;
    this.columns = [];
    this.columnIndexByName = {};
    this.primaryColumnName = null;
    this.baseTimeColumnName = null;
    this.valueColumnName = null;
    this.valueColumnType = null;
    this.valueColumnFamily = null;
    this.stringValueColumnName = null;
    this.stringValueColumnType = null;
    this.stringValueColumnFamily = null;
    this.stringOnly = false;
  }

  /**
   * append 스트림 열기
   * @param {MachbaseClient} client
   * @param {string} table
   * @param {string} [valueColumn] - 값을 저장할 컬럼명. 기본값 "VALUE"
   * @param {string} [stringValueColumn] - 문자열 보조 값을 저장할 VARCHAR 컬럼명
   * @param {{ stringOnly?: boolean }} [options]
   * @returns {Error|null}
   */
  open(client, table, valueColumn, stringValueColumn, options) {
    const stringOnly = !!(options && options.stringOnly);
    const vcUpper = stringOnly ? '' : (valueColumn || 'VALUE').toUpperCase();
    const scUpper = stringValueColumn ? String(stringValueColumn).toUpperCase() : '';
    try {
      if (stringOnly && _hasColumnName(valueColumn)) {
        return new Error('valueColumn must not be set when stringOnly is true');
      }
      if (stringOnly && !scUpper) {
        return new Error('stringValueColumn is required when stringOnly is true');
      }

      const cols = client.selectColumnsByTableName(table);
      this._colCount = cols.length;
      this._nameIdx = -1;
      this._timeIdx = -1;
      this._valueIdx = -1;
      let stringValueIdx = -1;
      let primaryFallbackIdx = -1;
      let baseTimeFallbackIdx = -1;
      this.columnIndexByName = {};
      this.columns = cols.map((col, idx) => {
        this.columnIndexByName[col.NAME] = idx;
        return {
          name: col.NAME,
          type: _columnSqlType(col),
          family: _columnFamily(col),
          flag: col.FLAG || 0,
          length: col.LENGTH || 0,
          code: col.TYPE,
        };
      });

      for (let i = 0; i < cols.length; i++) {
        const n = cols[i].NAME;
        const flag = cols[i].FLAG || 0;
        if (flag & FLAG_PRIMARY) {
          this._nameIdx = i;
        } else if (n === 'NAME') {
          primaryFallbackIdx = i;
        }
        if (flag & FLAG_BASETIME) {
          this._timeIdx = i;
        } else if (n === 'TIME') {
          baseTimeFallbackIdx = i;
        }
        if (!stringOnly && n === vcUpper) {
          this._valueIdx = i;
        } else if (scUpper && n === scUpper) {
          stringValueIdx = i;
        }
      }

      if (this._nameIdx < 0) this._nameIdx = primaryFallbackIdx;
      if (this._timeIdx < 0) this._timeIdx = baseTimeFallbackIdx;

      if (this._nameIdx < 0 || this._timeIdx < 0 || (!stringOnly && this._valueIdx < 0)) {
        const missing = [];
        if (this._nameIdx < 0) missing.push('PRIMARY KEY');
        if (this._timeIdx < 0) missing.push('BASETIME');
        if (!stringOnly && this._valueIdx < 0) missing.push(vcUpper);
        return new Error('column not found in table \'' + table + '\': ' + missing.join(', '));
      }

      if (scUpper) {
        if (!stringOnly && scUpper === vcUpper) {
          return new Error(`stringValueColumn must be different from valueColumn: '${scUpper}'`);
        }
        if (stringValueIdx < 0) {
          return new Error(`column not found in table '${table}': ${scUpper}`);
        }
      }

      const conflicting = cols.filter((c, i) => i !== this._nameIdx && i !== this._timeIdx && i !== this._valueIdx && (c.FLAG & FLAG_SUMMARIZED));
      if (conflicting.length > 0) {
        return new Error('table \'' + table + '\' has other SUMMARIZED columns that cannot be null: ' + conflicting.map(c => c.NAME).join(', ') + (stringOnly ? '. stringOnly requires a table without SUMMARIZED value columns.' : '. Use one of these as valueColumn instead.'));
      }

      const valueColumnMeta = stringOnly ? null : this.columns[this._valueIdx];
      if (!stringOnly && (!valueColumnMeta || (valueColumnMeta.family !== 'NUMERIC' && valueColumnMeta.family !== 'JSON'))) {
        return new Error(`valueColumn '${vcUpper}' must be a numeric or JSON column`);
      }

      const stringColumnMeta = stringValueIdx >= 0 ? this.columns[stringValueIdx] : null;
      if (stringColumnMeta && stringColumnMeta.family !== 'VARCHAR') {
        return new Error(`stringValueColumn '${scUpper}' must be a VARCHAR column`);
      }

      this.columnNames = cols.map(c => c.NAME);
      this.nameIdx = this._nameIdx;
      this.timeIdx = this._timeIdx;
      this.primaryIdx = this._nameIdx;
      this.baseTimeIdx = this._timeIdx;
      this.valueIdx = this._valueIdx;
      this.primaryColumnName = cols[this._nameIdx].NAME;
      this.baseTimeColumnName = cols[this._timeIdx].NAME;
      this.valueColumnName = stringOnly ? null : vcUpper;
      this.valueColumnType = valueColumnMeta ? valueColumnMeta.type : null;
      this.valueColumnFamily = valueColumnMeta ? valueColumnMeta.family : null;
      this.stringValueColumnName = stringColumnMeta ? stringColumnMeta.name : null;
      this.stringValueColumnType = stringColumnMeta ? stringColumnMeta.type : null;
      this.stringValueColumnFamily = stringColumnMeta ? stringColumnMeta.family : null;
      this.stringOnly = stringOnly;
      this.stream = client.openAppender(table);
      return null;
    } catch (err) {
      return err;
    }
  }

  /**
   * 컬럼명 기반 객체 배열 append
   * @param {Array<object>} rows
   * @returns {Error|null}
   */
  appendNamedRows(rows) {
    if (!rows || rows.length === 0) return null;
    if (!this.stream) return new Error('MachbaseStream.appendNamedRows called before open()');
    try {
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r] || {};
        const out = [];
        for (let i = 0; i < this._colCount; i++) {
          const colName = this.columnNames[i];
          out.push(Object.prototype.hasOwnProperty.call(row, colName) && row[colName] !== undefined ? row[colName] : null);
        }
        this.stream.append.apply(this.stream, out);
      }
      this.stream.flush();
      return null;
    } catch (err) {
      return err;
    }
  }

  /**
   * 행렬 데이터 append
   * @param {Array<[name, time, value]>} matrix
   * @returns {Error|null}
   */
  append(matrix) {
    if (!matrix || matrix.length === 0) return null;
    if (!this.stream) return new Error('MachbaseStream.append called before open()');
    if (!this.valueColumnName) return new Error('MachbaseStream.append called without valueColumn');
    return this.appendNamedRows(matrix.map((row) => ({
      [this.primaryColumnName]: row[0],
      [this.baseTimeColumnName]: row[1],
      [this.valueColumnName]: row[2],
    })));
  }

  /**
   * 스트림 닫기
   * @returns {Error|null}
   */
  close() {
    if (this.stream) {
      try {
        this.stream.flush();
        this.stream.close();
      } catch (err) {
        this.stream = null;
        return err;
      }
      this.stream = null;
    }
    return null;
  }
}

module.exports = { MachbaseStream };
