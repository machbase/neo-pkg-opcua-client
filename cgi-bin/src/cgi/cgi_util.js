'use strict';

const fs = require('fs');
const path = require('path');
const process = require('process');
const { LOG_DIR } = require('../lib/logger.js');
const {
  protectServerConfig,
  revealServerConfig,
  protectOpcuaServerConfig,
  revealOpcuaServerConfig,
} = require('./secret.js');
const { mergeCollectorConfig } = require('../config/collector-config.js');

const APP_DIR = process.argv[1].slice(0, process.argv[1].lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const CONF_DIR = path.join(APP_DIR, 'conf.d');
const SERVERS_DIR = path.join(CONF_DIR, 'servers');
const OPCUA_SERVERS_DIR = path.join(CONF_DIR, 'opcua-servers');
const OPCUA_CERTS_DIR = path.join(CONF_DIR, 'opcua-certs');
const DATA_DIR = path.join(APP_DIR, 'data');

fs.mkdirSync(CONF_DIR, { recursive: true });
fs.mkdirSync(SERVERS_DIR, { recursive: true });
fs.mkdirSync(OPCUA_SERVERS_DIR, { recursive: true });
fs.mkdirSync(OPCUA_CERTS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

function timeToJsonString(value) {
  if (!value) return '';
  if (typeof value.toISOString === 'function') {
    return value.toISOString();
  }
  try {
    const text = JSON.stringify(value);
    if (typeof text === 'string' && text.length >= 2 && text[0] === '"' && text[text.length - 1] === '"') {
      return text.slice(1, -1);
    }
  } catch (_) {}
  return String(value);
}

function decodeQueryComponent(value) {
  return decodeURIComponent(String(value || '').replace(/\+/g, ' '));
}

function getEnv(name) {
  if (process.env && typeof process.env.get === 'function') {
    return process.env.get(name);
  }
  return process.env ? process.env[name] : undefined;
}

class CGI {
  /**
   * 로그 디렉토리 경로를 반환한다.
   * @returns {string}
   */
  static getLogDir() {
    return LOG_DIR;
  }

  /**
   * log API에서 사용할 파일명을 검증하고 절대경로로 변환한다.
   * 경로 탐색은 허용하지 않는다.
   * @param {string} name
   * @returns {string}
   */
  static resolveLogFilePath(name) {
    const fileName = String(name || '').trim();
    if (!fileName) {
      throw new Error('name is required');
    }
    if (fileName.indexOf('/') >= 0 || fileName.indexOf('\\') >= 0 || fileName.indexOf('..') >= 0) {
      throw new Error('invalid file name');
    }
    return path.join(CGI.getLogDir(), fileName);
  }

  /**
   * collector name 기준 active log 파일 경로를 반환한다.
   * 실시간 tail 대상은 항상 {name}.log 이다.
   * @param {string} name
   * @returns {string}
   */
  static resolveActiveLogFilePath(name) {
    const text = String(name || '').trim();
    if (!text) {
      throw new Error('name is required');
    }
    if (text.indexOf('/') >= 0 || text.indexOf('\\') >= 0 || text.indexOf('..') >= 0) {
      throw new Error('invalid log name');
    }
    return CGI.resolveLogFilePath(`${text}.log`);
  }

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
      return mergeCollectorConfig(JSON.parse(raw));
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
    fs.writeFileSync(tmpPath, JSON.stringify(mergeCollectorConfig(config), null, 2), 'utf8');
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
      return revealServerConfig(JSON.parse(raw));
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
    fs.writeFileSync(tmpPath, JSON.stringify(protectServerConfig(config), null, 2), 'utf8');
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

  // ── conf.d/opcua-servers CRUD ───────────────────────────────────────────────

  /**
   * conf.d/opcua-servers/ 디렉토리의 JSON 설정 파일 이름 목록을 반환한다.
   * @returns {string[]}
   */
  static getOpcuaServerConfigList() {
    try {
      return fs.readdirSync(OPCUA_SERVERS_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace(/\.json$/, ''));
    } catch (_) {
      return [];
    }
  }

  /**
   * 이름으로 OPC UA 서버 설정 파일을 읽어 반환한다. 없으면 null을 반환한다.
   * @param {string} name
   * @returns {object|null}
   */
  static getOpcuaServerConfig(name) {
    try {
      const raw = fs.readFileSync(path.join(OPCUA_SERVERS_DIR, `${name}.json`), 'utf8');
      return revealOpcuaServerConfig(JSON.parse(raw));
    } catch (_) {
      return null;
    }
  }

  /**
   * OPC UA 서버 설정을 파일에 저장한다. 디렉토리가 없으면 생성한다 (atomic write).
   * @param {string} name
   * @param {object} config
   */
  static writeOpcuaServerConfig(name, config) {
    fs.mkdirSync(OPCUA_SERVERS_DIR, { recursive: true });
    const filePath = path.join(OPCUA_SERVERS_DIR, `${name}.json`);
    const tmpPath = `${filePath}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(protectOpcuaServerConfig(config), null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
  }

  /**
   * OPC UA 서버 설정 파일을 삭제한다. 파일이 이미 없으면 null, 그 외 오류는 err를 반환한다.
   * @param {string} name
   * @returns {Error|null}
   */
  static removeOpcuaServerConfig(name) {
    try {
      fs.unlinkSync(path.join(OPCUA_SERVERS_DIR, `${name}.json`));
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

  static _assertSafeOpcuaServerName(name) {
    const value = String(name || '').trim();
    if (!value || value.indexOf('/') >= 0 || value.indexOf('\\') >= 0 || value.indexOf('..') >= 0) {
      throw new Error('invalid opcua server name');
    }
    return value;
  }

  static resolveOpcuaServerCertDir(name) {
    const serverName = CGI._assertSafeOpcuaServerName(name);
    return path.join(OPCUA_CERTS_DIR, serverName);
  }

  static getOpcuaServerCredentialFilePaths(name) {
    const certDir = CGI.resolveOpcuaServerCertDir(name);
    return {
      certificateFile: path.join(certDir, 'client_cert.pem'),
      keyFile: path.join(certDir, 'client_key.pem'),
    };
  }

  static writeOpcuaServerCredentialFiles(name, certificatePem, keyPem) {
    const certDir = CGI.resolveOpcuaServerCertDir(name);
    fs.mkdirSync(certDir, { recursive: true });
    const paths = CGI.getOpcuaServerCredentialFilePaths(name);
    const certTmp = `${paths.certificateFile}.${Date.now()}.tmp`;
    const keyTmp = `${paths.keyFile}.${Date.now()}.tmp`;
    fs.writeFileSync(certTmp, String(certificatePem), 'utf8');
    fs.writeFileSync(keyTmp, String(keyPem), 'utf8');
    fs.renameSync(certTmp, paths.certificateFile);
    fs.renameSync(keyTmp, paths.keyFile);
    return paths;
  }

  static getOpcuaServerCredentialFileInfo(name) {
    let paths;
    try {
      paths = CGI.getOpcuaServerCredentialFilePaths(name);
    } catch (_) {
      return {};
    }

    const fileInfo = (filePath) => {
      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) return null;
        return {
          exists: true,
          updatedAt: timeToJsonString(stat.mtime),
        };
      } catch (_) {
        return null;
      }
    };

    return {
      certificate: fileInfo(paths.certificateFile),
      key: fileInfo(paths.keyFile),
    };
  }

  static removeOpcuaServerCredentialFiles(name) {
    let certDir;
    let paths;
    try {
      certDir = CGI.resolveOpcuaServerCertDir(name);
      paths = CGI.getOpcuaServerCredentialFilePaths(name);
    } catch (err) {
      return err;
    }

    let firstErr = null;
    for (const filePath of [paths.certificateFile, paths.keyFile]) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        const message = err && err.message ? String(err.message) : String(err || '');
        const isMissing = (err && err.code === 'ENOENT')
          || message.indexOf('no such file') >= 0
          || message.indexOf('cannot find the file') >= 0
          || message.indexOf('cannot find the path') >= 0;
        if (!isMissing && !firstErr) firstErr = err;
      }
    }
    try {
      fs.rmdirSync(certDir);
    } catch (_) {}
    return firstErr;
  }

  // ── CGI I/O ──────────────────────────────────────────────────────────────

  /**
   * QUERY_STRING 환경변수를 파싱하여 키-값 객체로 반환한다.
   * 기본 동작은 기존 CGI API와 같게 반복 키의 마지막 값을 사용한다.
   * @param {{ arrayKeys?: string[], queryString?: string }} [options]
   * @returns {Record<string, string|string[]>}
   */
  static parseQuery(options = {}) {
    const qs = options.queryString !== undefined
      ? String(options.queryString || '')
      : (getEnv('QUERY_STRING') || '');
    const result = {};
    const arrayKeys = new Set(Array.isArray(options.arrayKeys) ? options.arrayKeys : []);
    for (const part of qs.split('&')) {
      const [k, v] = part.split('=');
      if (k) {
        const key = decodeQueryComponent(k);
        const value = decodeQueryComponent(v || '');
        if (arrayKeys.has(key) && Object.prototype.hasOwnProperty.call(result, key)) {
          if (Array.isArray(result[key])) result[key].push(value);
          else result[key] = [result[key], value];
        } else {
          result[key] = value;
        }
      }
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

module.exports = { CGI, CONF_DIR, DATA_DIR };
