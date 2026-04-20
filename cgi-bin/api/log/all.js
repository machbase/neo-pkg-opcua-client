/**
 * GET /cgi-bin/api/log/all  -- 패키지 전체 로그 파일 목록 조회
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
    try {
      files = fs.readdirSync(LOG_DIR).filter((f) => f.endsWith('.log'));
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      const notFound = msg.indexOf('ENOENT') >= 0 || msg.indexOf('no such file') >= 0;
      if (notFound) {
        files = [];
      } else {
        reply({ ok: false, reason: msg });
        return;
      }
    }
    files.sort();
    const fileInfos = files.map((name) => {
      const filePath = path.join(LOG_DIR, name);
      let size = 0;
      try {
        const stat = fs.statSync(filePath);
        size = stat.size;
      } catch (_) {}
      return { name, size };
    });
    reply({ ok: true, data: { files: fileInfos } });
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
