'use strict';

/**
 * @fileoverview MachbaseClient — machcli 동기 DB 클라이언트 래퍼
 *
 * 모든 메서드는 동기(sync)로 동작한다.
 * 단일 연결에서 동시 query + append를 수행할 수 없으므로 Worker별 독립 인스턴스를 사용한다.
 */

const { Client } = require('machcli');
const { ColumnType, Column, TableSchema, FLAG_BASETIME, FLAG_SUMMARIZED, FLAG_METADATA, FLAG_PRIMARY } = require('./types.js');


/**
 * Machbase Neo DB 연결 및 쿼리 클라이언트
 */
class MachbaseClient {
  /**
   * @param {{ host: string, port: number, user: string, password: string }} config - DB 접속 정보
   * @param {{ clientFactory?: function }} [options]
   */
  constructor(config, { clientFactory } = {}) {
    this._config = config;
    this._db = null;
    this._conn = null;
    this._clientFactory = clientFactory || ((conf) => new Client(conf));
  }

  /**
   * DB에 연결한다.
   */
  connect() {
    this._db = this._clientFactory(this._config);
    try {
      this._conn = this._db.connect();
    } catch (e) {
      this.close();
      throw e;
    }
  }

  /**
   * DB 연결을 닫는다. 오류는 무시한다.
   */
  close() {
    try {
      this._conn && this._conn.close();
    } catch (_) {}
    try {
      this._db && this._db.close();
    } catch (_) {}
    this._conn = null;
    this._db = null;
  }

  /**
   * 쿼리한 결과 행 배열을 반환한다.
   * @param {string} sql
   * @param {Array} [values] - 바인딩 파라미터
   * @returns {Array<object>}
   */
  query(sql, values) {
    try {
      const rows = values && values.length > 0
        ? this._conn.query(sql, ...values)
        : this._conn.query(sql);

      const result = [];
      for (const row of rows) {
        result.push(row);
      }
      return result;
    } catch (err) {
      throw new Error(err.message);
    }
  }

  /**
   * 지정 테이블에 대한 append 스트림을 열어 반환한다.
   * @param {string} table
   * @param {Array<{ name: string }>} columns
   * @returns {object} machcli Appender 인스턴스
   */
  openAppender(table) {
    return this._conn.append(table);
  }

  /**
   * DDL/DML SQL을 실행한다.
   * @param {string} sql
   * @param {...*} values - 바인딩 파라미터
   * @returns {*}
   */
  execute(sql, ...values) {
    try {
      return values.length > 0 ? this._conn.exec(sql, ...values) : this._conn.exec(sql);
    } catch (err) {
      throw new Error(err.message);
    }
  }

  /**
   * 테이블 타입 조회
   * @param {string} tableName
   * @returns {{ type: 'TAG'|'LOG'|'UNSUPPORTED' }}
   */
  selectTableType(tableName) {
    const rows = this.query(
      'SELECT TYPE FROM M$SYS_TABLES WHERE NAME = ?',
      [tableName]
    );
    if (!rows || rows.length === 0) return { type: 'UNSUPPORTED' };
    switch (rows[0].TYPE) {
      case 6: return { type: 'TAG' };
      case 0: return { type: 'LOG' };
      default: return { type: 'UNSUPPORTED' };
    }
  }

  /**
   * TAG 데이터 파티션 목록 조회
   * @param {string} tableName - 논리 테이블명
   * @returns {Array<{ data_table: string }>}
   */
  selectTagDataTables(tableName) {
    const pattern = `_${tableName}_DATA_%`;
    const sql = `
      SELECT m.NAME AS data_table
      FROM V$STORAGE_TAG_TABLES v, M$SYS_TABLES m
      WHERE v.ID = m.ID AND m.NAME LIKE ?
      ORDER BY m.NAME
    `.trim();
    return this.query(sql, [pattern]);
  }

  /**
   * 전체 유저 목록 조회
   * @returns {Array<{ USER_ID: number, NAME: string }>}
   */
  selectUsers() {
    return this.query('SELECT USER_ID, NAME FROM M$SYS_USERS');
  }

  /**
   * 사용자 테이블 목록 조회 (TAG/LOG 타입만, USER_ID 포함)
   * @returns {Array<{ NAME: string, TYPE: number, ID: number, USER_ID: number }>}
   */
  selectAllTables() {
    const sql = `
      SELECT NAME, TYPE, ID, USER_ID
      FROM M$SYS_TABLES
      WHERE TYPE IN (0, 6)
    `.trim();
    return this.query(sql);
  }

  /**
   * 테이블명 기준으로 M$SYS_COLUMNS 조회
   * @param {string} tableName
   * @returns {Array<{ NAME: string, TYPE: number, ID: number, LENGTH: number, FLAG: number }>}
   */
  selectColumnsByTableName(tableName) {
    const sql = `
      SELECT c.NAME, c.TYPE, c.ID, c.LENGTH, c.FLAG
      FROM M$SYS_COLUMNS c, M$SYS_TABLES t
      WHERE c.TABLE_ID = t.ID AND t.NAME = ?
        AND c.ID < 65534
      ORDER BY c.ID ASC
    `.trim();
    return this.query(sql, [tableName]);
  }

