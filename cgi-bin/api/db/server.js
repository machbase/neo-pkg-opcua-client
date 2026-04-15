/**
 * POST   /cgi-bin/api/db/server          -- DB 서버 등록 (body: { name, host, port, user, password })
 * GET    /cgi-bin/api/db/server?name=xxx -- 단건 조회
 * PUT    /cgi-bin/api/db/server?name=xxx -- 수정
 * DELETE /cgi-bin/api/db/server?name=xxx -- 삭제
 */

const path = require('path');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const { CGI } = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));
const Handler = require(path.join(ROOT, 'src', 'cgi', 'handler.js'));

const { name } = CGI.parseQuery();
const reply = (r) => CGI.reply(r);

function validateServerBody(body) {
  if (!body.host) {
    return 'host is required';
  }
  if (body.port === undefined || body.port === null || body.port === '') {
    return 'port is required';
  }
  if (!body.user) {
    return 'user is required';
  }
  if (body.password === undefined || body.password === null) {
    return 'password is required';
  }
  return null;
}

const handlers = {
  POST: () => {
    const body = CGI.readBody();
    if (!body.name) {
      reply({ ok: false, reason: 'name is required' });
      return;
    }
    const err = validateServerBody(body);
    if (err) {
      reply({ ok: false, reason: err });
      return;
    }
    Handler.serverPost(body.name, {
      host: body.host,
      port: Number(body.port),
      user: body.user,
      password: body.password,
    }, reply);
  },
  GET: () => {
    if (!name) {
      reply({ ok: false, reason: 'name is required' });
      return;
    }
    Handler.serverGet(name, reply);
  },
  PUT: () => {
    if (!name) {
      reply({ ok: false, reason: 'name is required' });
      return;
    }
    const body = CGI.readBody();
    const err = validateServerBody(body);
    if (err) {
      reply({ ok: false, reason: err });
      return;
    }
    Handler.serverPut(name, {
      host: body.host,
      port: Number(body.port),
      user: body.user,
      password: body.password,
    }, reply);
  },
  DELETE: () => {
    if (!name) {
      reply({ ok: false, reason: 'name is required' });
      return;
    }
    Handler.serverDelete(name, reply);
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
