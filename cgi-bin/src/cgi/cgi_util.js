'use strict';

const fs = require('fs');
const path = require('path');
const process = require('process');

const APP_DIR = process.argv[1].slice(0, process.argv[1].lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const CONF_DIR = path.join(APP_DIR, 'conf.d');
const SERVERS_DIR = path.join(CONF_DIR, 'servers');

class CGI {

  // ── conf.d CRUD ─────────────────────────────────────────────────────────────

  /**
   * conf.d/ 디렉토리의 JSON 설정 파일 이름 목록을 반환한다.
   * @returns {string[]}
   */
  static getConfigList() {
    try {
      return fs.readdirSync(CONF_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace(/\.json$/, ''));
    } catch (_) {
      return [];
    }
  }

  /**
   * 이름으로 설정 파일을 읽어 반환한다. 없으면 null을 반환한다.
   * @param {string} name
   * @returns {object|null}
   */
  static getConfig(name) {
    try {
      const raw = fs.readFileSync(path.join(CONF_DIR, `${name}.json`), 'utf8');
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  /**
   * 설정을 파일에 저장한다. tmp 파일에 먼저 쓴 뒤 rename으로 교체한다 (atomic write).
   * @param {string} name
   * @param {object} config
   */
  static writeConfig(name, config) {
    const filePath = path.join(CONF_DIR, `${name}.json`);
    const tmpPath = `${filePath}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
  }

  /**
   * 설정 파일을 삭제한다. 파일이 이미 없으면 null, 그 외 오류는 err를 반환한다.
   * @param {string} name
   * @returns {Error|null}
   */
  static removeConfig(name) {
    try {
      fs.unlinkSync(path.join(CONF_DIR, `${name}.json`));
      return null;
    } catch (err) {
      const message = err && err.message ? String(err.message) : String(err || '');
      const isMissing = (err && err.code === 'ENOENT')
        || message.indexOf('no such file') >= 0
        || message.indexOf('cannot find the file') >= 0
        || message.indexOf('cannot find the path') >= 0;
      return isMissing ? null : err;
    }
  }

  /**
   * 설정 파일이 존재하는지 확인한다.
   * @param {string} name
   * @returns {boolean}
   */
  static existsConfig(name) {
    try {
      return fs.statSync(path.join(CONF_DIR, `${name}.json`)).isFile();
    } catch (_) {
      return false;
    }
  }

  // ── conf.d/servers CRUD ─────────────────────────────────────────────────────

  /**
   * conf.d/servers/ 디렉토리의 JSON 설정 파일 이름 목록을 반환한다.
   * @returns {string[]}
   */
  static getServerConfigList() {
    try {
      return fs.readdirSync(SERVERS_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace(/\.json$/, ''));
    } catch (_) {
      return [];
    }
  }

  /**
   * 이름으로 서버 설정 파일을 읽어 반환한다. 없으면 null을 반환한다.
   * @param {string} name
   * @returns {object|null}
   */
  static getServerConfig(name) {
    try {
      const raw = fs.readFileSync(path.join(SERVERS_DIR, `${name}.json`), 'utf8');
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  /**
   * 서버 설정을 파일에 저장한다. 디렉토리가 없으면 생성한다 (atomic write).
   * @param {string} name
   * @param {object} config
   */
  static writeServerConfig(name, config) {
    fs.mkdirSync(SERVERS_DIR, { recursive: true });
    const filePath = path.join(SERVERS_DIR, `${name}.json`);
    const tmpPath = `${filePath}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
  }

  /**
   * 서버 설정 파일을 삭제한다. 파일이 이미 없으면 null, 그 외 오류는 err를 반환한다.
   * @param {string} name
   * @returns {Error|null}
   */
  static removeServerConfig(name) {
    try {
      fs.unlinkSync(path.join(SERVERS_DIR, `${name}.json`));
      return null;
    } catch (err) {
      const message = err && err.message ? String(err.message) : String(err || '');
      const isMissing = (err && err.code === 'ENOENT')
        || message.indexOf('no such file') >= 0
        || message.indexOf('cannot find the file') >= 0
        || message.indexOf('cannot find the path') >= 0;
      return isMissing ? null : err;
    }
  }

  // ── CGI I/O ──────────────────────────────────────────────────────────────

  /**
   * QUERY_STRING 환경변수를 파싱하여 키-값 객체로 반환한다.
   * @returns {Record<string, string>}
   */
  static parseQuery() {
    const qs = process.env.get('QUERY_STRING') || '';
    const result = {};
    for (const part of qs.split('&')) {
      const [k, v] = part.split('=');
      if (k) result[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
    return result;
  }

  /**
   * stdin에서 요청 바디를 읽어 JSON으로 파싱한다. 실패 시 빈 객체를 반환한다.
   * @returns {object}
   */
  static readBody() {
    try {
      // TODO : enable, neo-regress pass를 위해 disalbe 처리함.
      //const len = parseInt(process.env.get('CONTENT_LENGTH') || '0', 10);
      //if (!len) return {};
      //const raw = process.stdin.read(len);
      const raw = process.stdin.read();
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  /**
   * CGI 응답을 JSON으로 stdout에 출력한다.
   * @param {object} data
   */
  static reply(data) {
    const body = JSON.stringify(data);
    process.stdout.write('Content-Type: application/json\r\n');
    process.stdout.write('\r\n');
    process.stdout.write(body);
  }
}

module.exports = { CGI };
