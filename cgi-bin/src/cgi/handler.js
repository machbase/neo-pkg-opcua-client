'use strict';

const { CGI } = require('./cgi_util.js');
const Service = require('./service.js');
const { MachbaseClient } = require('../db/client.js');
const { Column, TableSchema, ColumnType, FLAG_PRIMARY, FLAG_BASETIME, FLAG_SUMMARIZED, FLAG_METADATA } = require('../db/types.js');
const OpcuaClient = require('../opcua/opcua-client.js');

// ── Shared helpers ──────────────────────────────────────────────────────────

function errorMessage(err) {
  return err && err.message ? err.message : String(err);
}

// ── Collector CRUD ──────────────────────────────────────────────────────────

const MIN_INTERVAL_MS = 1000;
const DEFAULT_INTERVAL_MS = 1000;

/**
 * Validates and normalizes a collector config in-place.
 * @param {object} config
 * @returns {string|null} error message or null
 */
function validateConfig(config) {
  if (!config.opcua) {
    return 'config.opcua is required';
  }
  if (config.opcua.interval === undefined || config.opcua.interval === null) {
    config.opcua.interval = DEFAULT_INTERVAL_MS;
  }
  const interval = Number(config.opcua.interval);
  if (!Number.isFinite(interval) || interval < MIN_INTERVAL_MS) {
    return `config.opcua.interval must be >= ${MIN_INTERVAL_MS} (ms)`;
  }
  config.opcua.interval = interval;
  return null;
}

/**
 * POST /cgi-bin/api/collector
 * @param {string} name
 * @param {object} config
 * @param {function} reply
 */
function collectorPost(name, config, reply) {
  const validErr = validateConfig(config);
  if (validErr) {
    reply({ ok: false, reason: validErr });
    return;
  }
  if (CGI.getConfig(name)) {
    reply({
      ok: false,
      reason: `collector '${name}' already exists`,
    });
    return;
  }
  CGI.writeConfig(name, config);
  Service.install(name, (err) => {
    if (err) {
      CGI.removeConfig(name);
      reply({
        ok: false,
        reason: errorMessage(err),
      });
    } else {
      reply({
        ok: true,
        data: { name },
      });
    }
  });
}

/**
 * GET /cgi-bin/api/collector?name=xxx
 * @param {string} name
 * @param {function} reply
 */
function collectorGet(name, reply) {
  const config = CGI.getConfig(name);
  if (!config) {
    reply({
      ok: false,
      reason: `collector '${name}' not found`,
    });
    return;
  }
  reply({
    ok: true,
    data: {
      name,
      config,
    },
  });
}

/**
 * PUT /cgi-bin/api/collector?name=xxx
 * @param {string} name
 * @param {object} body
 * @param {function} reply
 */
function collectorPut(name, body, reply) {
  const currentConfig = CGI.getConfig(name);
  if (!currentConfig) {
    reply({
      ok: false,
      reason: `collector '${name}' not found`,
    });
    return;
  }
  const nextConfig = body;
  Service.status(name, (statusErr, serviceInfo) => {
    if (statusErr && !Service.isMissingServiceError(statusErr)) {
      reply({
        ok: false,
        reason: errorMessage(statusErr),
      });
      return;
    }
    CGI.writeConfig(name, nextConfig);
    const isRunning = !statusErr && serviceInfo
      && String(serviceInfo.status).toUpperCase() === 'RUNNING';
    if (!isRunning) {
      reply({
        ok: true,
        data: { name },
      });
      return;
    }
    Service.stop(name, (stopErr) => {
      if (stopErr) {
        reply({
          ok: false,
          reason: errorMessage(stopErr),
        });
        return;
      }
      Service.start(name, (startErr) => {
        if (startErr) {
          reply({
            ok: false,
            reason: errorMessage(startErr),
          });
        } else {
          reply({
            ok: true,
            data: { name },
          });
        }
      });
    });
  });
}

/**
 * DELETE /cgi-bin/api/collector?name=xxx
 * @param {string} name
 * @param {function} reply
 */
