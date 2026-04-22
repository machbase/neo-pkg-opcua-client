'use strict';

const fs = require('fs');
const path = require('path');
const process = require('process');
const service = require('service');

const SERVICE_NAME_PREFIX = '_opc_';
const STOP_STATE_TTL_MS = 10 * 60 * 1000;
const STOP_STATE_FILE_NAME = '.pkg-collector-stop-state.json';

function _text(value) {
  if (value == null) return '';
  return String(value).trim();
}

function _normalizePath(value) {
  return _text(value).replace(/\\/g, '/');
}

function _hasFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (_) {
    return false;
  }
}

function _pushUnique(list, seen, value) {
  const text = _text(value);
  if (!text || seen[text]) return;
  seen[text] = true;
  list.push(text);
}

function _uniqueSorted(values) {
  const result = [];
  const seen = {};
  const list = Array.isArray(values) ? values : [];
  for (let i = 0; i < list.length; i++) {
    _pushUnique(result, seen, list[i]);
  }
  result.sort();
  return result;
}

function _normalizeDirPath(value) {
  const dirPath = _text(value);
  if (!dirPath) return '';
  return path.normalize(dirPath);
}

function _resolveAppRoot() {
  const candidates = [];
  const seen = {};
  const push = (value) => {
    const dirPath = _normalizeDirPath(value);
    if (!dirPath) return;
    if (!seen[dirPath]) {
      seen[dirPath] = true;
      candidates.push(dirPath);
    }
  };

  const cwd = _text(process.cwd && process.cwd());
  push(cwd);

  const scriptPath = _text(process.argv && process.argv[1]);
  if (scriptPath) {
    const absoluteScriptPath = path.isAbsolute(scriptPath) || !cwd
      ? scriptPath
      : path.join(cwd, scriptPath);
    const scriptDir = path.dirname(absoluteScriptPath);
    push(scriptDir);
    push(path.join(scriptDir, '..'));
  }

  for (let i = 0; i < candidates.length; i++) {
    const dirPath = candidates[i];
    if (_hasFile(path.join(dirPath, 'package.json')) && _hasFile(path.join(dirPath, 'cgi-bin', 'neo-collector.js'))) {
      return dirPath;
    }
  }

  throw new Error('failed to resolve package root');
}

const ROOT_DIR = _resolveAppRoot();
const CGI_DIR = path.join(ROOT_DIR, 'cgi-bin');
const DATA_DIR = path.join(CGI_DIR, 'data');
const STOP_STATE_FILE = path.join(DATA_DIR, STOP_STATE_FILE_NAME);
const PACKAGE_JSON = readJson(path.join(ROOT_DIR, 'package.json'));
const PACKAGE_NAME = _text(PACKAGE_JSON && PACKAGE_JSON.name) || path.basename(ROOT_DIR);
const EXPECTED_EXECUTABLE = _normalizePath(path.join(CGI_DIR, 'neo-collector.js'));
const EXPECTED_EXECUTABLE_SUFFIX = _normalizePath(path.join('/', PACKAGE_NAME, 'cgi-bin', 'neo-collector.js'));
const EXPECTED_DEPLOYED_EXECUTABLE_SUFFIX = _normalizePath(path.join('/public', PACKAGE_NAME, 'cgi-bin', 'neo-collector.js'));
const EXPECTED_WORKING_DIR = _normalizePath(CGI_DIR);
const EXPECTED_WORKING_DIR_SUFFIX = _normalizePath(path.join('/', PACKAGE_NAME, 'cgi-bin'));
const EXPECTED_DEPLOYED_WORKING_DIR_SUFFIX = _normalizePath(path.join('/public', PACKAGE_NAME, 'cgi-bin'));

function formatNames(values) {
  const names = _uniqueSorted(values);
  return names.length > 0 ? names.join(', ') : '(none)';
}

function printInfo(message) {
  console.println(`[INFO] ${message}`);
}

function printWarn(message) {
  console.println(`[WARN] ${message}`);
}

function printError(message) {
  console.println(`[ERROR] ${message}`);
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function deleteFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (_) {}
}

function isMissingServiceError(err) {
  const message = err && err.message ? String(err.message).toLowerCase() : '';
  return message.indexOf('does not exist') >= 0
    || message.indexOf('not found') >= 0
    || message.indexOf('no such service') >= 0
    || message.indexOf('unknown service') >= 0
    || (message.indexOf("detail '") >= 0 && message.indexOf('not found') >= 0);
}

function isRunningStatus(serviceInfo) {
  const status = serviceInfo && serviceInfo.status ? String(serviceInfo.status).toUpperCase() : '';
  return status === 'RUNNING';
}

