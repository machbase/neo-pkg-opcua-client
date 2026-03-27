/**
 * POST   /cgi-bin/api/collector          -- 등록 (body: { name, config })
 * GET    /cgi-bin/api/collector?name=xxx -- 단건 조회
 * PUT    /cgi-bin/api/collector?name=xxx -- 수정 (body: config)
 * DELETE /cgi-bin/api/collector?name=xxx -- 제거
 */

let _path;
try { _path = require('path'); } catch(e) { throw new Error('FAIL:path ' + e.message); }
const path = _path;
let _proc;
try { _proc = require('process'); } catch(e) { throw new Error('FAIL:process ' + e.message); }
const process = _proc;

const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const CGI = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));

const { name } = CGI.parseQuery();

function POST() {
  const body = CGI.readBody();
  if (!body.name) {
    CGI.reply({ ok: false, reason: 'name is required' });
  } else if (!body.config) {
    CGI.reply({ ok: false, reason: 'config is required' });
  } else if (CGI.readConfig(body.name)) {
    CGI.reply({ ok: false, reason: `collector '${body.name}' already exists` });
  } else {
    CGI.writeConfig(body.name, body.config);
    CGI.reply({ ok: true, data: { name: body.name } });
  }
}

function GET() {
  if (!name) return CGI.reply({ ok: false, reason: 'name is required' });
  const config = CGI.readConfig(name);
  if (!config) {
    CGI.reply({ ok: false, reason: `collector '${name}' not found` });
  } else {
    CGI.reply({ ok: true, data: { name, config } });
  }
}

function PUT() {
  if (!name) return CGI.reply({ ok: false, reason: 'name is required' });
  if (!CGI.readConfig(name)) {
    CGI.reply({ ok: false, reason: `collector '${name}' not found` });
  } else {
    CGI.writeConfig(name, CGI.readBody());
    CGI.reply({ ok: true, data: { name } });
  }
}

function DELETE() {
  if (!name) return CGI.reply({ ok: false, reason: 'name is required' });
  if (!CGI.readConfig(name)) {
    CGI.reply({ ok: false, reason: `collector '${name}' not found` });
  } else {
    CGI.deleteConfig(name);
    CGI.reply({ ok: true });
  }
}

const handlers = { POST, GET, PUT, DELETE };
const method = (process.env.get('REQUEST_METHOD') || 'GET').toUpperCase();
(handlers[method] || (() => CGI.reply({ ok: false, reason: 'method not allowed' })))();
