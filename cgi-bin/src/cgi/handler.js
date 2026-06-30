'use strict';

const fs = require('fs');
const path = require('path');
const process = require('process');
const { CGI } = require('./cgi_util.js');
const Service = require('./service.js');
const { MachbaseClient } = require('../db/client.js');
const { Column, TableSchema, ColumnType, FLAG_PRIMARY, FLAG_BASETIME, FLAG_SUMMARIZED, FLAG_METADATA } = require('../db/types.js');
const OpcuaClient = require('../opcua/opcua-client.js');
const { AttributeID, StatusCode } = require('opcua');

// ── Shared helpers ──────────────────────────────────────────────────────────

function errorMessage(err) {
  return err && err.message ? err.message : String(err);
}

const APP_DIR = (() => {
  const script = process.argv[1] || '';
  const marker = '/cgi-bin/';
  const markerIndex = script.lastIndexOf(marker);
  if (markerIndex >= 0) {
    return script.slice(0, markerIndex + '/cgi-bin'.length);
  }
  return path.resolve(__dirname, '../..');
})();

const SERVICE_PREFIX = Service.SERVICE_PREFIX || '_opc_';
const OPCUA_ROOT_NODE_ID = 'ns=0;i=85';

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function getEnv(name) {
  if (process.env && typeof process.env.get === 'function') {
    return process.env.get(name);
  }
  return process.env ? process.env[name] : '';
}

function getServiceDirectoryCandidates() {
  const result = [];
  const seen = {};
  const push = (value) => {
    if (typeof value !== 'string') return;
    const dirPath = value.trim();
    if (!dirPath || seen[dirPath]) return;
    seen[dirPath] = true;
    result.push(dirPath);
  };

  push('/etc/services');

  const home = getEnv('HOME');
  if (home) {
    push(path.join(home, 'etc', 'services'));
  }

  const execPath = process.execPath || process.argv[0] || '';
  if (execPath && path.isAbsolute(execPath)) {
    push(path.join(path.dirname(execPath), 'etc', 'services'));
  }

  return result;
}

function expectedOpcuaClientExecutablePath() {
  return path.normalize(path.join(APP_DIR, 'neo-collector.js'));
}

function normalizeServiceExecutablePath(definition) {
  const executable = definition && definition.executable != null ? String(definition.executable).trim() : '';
  if (!executable) return '';
  if (path.isAbsolute(executable)) return path.normalize(executable);
  const workingDir = definition && definition.working_dir != null ? String(definition.working_dir).trim() : '';
  return path.normalize(path.join(workingDir || APP_DIR, executable));
}

function serviceConfigFromInfo(serviceInfo) {
  if (!serviceInfo || typeof serviceInfo !== 'object') return null;
  if (serviceInfo.config && typeof serviceInfo.config === 'object') return serviceInfo.config;
  return serviceInfo;
}

function serviceNameFromInfo(serviceInfo, fallbackName) {
  const config = serviceConfigFromInfo(serviceInfo);
  return String(
    (config && config.name)
    || (serviceInfo && serviceInfo.name)
    || fallbackName
    || ''
  );
}

function isOpcuaClientServiceDefinition(serviceName, definition) {
  const executable = normalizeServiceExecutablePath(definition);
  if (executable) {
    return executable === expectedOpcuaClientExecutablePath();
  }
  return String(serviceName || '').startsWith(SERVICE_PREFIX);
}

function getOpcuaClientServiceDefinitions() {
  const result = [];
  const seen = {};

  for (const serviceDir of getServiceDirectoryCandidates()) {
    let files = [];
    try {
      files = fs.readdirSync(serviceDir);
    } catch (_) {
      continue;
    }

    for (const fileName of files) {
      if (!fileName || !fileName.endsWith('.json')) continue;
      const serviceName = fileName.replace(/\.json$/, '');
      if (!serviceName || seen[serviceName]) continue;

      const filePath = path.join(serviceDir, fileName);
      const definition = readJsonFile(filePath);
      if (!isOpcuaClientServiceDefinition(serviceName, definition)) continue;

      seen[serviceName] = true;
      result.push({ name: serviceName, path: filePath, definition });
    }
  }

  return result;
}

function isServiceRunningStatus(serviceInfo) {
  const config = serviceConfigFromInfo(serviceInfo);
  const status = String(
    (serviceInfo && serviceInfo.status)
    || (config && config.status)
    || ''
  ).toUpperCase();
  return status === 'RUNNING';
}

function normalizeServiceList(services) {
  if (Array.isArray(services)) return services;
  if (!services || typeof services !== 'object') return [];
  return Object.keys(services).map((name) => {
    const info = services[name];
    if (!info || typeof info !== 'object') return { name };
    if (serviceNameFromInfo(info)) return info;
    return { ...info, name };
  });
}

function summarizeOpcuaClientServiceList(services) {
  const summary = {
    scope: 'opcua-client',
    total: 0,
    running: 0,
    errors: [],
  };

  for (const serviceInfo of normalizeServiceList(services)) {
    const config = serviceConfigFromInfo(serviceInfo);
    const serviceName = serviceNameFromInfo(serviceInfo);
    if (!isOpcuaClientServiceDefinition(serviceName, config)) continue;

    summary.total += 1;
    if (isServiceRunningStatus(serviceInfo)) {
      summary.running += 1;
    }
    if (serviceInfo && serviceInfo.error) {
      summary.errors.push({ name: serviceName, reason: String(serviceInfo.error) });
    }
    if (config && config.read_error) {
      summary.errors.push({ name: serviceName, reason: String(config.read_error) });
    }
  }

  return summary;
}

function statusRaw(serviceName, callback) {
  if (Service && typeof Service.statusRaw === 'function') {
    Service.statusRaw(serviceName, callback);
    return;
  }
  const name = String(serviceName || '').startsWith(SERVICE_PREFIX)
    ? String(serviceName).slice(SERVICE_PREFIX.length)
    : serviceName;
  Service.status(name, callback);
}

function getOpcuaClientServiceSummaryFromDefinitions(listErr, callback) {
  const definitions = getOpcuaClientServiceDefinitions();
  const summary = {
    scope: 'opcua-client',
    total: definitions.length,
    running: 0,
    errors: [],
  };

  if (listErr) {
    summary.errors.push({
      reason: errorMessage(listErr),
    });
  }

  const next = (index) => {
    if (index >= definitions.length) {
      callback(null, summary);
      return;
    }

    const item = definitions[index];
    statusRaw(item.name, (err, serviceInfo) => {
      if (err) {
        summary.errors.push({
          name: item.name,
          reason: errorMessage(err),
        });
      } else if (isServiceRunningStatus(serviceInfo)) {
        summary.running += 1;
      }
      next(index + 1);
    });
  };

  next(0);
}

function getOpcuaClientServiceSummary(callback) {
  if (!Service || typeof Service.list !== 'function') {
    getOpcuaClientServiceSummaryFromDefinitions(new Error('service.list() is not available'), callback);
    return;
  }

  try {
    Service.list((listErr, services) => {
      if (!listErr) {
        callback(null, summarizeOpcuaClientServiceList(services));
        return;
      }
      getOpcuaClientServiceSummaryFromDefinitions(listErr, callback);
    });
  } catch (err) {
    getOpcuaClientServiceSummaryFromDefinitions(err, callback);
  }
}

// ── Collector CRUD ──────────────────────────────────────────────────────────

const MIN_INTERVAL_MS = 1000;
const DEFAULT_INTERVAL_MS = 1000;
const AUTO_TABLE_VALUE_COLUMN = 'VALUE';
const AUTO_TABLE_STRING_COLUMN = 'STR_VALUE';
const AUTO_TABLE_NAME_MIN_LENGTH = 80;
const AUTO_TABLE_STRING_LENGTH = 1024;
const AUTO_TABLE_NAME_LENGTH_STEP = 5;

function normalizeIdentifier(value, label) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  if (!/^[A-Z_][A-Z0-9_]*$/.test(normalized)) {
    throw new Error(`${label} must contain only letters, numbers, and underscore, and must not start with a number`);
  }
  return normalized;
}

function findUserId(client, userName) {
  const normalizedUser = String(userName || '').trim().toUpperCase();
  if (!normalizedUser) {
    throw new Error('db user is required');
  }
  const users = client.selectUsers();
  const found = findUserRow(users, normalizedUser);
  if (!found) {
    throw new Error(`user '${normalizedUser}' not found`);
  }
  return found.USER_ID;
}