function callService(method, args) {
  return new Promise((resolve, reject) => {
    if (!service || typeof service[method] !== 'function') {
      reject(new Error(`service.${method}() is not available`));
      return;
    }
    try {
      const callArgs = Array.isArray(args) ? args.slice() : [];
      callArgs.push((err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
      service[method].apply(service, callArgs);
    } catch (err) {
      reject(err);
    }
  });
}

function _extractEntry(source, entry) {
  const config = entry && entry.config ? entry.config : null;
  const name = _text((config && config.name) || (entry && entry.name));
  if (!name) return null;
  return {
    source,
    name,
    executable: _text((config && config.executable) || (entry && entry.executable)),
    workingDir: _text((config && config.working_dir) || (entry && entry.working_dir)),
    status: _text(entry && entry.status),
    args: Array.isArray((config && config.args) || (entry && entry.args))
      ? ((config && config.args) || (entry && entry.args)).slice()
      : [],
  };
}

async function readServiceStatusEntries() {
  const data = await callService('status', []);
  const list = Array.isArray(data) ? data : (data ? [data] : []);
  const result = [];
  for (let i = 0; i < list.length; i++) {
    const entry = _extractEntry('service.status', list[i]);
    if (entry) result.push(entry);
  }
  return result;
}

function getServiceDirectoryCandidates() {
  const result = [];
  const seen = {};
  const push = (value) => {
    const dirPath = _text(value);
    if (!dirPath || seen[dirPath]) return;
    seen[dirPath] = true;
    result.push(dirPath);
  };

  push('/etc/services');

  const home = _text(process.env && process.env.get ? process.env.get('HOME') : '');
  if (home) {
    push(path.join(home, 'etc', 'services'));
  }

  const execPath = _text(process.execPath || (process.argv && process.argv[0]));
  if (execPath && path.isAbsolute(execPath)) {
    push(path.join(path.dirname(execPath), 'etc', 'services'));
  }

  return result;
}

function getServiceDefinitionPaths(name) {
  const result = [];
  const seen = {};
  const fileName = `${_text(name)}.json`;
  if (!fileName || fileName === '.json') return result;
  const dirs = getServiceDirectoryCandidates();
  for (let i = 0; i < dirs.length; i++) {
    const filePath = path.join(dirs[i], fileName);
    if (!seen[filePath]) {
      seen[filePath] = true;
      result.push(filePath);
    }
  }
  return result;
}

function deleteServiceDefinition(name) {
  const paths = getServiceDefinitionPaths(name);
  for (let i = 0; i < paths.length; i++) {
    deleteFile(paths[i]);
  }
}

function readServiceDefinitionEntries() {
  const result = [];
  const seenFile = {};
  const dirs = getServiceDirectoryCandidates();
  for (let i = 0; i < dirs.length; i++) {
    const dirPath = dirs[i];
    let names = [];
    try {
      names = fs.readdirSync(dirPath);
    } catch (_) {
      continue;
    }
    for (let j = 0; j < names.length; j++) {
      const fileName = names[j];
      if (!/\.json$/i.test(fileName)) continue;
      const filePath = path.join(dirPath, fileName);
      if (seenFile[filePath]) continue;
      seenFile[filePath] = true;
      try {
        const data = readJson(filePath);
        const entry = _extractEntry('service.definition', data);
        if (entry) result.push(entry);
      } catch (_) {
        const name = fileName.replace(/\.json$/i, '');
        result.push({
          source: 'service.definition',
          name,
          executable: '',
          workingDir: '',
          status: '',
          args: [],
        });
      }
    }
  }
  return result;
}

function resolveExecutablePath(executable, workingDir) {
  const execText = _text(executable);
  if (!execText) return '';
  if (path.isAbsolute(execText)) {
    return _normalizePath(path.normalize(execText));
  }
  const workingDirText = _text(workingDir);
  if (workingDirText && path.isAbsolute(workingDirText)) {
    return _normalizePath(path.join(workingDirText, execText));
  }
  return _normalizePath(execText);
}

function resolveWorkingDirPath(value) {
  const dirText = _text(value);
  if (!dirText) return '';
  if (path.isAbsolute(dirText)) {
    return _normalizePath(path.normalize(dirText));
  }
  return _normalizePath(dirText);
}

function isCollectorExecutable(executable, workingDir) {
  const resolved = resolveExecutablePath(executable, workingDir);
  if (!resolved) return false;
  if (resolved === EXPECTED_EXECUTABLE) return true;
  return resolved.endsWith(EXPECTED_EXECUTABLE_SUFFIX)
    || resolved.endsWith(EXPECTED_DEPLOYED_EXECUTABLE_SUFFIX);
}

function isCollectorWorkingDir(workingDir) {
  const resolved = resolveWorkingDirPath(workingDir);
  if (!resolved) return false;
  if (resolved === EXPECTED_WORKING_DIR) return true;
  return resolved.endsWith(EXPECTED_WORKING_DIR_SUFFIX)
    || resolved.endsWith(EXPECTED_DEPLOYED_WORKING_DIR_SUFFIX);
}

function mergeEntries(entries) {
  const map = {};
  const list = Array.isArray(entries) ? entries : [];
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (!entry || !entry.name) continue;
    const name = entry.name;
    if (!map[name]) {
      map[name] = {
        name,
        executable: '',
        workingDir: '',
        status: '',
        args: [],
        sources: [],
      };
    }
    const target = map[name];
    if (!target.executable && entry.executable) target.executable = entry.executable;
    if (!target.workingDir && entry.workingDir) target.workingDir = entry.workingDir;
    if (!target.status && entry.status) target.status = entry.status;
    if ((!target.args || target.args.length === 0) && Array.isArray(entry.args) && entry.args.length > 0) {
      target.args = entry.args.slice();
    }
    if (entry.source && target.sources.indexOf(entry.source) < 0) {
      target.sources.push(entry.source);
    }
  }
  return map;
}

async function discoverCollectorServices() {
  const collected = [];
  const warnings = [];

  try {
    const statusEntries = await readServiceStatusEntries();
    for (let i = 0; i < statusEntries.length; i++) {
      collected.push(statusEntries[i]);
    }
  } catch (err) {
    warnings.push(`service.status() list failed: ${err.message}`);
  }

  const definitionEntries = readServiceDefinitionEntries();
  for (let i = 0; i < definitionEntries.length; i++) {
    collected.push(definitionEntries[i]);
  }

  const merged = mergeEntries(collected);
  const names = Object.keys(merged).sort();
  const services = [];
  for (let i = 0; i < names.length; i++) {
    const entry = merged[names[i]];
    if (entry.executable) {
      if (!isCollectorExecutable(entry.executable, entry.workingDir)) continue;
      entry.match = 'executable';
    } else if (entry.workingDir) {
      if (!isCollectorWorkingDir(entry.workingDir)) continue;
      entry.match = 'working_dir';
    } else {
      if (!entry.name.startsWith(SERVICE_NAME_PREFIX)) continue;
      entry.match = 'prefix';
    }
    services.push(entry);
  }

  return { services, warnings };
}

async function getServiceStatus(name) {
  return callService('status', [name]);
}

async function stopServiceIfRunning(name) {
  let serviceInfo;
  try {
    serviceInfo = await getServiceStatus(name);
  } catch (err) {
    if (isMissingServiceError(err)) {
      return { name, action: 'skip', reason: 'missing' };
    }
    throw err;
  }
  if (!isRunningStatus(serviceInfo)) {
    return { name, action: 'skip', reason: 'not_running' };
  }
  await callService('stop', [name]);
  return { name, action: 'stopped' };
}

async function startServiceIfNeeded(name) {
  try {
    const serviceInfo = await getServiceStatus(name);
    if (isRunningStatus(serviceInfo)) {
      return { name, action: 'skip', reason: 'already_running' };
    }
  } catch (err) {
    if (!isMissingServiceError(err)) {
      throw err;
    }
  }
  await callService('start', [name]);
  return { name, action: 'started' };
}

async function uninstallService(name) {
  try {
    await callService('uninstall', [name]);
    deleteServiceDefinition(name);
    return { name, action: 'uninstalled' };
  } catch (err) {
    if (isMissingServiceError(err)) {
      deleteServiceDefinition(name);
      return { name, action: 'skip', reason: 'missing' };
    }
    throw err;
  }
}

async function runSequential(names, runner) {
  const results = [];
  const errors = [];
  const list = _uniqueSorted(names);
  for (let i = 0; i < list.length; i++) {
    const name = list[i];
    try {
      results.push(await runner(name));
    } catch (err) {
      errors.push({ name, error: err });
    }
  }
  return { results, errors };
}

function saveStoppedState(names) {
  // collector config-only 항목은 start 대상이 아니므로, 실제로 멈춘 installed service만 저장한다.
  writeJson(STOP_STATE_FILE, {
    savedAt: Date.now(),
    ttlMs: STOP_STATE_TTL_MS,
    serviceNames: _uniqueSorted(names),
  });
}

function loadStoppedState() {
  try {
    const data = readJson(STOP_STATE_FILE);
    const savedAt = Number(data && data.savedAt);
    const ttlMs = Number(data && data.ttlMs);
    if (!Number.isFinite(savedAt) || !Number.isFinite(ttlMs) || ttlMs <= 0) {
      return null;
    }
    const ageMs = Date.now() - savedAt;
    if (ageMs > ttlMs) {
      deleteFile(STOP_STATE_FILE);
      return null;
    }
    return {
      savedAt,
      ttlMs,
      ageMs,
      serviceNames: _uniqueSorted(data && data.serviceNames),
    };
  } catch (_) {
    return null;
  }
}

function clearStoppedState() {
  deleteFile(STOP_STATE_FILE);
}

module.exports = {
  SERVICE_NAME_PREFIX,
  STOP_STATE_TTL_MS,
  ROOT_DIR,
  CGI_DIR,
  DATA_DIR,
  STOP_STATE_FILE,
  discoverCollectorServices,
  stopServiceIfRunning,
  startServiceIfNeeded,
  uninstallService,
  runSequential,
  saveStoppedState,
  loadStoppedState,
  clearStoppedState,
  formatNames,
  printInfo,
  printWarn,
  printError,
};
