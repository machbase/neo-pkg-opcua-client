/**
 * GET /cgi-bin/api/log/list  -- 로그 파일 이름 목록 조회
 */

const path = require('path');
const fs = require('fs');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const { CGI } = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));
const { LOG_DIR } = require(path.join(ROOT, 'src', 'lib', 'logger.js'));

const reply = (r) => CGI.reply(r);

const handlers = {
  GET: () => {
    let files;
    let dirError = null;
    try {
      files = fs.readdirSync(LOG_DIR).filter((f) => f.endsWith('.log'));
    } catch (err) {
      files = [];
      dirError = err && err.message ? err.message : String(err);
    }
    files.sort();
    reply({ ok: true, data: files, dir: LOG_DIR, dirError });
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
