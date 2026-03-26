/**
 * GET /cgi-bin/api/collector/list  -- 목록 조회
 */

const path = require('path');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const CGI = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));

function GET() {
  const names = CGI.listConfigs();
  const data = names.map(name => ({
    name,
    running: CGI.isRunning(name),
  }));
  CGI.reply({ ok: true, data });
}

const handlers = { GET };
const method = (process.env.get('REQUEST_METHOD') || 'GET').toUpperCase();
(handlers[method] || (() => CGI.reply({ ok: false, reason: 'method not allowed' })))();
