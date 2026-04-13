/**
 * POST /cgi-bin/api/db/table/columns  -- 테이블 컬럼 목록 조회
 *
 * body: { host, port, user, password, table }
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
    const db = body && body.db && typeof body.db === 'object' ? body.db : body;
    if (!db || typeof db !== 'object') {
      reply({ ok: false, reason: 'db config is required' });
      return;
    }
    if (!db.host) {
      reply({ ok: false, reason: 'db.host is required' });
      return;
    }
    if (db.port === undefined || db.port === null || db.port === '') {
      reply({ ok: false, reason: 'db.port is required' });
      return;
    }
    if (!db.user) {
      reply({ ok: false, reason: 'db.user is required' });
      return;
    }
    if (db.password === undefined || db.password === null) {
      reply({ ok: false, reason: 'db.password is required' });
      return;
    }
    if (!db.table) {
      reply({ ok: false, reason: 'db.table is required' });
      return;
    }
    Handler.dbTableColumns({
      host: db.host,
      port: Number(db.port),
      user: db.user,
      password: db.password,
      table: db.table,
    }, reply);
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
