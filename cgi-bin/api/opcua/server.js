/**
 * POST   /cgi-bin/api/opcua/server          -- OPC UA 서버 등록 (body: { name, endpoint, security? })
 * GET    /cgi-bin/api/opcua/server?name=xxx -- 단건 조회
 * PUT    /cgi-bin/api/opcua/server?name=xxx -- 수정
 * DELETE /cgi-bin/api/opcua/server?name=xxx -- 삭제
 */

const path = require('path');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const { CGI } = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));
const Handler = require(path.join(ROOT, 'src', 'cgi', 'handler.js'));

const { name } = CGI.parseQuery();
const reply = (r) => CGI.reply(r);

function configFromBody(body) {
  return {
    endpoint: body.endpoint,
    security: body.security,
  };
}

const handlers = {
  POST: () => {
    const body = CGI.readBody();
    if (!body.name) {
      reply({ ok: false, reason: 'name is required' });
      return;
    }
    Handler.opcuaServerPost(body.name, configFromBody(body), reply);
  },
  GET: () => {
    if (!name) {
      reply({ ok: false, reason: 'name is required' });
      return;
    }
    Handler.opcuaServerGet(name, reply);
  },
  PUT: () => {
    if (!name) {
      reply({ ok: false, reason: 'name is required' });
      return;
    }
    const body = CGI.readBody();
    Handler.opcuaServerPut(name, configFromBody(body), reply);
  },
  DELETE: () => {
    if (!name) {
      reply({ ok: false, reason: 'name is required' });
      return;
    }
    Handler.opcuaServerDelete(name, reply);
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
