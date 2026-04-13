/**
 * POST   /cgi-bin/api/collector          -- 등록 (body: { name, config })
 * GET    /cgi-bin/api/collector?name=xxx -- 단건 조회
 * PUT    /cgi-bin/api/collector?name=xxx -- 수정 (body: config)
 * DELETE /cgi-bin/api/collector?name=xxx -- 제거
 */

const path = require('path');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const { CGI } = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));
const Handler = require(path.join(ROOT, 'src', 'cgi', 'handler.js'));

const { name } = CGI.parseQuery();
const reply = (r) => CGI.reply(r);

const handlers = {
  POST: () => {
    const body = CGI.readBody();
    if (!body.name) {
      reply({ ok: false, reason: 'name is required' });
      return;
    }
    if (!body.config) {
      reply({ ok: false, reason: 'config is required' });
      return;
    }
    Handler.collectorPost(body.name, body.config, reply);
  },
  GET: () => {
    if (!name) {
      reply({ ok: false, reason: 'name is required' });
      return;
    }
    Handler.collectorGet(name, reply);
  },
  PUT: () => {
    if (!name) {
      reply({ ok: false, reason: 'name is required' });
      return;
    }
    Handler.collectorPut(name, CGI.readBody(), reply);
  },
  DELETE: () => {
    if (!name) {
      reply({ ok: false, reason: 'name is required' });
      return;
    }
    Handler.collectorDelete(name, reply);
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
