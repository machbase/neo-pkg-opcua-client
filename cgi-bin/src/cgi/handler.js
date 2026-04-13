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

function _mergeConfigForUpdate(currentConfig, nextConfig) {
  const merged = { ...nextConfig };
  if (currentConfig && currentConfig.db) {
    merged.db = { ...(nextConfig.db || {}) };
    if (currentConfig.db.password !== undefined &&
        (merged.db.password === undefined || merged.db.password === '')) {
      merged.db.password = currentConfig.db.password;
    }
  }
  return merged;
}

/**
 * POST /cgi-bin/api/collector
 * @param {string} name
 * @param {object} config
 * @param {function} reply
 */
function collectorPost(name, config, reply) {
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
  const safeConfig = { ...config, db: { ...config.db } };
  delete safeConfig.db.password;
  reply({
    ok: true,
    data: {
      name,
      config: safeConfig,
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
  const nextConfig = _mergeConfigForUpdate(currentConfig, body);
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
 * POST /cgi-bin/api/db/table/columns
 * @param {{ host: string, port: number, user: string, password: string, table: string }} db
 * @param {function} reply
 */
function dbTableColumns(db, reply) {
  const client = new MachbaseClient(db);
  try {
    client.connect();
    if (client.selectTableType(db.table).type === 'UNSUPPORTED') {
      reply({
        ok: false,
        reason: `table '${db.table}' not found`,
      });
      return;
    }
    const rows = client.selectColumnsByTableName(db.table);
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
      data: {
        table: db.table,
        columns,
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

// ── Node endpoints ──────────────────────────────────────────────────────────

/**
 * POST /cgi-bin/api/node/children
 * @param {object} body
 * @param {function} reply
 */
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
    const request = { nodes: [body.node] };
    if (typeof body.nodeClassMask === 'number') {
      request.nodeClassMask = body.nodeClassMask;
    }
    const results = client.browse(request);
    const data = results && results[0] && results[0].references ? results[0].references : [];
    reply({
      ok: true,
      data,
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
 * POST /cgi-bin/api/node/children-native
 * @param {object} body
 * @param {function} reply
 */
function nodeChildrenNative(body, reply) {
  const client = new OpcuaClient(body.endpoint);
  if (!client.open()) {
    reply({
      ok: false,
      reason: 'connect failed: ' + body.endpoint,
    });
    return;
  }
  try {
    const results = client.children(body);
    reply({
      ok: true,
      data: results,
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
  dbConnect,
  dbTableCreate,
  dbTableColumns,
  nodeChildren,
  nodeChildrenNative,
};
