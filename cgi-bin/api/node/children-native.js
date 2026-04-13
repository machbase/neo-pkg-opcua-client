/**
 * POST /cgi-bin/api/node/children-native  -- OPC UA 노드 native children 조회
 *
 * body: { endpoint, node, nodeClassMask? }
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
    if (!body.endpoint) {
      reply({ ok: false, reason: 'endpoint is required' });
      return;
    }
    if (!body.node) {
      reply({ ok: false, reason: 'node is required' });
      return;
    }
    Handler.nodeChildrenNative(body, reply);
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