function collectorDelete(name, reply) {
  if (!CGI.getConfig(name)) {
    reply({
      ok: false,
      reason: `collector '${name}' not found`,
    });
    return;
  }
  Service.status(name, (statusErr, serviceInfo) => {
    if (statusErr && !Service.isMissingServiceError(statusErr)) {
      reply({
        ok: false,
        reason: errorMessage(statusErr),
      });
      return;
    }
    const isRunning = !statusErr && serviceInfo
      && String(serviceInfo.status).toUpperCase() === 'RUNNING';
    const proceed = () => {
      Service.uninstall(name, (uninstallErr) => {
        if (uninstallErr && !Service.isMissingServiceError(uninstallErr)) {
          reply({
            ok: false,
            reason: errorMessage(uninstallErr),
          });
          return;
        }
        Service.remove(name);
        CGI.removeConfig(name);
        reply({ ok: true });
      });
    };
    if (isRunning) {
      Service.stop(name, (stopErr) => {
        if (stopErr) {
          reply({
            ok: false,
            reason: errorMessage(stopErr),
          });
          return;
        }
        proceed();
      });
    } else {
      proceed();
    }
  });
}

// ── Collector sub-endpoints ─────────────────────────────────────────────────

function _uniqueConfigNames() {
  const seen = {};
  return CGI.getConfigList()
    .filter((name) => {
      if (!name || seen[name]) {
        return false;
      }
      seen[name] = true;
      return true;
    })
    .sort();
}

// TODO: fast-path(getServiceMap 성공)에서 installed 판단이 runtime map 기준이라
//       definition 파일 존재 여부와 다를 수 있음. 예: daemon 재시작 후 map에 없지만
//       파일은 존재하는 경우 installed: false로 잘못 반환될 수 있음.
// servicesByName: getServiceMap 성공 시 map, 실패 시 null
function _replyCollectorStatuses(names, index, data, servicesByName, reply) {
  if (index >= names.length) {
    reply({
      ok: true,
      data,
    });
    return;
  }
  const name = names[index];
  if (servicesByName !== null) {
    const listedService = servicesByName[name];
    data.push({
      name,
      installed: !!listedService,
      running: listedService ? String(listedService.status).toUpperCase() === 'RUNNING' : false,
    });
    _replyCollectorStatuses(names, index + 1, data, servicesByName, reply);
    return;
  }
  const installed = Service.installed(name);
  Service.status(name, (err, serviceInfo) => {
    if (err) {
      data.push({
        name,
        installed,
        running: false,
      });
    } else {
      data.push({
        name,
        installed: true,
        running: String(serviceInfo.status).toUpperCase() === 'RUNNING',
      });
    }
    _replyCollectorStatuses(names, index + 1, data, servicesByName, reply);
  });
}

/**
 * GET /cgi-bin/api/collector/list
 * @param {function} reply
 */
function collectorList(reply) {
  Service.getServiceMap((err, serviceInfos) => {
    _replyCollectorStatuses(_uniqueConfigNames(), 0, [], err ? null : serviceInfos, reply);
  });
}

// TODO: collectorInstall의 중복 설치 확인이 getServiceMap 성공/실패에 따라
//       runtime map(getServiceMap)과 filesystem(Service.installed()) 두 가지 소스를 사용함.
//       getServiceMap 실패 시 Service.installed()=false 이지만 runtime은 여전히 추적 중이라면
//       불필요한 install 시도가 발생하고 JSH 구현에 따라 partial state가 남을 수 있음.
/**
 * POST /cgi-bin/api/collector/install?name=xxx
 * @param {string} name
 * @param {function} reply
 */
function collectorInstall(name, reply) {
  if (!CGI.getConfig(name)) {
    reply({
      ok: false,
      reason: `collector '${name}' not found`,
    });
    return;
  }
  Service.getServiceMap((listErr, serviceInfos) => {
    if (!listErr) {
      if (serviceInfos[name]) {
        reply({
          ok: false,
          reason: `collector '${name}' service already installed`,
        });
        return;
      }
      Service.install(name, (installErr) => {
        if (installErr) {
          reply({
            ok: false,
            reason: errorMessage(installErr),
          });
        } else {
          reply({
            ok: true,
            data: { name },
          });
        }
      });
      return;
    }
    if (Service.installed(name)) {
      reply({
        ok: false,
        reason: `collector '${name}' service already installed`,
      });
      return;
    }
    Service.install(name, (installErr) => {
      if (installErr) {
        reply({
          ok: false,
          reason: errorMessage(installErr),
        });
      } else {
        reply({
          ok: true,
          data: { name },
        });
      }
    });
  });
}

/**
 * GET /cgi-bin/api/collector/last-time?name=xxx
 * @param {string} name
 * @param {function} reply
 * TODO: service details 대신 checkpoint 파일의 mtime을 읽는 방식으로 교체 검토
 *       - 현재: Service.getValue() — IPC, 비동기
 *       - 개선안: fs.statSync('run/${name}.checkpoint').mtimeMs — 동기, 시스템콜 1회
 */
