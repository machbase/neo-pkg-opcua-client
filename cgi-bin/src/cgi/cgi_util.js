'use strict';

const fs = require('fs');
const path = require('path');
const process = require('process');

const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const CONF_DIR = path.join(ROOT, 'conf.d');
const RUN_DIR  = path.join(ROOT, 'run');

class CGI {

  // ── conf.d CRUD ─────────────────────────────────────────────────────────────

  static listConfigs() {
    try {
      return fs.readdirSync(CONF_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace(/\.json$/, ''));
    } catch (_) {
      return [];
    }
  }

  static readConfig(name) {
    try {
      const raw = fs.readFileSync(path.join(CONF_DIR, `${name}.json`), 'utf8');
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  static writeConfig(name, config) {
    const filePath = path.join(CONF_DIR, `${name}.json`);
    const tmpPath = `${filePath}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
  }

  static deleteConfig(name) {
    try { fs.unlinkSync(path.join(CONF_DIR, `${name}.json`)); } catch (_) {}
  }

  // ── CGI 헬퍼 ──────────────────────────────────────────────────────────────

  static parseQuery() {
    const qs = process.env.get('QUERY_STRING') || '';
    const result = {};
    for (const part of qs.split('&')) {
      const [k, v] = part.split('=');
      if (k) result[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
    return result;
  }

  static readBody() {
    try {
      const raw = process.stdin.read();
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  static reply(data) {
    const body = JSON.stringify(data);
    process.stdout.write('Content-Type: application/json\r\n');
    process.stdout.write('\r\n');
    process.stdout.write(body);
  }

  // ── 실행 상태 ──────────────────────────────────────────────────────────────

  static isRunning(name) {
    return fs.existsSync(path.join(RUN_DIR, `${name}.pid`));
  }
}

module.exports = CGI;
