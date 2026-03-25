/**
 * GET  /cgi-bin/collectors  -- 목록 조회
 * POST /cgi-bin/collectors  -- 등록 (body: { name, config })
 */

const path = require('path');
const process = require('process');
const ROOT = path.resolve(path.dirname(process.argv[1]));
const { listConfigs, readConfig, writeConfig, readBody, reply } = require(path.join(ROOT, 'src', 'admin', 'cgi_util.js'));

const method = (process.env.get('REQUEST_METHOD') || 'GET').toUpperCase();

if (method === 'GET') {
  const names = listConfigs();
  const data = names.map(name => ({ name, config: readConfig(name) }));
  reply(200, { ok: true, data });

} else if (method === 'POST') {
  const body = readBody();
  if (!body.name) {
    reply(400, { ok: false, reason: 'name is required' });
  } else if (!body.config) {
    reply(400, { ok: false, reason: 'config is required' });
  } else if (readConfig(body.name)) {
    reply(409, { ok: false, reason: `collector '${body.name}' already exists` });
  } else {
    writeConfig(body.name, body.config);
    reply(201, { ok: true, data: { name: body.name } });
  }

} else {
  reply(405, { ok: false, reason: 'method not allowed' });
}
