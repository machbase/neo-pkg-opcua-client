/**
 * POST /cgi-bin/api/db/table/create  -- TAG 테이블 생성
 *
 * body: { server: "server-name", table: "TAGDATA" }
 */

const path = require('path');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const { CGI } = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));
const Handler = require(path.join(ROOT, 'src', 'cgi', 'handler.js'));

const reply = (r) => CGI.reply(r);

const handlers = {
  POST: () => {
    const body = CGI.readBody();
    if (!body.server) {
      reply({ ok: false, reason: 'server is required' });
      return;
    }
    if (!body.table) {
      reply({ ok: false, reason: 'table is required' });
      return;
    }
    const db = CGI.getServerConfig(body.server);
    if (!db) {
      reply({ ok: false, reason: `server '${body.server}' not found` });
      return;
    }
    Handler.dbTableCreate({ ...db, table: body.table }, reply);
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