function findUserRow(users, userName) {
  const normalizedUser = String(userName || '').trim().toUpperCase();
  if (!normalizedUser) return null;
  return (users || []).find((u) => String(u.NAME || '').toUpperCase() === normalizedUser) || null;
}

function autoCreateTableNameLength(config) {
  const nodes = config && config.opcua && Array.isArray(config.opcua.nodes)
    ? config.opcua.nodes
    : [];
  let maxLen = AUTO_TABLE_NAME_MIN_LENGTH;
  for (const node of nodes) {
    const name = node && node.name != null ? String(node.name) : '';
    if (name.length > maxLen) {
      maxLen = name.length;
    }
  }
  return Math.ceil(maxLen / AUTO_TABLE_NAME_LENGTH_STEP) * AUTO_TABLE_NAME_LENGTH_STEP;
}

function buildAutoCreateTableSchema(tableName, nameLength) {
  return new TableSchema('TAG', tableName, [
    new Column('NAME', ColumnType.VARCHAR, 0, FLAG_PRIMARY, nameLength),
    new Column('TIME', ColumnType.DATETIME, 1, FLAG_BASETIME, 0),
    new Column(AUTO_TABLE_VALUE_COLUMN, ColumnType.DOUBLE, 2, FLAG_SUMMARIZED, 0),
    new Column(AUTO_TABLE_STRING_COLUMN, ColumnType.VARCHAR, 3, 0, AUTO_TABLE_STRING_LENGTH),
  ]);
}

function userFacingError(message) {
  const err = new Error(message);
  err.userFacing = true;
  return err;
}

function normalizeOpcuaServerName(name) {
  const value = String(name || '').trim();
  if (!value) {
    throw userFacingError('name is required');
  }
  if (value.indexOf('/') >= 0 || value.indexOf('\\') >= 0 || value.indexOf('..') >= 0) {
    throw userFacingError('invalid opcua server name');
  }
  return value;
}

const OPCUA_SECURITY_POLICIES = {
  None: true,
  Basic128Rsa15: true,
  Basic256: true,
  Basic256Sha256: true,
  Aes128_Sha256_RsaOaep: true,
  Aes256_Sha256_RsaPss: true,
};

const OPCUA_MESSAGE_SECURITY_MODES = {
  None: true,
  Sign: true,
  SignAndEncrypt: true,
};

const OPCUA_AUTH_MODES = {
  Anonymous: true,
  UserName: true,
};
const OPCUA_DEFAULT_READ_BATCH_SIZE = 300;
const OPCUA_MAX_NODES_PER_READ_NODE_ID = 'ns=0;i=11705';
const OPCUA_CAPABILITY_SOURCES = {
  server: true,
  default: true,
};

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function normalizeText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeChoice(value, choices, label) {
  const text = normalizeText(value);
  if (!text || !choices[text]) {
    throw userFacingError(`${label} is invalid`);
  }
  return text;
}

function normalizePositiveInteger(value, label) {
  const num = Number(value);
  if (!Number.isFinite(num) || Math.floor(num) !== num || num < 1) {
    throw userFacingError(`${label} must be a positive integer`);
  }
  return num;
}

function normalizeNonNegativeInteger(value, label) {
  const num = Number(value);
  if (!Number.isFinite(num) || Math.floor(num) !== num || num < 0) {
    throw userFacingError(`${label} must be a non-negative integer`);
  }
  return num;
}

function defaultOpcuaCapabilities(checkedAt) {
  return {
    maxNodesPerRead: null,
    maxNodesPerReadSource: 'default',
    checkedAt: checkedAt || new Date().toISOString(),
  };
}

function normalizeOpcuaCapabilities(value, previous) {
  const input = value && typeof value === 'object' ? value : null;
  if (!input) {
    if (previous && typeof previous === 'object') {
      return {
        maxNodesPerRead: previous.maxNodesPerRead === undefined || previous.maxNodesPerRead === null
          ? null
          : normalizeNonNegativeInteger(previous.maxNodesPerRead, 'capabilities.maxNodesPerRead'),
        maxNodesPerReadSource: OPCUA_CAPABILITY_SOURCES[previous.maxNodesPerReadSource] ? previous.maxNodesPerReadSource : 'default',
        checkedAt: normalizeText(previous.checkedAt) || new Date().toISOString(),
      };
    }
    return defaultOpcuaCapabilities();
  }

  const source = OPCUA_CAPABILITY_SOURCES[input.maxNodesPerReadSource]
    ? input.maxNodesPerReadSource
    : (input.maxNodesPerRead === undefined || input.maxNodesPerRead === null ? 'default' : 'server');
  const capabilities = {
    maxNodesPerRead: null,
    maxNodesPerReadSource: source,
    checkedAt: normalizeText(input.checkedAt) || new Date().toISOString(),
  };
  if (input.maxNodesPerRead !== undefined && input.maxNodesPerRead !== null) {
    capabilities.maxNodesPerRead = normalizeNonNegativeInteger(input.maxNodesPerRead, 'capabilities.maxNodesPerRead');
    capabilities.maxNodesPerReadSource = 'server';
  } else {
    capabilities.maxNodesPerReadSource = 'default';
  }
  return capabilities;
}

function normalizeOpcuaReadBatchSize(config, previous, capabilities, preservePrevious) {
  const hasInput = config.readBatchSize !== undefined && config.readBatchSize !== null && config.readBatchSize !== '';
  const hasPrevious = previous && previous.readBatchSize !== undefined && previous.readBatchSize !== null;
  const serverLimit = capabilities.maxNodesPerRead > 0 ? capabilities.maxNodesPerRead : null;
  const defaultValue = serverLimit ? Math.min(serverLimit, OPCUA_DEFAULT_READ_BATCH_SIZE) : OPCUA_DEFAULT_READ_BATCH_SIZE;
  const value = hasInput
    ? config.readBatchSize
    : (preservePrevious && hasPrevious ? previous.readBatchSize : defaultValue);
  const readBatchSize = normalizePositiveInteger(value, 'readBatchSize');
  if (!serverLimit) {
    return readBatchSize;
  }
  if (readBatchSize > serverLimit) {
    throw userFacingError(`readBatchSize must be <= ${serverLimit} (capabilities.maxNodesPerRead)`);
  }
  return readBatchSize;
}

function detectOpcuaCapabilities(client) {
  const checkedAt = new Date().toISOString();
  const capabilities = defaultOpcuaCapabilities(checkedAt);
  try {
    const results = client.read([OPCUA_MAX_NODES_PER_READ_NODE_ID]) || [];
    const value = results[0] && results[0].value;
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      const maxNodesPerRead = Number(value);
      if (Number.isFinite(maxNodesPerRead) && Math.floor(maxNodesPerRead) === maxNodesPerRead && maxNodesPerRead >= 0) {
        capabilities.maxNodesPerRead = maxNodesPerRead;
        capabilities.maxNodesPerReadSource = 'server';
        return {
          capabilities,
          readBatchSize: maxNodesPerRead > 0 ? Math.min(maxNodesPerRead, OPCUA_DEFAULT_READ_BATCH_SIZE) : OPCUA_DEFAULT_READ_BATCH_SIZE,
        };
      }
    }
  } catch (err) {
    capabilities.error = errorMessage(err);
  }
  return {
    capabilities,
    readBatchSize: OPCUA_DEFAULT_READ_BATCH_SIZE,
  };
}

function verifyOpcuaBrowse(config) {
  const client = new OpcuaClient(config);
  if (!client.open()) {
    throw client.lastError || new Error('connect failed');
  }
  try {
    _browseDescendants(client, OPCUA_ROOT_NODE_ID, 0);
  } finally {
    client.close();
  }
}

function validatePemText(value, label, marker) {
  const text = value === undefined || value === null ? '' : String(value);
  if (!text.trim()) {
    throw userFacingError(`${label} is required`);
  }
  if (text.indexOf(marker) < 0) {
    throw userFacingError(`${label} must be PEM format`);
  }
  return text;
}

