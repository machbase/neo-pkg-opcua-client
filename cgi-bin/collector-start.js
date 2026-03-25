/**
 * POST /cgi-bin/collector-start?name=xxx  -- collector 시작 (데몬 연동 예정)
 */

const path = require('path');
const process = require('process');
const ROOT = path.resolve(path.dirname(process.argv[1]));
const { readConfig, parseQuery, reply } = require(path.join(ROOT, 'src', 'admin', 'cgi_util.js'));

const { name } = parseQuery();

if (!name) {
  reply(400, { ok: false, reason: 'name is required' });
} else if (!readConfig(name)) {
  reply(404, { ok: false, reason: `collector '${name}' not found` });
} else {
  // TODO: jsh 비동기 exec 지원 시 process.exec()로 구현 예정
  reply(503, { ok: false, reason: `daemon not supported yet. run manually: machbase-neo jsh cgi-bin/neo-collector.js cgi-bin/conf.d/${name}.json` });
}
