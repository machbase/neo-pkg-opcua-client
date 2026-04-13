'use strict';

const { CGI } = require('./cgi_util.js');
const Service = require('./service.js');
const MachbaseClient = require('../db/machbase-client.js');
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
 * @param {{ name: string, config: object }} body
 */
function collectorPost(body) {
  if (!body.name) {
    CGI.reply({
      ok: false,
      reason: 'name is required',
    });
  } else if (!body.config) {
    CGI.reply({
      ok: false,
      reason: 'config is required',
    });
  } else if (CGI.getConfig(body.name)) {
    CGI.reply({
      ok: false,
      reason: `collector '${body.name}' already exists`,
    });
  } else {
    CGI.writeConfig(body.name, body.config);
    Service.install(body.name, (err) => {
      if (err) {
        CGI.removeConfig(body.name);
        CGI.reply({
          ok: false,
          reason: errorMessage(err),
        });
      } else {
        CGI.reply({
          ok: true,
          data: { name: body.name },
        });
      }
    });
  }
}

/**
 * GET /cgi-bin/api/collector?name=xxx
 * @param {string} name
 */
function collectorGet(name) {
  if (!name) {
    CGI.reply({
      ok: false,
      reason: 'name is required',
    });
    return;
  }
  const config = CGI.getConfig(name);
  if (!config) {
    CGI.reply({
      ok: false,
      reason: `collector '${name}' not found`,
    });
  } else {
    const safeConfig = { ...config, db: { ...config.db } };
    delete safeConfig.db.password;
    CGI.reply({
      ok: true,
      data: {
        name,
        config: safeConfig,
      },
    });
  }
}

/**
 * PUT /cgi-bin/api/collector?name=xxx
 * @param {string} name
 * @param {object} body
 */