function normalizeOpcuaServerSecurity(security, options = {}) {
  const input = security && typeof security === 'object' ? { ...security } : {};
  const previous = options.previous && typeof options.previous === 'object' ? options.previous : {};
  const serverName = options.serverName || '';
  const forStorage = options.forStorage === true;

  const normalized = {};
  normalized.enabled = input.enabled === true;
  if (!normalized.enabled) {
    if (forStorage && serverName && (previous.certificateFile || previous.keyFile)) {
      normalized.__removeCertificate = true;
    }
    return normalized;
  }

  const securityPolicy = hasOwn(input, 'securityPolicy')
    ? input.securityPolicy
    : (previous.securityPolicy || 'None');
  const messageSecurityMode = hasOwn(input, 'messageSecurityMode')
    ? input.messageSecurityMode
    : (hasOwn(input, 'securityMode') ? input.securityMode : (previous.messageSecurityMode || 'None'));
  const authMode = hasOwn(input, 'authMode')
    ? input.authMode
    : (previous.authMode || 'Anonymous');

  normalized.securityPolicy = normalizeChoice(securityPolicy, OPCUA_SECURITY_POLICIES, 'security.securityPolicy');
  normalized.messageSecurityMode = normalizeChoice(messageSecurityMode, OPCUA_MESSAGE_SECURITY_MODES, 'security.messageSecurityMode');
  normalized.authMode = normalizeChoice(authMode, OPCUA_AUTH_MODES, 'security.authMode');

  if (normalized.messageSecurityMode === 'None' && normalized.securityPolicy !== 'None') {
    throw userFacingError('security.securityPolicy must be None when messageSecurityMode is None');
  }
  if (normalized.messageSecurityMode !== 'None' && normalized.securityPolicy === 'None') {
    throw userFacingError('security.securityPolicy is required when messageSecurityMode is not None');
  }

  const username = hasOwn(input, 'username') ? normalizeText(input.username) : normalizeText(previous.username);
  if (username) {
    normalized.username = username;
  }

  if (input.clearPassword === true) {
    delete normalized.password;
  } else if (hasOwn(input, 'password')) {
    const password = input.password === undefined || input.password === null ? '' : String(input.password);
    if (password) normalized.password = password;
  } else if (previous.password) {
    normalized.password = previous.password;
  }

  const hasCertificatePem = hasOwn(input, 'certificatePem') && normalizeText(input.certificatePem) !== '';
  const hasKeyPem = hasOwn(input, 'keyPem') && normalizeText(input.keyPem) !== '';
  if (hasCertificatePem !== hasKeyPem) {
    throw userFacingError('security.certificatePem and security.keyPem must be provided together');
  }

  if (normalized.authMode === 'UserName') {
    if (!normalized.username) {
      throw userFacingError('security.username is required when authMode is UserName');
    }
    if (!normalized.password) {
      throw userFacingError('security.password is required when authMode is UserName');
    }
  }

  const certificateRequired = normalized.messageSecurityMode !== 'None';
  if (!certificateRequired) {
    if (forStorage && serverName && (previous.certificateFile || previous.keyFile)) {
      normalized.__removeCertificate = true;
    }
    return normalized;
  }
  const existingCertificateFiles = normalizeText(input.certificateFile)
    || (!input.clearCertificate && normalizeText(previous.certificateFile));
  const existingKeyFiles = normalizeText(input.keyFile)
    || (!input.clearCertificate && normalizeText(previous.keyFile));
  const willHaveCertificate = (hasCertificatePem && hasKeyPem) || (existingCertificateFiles && existingKeyFiles);
  if (certificateRequired && !willHaveCertificate) {
    throw userFacingError('security.certificatePem and security.keyPem are required for secure mode');
  }

  if (input.clearCertificate === true) {
    if (forStorage && serverName) {
      normalized.__removeCertificate = true;
    }
  } else if (hasCertificatePem && hasKeyPem) {
    if (!forStorage || !serverName) {
      throw userFacingError('opcua server name is required to store certificate files');
    }
    const certificatePem = validatePemText(input.certificatePem, 'security.certificatePem', 'BEGIN CERTIFICATE');
    const keyPem = validatePemText(input.keyPem, 'security.keyPem', 'PRIVATE KEY');
    const paths = CGI.writeOpcuaServerCredentialFiles(serverName, certificatePem, keyPem);
    normalized.certificateFile = paths.certificateFile;
    normalized.keyFile = paths.keyFile;
  } else {
    const certificateFile = normalizeText(input.certificateFile) || normalizeText(previous.certificateFile);
    const keyFile = normalizeText(input.keyFile) || normalizeText(previous.keyFile);
    if (certificateFile && keyFile) {
      normalized.certificateFile = certificateFile;
      normalized.keyFile = keyFile;
    }
  }

  return normalized;
}

function safeOpcuaServerConfig(config, serverName) {
  const safe = { ...(config || {}) };
  const security = safe.security && typeof safe.security === 'object'
    ? { ...safe.security }
    : {};
  const credentialInfo = serverName ? CGI.getOpcuaServerCredentialFileInfo(serverName) : {};
  if (security.password !== undefined && security.password !== null && security.password !== '') {
    security.hasPassword = true;
  }
  delete security.password;
  if (security.certificateFile) {
    security.hasCertificateFile = true;
    if (credentialInfo.certificate && credentialInfo.certificate.updatedAt) {
      security.certificateUpdatedAt = credentialInfo.certificate.updatedAt;
    }
  }
  if (security.keyFile) {
    security.hasKeyFile = true;
    if (credentialInfo.key && credentialInfo.key.updatedAt) {
      security.keyUpdatedAt = credentialInfo.key.updatedAt;
    }
  }
  delete security.certificateFile;
  delete security.keyFile;
  delete security.certificatePem;
  delete security.keyPem;
  delete security.clearPassword;
  delete security.clearCertificate;
  delete security.__removeCertificate;
  safe.security = security;
  return safe;
}

function consumeOpcuaCredentialCleanupFlag(config) {
  const security = config && config.security && typeof config.security === 'object'
    ? config.security
    : null;
  const removeCredential = security && security.__removeCertificate === true;
  if (security) {
    delete security.__removeCertificate;
  }
  return removeCredential;
}

