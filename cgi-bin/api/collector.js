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

function validateCollectorConfig(config) {
  if (!config || !config.opcua) {
    return 'config.opcua is required';
  }
  if (config.opcua.interval === undefined || config.opcua.interval === null) {
    config.opcua.interval = 1000;
  }
  const interval = Number(config.opcua.interval);
  if (!Number.isFinite(interval) || interval < 1000) {
    return 'config.opcua.interval must be >= 1000 (ms)';
  }
  config.opcua.interval = interval;
  return null;
}

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
    const configErr = validateCollectorConfig(body.config);
    if (configErr) {
      reply({ ok: false, reason: configErr });
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
    const putBody = CGI.readBody();
    const putConfigErr = validateCollectorConfig(putBody);
    if (putConfigErr) {
      reply({ ok: false, reason: putConfigErr });
      return;
    }
    Handler.collectorPut(name, putBody, reply);
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
