/**
 * GET    /cgi-bin/collector?name=xxx  -- 단건 조회
 * PUT    /cgi-bin/collector?name=xxx  -- 수정 (body: config)
 * DELETE /cgi-bin/collector?name=xxx  -- 제거
 */

const path = require('path');
const process = require('process');
const ROOT = path.resolve(path.dirname(process.argv[1]));
const { readConfig, writeConfig, deleteConfig, parseQuery, readBody, reply } = require(path.join(ROOT, 'src', 'admin', 'cgi_util.js'));

const method = (process.env.get('REQUEST_METHOD') || 'GET').toUpperCase();
const { name } = parseQuery();

if (!name) {
  reply(400, { ok: false, reason: 'name is required' });
} else if (method === 'GET') {
  const config = readConfig(name);
  if (!config) {
    reply(404, { ok: false, reason: `collector '${name}' not found` });
  } else {
    reply(200, { ok: true, data: { name, config } });
  }

} else if (method === 'PUT') {
  if (!readConfig(name)) {
    reply(404, { ok: false, reason: `collector '${name}' not found` });
  } else {
    writeConfig(name, readBody());
    reply(200, { ok: true, data: { name } });
  }

} else if (method === 'DELETE') {
  if (!readConfig(name)) {
    reply(404, { ok: false, reason: `collector '${name}' not found` });
  } else {
    deleteConfig(name);
    reply(200, { ok: true });
  }

} else {
  reply(405, { ok: false, reason: 'method not allowed' });
}
