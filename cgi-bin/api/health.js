'use strict';

const path = require('path');
const process = require('process');
const ROOT = process.argv[1].slice(0, process.argv[1].lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const Handler = require(path.join(ROOT, 'src', 'cgi', 'handler.js'));

function reply(status, data) {
  process.stdout.write('Content-Type: application/json\r\n');
  process.stdout.write('Status: ' + status + '\r\n');
  process.stdout.write('\r\n');
  process.stdout.write(JSON.stringify(data));
}

function healthPayload(serviceSummary) {
  return {
    healthy: true,
    status: 'running',
    pid: 0,
    exit_code: null,
    error: '',
    service_summary: serviceSummary,
  };
}

Handler.getOpcuaClientServiceSummary((err, summary) => {
  const serviceSummary = summary || {
    scope: 'opcua-client',
    total: 0,
    running: 0,
    errors: err ? [{ reason: err.message || String(err) }] : [],
  };
  reply(200, {
    ok: true,
    data: healthPayload(serviceSummary),
  });
});
