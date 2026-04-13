/**
 * GET /cgi-bin/api/collector/last-time?name=xxx  -- 마지막 성공 수집 시간 조회
 */

const path = require('path');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const { CGI } = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));
const Handler = require(path.join(ROOT, 'src', 'cgi', 'handler.js'));

const { name } = CGI.parseQuery();

const handlers = {
  GET: () => Handler.collectorLastTime(name),
};
const method = (process.env.get('REQUEST_METHOD') || 'GET').toUpperCase();
try {
  const handler = handlers[method] || (() => {
    CGI.reply({
      ok: false,
      reason: 'method not allowed',
    });
  });
  handler();
} catch (err) {
  CGI.reply({
    ok: false,
    reason: err && err.message ? err.message : String(err),
  });
}
