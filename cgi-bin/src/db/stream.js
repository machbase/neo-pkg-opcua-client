'use strict';

const { getInstance: getLogger } = require('../lib/logger.js');


/**
 * Machbase append 스트림 래퍼
 *
 * append 스트림의 생명주기(열기/쓰기/닫기)만 담당한다.
 * client 생명주기는 호출자가 관리한다.
 */
class MachbaseStream {
  constructor() {
    this.stream = null;
  }

  /**
   * append 스트림 열기
   * @param {MachbaseClient} client
   * @param {string} table
   * @param {Array<{ name: string, type: string }>} columns
   * @returns {Error|null}
   */
  open(client, table, columns) {
    try {
      this.stream = client.openAppender(table, columns);
      return null;
    } catch (err) {
      getLogger().error('stream', { table, msg: `open failed: ${err.message}` });
      return err;
    }
  }

  /**
   * 행렬 데이터 append
   * @param {Array<Array>} matrix - 컬럼 순서대로 정렬된 값 배열의 배열
   * @returns {Error|null}
   */
  append(matrix) {
    if (!matrix || matrix.length === 0) return null;
    if (!this.stream) return new Error('MachbaseStream.append called before open()');
    try {
      for (const row of matrix) {
        this.stream.append(...row);
      }
      this.stream.flush();
      return null;
    } catch (err) {
      getLogger().error('stream', { msg: `append failed: ${err.message}` });
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
        getLogger().error('stream', { msg: `stream close failed: ${err.message}` });
        this.stream = null;
        return err;
      }
      this.stream = null;
    }
    return null;
  }
}

module.exports = { MachbaseStream };
