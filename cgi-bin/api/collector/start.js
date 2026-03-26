/**
 * POST /cgi-bin/api/collector/start?name=xxx  -- collector 시작 (데몬 연동 예정)
 */

const path = require('path');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const CGI = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));

const { name } = CGI.parseQuery();

function POST() {
  if (!name) return CGI.reply({ ok: false, reason: 'name is required' });
  if (!CGI.readConfig(name)) return CGI.reply({ ok: false, reason: `collector '${name}' not found` });
  // TODO: jsh 비동기 exec 지원 시 process.exec()로 구현 예정
  CGI.reply({ ok: false, reason: `daemon not supported yet. run manually: machbase-neo jsh cgi-bin/neo-collector.js cgi-bin/conf.d/${name}.json` });
}

const handlers = { POST };
const method = (process.env.get('REQUEST_METHOD') || 'GET').toUpperCase();
(handlers[method] || (() => CGI.reply({ ok: false, reason: 'method not allowed' })))();
