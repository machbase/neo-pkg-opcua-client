/**
 * GET /cgi-bin/api/log/content?file=repli.log  -- 로그 파일 내용 조회
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
    const { file } = CGI.parseQuery();
    if (!file) {
      reply({ ok: false, reason: 'file is required' });
      return;
    }

    // path traversal 방지: 파일명만 허용 (디렉토리 구분자 차단)
    if (file.indexOf('/') >= 0 || file.indexOf('\\') >= 0 || file.indexOf('..') >= 0) {
      reply({ ok: false, reason: 'invalid file name' });
      return;
    }

    const filePath = path.join(LOG_DIR, file);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      const notFound = msg.indexOf('ENOENT') >= 0 || msg.indexOf('no such file') >= 0;
      reply({ ok: false, reason: notFound ? 'file not found: ' + file : msg });
      return;
    }

    reply({ ok: true, data: { file, content } });
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
