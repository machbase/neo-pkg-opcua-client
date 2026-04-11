'use strict';

const { CGI } = require('./cgi_util.js');
const Service = require('./service.js');
const { SERVICE_PREFIX } = Service;
const MachbaseClient = require('../db/machbase-client.js');
const OpcuaClient = require('../opcua/opcua-client.js');

// ── Shared helpers ──────────────────────────────────────────────────────────

function errorMessage(err) {
  return err && err.message ? err.message : String(err);
}

function isMissingServiceError(err) {
  const m = err && err.message ? String(err.message).toLowerCase() : '';
  return m.includes('does not exist') || m.includes('not found')
    || m.includes('no such service') || m.includes('unknown service')
    || (m.includes("detail '") && m.includes('not found'));
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
    CGI.reply({ ok: false, reason: 'name is required' });
  } else if (!body.config) {
    CGI.reply({ ok: false, reason: 'config is required' });
  } else if (CGI.getConfig(body.name)) {
    CGI.reply({ ok: false, reason: `collector '${body.name}' already exists` });
  } else {
    CGI.writeConfig(body.name, body.config);
    Service.install(body.name, (err) => {
      if (err) {
        CGI.removeConfig(body.name);
        CGI.reply({ ok: false, reason: errorMessage(err) });
      } else {
        CGI.reply({ ok: true, data: { name: body.name } });
      }
    });
  }
}

/**
 * GET /cgi-bin/api/collector?name=xxx
 * @param {string} name
 */
function collectorGet(name) {
  if (!name) return CGI.reply({ ok: false, reason: 'name is required' });
  const config = CGI.getConfig(name);
  if (!config) {
    CGI.reply({ ok: false, reason: `collector '${name}' not found` });
  } else {
    const safeConfig = { ...config, db: { ...config.db } };
    delete safeConfig.db.password;
    CGI.reply({ ok: true, data: { name, config: safeConfig } });
  }
}

/**
 * PUT /cgi-bin/api/collector?name=xxx
 * @param {string} name
 * @param {object} body
 */