function autoOpcuaServerNameBase(collectorName) {
  const base = String(collectorName || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'collector';
}

function nextAutoOpcuaServerName(collectorName) {
  const base = `${autoOpcuaServerNameBase(collectorName)}-opcua`;
  if (!CGI.getOpcuaServerConfig(base)) {
    return base;
  }
  let idx = 2;
  while (CGI.getOpcuaServerConfig(`${base}-${idx}`)) {
    idx += 1;
  }
  return `${base}-${idx}`;
}

function normalizeOpcuaServerConfig(config, options = {}) {
  if (!config || typeof config !== 'object') {
    throw userFacingError('config is required');
  }
  const endpoint = String(config.endpoint || '').trim();
  if (!endpoint) {
    throw userFacingError('config.endpoint is required');
  }
  const previous = options.previousConfig && typeof options.previousConfig === 'object'
    ? options.previousConfig
    : null;
  const hasCapabilitiesInput = config.capabilities !== undefined && config.capabilities !== null;
  const preservePrevious = previous
    && previous.endpoint === endpoint
    && !hasCapabilitiesInput;
  const capabilities = normalizeOpcuaCapabilities(
    hasCapabilitiesInput ? config.capabilities : null,
    preservePrevious ? previous.capabilities : null
  );
  const readBatchSize = normalizeOpcuaReadBatchSize(config, previous, capabilities, preservePrevious);
  return {
    ...config,
    endpoint,
    readBatchSize,
    capabilities,
    security: normalizeOpcuaServerSecurity(config.security, {
      previous: options.previousConfig && options.previousConfig.security,
      serverName: options.serverName,
      forStorage: options.forStorage === true,
    }),
  };
}

function getOpcuaServerConfigOrThrow(name) {
  const serverName = normalizeOpcuaServerName(name);
  const config = CGI.getOpcuaServerConfig(serverName);
  if (!config) {
    throw userFacingError(`opcua server '${serverName}' not found`);
  }
  return {
    name: serverName,
    config: normalizeOpcuaServerConfig(config),
  };
}

function resolveOpcuaEndpoint(request) {
  const source = request && typeof request === 'object' ? request : { endpoint: request };
  const serverName = source.server !== undefined && source.server !== null
    ? String(source.server).trim()
    : '';
  if (serverName) {
    const resolved = getOpcuaServerConfigOrThrow(serverName);
    const endpoint = normalizeText(source.endpoint) || resolved.config.endpoint;
    return {
      server: resolved.name,
      endpoint,
      config: { ...resolved.config, endpoint },
    };
  }
  const endpoint = String(source.endpoint || '').trim();
  if (!endpoint) {
    throw userFacingError('endpoint or server is required');
  }
  return {
    server: '',
    endpoint,
    config: {
      endpoint,
      security: { enabled: false },
    },
  };
}

function prepareCollectorOpcuaServerConfig(collectorName, config) {
  const opcua = config && config.opcua;
  if (!opcua) {
    throw userFacingError('config.opcua is required');
  }

  const serverName = opcua.server !== undefined && opcua.server !== null
    ? String(opcua.server).trim()
    : '';
  if (serverName) {
    const resolved = getOpcuaServerConfigOrThrow(serverName);
    opcua.server = resolved.name;
    delete opcua.endpoint;
    return null;
  }

  const endpoint = String(opcua.endpoint || '').trim();
  if (!endpoint) {
    throw userFacingError('config.opcua.server or config.opcua.endpoint is required');
  }

  const autoName = nextAutoOpcuaServerName(collectorName);
  CGI.writeOpcuaServerConfig(autoName, {
    endpoint,
    readBatchSize: OPCUA_DEFAULT_READ_BATCH_SIZE,
    capabilities: defaultOpcuaCapabilities(),
    security: { enabled: false },
  });
  opcua.server = autoName;
  delete opcua.endpoint;
  return autoName;
}

function rollbackAutoCreatedOpcuaServer(name) {
  if (!name) return;
  try { CGI.removeOpcuaServerConfig(name); } catch (_) {}
}

function opcuaClientConfig(resolved, readRetryInterval) {
  const config = resolved && resolved.config && typeof resolved.config === 'object'
    ? { ...resolved.config }
    : { endpoint: resolved && resolved.endpoint };
  config.endpoint = resolved.endpoint;
  if (readRetryInterval !== undefined && readRetryInterval !== null && readRetryInterval !== '') {
    config.readRetryInterval = readRetryInterval;
  }
  return config;
}

function opcuaConnectFailedReason(endpoint, client) {
  const detail = client && client.lastError ? errorMessage(client.lastError) : '';
  return detail ? `connect failed: ${endpoint}: ${detail}` : `connect failed: ${endpoint}`;
}

function temporaryOpcuaConnectSecurityName() {
  return `opcua-connect-test-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function cleanupTemporaryOpcuaConnectSecurity(name) {
  if (!name) return;
  try {
    CGI.removeOpcuaServerCredentialFiles(name);
  } catch (_) {}
}

function applyDirectOpcuaConnectSecurity(resolved, request) {
  if (!resolved) return null;
  if (!request || typeof request !== 'object' || !hasOwn(request, 'security')) return null;
  if (request.security === undefined || request.security === null) return null;

  const tempName = temporaryOpcuaConnectSecurityName();
  try {
    resolved.config.security = normalizeOpcuaServerSecurity(request.security, {
      previous: resolved.config && resolved.config.security,
      serverName: tempName,
      forStorage: true,
    });
    return tempName;
  } catch (err) {
    cleanupTemporaryOpcuaConnectSecurity(tempName);
    throw err;
  }
}

function prepareAutoCreateTableRequest(config) {
  const tableName = normalizeIdentifier(config.dbTable, 'config.dbTable');
  if (!config.db) {
    throw new Error('config.db is required for autoCreateTable');
  }
  return {
    tableName,
    dbName: config.db,
    nameLength: autoCreateTableNameLength(config),
  };
}

function applyAutoCreateConfig(config, tableName) {
  config.dbTable = tableName;
  config.valueColumn = AUTO_TABLE_VALUE_COLUMN;
  config.stringValueColumn = AUTO_TABLE_STRING_COLUMN;
  config.stringOnly = false;
}

function maxTagNameLengthForConfig(collectorName, config, columns) {
  const valueColumn = String(config && config.valueColumn ? config.valueColumn : AUTO_TABLE_VALUE_COLUMN).toUpperCase();
  const selectedValueColumn = (columns || []).find((col) => String(col.NAME || '').toUpperCase() === valueColumn);
  const isJsonMode = selectedValueColumn && ColumnType.fromCode(selectedValueColumn.TYPE) === ColumnType.JSON;
  if (isJsonMode) {
    return String(collectorName || '').length;
  }

  const nodes = config && config.opcua && Array.isArray(config.opcua.nodes)
    ? config.opcua.nodes
    : [];
  let maxLen = 0;
  for (const node of nodes) {
    const tagName = node && node.name != null ? String(node.name) : '';
    if (tagName.length > maxLen) {
      maxLen = tagName.length;
    }
  }
  return maxLen;
}

function validateCollectorTagNameLength(name, config) {
  if (!config || !config.db || !config.dbTable) {
    return;
  }

  const db = CGI.getServerConfig(config.db);
  if (!db) {
    throw userFacingError(`server '${config.db}' not found`);
  }

  const tableName = normalizeIdentifier(config.dbTable, 'config.dbTable');
  const client = new MachbaseClient(db);
  try {
    client.connect();
    const userId = findUserId(client, db.user);
    const tableMeta = client.selectTableMeta(tableName, userId);
    if (!tableMeta) {
      throw userFacingError(`table '${tableName}' not found`);
    }
    const columns = client.selectColumnsByTableId(tableMeta.ID);
    const primaryColumn = (columns || []).find((col) => Number(col.FLAG || 0) & FLAG_PRIMARY)
      || (columns || []).find((col) => String(col.NAME || '').toUpperCase() === 'NAME');
    if (!primaryColumn) {
      throw userFacingError(`table '${tableName}' primary column not found`);
    }
    const length = Number(primaryColumn.LENGTH || 0);
    if (!length) {
      return;
    }
    const maxLen = maxTagNameLengthForConfig(name, config, columns);
    if (maxLen > length) {
      throw userFacingError(`tag name length ${maxLen} exceeds ${primaryColumn.NAME} VARCHAR(${length}) in table '${tableName}'`);
    }
  } finally {
    client.close();
  }
}

function createAutoCollectorTable(config) {
  const request = prepareAutoCreateTableRequest(config);
  const db = CGI.getServerConfig(request.dbName);
  if (!db) {
    throw userFacingError(`server '${request.dbName}' not found`);
  }

  const client = new MachbaseClient(db);
  try {
    client.connect();
    const userId = findUserId(client, db.user);
    if (client.selectTableMeta(request.tableName, userId)) {
      throw userFacingError(`table '${request.tableName}' already exists; select the existing table instead of auto-create`);
    }

    const schema = buildAutoCreateTableSchema(request.tableName, request.nameLength);
    client.createTagTable(request.tableName, schema);
    return { db, tableName: request.tableName };
  } catch (err) {
    if (err && err.userFacing) {
      throw err;
    }
    throw new Error(`create table failed: ${request.tableName}: ${errorMessage(err)}`);
  } finally {
    client.close();
  }
}

function dropAutoCreatedTable(db, tableName) {
  const client = new MachbaseClient(db);
  try {
    client.connect();
    const rowCount = client.selectRowCount(tableName);
    if (rowCount === 0) {
      client.dropTableCascade(tableName);
    }
  } finally {
    client.close();
  }
}

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
  const hasServer = config.opcua.server !== undefined && config.opcua.server !== null && String(config.opcua.server).trim() !== '';
  const hasEndpoint = config.opcua.endpoint !== undefined && config.opcua.endpoint !== null && String(config.opcua.endpoint).trim() !== '';
  if (!hasServer && !hasEndpoint) {
    return 'config.opcua.server or config.opcua.endpoint is required';
  }
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
  const autoCreateTable = config.autoCreateTable === true;
  if (config.autoCreateTable !== undefined) {
    delete config.autoCreateTable;
  }

  let autoCreatedOpcuaServer = null;
  try {
    autoCreatedOpcuaServer = prepareCollectorOpcuaServerConfig(name, config);
  } catch (err) {
    reply({
      ok: false,
      reason: errorMessage(err),
    });
    return;
  }

  let autoCreated = null;
  if (autoCreateTable) {
    try {
      autoCreated = createAutoCollectorTable(config);
      applyAutoCreateConfig(config, autoCreated.tableName);
    } catch (err) {
      rollbackAutoCreatedOpcuaServer(autoCreatedOpcuaServer);
      reply({
        ok: false,
        reason: errorMessage(err),
      });
      return;
    }
  } else {
    try {
      validateCollectorTagNameLength(name, config);
    } catch (err) {
      rollbackAutoCreatedOpcuaServer(autoCreatedOpcuaServer);
      reply({
        ok: false,
        reason: errorMessage(err),
      });
      return;
    }
  }

  try {
    CGI.writeConfig(name, config);
  } catch (err) {
    if (autoCreated) {
      try { dropAutoCreatedTable(autoCreated.db, autoCreated.tableName); } catch (_) {}
    }
    rollbackAutoCreatedOpcuaServer(autoCreatedOpcuaServer);
    reply({
      ok: false,
      reason: errorMessage(err),
    });
    return;
  }
  Service.install(name, (err) => {
    if (err) {
      CGI.removeConfig(name);
      if (autoCreated) {
        try { dropAutoCreatedTable(autoCreated.db, autoCreated.tableName); } catch (_) {}
      }
      rollbackAutoCreatedOpcuaServer(autoCreatedOpcuaServer);
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
  const validErr = validateConfig(nextConfig);
  if (validErr) {
    reply({ ok: false, reason: validErr });
    return;
  }

  let autoCreatedOpcuaServer = null;
  try {
    autoCreatedOpcuaServer = prepareCollectorOpcuaServerConfig(name, nextConfig);
    validateCollectorTagNameLength(name, nextConfig);
  } catch (err) {
    rollbackAutoCreatedOpcuaServer(autoCreatedOpcuaServer);
    reply({
      ok: false,
      reason: errorMessage(err),
    });
    return;
  }

  Service.status(name, (statusErr, serviceInfo) => {
    if (statusErr && !Service.isMissingServiceError(statusErr)) {
      rollbackAutoCreatedOpcuaServer(autoCreatedOpcuaServer);
      reply({
        ok: false,
        reason: errorMessage(statusErr),
      });
      return;
    }
    try {
      CGI.writeConfig(name, nextConfig);
    } catch (err) {
      rollbackAutoCreatedOpcuaServer(autoCreatedOpcuaServer);
      reply({
        ok: false,
        reason: errorMessage(err),
      });
      return;
    }
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

// ── OPC UA Server config CRUD ─────────────────────────────────────────────────

/**
 * POST /cgi-bin/api/opcua/server
 * @param {string} name
 * @param {object} config
 * @param {function} reply
 */
function opcuaServerPost(name, config, reply) {
  let serverName;
  let normalized;
  try {
    serverName = normalizeOpcuaServerName(name);
  } catch (err) {
    reply({ ok: false, reason: errorMessage(err) });
    return;
  }
  if (CGI.getOpcuaServerConfig(serverName)) {
    reply({
      ok: false,
      reason: `opcua server '${serverName}' already exists`,
    });
    return;
  }
  try {
    normalized = normalizeOpcuaServerConfig(config, {
      serverName,
      forStorage: true,
    });
  } catch (err) {
    reply({ ok: false, reason: errorMessage(err) });
    return;
  }
  try {
    const removeCredential = consumeOpcuaCredentialCleanupFlag(normalized);
    CGI.writeOpcuaServerConfig(serverName, normalized);
    if (removeCredential) {
      const credentialErr = CGI.removeOpcuaServerCredentialFiles(serverName);
      if (credentialErr) {
        reply({ ok: false, reason: errorMessage(credentialErr) });
        return;
      }
    }
    reply({
      ok: true,
      data: { name: serverName },
    });
  } catch (err) {
    reply({ ok: false, reason: errorMessage(err) });
  }
}

/**
 * GET /cgi-bin/api/opcua/server?name=xxx
 * @param {string} name
 * @param {function} reply
 */
function opcuaServerGet(name, reply) {
  let resolved;
  try {
    resolved = getOpcuaServerConfigOrThrow(name);
  } catch (err) {
    reply({ ok: false, reason: errorMessage(err) });
    return;
  }
  reply({
    ok: true,
    data: { name: resolved.name, config: safeOpcuaServerConfig(resolved.config, resolved.name) },
  });
}

/**
 * PUT /cgi-bin/api/opcua/server?name=xxx
 * @param {string} name
 * @param {object} body
 * @param {function} reply
 */
function opcuaServerPut(name, body, reply) {
  let serverName;
  let normalized;
  let existing;
  try {
    serverName = normalizeOpcuaServerName(name);
    existing = CGI.getOpcuaServerConfig(serverName);
    normalized = normalizeOpcuaServerConfig(body, {
      serverName,
      previousConfig: existing,
      forStorage: true,
    });
  } catch (err) {
    reply({ ok: false, reason: errorMessage(err) });
    return;
  }
  if (!existing) {
    reply({
      ok: false,
      reason: `opcua server '${serverName}' not found`,
    });
    return;
  }
  try {
    const removeCredential = consumeOpcuaCredentialCleanupFlag(normalized);
    CGI.writeOpcuaServerConfig(serverName, normalized);
    if (removeCredential) {
      const credentialErr = CGI.removeOpcuaServerCredentialFiles(serverName);
      if (credentialErr) {
        reply({ ok: false, reason: errorMessage(credentialErr) });
        return;
      }
    }
    reply({
      ok: true,
      data: { name: serverName },
    });
  } catch (err) {
    reply({ ok: false, reason: errorMessage(err) });
  }
}

/**
 * DELETE /cgi-bin/api/opcua/server?name=xxx
 * @param {string} name
 * @param {function} reply
 */
function opcuaServerDelete(name, reply) {
  let serverName;
  try {
    serverName = normalizeOpcuaServerName(name);
  } catch (err) {
    reply({ ok: false, reason: errorMessage(err) });
    return;
  }
  if (!CGI.getOpcuaServerConfig(serverName)) {
    reply({
      ok: false,
      reason: `opcua server '${serverName}' not found`,
    });
    return;
  }
  const err = CGI.removeOpcuaServerConfig(serverName);
  if (err) {
    reply({
      ok: false,
      reason: errorMessage(err),
    });
    return;
  }
  const credentialErr = CGI.removeOpcuaServerCredentialFiles(serverName);
  if (credentialErr) {
    reply({
      ok: false,
      reason: errorMessage(credentialErr),
    });
    return;
  }
  reply({ ok: true });
}

/**
 * GET /cgi-bin/api/opcua/server/list
 * @param {function} reply
 */
function opcuaServerList(reply) {
  const data = CGI.getOpcuaServerConfigList().sort().map((name) => {
    const config = CGI.getOpcuaServerConfig(name);
    return {
      name,
      config: safeOpcuaServerConfig(normalizeOpcuaServerConfig(config), name),
    };
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
      const found = findUserRow(users, db.user);
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
      const found = findUserRow(users, lookupUser);
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

function parseQualifiedTagTable(table) {
  const raw = String(table || '').trim();
  if (!raw) {
    throw new Error('table is required');
  }
  const parts = raw.split('.');
  if (parts.length > 2) {
    throw new Error('table must be TABLE or USER.TABLE');
  }
  const tableName = normalizeIdentifier(parts.length === 2 ? parts[1] : parts[0], 'table');
  const tableUser = parts.length === 2 ? normalizeIdentifier(parts[0], 'table user') : null;
  return {
    tableName,
    tableUser,
    tableRef: tableUser ? `${tableUser}.${tableName}` : tableName,
  };
}

function parsePositiveInt(value, defaultValue, minValue, maxValue) {
  const n = Number(value);
  if (!Number.isFinite(n)) return defaultValue;
  const int = Math.floor(n);
  if (int < minValue) return minValue;
  if (int > maxValue) return maxValue;
  return int;
}

function parseOptionalDate(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid date`);
  }
  return date;
}