  /**
   * 테이블명 기준으로 테이블 메타(ID, TYPE) 조회
   * @param {string} tableName
   * @param {number} [userId] - 지정 시 해당 USER_ID 소유 테이블만 조회
   * @returns {{ ID: number, TYPE: number, NAME: string }|null}
   */
  selectTableMeta(tableName, userId) {
    if (userId != null) {
      const rows = this.query(
        'SELECT ID, TYPE, NAME FROM M$SYS_TABLES WHERE NAME = ? AND USER_ID = ?',
        [tableName, userId]
      );
      return rows.length > 0 ? rows[0] : null;
    }
    const rows = this.query(
      'SELECT ID, TYPE, NAME FROM M$SYS_TABLES WHERE NAME = ?',
      [tableName]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * 테이블 ID 기준으로 M$SYS_COLUMNS 조회
   * @param {number} tableId
   * @returns {Array<{ NAME: string, TYPE: number, ID: number, LENGTH: number, FLAG: number }>}
   */
  selectColumnsByTableId(tableId) {
    const sql = `
      SELECT NAME, TYPE, ID, LENGTH, FLAG
      FROM M$SYS_COLUMNS
      WHERE TABLE_ID = ?
        AND ID < 65534
      ORDER BY ID ASC
    `.trim();
    return this.query(sql, [tableId]);
  }

  /**
   * 테이블의 최대 RID 조회
   * @param {string} tableName
   * @returns {bigint} 빈 테이블이면 0n
   */
  selectMaxRid(tableName) {
    const rows = this.query(`SELECT MAX(_RID) as max_rid FROM ${tableName}`);
    const raw = rows?.[0]?.max_rid;
    return raw == null ? 0n : BigInt(raw);
  }

  /**
   * TAG META 테이블 전체 조회
   * @param {string} logicalTable - 논리 테이블명
   * @returns {Array<{ _ID: bigint, name: string }>}
   */
  selectTagNames(logicalTable) {
    return this.query(`SELECT _ID, name FROM _${logicalTable}_META`);
  }

  /**
   * TAG META 테이블 조회 (_ID, name + metadata columns)
   * @param {string} logicalTable - 논리 테이블명
   * @param {string[]} metaColNames - metadata column 이름 목록
   * @returns {Array<{ _ID: bigint, name: string, [col]: any }>}
   */
  selectTagMeta(logicalTable, metaColNames = []) {
    const extraCols = metaColNames.length > 0 ? ', ' + metaColNames.join(', ') : '';
    return this.query(`SELECT _ID, name${extraCols} FROM _${logicalTable}_META`);
  }

  /**
   * TAG META 업데이트
   * @param {string} logicalTable
   * @param {string} oldName
   * @param {Array<{ name: string, value: any }>} sets
   */
  updateTagMeta(logicalTable, oldName, sets) {
    const esc = v => v == null ? 'NULL'
      : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'`
      : String(v);
    const setClauses = sets.map(({ name, value }) => `${name} = ${esc(value)}`).join(', ');
    this.execute(
      `UPDATE ${logicalTable} METADATA SET ${setClauses} WHERE NAME = ${esc(oldName)}`
    );
  }

  /**
   * TAG META 테이블에서 tagId 기준 단건 조회
   * @param {string} logicalTable
   * @param {number|bigint} tagId
   * @param {string[]} metaColNames
   * @returns {{ _ID: bigint, name: string, [col]: any }|null}
   */
  selectTagMetaById(logicalTable, tagId, metaColNames = []) {
    const extraCols = metaColNames.length > 0 ? ', ' + metaColNames.join(', ') : '';
    const rows = this.query(
      `SELECT _ID, name${extraCols} FROM _${logicalTable}_META WHERE _ID = ?`,
      [tagId]
    );
    return rows?.[0] ?? null;
  }

  /**
   * 스키마를 기반으로 TAG 테이블 생성
   * @param {string} tableName
   * @param {import('./types').TableSchema} schema
   */
  createTagTable(tableName, schema) {
    const dataCols = schema.columns.filter(c => !(c.flag & FLAG_METADATA));
    const metaCols = schema.columns.filter(c =>   c.flag & FLAG_METADATA);

    if (!dataCols.some(c => c.flag & FLAG_PRIMARY))
      throw new Error(`createTagTable: PRIMARY KEY column not found in schema for '${schema.logicalTable}'`);
    if (!dataCols.some(c => c.flag & FLAG_BASETIME))
      throw new Error(`createTagTable: BASETIME column not found in schema for '${schema.logicalTable}'`);

    const colDefs = dataCols.map(c => {
      let def = `${c.name} ${c.sqlType()}`;
      if      (c.flag & FLAG_PRIMARY)    def += ' PRIMARY KEY';
      else if (c.flag & FLAG_BASETIME)   def += ' BASETIME';
      else if (c.flag & FLAG_SUMMARIZED) def += ' SUMMARIZED';
      return def;
    });

    let sql = `CREATE TAG TABLE ${tableName} (${colDefs.join(', ')})`;
    if (metaCols.length > 0) {
      const metaDefs = metaCols.map(c => `${c.name} ${c.sqlType()}`).join(', ');
      sql += ` METADATA (${metaDefs})`;
    }
    this.execute(sql);
  }

  /**
   * 스키마를 기반으로 LOG 테이블 생성
   * @param {string} tableName
   * @param {import('./types').TableSchema} schema
   */
  createLogTable(tableName, schema) {
    const colDefs = schema.columns.map(c => `${c.name} ${c.sqlType()}`);
    this.execute(`CREATE TABLE ${tableName} (${colDefs.join(', ')})`);
  }
}

module.exports = { MachbaseClient, ColumnType, Column, TableSchema };
