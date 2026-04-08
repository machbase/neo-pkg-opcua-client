/**
 * GET /cgi-bin/api/collector/last-time?name=xxx  -- 마지막 성공 수집 시간 조회
 */

const path = require('path');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const CGI = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));

const { name } = CGI.parseQuery();

function errorMessage(err) {
  return err && err.message ? err.message : String(err);
}

function normalizeTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber)) return asNumber;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function GET() {
  if (!name) return CGI.reply({ ok: false, reason: 'name is required' });
  if (!CGI.readConfig(name)) {
    CGI.reply({ ok: false, reason: `collector '${name}' not found` });
    return;
  }

  CGI.getServiceDetail(name, 'lastCollectedAt', (err, result) => {
    if (err) {
      if (CGI.isMissingServiceError(err) || CGI.isMissingServiceDetailError(err)) {
        CGI.reply({ ok: true, data: { name, lastCollectedAt: null } });
        return;
      }
      CGI.reply({ ok: false, reason: errorMessage(err) });
      return;
    }

    CGI.reply({
      ok: true,
      data: {
        name,
        lastCollectedAt: normalizeTimestamp(CGI.serviceDetailValue(result, 'lastCollectedAt')),
      },
    });
  });
}

const handlers = { GET };
const method = (process.env.get('REQUEST_METHOD') || 'GET').toUpperCase();
try {
  (handlers[method] || (() => CGI.reply({ ok: false, reason: 'method not allowed' })))();
} catch (err) {
  CGI.reply({ ok: false, reason: errorMessage(err) });
}