function pickRowValue(row, names) {
  for (const name of names) {
    if (name && Object.prototype.hasOwnProperty.call(row, name)) {
      return row[name];
    }
  }
  return undefined;
}

function rowCountValue(row) {
  const raw = pickRowValue(row || {}, ['ROW_COUNT', 'row_count', 'COUNT(*)', 'count']);
  const n = Number(raw || 0);
  return Number.isFinite(n) ? n : 0;
}

const INTERNAL_QUERY_ROW_FIELDS = new Set(['buffer', 'names']);
const TAG_DATA_MAX_PAGE_SIZE = 1000000;

function normalizeTagDataRow(row, req) {
  const normalized = {};
  for (const [key, value] of Object.entries(row || {})) {
    const normalizedKey = String(key).toLowerCase();
    if (INTERNAL_QUERY_ROW_FIELDS.has(normalizedKey)) continue;
    normalized[normalizedKey] = value;
  }

  const primaryKey = String(req.primaryColumn || 'NAME').toLowerCase();
  const timeKey = String(req.timeColumn || 'TIME').toLowerCase();
  const valueKey = String(req.valueColumn || 'VALUE').toLowerCase();

  if (primaryKey !== 'name' && Object.prototype.hasOwnProperty.call(normalized, primaryKey)) {
    normalized.name = normalized[primaryKey];
    delete normalized[primaryKey];
  }
  if (timeKey !== 'time' && Object.prototype.hasOwnProperty.call(normalized, timeKey)) {
    normalized.time = normalized[timeKey];
    delete normalized[timeKey];
  }
  if (valueKey !== 'value' && Object.prototype.hasOwnProperty.call(normalized, valueKey)) {
    normalized.value = normalized[valueKey];
    delete normalized[valueKey];
  }

  return normalized;
}

