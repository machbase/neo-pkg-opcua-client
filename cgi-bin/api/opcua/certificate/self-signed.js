/**
 * POST /cgi-bin/api/opcua/certificate/self-signed
 *
 * body: { name, days? }
 */

const path = require('path');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const { CGI } = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));
const { createOpcuaSelfSignedCertificate } = require(path.join(ROOT, 'src', 'opcua', 'certificate.js'));

const reply = (r) => CGI.reply(r);

const handlers = {
  POST: () => {
    const body = CGI.readBody();
    const data = createOpcuaSelfSignedCertificate(body);
    reply({ ok: true, data });
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
