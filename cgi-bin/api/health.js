'use strict';

const process = require('process');

function reply(status, data) {
  process.stdout.write('Content-Type: application/json\r\n');
  process.stdout.write('Status: ' + status + '\r\n');
  process.stdout.write('\r\n');
  process.stdout.write(JSON.stringify(data));
}

reply(200, {
  ok: true,
  data: {
    healthy: true,
    status: 'running',
    pid: 0,
    exit_code: null,
    error: '',
  },
});