function buildTagMetaTableRef(table) {
  return table.tableUser ? `${table.tableUser}._${table.tableName}_META` : `_${table.tableName}_META`;
}

function buildTagStatViewRef(table) {
  return table.tableUser ? `${table.tableUser}.V$${table.tableName}_STAT` : `V$${table.tableName}_STAT`;
}

const HIERARCHY_TAG_NAME = '__machbase_hierarchy__';

function parseJsonObject(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_err) {
    return null;
  }
}

function normalizeAssetHierarchy(value) {
  const parsed = parseJsonObject(value);
  if (!parsed || !Array.isArray(parsed.schema)) return null;
  const column = normalizeText(parsed.column) || 'asset';
  const schema = parsed.schema.map((key) => normalizeText(key)).filter(Boolean);
  if (schema.length !== parsed.schema.length || schema.length === 0) return null;
  if (new Set(schema).size !== schema.length) return null;
  const tree = Array.isArray(parsed.tree) ? parsed.tree : null;
  if (!tree) return null;
  return { column, schema, tree };
}

function findAssetHierarchy(row) {
  if (!row) return null;
  for (const value of Object.values(row || {})) {
    if (typeof value !== 'string' || !value.trim().startsWith('{')) continue;
    const hierarchy = normalizeAssetHierarchy(value);
    if (!hierarchy) continue;
    return hierarchy;
  }

  return null;
}

function mapTagMetaResponse(rows, assetColumn, assetHierarchy = null) {
  const tags = [];
  const assetColumnNames = assetColumn
    ? [assetColumn, assetColumn.toUpperCase(), assetColumn.toLowerCase()]
    : [];

  for (const row of rows || []) {
    const name = pickRowValue(row, ['NAME', 'name']);
    if (name === undefined || name === null || name === '') continue;
    const tagName = String(name);
    if (tagName === HIERARCHY_TAG_NAME) {
      continue;
    }

    const id = pickRowValue(row, ['_ID', '_id', 'ID', 'id']);
    const tag = {
      id: id === undefined || id === null ? null : String(id),
      name: tagName,
    };
    const asset = assetColumnNames.length > 0 ? pickRowValue(row, assetColumnNames) : undefined;
    const assetObject = parseJsonObject(asset);
    if (assetObject) tag.asset = assetObject;
    tags.push(tag);
  }

  return { tags, assetHierarchy };
}

function mapTagMetaRows(rows) {
  return mapTagMetaResponse(rows).tags;
}

function findMetadataColumnName(columns, requestedName) {
  const requested = normalizeText(requestedName).toUpperCase();
  if (!requested) return '';
  const found = (columns || []).find((row) => {
    const name = normalizeText(row.NAME || row.name).toUpperCase();
    const flag = Number(row.FLAG || row.flag || 0);
    return name === requested && (flag & FLAG_METADATA);
  });
  return found ? normalizeText(found.NAME || found.name) : '';
}

function parseTagDataNames(params) {
  const rawNames = params && params.names;
  const names = [];

  if (Array.isArray(rawNames)) {
    for (const value of rawNames) {
      const name = String(value || '').trim();
      if (name) names.push(name);
    }
  } else if (rawNames !== undefined && rawNames !== null) {
    for (const value of String(rawNames).split(',')) {
      const name = value.trim();
      if (name) names.push(name);
    }
  }

  if (names.length === 0) {
    const legacyName = String((params && params.name) || '').trim();
    if (legacyName) names.push(legacyName);
  }

  return names;
}

function buildTagDataWhere(params, primaryColumn, timeColumn) {
  const placeholders = params.names.map(() => '?').join(', ');
  const clauses = [`${primaryColumn} IN (${placeholders})`];
  const values = params.names.slice();
  if (params.from) {
    clauses.push(`${timeColumn} >= ?`);
    values.push(params.from);
  }
  if (params.to) {
    clauses.push(`${timeColumn} <= ?`);
    values.push(params.to);
  }
  return {
    sql: clauses.join(' AND '),
    values,
  };
}

function buildTagDataCursor(req) {
  if (!req.cursorSide || !req.cursorTime) return null;

  const latest = req.direction !== 'oldest';
  const next = req.cursorSide === 'next';
  let timeOp;
  let nameOp;
  let orderTime;
  let orderName;
  let reverseRows = false;

  if (latest && next) {
    timeOp = '<';
    nameOp = '>';
    orderTime = 'DESC';
    orderName = 'ASC';
  } else if (latest) {
    timeOp = '>';
    nameOp = '<';
    orderTime = 'ASC';
    orderName = 'DESC';
    reverseRows = true;
  } else if (next) {
    timeOp = '>';
    nameOp = '>';
    orderTime = 'ASC';
    orderName = 'ASC';
  } else {
    timeOp = '<';
    nameOp = '<';
    orderTime = 'DESC';
    orderName = 'DESC';
    reverseRows = true;
  }

  const cursorTimeSql = formatSqlTimestampLiteral(req.cursorTime);

  return {
    sql: `(${req.timeColumn} ${timeOp} ${cursorTimeSql} OR (${req.timeColumn} = ${cursorTimeSql} AND ${req.primaryColumn} ${nameOp} ?))`,
    values: [req.cursorName],
    orderTime,
    orderName,
    reverseRows,
  };
}

function escapeSqlString(value) {
  return String(value === undefined || value === null ? '' : value).replace(/'/g, "''");
}

function formatSqlDateLiteral(value) {
  if (!(value instanceof Date)) return '';
  const iso = value.toISOString().replace('T', ' ').replace('Z', '');
  return `to_date('${escapeSqlString(iso)}')`;
}

function formatSqlTimestampLiteral(value) {
  if (!(value instanceof Date)) return "TO_TIMESTAMP('')";
  const pad = (part, size = 2) => String(part).padStart(size, '0');
  const timestamp =
    `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ` +
    `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}.` +
    `${pad(value.getMilliseconds(), 3)}`;
  return `TO_TIMESTAMP('${escapeSqlString(timestamp)}')`;
}

function buildTagChartTqlWhere(req) {
  const names = req.names.map((name) => `'${escapeSqlString(name)}'`).join(', ');
  const clauses = [`${req.primaryColumn} IN (${names})`];
  if (req.from) {
    clauses.push(`${req.timeColumn} >= ${formatSqlDateLiteral(req.from)}`);
  }
  if (req.to) {
    clauses.push(`${req.timeColumn} <= ${formatSqlDateLiteral(req.to)}`);
  }
  return clauses.join(' AND ');
}

function buildTagChartSelect(req) {
  const queryWhere = buildTagChartTqlWhere(req);
  const query =
    `SELECT ${req.timeColumn} AS TIME, ${req.primaryColumn} AS NAME, ${req.valueColumn} AS VALUE ` +
    `FROM ${req.tableRef} WHERE ${queryWhere} ORDER BY ${req.timeColumn} ASC, ${req.primaryColumn} ASC`;
  return {
    query,
  };
}

function normalizeChartPointTime(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return Number.NaN;
    if (Math.abs(value) > 100000000000000) return value / 1000000;
    return value;
  }

  const text = String(value === undefined || value === null ? '' : value).trim();
  if (!text) return Number.NaN;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return normalizeChartPointTime(numeric);
  return Date.parse(text);
}

