/**
 * GET /cgi-bin/api/log/list  -- 로그 파일 이름 목록 조회
 */

const path = require('path');
const fs = require('fs');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const { CGI } = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));

const HOME = process.env.get('HOME');
const PKG_NAME = path.basename(path.dirname(ROOT));
const LOG_DIR = path.join(HOME, 'public', 'logs', PKG_NAME);

const reply = (r) => CGI.reply(r);

const handlers = {
  GET: () => {
    let files;
    try {
      files = fs.readdirSync(LOG_DIR).filter((f) => f.endsWith('.log'));
    } catch (_) {
      files = [];
    }
    files.sort();
    reply({ ok: true, data: files });
  },
};

const method = (process.env.get('REQUEST_METHOD') || 'GET').toUpperCase();
try {
  const handler = handlers[method] || (() => {
    reply({ ok: false, reason: 'method not allowed' });
  });
  handler();
} catch (err) {
  reply({ ok: false, reason: err && err.message ? err.message : String(err) });
}
