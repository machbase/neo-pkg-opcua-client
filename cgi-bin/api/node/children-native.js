/**
 * POST /cgi-bin/api/node/children-native
 *
 * Legacy/native children route.
 * Calls opcua.Client#children() directly.
 *
 * body: {
 *   endpoint: string,          // OPC UA 서버 주소 (예: opc.tcp://localhost:4840)
 *   node: string,
 *   nodeClassMask?: number,    // opcua.NodeClass 비트마스크
 * }
 */

const path = require('path');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const CGI = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));
const OpcuaClient = require(path.join(ROOT, 'src', 'opcua', 'opcua-client.js'));

function POST() {
    const body = CGI.readBody();
    if (!body.endpoint) {
        CGI.reply({ ok: false, reason: 'endpoint is required' });
        return;
    }
    if (!body.node) {
        CGI.reply({ ok: false, reason: 'node is required' });
        return;
    }

    const client = new OpcuaClient(body.endpoint);
    if (!client.open()) {
        CGI.reply({ ok: false, reason: 'connect failed: ' + body.endpoint });
        return;
    }
    try {
        const results = client.children(body);
        CGI.reply({ ok: true, data: results });
    } catch (e) {
        CGI.reply({ ok: false, reason: e.message });
    } finally {
        client.close();
    }
}

const handlers = { POST };
const method = (process.env.get('REQUEST_METHOD') || 'GET').toUpperCase();
(handlers[method] || (() => CGI.reply({ ok: false, reason: 'method not allowed' })))();
