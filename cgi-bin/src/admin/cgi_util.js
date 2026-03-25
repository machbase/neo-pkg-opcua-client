'use strict';

const fs = require('fs');
const path = require('path');
const process = require('process');

const CONF_DIR = path.join(process.cwd(), 'cgi-bin', 'conf.d');

// ── conf.d CRUD ───────────────────────────────────────────────────────────────

function listConfigs() {
  try {
    return fs.readdirSync(CONF_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/\.json$/, ''));
  } catch (_) {
    return [];
  }
}

function readConfig(name) {
  try {
    const raw = fs.readFileSync(path.join(CONF_DIR, `${name}.json`), 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function writeConfig(name, config) {
  const filePath = path.join(CONF_DIR, `${name}.json`);
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function deleteConfig(name) {
  try { fs.unlinkSync(path.join(CONF_DIR, `${name}.json`)); } catch (_) {}
}

// ── CGI 헬퍼 ─────────────────────────────────────────────────────────────────

function parseQuery() {
  const qs = process.env.get('QUERY_STRING') || '';
  const result = {};
  for (const part of qs.split('&')) {
    const [k, v] = part.split('=');
    if (k) result[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return result;
}

function readBody() {
  try {
    const raw = process.stdin.read();
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function reply(status, data) {
  const body = JSON.stringify(data);
  const byteLen = unescape(encodeURIComponent(body)).length;
  process.stdout.write(`Status: ${status}\r\n`);
  process.stdout.write('Content-Type: application/json\r\n');
  process.stdout.write(`Content-Length: ${byteLen}\r\n`);
  process.stdout.write('\r\n');
  process.stdout.write(body);
}

module.exports = { listConfigs, readConfig, writeConfig, deleteConfig, parseQuery, readBody, reply };
