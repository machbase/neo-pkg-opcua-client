/** POST: project the selected keys of one collector's JSON values. */
const path = require('path');
const process = require('process');
const argv = process.argv[1];
const ROOT = argv.slice(0, argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const { CGI } = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));
const Handler = require(path.join(ROOT, 'src', 'cgi', 'handler.js'));

try {
  if ((process.env.get('REQUEST_METHOD') || 'GET').toUpperCase() !== 'POST') {
    CGI.reply({ ok: false, reason: 'method not allowed' });
  } else {
    const body = CGI.readBody();
    const db = body.server && CGI.getServerConfig(body.server);
    if (!db) CGI.reply({ ok: false, reason: 'database server not found' });
    else Handler.dbTableJsonKeys(db, body, result => CGI.reply(result));
  }
} catch (err) {
  CGI.reply({ ok: false, reason: err.message || String(err) });
}