function collectorPut(name, body) {
  if (!name) {
    CGI.reply({
      ok: false,
      reason: 'name is required',
    });
    return;
  }
  const currentConfig = CGI.getConfig(name);
  if (!currentConfig) {
    CGI.reply({
      ok: false,
      reason: `collector '${name}' not found`,
    });
    return;
  }
  const nextConfig = _mergeConfigForUpdate(currentConfig, body);
  Service.status(name, (statusErr, serviceInfo) => {
    if (statusErr && !Service.isMissingServiceError(statusErr)) {
      CGI.reply({
        ok: false,
        reason: errorMessage(statusErr),
      });
      return;
    }
    CGI.writeConfig(name, nextConfig);
    const isRunning = !statusErr && serviceInfo
      && String(serviceInfo.status).toUpperCase() === 'RUNNING';
    if (!isRunning) {
      CGI.reply({
        ok: true,
        data: { name },
      });
      return;
    }
    Service.stop(name, (stopErr) => {
      if (stopErr) {
        CGI.reply({
          ok: false,
          reason: errorMessage(stopErr),
        });
        return;
      }
      Service.start(name, (startErr) => {
        if (startErr) {
          CGI.reply({
            ok: false,
            reason: errorMessage(startErr),
          });
        } else {
          CGI.reply({
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
 */
function collectorDelete(name) {
  if (!name) {
    CGI.reply({
      ok: false,
      reason: 'name is required',
    });
    return;
  }
  if (!CGI.getConfig(name)) {
    CGI.reply({
      ok: false,
      reason: `collector '${name}' not found`,
    });
    return;
  }
  Service.status(name, (statusErr, serviceInfo) => {
    if (statusErr && !Service.isMissingServiceError(statusErr)) {
      CGI.reply({
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
          CGI.reply({
            ok: false,
            reason: errorMessage(uninstallErr),
          });
          return;
        }
        Service.remove(name);
        CGI.removeConfig(name);
        CGI.reply({ ok: true });
      });
    };
    if (isRunning) {
      Service.stop(name, (stopErr) => {
        if (stopErr) {
          CGI.reply({
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
function _replyCollectorStatuses(names, index, data, servicesByName) {
  if (index >= names.length) {
    CGI.reply({
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
    _replyCollectorStatuses(names, index + 1, data, servicesByName);
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
    _replyCollectorStatuses(names, index + 1, data, servicesByName);
  });
}

/**
 * GET /cgi-bin/api/collector/list
 */
function collectorList() {
  Service.getServiceMap((err, serviceInfos) => {
    _replyCollectorStatuses(_uniqueConfigNames(), 0, [], err ? null : serviceInfos);
  });
}

// TODO: collectorInstall의 중복 설치 확인이 getServiceMap 성공/실패에 따라
//       runtime map(getServiceMap)과 filesystem(Service.installed()) 두 가지 소스를 사용함.
//       getServiceMap 실패 시 Service.installed()=false 이지만 runtime은 여전히 추적 중이라면
//       불필요한 install 시도가 발생하고 JSH 구현에 따라 partial state가 남을 수 있음.
/**
 * POST /cgi-bin/api/collector/install?name=xxx
 * @param {string} name
 */
function collectorInstall(name) {
  if (!name) {
    CGI.reply({
      ok: false,
      reason: 'name is required',
    });
    return;
  }
  if (!CGI.getConfig(name)) {
    CGI.reply({
      ok: false,
      reason: `collector '${name}' not found`,
    });
    return;
  }
  Service.getServiceMap((listErr, serviceInfos) => {
    if (!listErr) {
      if (serviceInfos[name]) {
        CGI.reply({
          ok: false,
          reason: `collector '${name}' service already installed`,
        });
        return;
      }
      Service.install(name, (installErr) => {
        if (installErr) {
          CGI.reply({
            ok: false,
            reason: errorMessage(installErr),
          });
        } else {
          CGI.reply({
            ok: true,
            data: { name },
          });
        }
      });
      return;
    }
    if (Service.installed(name)) {
      CGI.reply({
        ok: false,
        reason: `collector '${name}' service already installed`,
      });
      return;
    }
    Service.install(name, (installErr) => {
      if (installErr) {
        CGI.reply({
          ok: false,
          reason: errorMessage(installErr),
        });
      } else {
        CGI.reply({
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
 * TODO: service details 대신 checkpoint 파일의 mtime을 읽는 방식으로 교체 검토
 *       - 현재: Service.getValue() — IPC, 비동기
 *       - 개선안: fs.statSync('run/${name}.checkpoint').mtimeMs — 동기, 시스템콜 1회
 */
function collectorLastTime(name) {
  if (!name) {
    CGI.reply({
      ok: false,
      reason: 'name is required',
    });
    return;
  }
  if (!CGI.getConfig(name)) {
    CGI.reply({
      ok: false,
      reason: `collector '${name}' not found`,
    });
    return;
  }
  Service.getValue(name, 'lastCollectedAt', (err, value) => {
    if (err) {
      if (Service.isMissingServiceError(err)) {
        CGI.reply({
          ok: true,
          data: {
            name,
            lastCollectedAt: null,
          },
        });
        return;
      }
      CGI.reply({
        ok: false,
        reason: errorMessage(err),
      });
      return;
    }
    CGI.reply({
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
 */
function collectorStart(name) {
  if (!name) {
    CGI.reply({
      ok: false,
      reason: 'name is required',
    });
    return;
  }
  if (!CGI.getConfig(name)) {
    CGI.reply({
      ok: false,
      reason: `collector '${name}' not found`,
    });
    return;
  }
  Service.start(name, (err) => {
    if (err) {
      CGI.reply({
        ok: false,
        reason: errorMessage(err),
      });
    } else {
      CGI.reply({
        ok: true,
        data: { name },
      });
    }
  });
}

/**
 * POST /cgi-bin/api/collector/stop?name=xxx
 * @param {string} name
 */
function collectorStop(name) {
  if (!name) {
    CGI.reply({
      ok: false,
      reason: 'name is required',
    });
    return;
  }
  if (!CGI.getConfig(name)) {
    CGI.reply({
      ok: false,
      reason: `collector '${name}' not found`,
    });
    return;
  }
  Service.stop(name, (err) => {
    if (err) {
      CGI.reply({
        ok: false,
        reason: errorMessage(err),
      });
    } else {
      CGI.reply({
        ok: true,
        data: { name },
      });
    }
  });
}

// ── DB endpoints ────────────────────────────────────────────────────────────

function _validateDbBody(body, requireTable) {
  const db = body && body.db && typeof body.db === 'object' ? body.db : body;
  if (!db || typeof db !== 'object') {
    return { error: 'db config is required' };
  }
  if (!db.host) {
    return { error: 'db.host is required' };
  }
  if (db.port === undefined || db.port === null || db.port === '') {
    return { error: 'db.port is required' };
  }
  if (!db.user) {
    return { error: 'db.user is required' };
  }
  if (db.password === undefined || db.password === null) {
    return { error: 'db.password is required' };
  }
  if (requireTable && !db.table) {
    return { error: 'db.table is required' };
  }
  return {
    db: {
      host: db.host,
      port: Number(db.port),
      user: db.user,
      password: db.password,
      table: db.table,
    },
  };
}

/**
 * POST /cgi-bin/api/db/connect
 * @param {object} body
 */
function dbConnect(body) {
  const checked = _validateDbBody(body, false);
  if (checked.error) {
    CGI.reply({
      ok: false,
      reason: checked.error,
    });
    return;
  }
  const client = new MachbaseClient(checked.db);
  try {
    client.connect();
    CGI.reply({
      ok: true,
      data: {
        connected: true,
        host: checked.db.host,
        port: checked.db.port,
        user: checked.db.user,
      },
    });
  } catch (err) {
    CGI.reply({
      ok: false,
      reason: errorMessage(err),
    });
  } finally {
    client.close();
  }
}

/**
 * POST /cgi-bin/api/db/table/create
 * @param {object} body
 */
function dbTableCreate(body) {
  const checked = _validateDbBody(body, true);
  if (checked.error) {
    CGI.reply({
      ok: false,
      reason: checked.error,
    });
    return;
  }
  const client = new MachbaseClient(checked.db);
  try {
    client.connect();
    if (client.hasTable(checked.db.table)) {
      CGI.reply({
        ok: false,
        reason: `table '${checked.db.table}' already exists`,
      });
      return;
    }
    client.createTagTable(checked.db.table);
    CGI.reply({
      ok: true,
      data: {
        table: checked.db.table,
        created: true,
      },
    });
  } catch (err) {
    CGI.reply({
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
 */
function nodeChildren(body) {
  if (!body.endpoint) {
    CGI.reply({
      ok: false,
      reason: 'endpoint is required',
    });
    return;
  }
  if (!body.node) {
    CGI.reply({
      ok: false,
      reason: 'node is required',
    });
    return;
  }
  const client = new OpcuaClient(body.endpoint);
  if (!client.open()) {
    CGI.reply({
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
    CGI.reply({
      ok: true,
      data,
    });
  } catch (e) {
    CGI.reply({
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
 */
function nodeChildrenNative(body) {
  if (!body.endpoint) {
    CGI.reply({
      ok: false,
      reason: 'endpoint is required',
    });
    return;
  }
  if (!body.node) {
    CGI.reply({
      ok: false,
      reason: 'node is required',
    });
    return;
  }
  const client = new OpcuaClient(body.endpoint);
  if (!client.open()) {
    CGI.reply({
      ok: false,
      reason: 'connect failed: ' + body.endpoint,
    });
    return;
  }
  try {
    const results = client.children(body);
    CGI.reply({
      ok: true,
      data: results,
    });
  } catch (e) {
    CGI.reply({
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
  nodeChildren,
  nodeChildrenNative,
};
