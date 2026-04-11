/**
 * POST   /cgi-bin/api/collector          -- 등록 (body: { name, config })
 * GET    /cgi-bin/api/collector?name=xxx -- 단건 조회
 * PUT    /cgi-bin/api/collector?name=xxx -- 수정 (body: config)
 * DELETE /cgi-bin/api/collector?name=xxx -- 제거
 */

const path = require('path');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const { CGI } = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));
const Handler = require(path.join(ROOT, 'src', 'cgi', 'handler.js'));

const { name } = CGI.parseQuery();

const handlers = {
  POST:   () => Handler.collectorPost(CGI.readBody()),
  GET:    () => Handler.collectorGet(name),
  PUT:    () => Handler.collectorPut(name, CGI.readBody()),
  DELETE: () => Handler.collectorDelete(name),
};
const method = (process.env.get('REQUEST_METHOD') || 'GET').toUpperCase();
try {
  (handlers[method] || (() => CGI.reply({ ok: false, reason: 'method not allowed' })))();
} catch (err) {
  CGI.reply({ ok: false, reason: err && err.message ? err.message : String(err) });
}
