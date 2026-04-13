'use strict';

// ─── ColumnType ───────────────────────────────────────────────────────────────

/**
 * Machbase 컬럼 타입 정의
 * (공식 문서: https://docs.machbase.com/dbms/sql-reference/datatypes/#data-type-table)
 *
 * @property {string|null} ddlType - CREATE TABLE DDL 타입 (고정 길이) 또는 null (VARCHAR 등 가변)
 */
class ColumnType {
  constructor(ddlType) {
    this.ddlType = ddlType;
  }

  static SHORT     = new ColumnType('SHORT');
  static USHORT    = new ColumnType('SHORT');
  static INTEGER   = new ColumnType('INTEGER');
  static UINTEGER  = new ColumnType('INTEGER');
  static LONG      = new ColumnType('LONG');
  static ULONG     = new ColumnType('LONG');
  static DATETIME  = new ColumnType('DATETIME');
  static FLOAT     = new ColumnType('FLOAT');
  static DOUBLE    = new ColumnType('DOUBLE');
  static VARCHAR   = new ColumnType(null);
  static TEXT      = new ColumnType('TEXT');
  static CLOB      = new ColumnType('CLOB');
  static BLOB      = new ColumnType('BLOB');
  static BINARY    = new ColumnType('BINARY');
  static IPV4      = new ColumnType('IPV4');
  static IPV6      = new ColumnType('IPV6');
  static JSON      = new ColumnType('JSON');
  static UNKNOWN   = new ColumnType(null);

  /** @type {Map<number, ColumnType>} */
  static #byCode = new Map([
    [4,   ColumnType.SHORT],   [104, ColumnType.USHORT],
    [8,   ColumnType.INTEGER], [108, ColumnType.UINTEGER],
    [12,  ColumnType.LONG],    [112, ColumnType.ULONG],
    [6,   ColumnType.DATETIME],
    [16,  ColumnType.FLOAT],   [20,  ColumnType.DOUBLE],
    [5,   ColumnType.VARCHAR], [49,  ColumnType.TEXT],
    [53,  ColumnType.CLOB],    [57,  ColumnType.BLOB],
    [97,  ColumnType.BINARY],  [32,  ColumnType.IPV4],
    [36,  ColumnType.IPV6],    [61,  ColumnType.JSON],
  ]);

  /**
   * M$SYS_COLUMNS.TYPE 코드로 ColumnType 인스턴스 반환
   * @param {number} code
   * @returns {ColumnType}
   */
  static fromCode(code) {
    return ColumnType.#byCode.get(code) ?? ColumnType.UNKNOWN;
  }
}

// ─── Column FLAG 상수 ─────────────────────────────────────────────────────────

/** M$SYS_COLUMNS.FLAG 비트 상수 */
const FLAG_BASETIME   = 0x1000000;  // 16777216  — BASETIME 컬럼
const FLAG_SUMMARIZED = 0x2000000;  // 33554432  — SUMMARIZED 컬럼
const FLAG_METADATA   = 0x4000000;  // 67108864  — TAG META 추가 속성 컬럼
const FLAG_PRIMARY    = 0x8000000;  // 134217728 — PRIMARY KEY 컬럼

// ─── Column ───────────────────────────────────────────────────────────────────

/**
 * 테이블 컬럼 메타정보
 *
 * @property {string} name - 컬럼명 (UPPERCASE, M$SYS_COLUMNS 기준)
 * @property {ColumnType} columnType - 컬럼 타입
 * @property {number} id - 컬럼 ID (M$SYS_COLUMNS.ID)
 * @property {number} flag - M$SYS_COLUMNS.FLAG 원본값 (FLAG_* 상수로 비트 검사)
 * @property {number} length - M$SYS_COLUMNS.LENGTH (VARCHAR 가변 길이)
 */
class Column {
  constructor(name, columnType, id, flag, length = 0) {
    this.name       = name;
    this.columnType = columnType;
    this.id         = id;
    this.flag       = flag;
    this.length     = length;
  }

  /**
   * CREATE TABLE DDL 타입 문자열 (예: 'VARCHAR(80)', 'DOUBLE')
   * @returns {string}
   */
  sqlType() {
    if (this.columnType.ddlType !== null) return this.columnType.ddlType;
    return `VARCHAR(${this.length})`;
  }
}

// ─── TableSchema ─────────────────────────────────────────────────────────────

/**
 * 불변 테이블 컬럼 구조 정보
 *
 * @property {string} tableType - 'TAG' | 'LOG'
 * @property {string} logicalTable
 * @property {Column[]} columns
 */
class TableSchema {
  constructor(tableType, logicalTable, columns) {
    this.tableType = tableType;
    this.logicalTable = logicalTable;
    /** @type {Column[]} */
    this.columns = columns || [];
  }
}

module.exports = { ColumnType, Column, TableSchema, FLAG_BASETIME, FLAG_SUMMARIZED, FLAG_METADATA, FLAG_PRIMARY };
