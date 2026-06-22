/**
 * GET /cgi-bin/api/db/table/data?server=xxx&table=xxx&name=xxx
 * GET /cgi-bin/api/db/table/data?server=xxx&table=xxx&names=xxx,yyy
 */

const path = require('path');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const { CGI } = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));
const Handler = require(path.join(ROOT, 'src', 'cgi', 'handler.js'));

const query = CGI.parseQuery({ arrayKeys: ['names'] });
const reply = (r) => CGI.reply(r);

const handlers = {
  GET: () => {
    if (!query.server) {
      reply({ ok: false, reason: 'server is required' });
      return;
    }
    if (!query.table) {
      reply({ ok: false, reason: 'table is required' });
      return;
    }
    if (!query.name && !query.names) {
      reply({ ok: false, reason: 'name is required' });
      return;
    }
    const db = CGI.getServerConfig(query.server);
    if (!db) {
      reply({ ok: false, reason: `server '${query.server}' not found` });
      return;
    }
    const params = {
      table: query.table,
      name: query.name,
      names: query.names,
      valueColumn: query.valueColumn,
      stringValueColumn: query.stringValueColumn,
      primaryColumn: query.primaryColumn,
      timeColumn: query.timeColumn,
      direction: query.direction,
      from: query.from,
      to: query.to,
      page: query.page,
      pageSize: query.pageSize,
    };
    if (query.includeTotal === 'true') {
      Handler.dbTableDataTotal(db, params, reply);
      return;
    }
    Handler.dbTableData(db, params, reply);
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
