/**
 * POST /cgi-bin/api/db/database/list
 * body: { server } 또는 { profile }
 */

const path = require('path');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const { CGI } = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));
const Handler = require(path.join(ROOT, 'src', 'cgi', 'handler.js'));

function POST() {
  Handler.databaseList(CGI.readBody(), (result) => CGI.reply(result));
}

const handlers = { POST };
const method = (process.env.get('REQUEST_METHOD') || 'POST').toUpperCase();
try {
  (handlers[method] || (() => CGI.reply({ ok: false, reason: 'method not allowed' })))();
} catch (err) {
  CGI.reply({ ok: false, reason: err && err.message ? err.message : String(err) });
}
