/**
 * GET /cgi-bin/api/log/content?name=repli.log[&start=1&end=10]  -- 로그 파일 내용 조회
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
    const { name, start, end } = CGI.parseQuery();
    if (!name) {
      reply({ ok: false, reason: 'name is required' });
      return;
    }

    // path traversal 방지: 파일명만 허용 (디렉토리 구분자 차단)
    if (name.indexOf('/') >= 0 || name.indexOf('\\') >= 0 || name.indexOf('..') >= 0) {
      reply({ ok: false, reason: 'invalid file name' });
      return;
    }

    const filePath = path.join(LOG_DIR, name);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      const notFound = msg.indexOf('ENOENT') >= 0 || msg.indexOf('no such file') >= 0;
      reply({ ok: false, reason: notFound ? 'file not found: ' + name : msg });
      return;
    }

    const allLines = content ? content.split('\n') : [];
    if (allLines.length > 0 && allLines[allLines.length - 1] === '') {
      allLines.pop();
    }
    const totalLines = allLines.length;

    const startLine = start !== undefined ? parseInt(start, 10) : 1;
    const endLine = end !== undefined ? parseInt(end, 10) : totalLines;

    if (isNaN(startLine) || isNaN(endLine) || startLine < 1 || endLine < startLine) {
      reply({ ok: false, reason: 'invalid start/end' });
      return;
    }

    const lines = allLines.slice(startLine - 1, endLine);
    reply({ ok: true, data: { name, start: startLine, end: endLine, totalLines, lines } });
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
