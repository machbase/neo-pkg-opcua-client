/**
 * GET /cgi-bin/api/log/tail?name=...
 *
 * collector active 로그 파일({name}.log)을 SSE 기반으로 tail 한다.
 */

const path = require('path');
const fs = require('fs');
const process = require('process');
const tailSSE = require('util/tail/sse');

const ROOT = process.argv[1].slice(0, process.argv[1].lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const { CGI } = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));

function parseIntervalMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 500;
  if (parsed < 250) return 250;
  if (parsed > 5000) return 5000;
  return Math.floor(parsed);
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (_) {
    return false;
  }
}

function GET() {
  const query = CGI.parseQuery();
  let target;
  try {
    target = CGI.resolveActiveLogFilePath(query.name);
  } catch (err) {
    CGI.reply({ ok: false, reason: err.message });
    return;
  }

  const intervalMs = parseIntervalMs(query.intervalMs);
  const fromStart = !fileExists(target);
  const adapter = tailSSE.create(target, {
    fromStart,
    event: 'line',
    retryMs: 1500,
  });

  let closed = false;
  let timer = null;
  const close = () => {
    if (closed) return;
    closed = true;
    if (timer) clearInterval(timer);
    try { adapter.close(); } catch (_) {}
  };

  adapter.writeHeaders();
  adapter.comment(`tail ${path.basename(target)}`);

  timer = setInterval(function () {
    try {
      adapter.poll();
    } catch (err) {
      try { adapter.send(err && err.message ? err.message : String(err), 'error'); } catch (_) {}
      close();
      process.exit(0);
    }
  }, intervalMs);

  process.on('SIGINT', function () {
    close();
    process.exit(0);
  });

  process.on('SIGTERM', function () {
    close();
    process.exit(0);
  });
}

const handlers = { GET };
const method = (process.env.get('REQUEST_METHOD') || 'GET').toUpperCase();
try {
  (handlers[method] || (() => CGI.reply({ ok: false, reason: 'method not allowed' })))();
} catch (err) {
  CGI.reply({ ok: false, reason: err && err.message ? err.message : String(err) });
}