function normalizeChartPointValue(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildTagChartSeries(rows) {
  const seriesByName = new Map();
  for (const row of rows || []) {
    const name = String(pickRowValue(row || {}, ['NAME', 'name']) || '').trim();
    const time = normalizeChartPointTime(pickRowValue(row || {}, ['TIME', 'time']));
    if (!name || !Number.isFinite(time)) continue;
    if (!seriesByName.has(name)) {
      seriesByName.set(name, []);
    }
    seriesByName.get(name).push([
      time,
      normalizeChartPointValue(pickRowValue(row || {}, ['VALUE', 'value'])),
    ]);
  }

  return Array.from(seriesByName.entries()).map(([name, data]) => ({
    name,
    data: data.sort((a, b) => a[0] - b[0]),
  }));
}

function parseTagDataRequest(params) {
  const table = parseQualifiedTagTable(params && params.table);
  const names = parseTagDataNames(params);
  const req = {
    ...table,
    name: names[0] || '',
    names,
    primaryColumn: normalizeIdentifier((params && params.primaryColumn) || 'NAME', 'primaryColumn'),
    timeColumn: normalizeIdentifier((params && params.timeColumn) || 'TIME', 'timeColumn'),
    valueColumn: normalizeIdentifier((params && params.valueColumn) || 'VALUE', 'valueColumn'),
    stringValueColumn: params && params.stringValueColumn
      ? normalizeIdentifier(params.stringValueColumn, 'stringValueColumn')
      : null,
    direction: params && params.direction === 'oldest' ? 'oldest' : 'latest',
    from: parseOptionalDate(params && params.from, 'from'),
    to: parseOptionalDate(params && params.to, 'to'),
    page: parsePositiveInt(params && params.page, 1, 1, 1000000),
    pageSize: parsePositiveInt(params && params.pageSize, 100, 1, TAG_DATA_MAX_PAGE_SIZE),
    boundedRange: params && (params.boundedRange === true || params.boundedRange === 'true'),
    cursorSide: params && (params.cursorSide === 'next' || params.cursorSide === 'prev') ? params.cursorSide : null,
    cursorTime: parseOptionalDate(params && params.cursorTime, 'cursorTime'),
    cursorName: normalizeText(params && params.cursorName),
    cursorOffset: parsePositiveInt(params && params.cursorOffset, 0, 0, TAG_DATA_MAX_PAGE_SIZE),
  };
  if (!req.name) {
    throw new Error('name is required');
  }
  return req;
}

function validateTagDataTable(client, req, db) {
  const lookupUser = req.tableUser || db.user;
  const userId = lookupUser ? findUserId(client, lookupUser) : null;
  const meta = client.selectTableMeta(req.tableName, userId);
  if (!meta) {
    throw new Error(`table '${req.tableRef}' not found`);
  }
  if (meta.TYPE !== 6) {
    throw new Error(`table '${req.tableRef}' is not a TAG table`);
  }
}

/**
 * GET /cgi-bin/api/db/table/tags?server=xxx&table=xxx
 * @param {{ host: string, port: number, user: string, password: string }} db
 * @param {{ table: string }} params
 * @param {function} reply
 */
function dbTableTags(db, params, reply) {
  let req;
  try {
    req = parseQualifiedTagTable(params && params.table);
  } catch (err) {
    reply({ ok: false, reason: errorMessage(err) });
    return;
  }

  const client = new MachbaseClient(db);
  try {
    client.connect();
    const lookupUser = req.tableUser || db.user;
    const userId = lookupUser ? findUserId(client, lookupUser) : null;
    const meta = client.selectTableMeta(req.tableName, userId);
    if (!meta) {
      reply({ ok: false, reason: `table '${req.tableRef}' not found` });
      return;
    }
    if (meta.TYPE !== 6) {
      reply({ ok: false, reason: `table '${req.tableRef}' is not a TAG table` });
      return;
    }

    const tagMetaTable = buildTagMetaTableRef(req);
    const columns = client.selectColumnsByTableId(meta.ID);
    const hierarchyRows = client.query(`SELECT * FROM ${tagMetaTable} WHERE NAME = ?`, [HIERARCHY_TAG_NAME]);
    const assetHierarchy = findAssetHierarchy(hierarchyRows && hierarchyRows[0]);
    const assetColumn = assetHierarchy ? normalizeText(assetHierarchy.column) : '';
    const rows = client.query(assetHierarchy
      ? `SELECT * FROM ${tagMetaTable} ORDER BY NAME`
      : `SELECT _ID, NAME${assetColumn ? `, ${assetColumn}` : ''} FROM ${tagMetaTable} ORDER BY NAME`);
    const tagMeta = mapTagMetaResponse(rows, assetColumn, assetHierarchy);
    reply({
      ok: true,
      data: {
        table: req.tableRef,
        tags: tagMeta.tags,
        assetHierarchy: tagMeta.assetHierarchy,
      },
    });
  } catch (err) {
    reply({ ok: false, reason: errorMessage(err) });
  } finally {
    client.close();
  }
}

/**
 * GET /cgi-bin/api/db/table/data?server=xxx&table=xxx&name=xxx
 * @param {{ host: string, port: number, user: string, password: string }} db
 * @param {{
 *   table: string,
 *   name: string,
 *   names?: string|string[],
 *   valueColumn?: string,
 *   stringValueColumn?: string,
 *   primaryColumn?: string,
 *   timeColumn?: string,
 *   direction?: 'latest'|'oldest',
 *   from?: string,
 *   to?: string,
 *   page?: number,
 *   pageSize?: number,
 *   boundedRange?: boolean|string,
 *   cursorSide?: 'next'|'prev',
 *   cursorTime?: string,
 *   cursorName?: string,
 *   cursorOffset?: number,
 * }} params
 * @param {function} reply
 */
function dbTableData(db, params, reply) {
  let req;
  try {
    req = parseTagDataRequest(params);
  } catch (err) {
    reply({ ok: false, reason: errorMessage(err) });
    return;
  }

  const client = new MachbaseClient(db);
  try {
    client.connect();
    validateTagDataTable(client, req, db);

    const where = buildTagDataWhere(req, req.primaryColumn, req.timeColumn);
    const cursor = buildTagDataCursor(req);
    const queryWhere = cursor ? `${where.sql} AND ${cursor.sql}` : where.sql;
    const orderTime = cursor ? cursor.orderTime : (req.direction === 'oldest' ? 'ASC' : 'DESC');
    const orderName = cursor ? cursor.orderName : 'ASC';
    const scan = orderTime === 'ASC' ? 'SCAN_FORWARD' : 'SCAN_BACKWARD';
    const offset = cursor ? req.cursorOffset : (req.boundedRange ? 0 : (req.page - 1) * req.pageSize);
    const limitSql = cursor ? 'LIMIT ?, ?' : 'LIMIT ?';
    const limitValues = cursor ? [offset, req.pageSize] : [offset + req.pageSize];
    const dataRows = client.query(
      `SELECT /*+ ${scan}(${req.tableRef}) */ * ` +
      `FROM ${req.tableRef} WHERE ${queryWhere} ORDER BY ${req.timeColumn} ${orderTime}, ${req.primaryColumn} ${orderName} ${limitSql}`,
      [
        ...where.values,
        ...(cursor ? cursor.values : []),
        ...limitValues,
      ]
    );
    const pageRows = cursor
      ? (cursor.reverseRows ? [...(dataRows || [])].reverse() : (dataRows || []))
      : (dataRows || []).slice(req.boundedRange ? 0 : offset, req.boundedRange ? req.pageSize : offset + req.pageSize);
    const rows = pageRows.map((row) => normalizeTagDataRow(row, req));

    reply({
      ok: true,
      data: {
        table: req.tableRef,
        name: req.name,
        names: req.names,
        direction: req.direction,
        page: req.page,
        pageSize: req.pageSize,
        rows,
      },
    });
  } catch (err) {
    reply({ ok: false, reason: errorMessage(err) });
  } finally {
    client.close();
  }
}

function dbTableDataTotal(db, params, reply) {
  let req;
  try {
    req = parseTagDataRequest(params);
  } catch (err) {
    reply({ ok: false, reason: errorMessage(err) });
    return;
  }

  const client = new MachbaseClient(db);
  try {
    client.connect();
    validateTagDataTable(client, req, db);

    const where = buildTagDataWhere(req, req.primaryColumn, req.timeColumn);
    let total = null;
    if (req.names.length === 1 && !req.from && !req.to) {
      try {
        const rows = client.query(
          `SELECT ROW_COUNT FROM ${buildTagStatViewRef(req)} WHERE NAME = ?`,
          [req.name]
        );
        total = rowCountValue(rows && rows[0]);
      } catch (_) {
        total = null;
      }
    }

    if (total === null) {
      const rows = client.query(
        `SELECT COUNT(*) AS ROW_COUNT FROM ${req.tableRef} WHERE ${where.sql}`,
        where.values
      );
      total = rowCountValue(rows && rows[0]);
    }

    reply({
      ok: true,
      data: {
        table: req.tableRef,
        name: req.name,
        names: req.names,
        total,
        pageSize: req.pageSize,
        lastPage: Math.max(1, Math.ceil(total / req.pageSize)),
      },
    });
  } catch (err) {
    reply({ ok: false, reason: errorMessage(err) });
  } finally {
    client.close();
  }
}

function dbTableChart(db, params, reply) {
  let req;
  try {
    req = parseTagDataRequest(params);
  } catch (err) {
    reply({ ok: false, reason: errorMessage(err) });
    return;
  }

  const client = new MachbaseClient(db);
  try {
    client.connect();
    validateTagDataTable(client, req, db);

    const query = buildTagChartSelect(req);

    reply({
      ok: true,
      data: {
        type: 'query',
        table: req.tableRef,
        name: req.name,
        names: req.names,
        range: {
          from: req.from ? req.from.toISOString() : '',
          to: req.to ? req.to.toISOString() : '',
        },
        query: query.query,
      },
    });
  } catch (err) {
    reply({ ok: false, reason: errorMessage(err) });
  } finally {
    client.close();
  }
}

// ── OPC UA one-shot endpoints ───────────────────────────────────────────────

/**
 * POST /cgi-bin/api/opcua/connect
 * @param {string|{endpoint?: string, server?: string}} endpoint
 * @param {number} [readRetryInterval]
 * @param {function} reply
 */
function opcuaConnect(endpointOrRequest, readRetryInterval, reply) {
  let resolved;
  let temporarySecurityName = null;
  try {
    resolved = resolveOpcuaEndpoint(endpointOrRequest);
    temporarySecurityName = applyDirectOpcuaConnectSecurity(resolved, endpointOrRequest);
  } catch (err) {
    cleanupTemporaryOpcuaConnectSecurity(temporarySecurityName);
    reply({ ok: false, reason: errorMessage(err) });
    return;
  }
  const endpoint = resolved.endpoint;
  const client = new OpcuaClient(opcuaClientConfig(resolved, readRetryInterval));
  if (!client.open()) {
    cleanupTemporaryOpcuaConnectSecurity(temporarySecurityName);
    reply({
      ok: false,
      reason: opcuaConnectFailedReason(endpoint, client),
    });
    return;
  }
  try {
    const capabilityInfo = detectOpcuaCapabilities(client);
    client.close();
    verifyOpcuaBrowse(opcuaClientConfig(resolved, readRetryInterval));
    reply({
      ok: true,
      data: {
        server: resolved.server || undefined,
        endpoint,
        connected: true,
        readBatchSize: capabilityInfo.readBatchSize,
        capabilities: capabilityInfo.capabilities,
      },
    });
  } catch (e) {
    reply({
      ok: false,
      reason: opcuaConnectFailedReason(endpoint, { lastError: e }),
    });
  } finally {
    client.close();
    cleanupTemporaryOpcuaConnectSecurity(temporarySecurityName);
  }
}

/**
 * GET /cgi-bin/api/opcua/read?endpoint=xxx&nodes=id1,id2
 * @param {string|{endpoint?: string, server?: string}} endpoint
 * @param {string[]} nodeIds
 * @param {function} reply
 */
function opcuaRead(endpointOrRequest, nodeIds, reply) {
  let resolved;
  try {
    resolved = resolveOpcuaEndpoint(endpointOrRequest);
  } catch (err) {
    reply({ ok: false, reason: errorMessage(err) });
    return;
  }
  const endpoint = resolved.endpoint;
  const client = new OpcuaClient(opcuaClientConfig(resolved));
  if (!client.open()) {
    reply({
      ok: false,
      reason: opcuaConnectFailedReason(endpoint, client),
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
 * @param {string|{endpoint?: string, server?: string}} endpoint
 * @param {Array<{ node: string, value: any }>} writes
 * @param {function} reply
 */
function opcuaWrite(endpointOrRequest, writes, reply) {
  let resolved;
  try {
    resolved = resolveOpcuaEndpoint(endpointOrRequest);
  } catch (err) {
    reply({ ok: false, reason: errorMessage(err) });
    return;
  }
  const endpoint = resolved.endpoint;
  const client = new OpcuaClient(opcuaClientConfig(resolved));
  if (!client.open()) {
    reply({
      ok: false,
      reason: opcuaConnectFailedReason(endpoint, client),
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
  const request = { nodes: [nodeId] };
  if (typeof nodeClassMask === 'number') {
    request.nodeClassMask = nodeClassMask;
  }
  const results = client.browse(request);
  const first = results && results[0] ? results[0] : {};
  const references = first.references ? first.references.slice() : [];
  let continuationPoint = first.continuationPoint;
  while (continuationPoint) {
    const nextResults = client.browseNext({
      continuationPoints: [continuationPoint],
      releaseContinuationPoints: false,
    });
    const next = nextResults && nextResults[0] ? nextResults[0] : {};
    if (next.references && next.references.length > 0) {
      for (let i = 0; i < next.references.length; i++) {
        references.push(next.references[i]);
      }
    }
    continuationPoint = next.continuationPoint;
  }
  return references;
}

function _browseDescendants(client, rootNode, nodeClassMask) {
  const visited = {};
  visited[rootNode] = true;
  const queue = [rootNode];
  const all = [];
  while (queue.length > 0) {
    const current = queue.shift();
    const references = _browseAll(client, current, nodeClassMask);
    for (let i = 0; i < references.length; i++) {
      const ref = references[i];
      const childId = ref.NodeId;
      all.push(Object.assign(JSON.parse(JSON.stringify(ref)), { dataType: '' }));
      if (childId && !visited[childId]) {
        visited[childId] = true;
        queue.push(childId);
      }
    }
  }
  return all;
}

function nodeDescendants(body, reply) {
  let resolved;
  try {
    resolved = resolveOpcuaEndpoint(body);
  } catch (err) {
    reply({ ok: false, reason: errorMessage(err) });
    return;
  }
  const client = new OpcuaClient(opcuaClientConfig(resolved));
  if (!client.open()) {
    reply({
      ok: false,
      reason: opcuaConnectFailedReason(resolved.endpoint, client),
    });
    return;
  }
  try {
    const nodes = _browseDescendants(client, body.node, body.nodeClassMask);
    if (nodes.length > 0) {
      try {
        const attrResults = client.attributes({
          requests: nodes.map(n => ({ node: n.nodeId, attributeId: AttributeID.DataType })),
        });
        for (let i = 0; i < nodes.length; i++) {
          const result = JSON.parse(JSON.stringify(attrResults[i]));
          nodes[i].dataType = (result && result.status === StatusCode.Good) ? result.value : '';
        }
      } catch (_) {}
    }
    reply({
      ok: true,
      data: nodes,
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
  opcuaServerPost,
  opcuaServerGet,
  opcuaServerPut,
  opcuaServerDelete,
  opcuaServerList,
  dbConnect,
  dbTableCreate,
  dbTableList,
  dbTableColumns,
  dbTableTags,
  dbTableData,
  dbTableDataTotal,
  dbTableChart,
  nodeDescendants,
  opcuaConnect,
  opcuaRead,
  opcuaWrite,
  serviceConfigFromInfo,
  summarizeOpcuaClientServiceList,
  getOpcuaClientServiceSummary,
  getOpcuaClientServiceSummaryFromDefinitions,
};
