/**
 * POST /cgi-bin/api/node/children  -- OPC UA 노드 browse (프론트엔드용)
 *
 * body: { endpoint, node, nodeClassMask? }
 */

const path = require('path');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const { CGI } = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));
const Handler = require(path.join(ROOT, 'src', 'cgi', 'handler.js'));

const handlers = {
  POST: () => Handler.nodeChildren(CGI.readBody()),
};
const method = (process.env.get('REQUEST_METHOD') || 'GET').toUpperCase();
try {
  const handler = handlers[method] || (() => {
    CGI.reply({
      ok: false,
      reason: 'method not allowed',
    });
  });
  handler();
} catch (err) {
  CGI.reply({
    ok: false,
    reason: err && err.message ? err.message : String(err),
  });
}
