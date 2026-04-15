/**
 * GET /cgi-bin/api/opcua/read?endpoint=xxx&nodes=id1,id2  -- OPC UA 노드 일회성 읽기
 */

const path = require('path');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const { CGI } = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));
const Handler = require(path.join(ROOT, 'src', 'cgi', 'handler.js'));

const { endpoint, nodes } = CGI.parseQuery();
const reply = (r) => CGI.reply(r);

const handlers = {
  GET: () => {
    if (!endpoint) {
      reply({ ok: false, reason: 'endpoint is required' });
      return;
    }
    if (!nodes) {
      reply({ ok: false, reason: 'nodes is required' });
      return;
    }
    const nodeIds = nodes.split(',').map(n => n.trim()).filter(n => n.length > 0);
    if (nodeIds.length === 0) {
      reply({ ok: false, reason: 'nodes is empty' });
      return;
    }
    Handler.opcuaRead(endpoint, nodeIds, reply);
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
