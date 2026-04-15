'use strict';

const { FLAG_SUMMARIZED } = require('./types.js');

/**
 * Machbase append 스트림 래퍼
 *
 * open() 시 테이블 컬럼 목록을 조회하여 NAME / TIME / valueColumn 인덱스를 파악한다.
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
    this.valueIdx = -1;
  }

  /**
   * append 스트림 열기
   * @param {MachbaseClient} client
   * @param {string} table
   * @param {string} [valueColumn] - 값을 저장할 컬럼명. 기본값 "VALUE"
   * @returns {Error|null}
   */
  open(client, table, valueColumn) {
    const vcUpper = (valueColumn || 'VALUE').toUpperCase();
    try {
      const cols = client.selectColumnsByTableName(table);
      this._colCount = cols.length;
      this._nameIdx = -1;
      this._timeIdx = -1;
      this._valueIdx = -1;

      for (let i = 0; i < cols.length; i++) {
        const n = cols[i].NAME;
        if (n === 'NAME') {
          this._nameIdx = i;
        } else if (n === 'TIME') {
          this._timeIdx = i;
        } else if (n === vcUpper) {
          this._valueIdx = i;
        }
      }

      if (this._nameIdx < 0 || this._timeIdx < 0 || this._valueIdx < 0) {
        const missing = [];
        if (this._nameIdx < 0) missing.push('NAME');
        if (this._timeIdx < 0) missing.push('TIME');
        if (this._valueIdx < 0) missing.push(vcUpper);
        return new Error('column not found in table \'' + table + '\': ' + missing.join(', '));
      }

      const conflicting = cols.filter((c, i) => i !== this._nameIdx && i !== this._timeIdx && i !== this._valueIdx && (c.FLAG & FLAG_SUMMARIZED));
      if (conflicting.length > 0) {
        return new Error('table \'' + table + '\' has other SUMMARIZED columns that cannot be null: ' + conflicting.map(c => c.NAME).join(', ') + '. Use one of these as valueColumn instead.');
      }

      this.columnNames = cols.map(c => c.NAME);
      this.nameIdx = this._nameIdx;
      this.timeIdx = this._timeIdx;
      this.valueIdx = this._valueIdx;
      this.stream = client.openAppender(table);
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
    try {
      for (let r = 0; r < matrix.length; r++) {
        const row = matrix[r];
        const out = [];
        for (let i = 0; i < this._colCount; i++) {
          out.push(null);
        }
        out[this._nameIdx]  = row[0];
        out[this._timeIdx]  = row[1];
        out[this._valueIdx] = row[2];
        this.stream.append.apply(this.stream, out);
      }
      this.stream.flush();
      return null;
    } catch (err) {
      return err;
    }
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
