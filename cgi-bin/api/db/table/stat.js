/** GET: collector time bounds used to resolve last-* ranges. */
const path = require('path');
const process = require('process');
const argv = process.argv[1];
const ROOT = argv.slice(0, argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const { CGI } = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));
const Handler = require(path.join(ROOT, 'src', 'cgi', 'handler.js'));

try {
  if ((process.env.get('REQUEST_METHOD') || 'GET').toUpperCase() !== 'GET') {
    CGI.reply({ ok: false, reason: 'method not allowed' });
  } else {
    const query = CGI.parseQuery({ arrayKeys: ['names'] });
    const db = query.server && CGI.getServerConfig(query.server);
    if (!db) CGI.reply({ ok: false, reason: 'database server not found' });
    else Handler.dbTableStat(db, query, result => CGI.reply(result));
  }
} catch (err) {
  CGI.reply({ ok: false, reason: err.message || String(err) });
}
