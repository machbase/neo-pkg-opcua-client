/**
 * POST /cgi-bin/api/opcua/write  -- OPC UA 노드 일회성 쓰기
 *
 * body: { endpoint?, server?, writes: [{ node, value }, ...] }
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
    if (!body.endpoint && !body.server) {
      reply({ ok: false, reason: 'endpoint or server is required' });
      return;
    }
    if (!Array.isArray(body.writes) || body.writes.length === 0) {
      reply({ ok: false, reason: 'writes is required and must be a non-empty array' });
      return;
    }
    for (const w of body.writes) {
      if (!w.node) {
        reply({ ok: false, reason: 'each write entry must have a node' });
        return;
      }
      if (w.value === undefined || w.value === null) {
        reply({ ok: false, reason: `value is required for node '${w.node}'` });
        return;
      }
    }
    Handler.opcuaWrite({ endpoint: body.endpoint, server: body.server }, body.writes, reply);
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