function collectorPut(name, body) {
  if (!name) return CGI.reply({ ok: false, reason: 'name is required' });
  const currentConfig = CGI.getConfig(name);
  if (!currentConfig) {
    CGI.reply({ ok: false, reason: `collector '${name}' not found` });
    return;
  }
  const nextConfig = _mergeConfigForUpdate(currentConfig, body);
  CGI.writeConfig(name, nextConfig);
  Service.status(name, (statusErr, serviceInfo) => {
    if (statusErr && !isMissingServiceError(statusErr)) {
      CGI.reply({ ok: false, reason: errorMessage(statusErr) });
      return;
    }
    const isRunning = !statusErr && serviceInfo && String(serviceInfo.status).toUpperCase() === 'RUNNING';
    if (!isRunning) {
      CGI.reply({ ok: true, data: { name } });
      return;
    }
    Service.stop(name, (stopErr) => {
      if (stopErr) {
        CGI.reply({ ok: false, reason: errorMessage(stopErr) });
        return;
      }
      Service.start(name, (startErr) => {
        if (startErr) {
          CGI.reply({ ok: false, reason: errorMessage(startErr) });
        } else {
          CGI.reply({ ok: true, data: { name } });
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
  if (!name) return CGI.reply({ ok: false, reason: 'name is required' });
  if (!CGI.getConfig(name)) {
    CGI.reply({ ok: false, reason: `collector '${name}' not found` });
    return;
  }
  Service.status(name, (statusErr, serviceInfo) => {
    if (statusErr && !isMissingServiceError(statusErr)) {
      CGI.reply({ ok: false, reason: errorMessage(statusErr) });
      return;
    }
    const isRunning = !statusErr && serviceInfo && String(serviceInfo.status).toUpperCase() === 'RUNNING';
    const proceed = () => {
      Service.uninstall(name, (err) => {
        if (err && !isMissingServiceError(err)) {
          CGI.reply({ ok: false, reason: errorMessage(err) });
        } else {
          Service.remove(name);
          CGI.removeConfig(name);
          CGI.reply({ ok: true });
        }
      });
    };
    if (isRunning) {
      Service.stop(name, (stopErr) => {
        if (stopErr) {
          CGI.reply({ ok: false, reason: errorMessage(stopErr) });
        } else {
          proceed();
        }
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
    .filter(name => { if (!name || seen[name]) return false; seen[name] = true; return true; })
    .sort();
}

function _serviceInfoMap(serviceInfos) {
  const result = {};
  (serviceInfos || []).forEach((serviceInfo) => {
    const rawName = (serviceInfo && serviceInfo.config && serviceInfo.config.name)
      || (serviceInfo && serviceInfo.name) || '';
    if (rawName.startsWith(SERVICE_PREFIX)) {
      result[rawName.slice(SERVICE_PREFIX.length)] = serviceInfo;
    }
  });
  return result;
}

function _replyCollectorStatuses(names, index, data, servicesByName, hasServiceSnapshot) {
  if (index >= names.length) {
    CGI.reply({ ok: true, data });
    return;
  }
  const name = names[index];
  const listedService = servicesByName[name];
  if (listedService) {
    data.push({ name, installed: true, running: String(listedService.status).toUpperCase() === 'RUNNING' });
    _replyCollectorStatuses(names, index + 1, data, servicesByName, hasServiceSnapshot);
    return;
  }
  if (hasServiceSnapshot) {
    data.push({ name, installed: false, running: false });
    _replyCollectorStatuses(names, index + 1, data, servicesByName, hasServiceSnapshot);
    return;
  }
  const installed = Service.installed(name);
  Service.status(name, (err, serviceInfo) => {
    if (err) {
      data.push({ name, installed, running: false });
    } else {
      data.push({ name, installed: true, running: String(serviceInfo.status).toUpperCase() === 'RUNNING' });
    }
    _replyCollectorStatuses(names, index + 1, data, servicesByName, hasServiceSnapshot);
  });
}

/**
 * GET /cgi-bin/api/collector/list
 */
function collectorList() {
  Service.listServices((err, serviceInfos) => {
    if (err) {
      _replyCollectorStatuses(_uniqueConfigNames(), 0, [], {}, false);
      return;
    }
    _replyCollectorStatuses(_uniqueConfigNames(), 0, [], _serviceInfoMap(serviceInfos), true);
  });
}

/**
 * POST /cgi-bin/api/collector/install?name=xxx
 * @param {string} name
 */
function collectorInstall(name) {
  if (!name) return CGI.reply({ ok: false, reason: 'name is required' });
  if (!CGI.getConfig(name)) return CGI.reply({ ok: false, reason: `collector '${name}' not found` });

  Service.listServices((err, serviceInfos) => {
    if (!err) {
      if (_serviceInfoMap(serviceInfos)[name]) {
        CGI.reply({ ok: false, reason: `collector '${name}' service already installed` });
        return;
      }
      _doInstall(name);
      return;
    }
    if (Service.installed(name)) {
      CGI.reply({ ok: false, reason: `collector '${name}' service already installed` });
      return;
    }
    _doInstall(name);
  });
}

function _doInstall(name) {
  Service.install(name, (err) => {
    if (err) {
      CGI.reply({ ok: false, reason: errorMessage(err) });
    } else {
      CGI.reply({ ok: true, data: { name } });
    }
  });
}

/**
 * GET /cgi-bin/api/collector/last-time?name=xxx
 * @param {string} name
 */
function collectorLastTime(name) {
  if (!name) return CGI.reply({ ok: false, reason: 'name is required' });
  if (!CGI.getConfig(name)) {
    CGI.reply({ ok: false, reason: `collector '${name}' not found` });
    return;
  }
  Service.getValue(name, 'lastCollectedAt', (err, value) => {
    if (err) {
      if (isMissingServiceError(err)) {
        CGI.reply({ ok: true, data: { name, lastCollectedAt: null } });
        return;
      }
      CGI.reply({ ok: false, reason: errorMessage(err) });
      return;
    }
    CGI.reply({ ok: true, data: { name, lastCollectedAt: _normalizeTimestamp(value) } });
  });
}

function _normalizeTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber)) return asNumber;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * POST /cgi-bin/api/collector/start?name=xxx
 * @param {string} name
 */
function collectorStart(name) {
  if (!name) return CGI.reply({ ok: false, reason: 'name is required' });
  if (!CGI.getConfig(name)) return CGI.reply({ ok: false, reason: `collector '${name}' not found` });
  Service.start(name, (err) => {
    if (err) {
      CGI.reply({ ok: false, reason: errorMessage(err) });
    } else {
      CGI.reply({ ok: true, data: { name } });
    }
  });
}

/**
 * POST /cgi-bin/api/collector/stop?name=xxx
 * @param {string} name
 */
function collectorStop(name) {
  if (!name) return CGI.reply({ ok: false, reason: 'name is required' });
  if (!CGI.getConfig(name)) return CGI.reply({ ok: false, reason: `collector '${name}' not found` });
  Service.stop(name, (err) => {
    if (err) {
      CGI.reply({ ok: false, reason: errorMessage(err) });
    } else {
      CGI.reply({ ok: true, data: { name } });
    }
  });
}

// ── DB endpoints ────────────────────────────────────────────────────────────

function _validateDbBody(body, requireTable) {
  const db = body && body.db && typeof body.db === 'object' ? body.db : body;
  if (!db || typeof db !== 'object') return { error: 'db config is required' };
  if (!db.host) return { error: 'db.host is required' };
  if (db.port === undefined || db.port === null || db.port === '') return { error: 'db.port is required' };
  if (!db.user) return { error: 'db.user is required' };
  if (db.password === undefined || db.password === null) return { error: 'db.password is required' };
  if (requireTable && !db.table) return { error: 'db.table is required' };
  return { db: { host: db.host, port: Number(db.port), user: db.user, password: db.password, table: db.table } };
}

/**
 * POST /cgi-bin/api/db/connect
 * @param {object} body
 */
function dbConnect(body) {
  const checked = _validateDbBody(body, false);
  if (checked.error) {
    CGI.reply({ ok: false, reason: checked.error });
    return;
  }
  const client = new MachbaseClient(checked.db);
  try {
    client.connect();
    CGI.reply({ ok: true, data: { connected: true, host: checked.db.host, port: checked.db.port, user: checked.db.user } });
  } catch (err) {
    CGI.reply({ ok: false, reason: errorMessage(err) });
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
    CGI.reply({ ok: false, reason: checked.error });
    return;
  }
  const client = new MachbaseClient(checked.db);
  try {
    client.connect();
    if (client.hasTable(checked.db.table)) {
      CGI.reply({ ok: false, reason: `table '${checked.db.table}' already exists` });
      return;
    }
    client.createTagTable(checked.db.table);
    CGI.reply({ ok: true, data: { table: checked.db.table, created: true } });
  } catch (err) {
    CGI.reply({ ok: false, reason: errorMessage(err) });
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
  if (!body.endpoint) return CGI.reply({ ok: false, reason: 'endpoint is required' });
  if (!body.node) return CGI.reply({ ok: false, reason: 'node is required' });

  const client = new OpcuaClient(body.endpoint);
  if (!client.open()) {
    CGI.reply({ ok: false, reason: 'connect failed: ' + body.endpoint });
    return;
  }
  try {
    const request = { nodes: [body.node] };
    if (typeof body.nodeClassMask === 'number') {
      request.nodeClassMask = body.nodeClassMask;
    }
    const results = client.browse(request);
    const data = results && results[0] && results[0].references ? results[0].references : [];
    CGI.reply({ ok: true, data });
  } catch (e) {
    CGI.reply({ ok: false, reason: errorMessage(e) });
  } finally {
    client.close();
  }
}

/**
 * POST /cgi-bin/api/node/children-native
 * @param {object} body
 */
function nodeChildrenNative(body) {
  if (!body.endpoint) return CGI.reply({ ok: false, reason: 'endpoint is required' });
  if (!body.node) return CGI.reply({ ok: false, reason: 'node is required' });

  const client = new OpcuaClient(body.endpoint);
  if (!client.open()) {
    CGI.reply({ ok: false, reason: 'connect failed: ' + body.endpoint });
    return;
  }
  try {
    const results = client.children(body);
    CGI.reply({ ok: true, data: results });
  } catch (e) {
    CGI.reply({ ok: false, reason: errorMessage(e) });
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
