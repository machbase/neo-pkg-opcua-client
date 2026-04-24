/**
 * GET /cgi-bin/api/log/content/all?name=repli.log  -- 로그 파일 전체 내용 조회
 */

const path = require('path');
const fs = require('fs');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const { CGI } = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));

const reply = (r) => CGI.reply(r);

const handlers = {
  GET: () => {
    const { name } = CGI.parseQuery();
    if (!name) {
      reply({ ok: false, reason: 'name is required' });
      return;
    }

    let filePath;
    try {
      filePath = CGI.resolveLogFilePath(name);
    } catch (err) {
      reply({ ok: false, reason: err.message });
      return;
    }
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      const notFound = msg.indexOf('ENOENT') >= 0 || msg.indexOf('no such file') >= 0;
      reply({ ok: false, reason: notFound ? 'file not found: ' + name : msg });
      return;
    }

    reply({ ok: true, data: { name, content } });
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
