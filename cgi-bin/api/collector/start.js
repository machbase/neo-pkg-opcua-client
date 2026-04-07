/**
 * POST /cgi-bin/api/collector/start?name=xxx  -- collector service 시작
 */

const path = require('path');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const CGI = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));

const { name } = CGI.parseQuery();

function errorMessage(err) {
  return err && err.message ? err.message : String(err);
}

function POST() {
  if (!name) return CGI.reply({ ok: false, reason: 'name is required' });
  if (!CGI.readConfig(name)) return CGI.reply({ ok: false, reason: `collector '${name}' not found` });
  CGI.startService(name, (err) => {
    if (err) {
      CGI.reply({ ok: false, reason: errorMessage(err) });
    } else {
      CGI.reply({ ok: true, data: { name } });
    }
  });
}

const handlers = { POST };
const method = (process.env.get('REQUEST_METHOD') || 'GET').toUpperCase();
try {
  (handlers[method] || (() => CGI.reply({ ok: false, reason: 'method not allowed' })))();
} catch (err) {
  CGI.reply({ ok: false, reason: errorMessage(err) });
}