function collectorLastTime(name, reply) {
  if (!CGI.getConfig(name)) {
    reply({
      ok: false,
      reason: `collector '${name}' not found`,
    });
    return;
  }
  Service.getValue(name, 'lastCollectedAt', (err, value) => {
    if (err) {
      if (Service.isMissingServiceError(err)) {
        reply({
          ok: true,
          data: {
            name,
            lastCollectedAt: null,
          },
        });
        return;
      }
      reply({
        ok: false,
        reason: errorMessage(err),
      });
      return;
    }
    reply({
      ok: true,
      data: {
        name,
        lastCollectedAt: _normalizeTimestamp(value),
      },
    });
  });
}

function _normalizeTimestamp(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return value;
  }
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber)) {
    return asNumber;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * POST /cgi-bin/api/collector/start?name=xxx
 * @param {string} name
 * @param {function} reply
 */
function collectorStart(name, reply) {
  if (!CGI.getConfig(name)) {
    reply({
      ok: false,
      reason: `collector '${name}' not found`,
    });
    return;
  }
  Service.status(name, (statusErr, serviceInfo) => {
    if (!statusErr && String(serviceInfo && serviceInfo.status).toUpperCase() === 'RUNNING') {
      reply({
        ok: false,
        reason: `collector '${name}' is already running`,
      });
      return;
    }
    Service.start(name, (err) => {
      if (err) {
        reply({
          ok: false,
          reason: errorMessage(err),
        });
      } else {
        reply({
          ok: true,
          data: { name },
        });
      }
    });
  });
}

/**
 * POST /cgi-bin/api/collector/stop?name=xxx
 * @param {string} name
 * @param {function} reply
 */
function collectorStop(name, reply) {
  if (!CGI.getConfig(name)) {
    reply({
      ok: false,
      reason: `collector '${name}' not found`,
    });
    return;
  }
  Service.stop(name, (err) => {
    if (err) {
      reply({
        ok: false,
        reason: errorMessage(err),
      });
    } else {
      reply({
        ok: true,
        data: { name },
      });
    }
  });
}

// ── DB Server config CRUD ───────────────────────────────────────────────────

function _mergeServerConfig(current, next) {
  const merged = { ...next };
  if (current && current.password !== undefined &&
      (merged.password === undefined || merged.password === '')) {
    merged.password = current.password;
  }
  return merged;
}

/**
 * POST /cgi-bin/api/db/server
 * @param {string} name
 * @param {object} config
 * @param {function} reply
 */
function serverPost(name, config, reply) {
  if (CGI.getServerConfig(name)) {
    reply({
      ok: false,
      reason: `server '${name}' already exists`,
    });
    return;
  }
  CGI.writeServerConfig(name, config);
  reply({
    ok: true,
    data: { name },
  });
}

/**
 * GET /cgi-bin/api/db/server?name=xxx
 * @param {string} name
 * @param {function} reply
 */
function serverGet(name, reply) {
  const config = CGI.getServerConfig(name);
  if (!config) {
    reply({
      ok: false,
      reason: `server '${name}' not found`,
    });
    return;
  }
  const safeConfig = { ...config };
  delete safeConfig.password;
  reply({
    ok: true,
    data: { name, config: safeConfig },
  });
}

/**
 * PUT /cgi-bin/api/db/server?name=xxx
 * @param {string} name
 * @param {object} body
 * @param {function} reply
 */
function serverPut(name, body, reply) {
  const current = CGI.getServerConfig(name);
  if (!current) {
    reply({
      ok: false,
      reason: `server '${name}' not found`,
    });
    return;
  }
  CGI.writeServerConfig(name, _mergeServerConfig(current, body));
  reply({
    ok: true,
    data: { name },
  });
}

/**
 * DELETE /cgi-bin/api/db/server?name=xxx
 * @param {string} name
 * @param {function} reply
 */
function serverDelete(name, reply) {
  if (!CGI.getServerConfig(name)) {
    reply({
      ok: false,
      reason: `server '${name}' not found`,
    });
    return;
  }
  const err = CGI.removeServerConfig(name);
  if (err) {
    reply({
      ok: false,
      reason: errorMessage(err),
    });
    return;
  }
  reply({ ok: true });
}

/**
 * GET /cgi-bin/api/db/server/list
 * @param {function} reply
 */
function serverList(reply) {
  const names = CGI.getServerConfigList().sort();
  const data = names.map((name) => {
    const config = CGI.getServerConfig(name);
    const safeConfig = { ...config };
    delete safeConfig.password;
    return { name, config: safeConfig };
  });
  reply({
    ok: true,
    data,
  });
}

// ── DB endpoints ────────────────────────────────────────────────────────────

/**
 * POST /cgi-bin/api/db/connect
 * @param {{ host: string, port: number, user: string, password: string }} db
 * @param {function} reply
 */
function dbConnect(db, reply) {
  const client = new MachbaseClient(db);
  try {
    client.connect();
    reply({
      ok: true,
      data: {
        connected: true,
        host: db.host,
        port: db.port,
        user: db.user,
      },
    });
  } catch (err) {
    reply({
      ok: false,
      reason: errorMessage(err),
    });
  } finally {
    client.close();
  }
}

/**
 * POST /cgi-bin/api/db/table/create
 * @param {{ host: string, port: number, user: string, password: string, table: string }} db
 * @param {function} reply
 */
function dbTableCreate(db, reply) {
  const client = new MachbaseClient(db);
  try {
    client.connect();
    if (client.selectTableType(db.table).type !== 'UNSUPPORTED') {
      reply({
        ok: false,
        reason: `table '${db.table}' already exists`,
      });
      return;
    }
    const schema = new TableSchema('TAG', db.table, [
      new Column('NAME', ColumnType.VARCHAR, 0, FLAG_PRIMARY, 100),
      new Column('TIME', ColumnType.DATETIME, 1, FLAG_BASETIME, 0),
      new Column('VALUE', ColumnType.DOUBLE, 2, FLAG_SUMMARIZED, 0),
    ]);
    client.createTagTable(db.table, schema);
    reply({
      ok: true,
      data: {
        table: db.table,
        created: true,
      },
    });
  } catch (err) {
    reply({
      ok: false,
      reason: errorMessage(err),
    });
  } finally {
    client.close();
  }
}

/**
 * GET /cgi-bin/api/db/table/list?server=xxx
 * @param {{ host: string, port: number, user: string, password: string }} db
 * @param {function} reply
 */
function dbTableList(db, reply) {
  const client = new MachbaseClient(db);
  try {
    client.connect();
    const users = client.selectUsers();
    if (db.user) {
      const found = users.find((u) => u.NAME === db.user);
      if (!found) {
        reply({ ok: false, reason: `user '${db.user}' not found` });
        return;
      }
    }
    const userById = {};
    for (const u of users) userById[u.USER_ID] = u.NAME;
    const rows = client.selectAllTables();
    const tables = rows
      .filter((row) => row.TYPE === 6)
      .map((row) => ({ name: row.NAME, user: userById[row.USER_ID] || null }));
    reply({
      ok: true,
      data: tables,
    });
  } catch (err) {
    reply({
      ok: false,
      reason: errorMessage(err),
    });
  } finally {
    client.close();
  }
}

/**
 * GET /cgi-bin/api/db/table/columns?server=xxx&table=xxx
 * @param {{ host: string, port: number, user: string, password: string }} db
 * @param {string} table
 * @param {function} reply
 */
function dbTableColumns(db, table, reply) {
  // README: "SYS.TAG" 형식으로 들어올 수 있으므로 user명과 테이블명을 분리한다.
  // user명이 있으면 해당 USER_ID 소유 테이블만 조회해 동명 테이블 간 충돌을 방지한다.
  // TODO: 현재는 "user.table" 2단계만 파싱한다.
  //       Machbase가 "database.user.table" 3단계 형식을 지원할 경우
  //       database 단위 구분 및 연결 대상 분기 로직 추가 필요.
  const dotIdx = table.indexOf('.');
  const tableUser = dotIdx >= 0 ? table.slice(0, dotIdx) : null;
  const tableName = dotIdx >= 0 ? table.slice(dotIdx + 1) : table;

  const client = new MachbaseClient(db);
  try {
    client.connect();
    const users = client.selectUsers();

    let userId = null;
    const lookupUser = tableUser || db.user;
    if (lookupUser) {
      const found = users.find((u) => u.NAME === lookupUser);
      if (!found) {
        reply({ ok: false, reason: `user '${lookupUser}' not found` });
        return;
      }
      userId = found.USER_ID;
    }

    const meta = client.selectTableMeta(tableName, userId);
    if (!meta) {
      reply({ ok: false, reason: `table '${table}' not found` });
      return;
    }
    if (meta.TYPE !== 6) {
      reply({ ok: false, reason: `table '${table}' is not a TAG table` });
      return;
    }
    const rows = client.selectColumnsByTableId(meta.ID);
    const columns = rows.map((row) => {
      const col = new Column(row.NAME, ColumnType.fromCode(row.TYPE), row.ID, row.FLAG || 0, row.LENGTH || 0);
      return {
        name: col.name,
        type: col.sqlType(),
        primaryKey: !!(col.flag & FLAG_PRIMARY),
        basetime: !!(col.flag & FLAG_BASETIME),
        summarized: !!(col.flag & FLAG_SUMMARIZED),
        metadata: !!(col.flag & FLAG_METADATA),
      };
    });
    reply({
      ok: true,
      data: { table, columns },
    });
  } catch (err) {
    reply({
      ok: false,
      reason: errorMessage(err),
    });
  } finally {
    client.close();
  }
}

// ── OPC UA one-shot endpoints ───────────────────────────────────────────────

/**
 * GET /cgi-bin/api/opcua/read?endpoint=xxx&nodes=id1,id2
 * @param {string} endpoint
 * @param {string[]} nodeIds
 * @param {function} reply
 */
function opcuaRead(endpoint, nodeIds, reply) {
  const client = new OpcuaClient(endpoint);
  if (!client.open()) {
    reply({
      ok: false,
      reason: 'connect failed: ' + endpoint,
    });
    return;
  }
  try {
    const results = client.read(nodeIds);
    reply({
      ok: true,
      data: nodeIds.map((nodeId, i) => ({
        nodeId,
        value: results[i].value,
        sourceTimestamp: results[i].sourceTimestamp,
        serverTimestamp: results[i].serverTimestamp,
      })),
    });
  } catch (e) {
    reply({
      ok: false,
      reason: errorMessage(e),
    });
  } finally {
    client.close();
  }
}

/**
 * POST /cgi-bin/api/opcua/write
 * @param {string} endpoint
 * @param {Array<{ node: string, value: any }>} writes
 * @param {function} reply
 */
function opcuaWrite(endpoint, writes, reply) {
  const client = new OpcuaClient(endpoint);
  if (!client.open()) {
    reply({
      ok: false,
      reason: 'connect failed: ' + endpoint,
    });
    return;
  }
  try {
    const result = client.write(...writes);
    reply({
      ok: true,
      data: result,
    });
  } catch (e) {
    reply({
      ok: false,
      reason: errorMessage(e),
    });
  } finally {
    client.close();
  }
}

// ── Node endpoints ──────────────────────────────────────────────────────────

/**
 * POST /cgi-bin/api/opcua/node/descendants
 * @param {object} body
 * @param {function} reply
 */
function _browseAll(client, nodeId, nodeClassMask) {
  const request = { node: nodeId };
  if (typeof nodeClassMask === 'number') {
    request.nodeClassMask = nodeClassMask;
  }
  const results = client.children(request);
  return results || [];
}

function nodeChildren(body, reply) {
  const client = new OpcuaClient(body.endpoint);
  if (!client.open()) {
    reply({
      ok: false,
      reason: 'connect failed: ' + body.endpoint,
    });
    return;
  }
  try {
    const visited = {};
    visited[body.node] = true;
    const queue = [body.node];
    const all = [];
    while (queue.length > 0) {
      const current = queue.shift();
      const references = _browseAll(client, current, body.nodeClassMask);
      for (let i = 0; i < references.length; i++) {
        const ref = references[i];
        all.push(ref);
        const childId = ref.NodeId;
        if (childId && !visited[childId]) {
          visited[childId] = true;
          queue.push(childId);
        }
      }
    }
    reply({
      ok: true,
      data: all,
    });
  } catch (e) {
    reply({
      ok: false,
      reason: errorMessage(e),
    });
  } finally {
    client.close();
  }
}

module.exports = {
  collectorPost,
  collectorGet,
  collectorPut,
  collectorDelete,
  collectorList,
  collectorInstall,
  collectorLastTime,
  collectorStart,
  collectorStop,
  serverPost,
  serverGet,
  serverPut,
  serverDelete,
  serverList,
  dbConnect,
  dbTableCreate,
  dbTableList,
  dbTableColumns,
  nodeChildren,
  opcuaRead,
  opcuaWrite,
};
