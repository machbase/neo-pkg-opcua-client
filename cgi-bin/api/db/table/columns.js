/**
 * GET /cgi-bin/api/db/table/columns?server=xxx&table=xxx  -- 테이블 컬럼 목록 조회
 */

const path = require('path');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const { CGI } = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));
const Handler = require(path.join(ROOT, 'src', 'cgi', 'handler.js'));

const { server, table } = CGI.parseQuery();
const reply = (r) => CGI.reply(r);

const handlers = {
  GET: () => {
    if (!server) {
      reply({ ok: false, reason: 'server is required' });
      return;
    }
    if (!table) {
      reply({ ok: false, reason: 'table is required' });
      return;
    }
    const db = CGI.getServerConfig(server);
    if (!db) {
      reply({ ok: false, reason: `server '${server}' not found` });
      return;
    }
    Handler.dbTableColumns(db, table, reply);
  },
};
const method = (process.env.get('REQUEST_METHOD') || 'GET').toUpperCase();
try {
  const handler = handlers[method] || (() => {
    reply({
      ok: false,
      reason: 'method not allowed',
    });
  });
  handler();
} catch (err) {
  reply({
    ok: false,
    reason: err && err.message ? err.message : String(err),
  });
}
