'use strict';

const fs = require('fs');
const path = require('path');
const process = require('process');
const service = require('service');

const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const APP_ROOT = path.dirname(ROOT);
const CONF_DIR = path.join(ROOT, 'conf.d');
const RUN_DIR  = path.join(ROOT, 'run');
const SERVICE_PREFIX = '_opc_';

class CGI {

  // ── conf.d CRUD ─────────────────────────────────────────────────────────────

  static configPath(name) {
    return path.join(CONF_DIR, `${name}.json`);
  }

  static listConfigs() {
    try {
      return fs.readdirSync(CONF_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace(/\.json$/, ''));
    } catch (_) {
      return [];
    }
  }

  static readConfig(name) {
    try {
      const raw = fs.readFileSync(CGI.configPath(name), 'utf8');
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  static writeConfig(name, config) {
    const filePath = CGI.configPath(name);
    const tmpPath = `${filePath}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
  }

  static deleteConfig(name) {
    try { fs.unlinkSync(CGI.configPath(name)); } catch (_) {}
  }

  static deletePid(name) {
    try { fs.unlinkSync(path.join(RUN_DIR, `${name}.pid`)); } catch (_) {}
  }

  // ── CGI 헬퍼 ──────────────────────────────────────────────────────────────

  static parseQuery() {
    const qs = process.env.get('QUERY_STRING') || '';
    const result = {};
    for (const part of qs.split('&')) {
      const [k, v] = part.split('=');
      if (k) result[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
    return result;
  }

  static readBody() {
    try {
      const raw = process.stdin.read();
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  static reply(data) {
    const body = JSON.stringify(data);
    process.stdout.write('Content-Type: application/json\r\n');
    process.stdout.write('\r\n');
    process.stdout.write(body);
  }

  // ── service 제어 ────────────────────────────────────────────────────────────

  static serviceName(name) {
    return `${SERVICE_PREFIX}${name}`;
  }

  static collectorNameFromServiceName(serviceName) {
    if (typeof serviceName !== 'string' || !serviceName.startsWith(SERVICE_PREFIX)) {
      return '';
    }
    return serviceName.slice(SERVICE_PREFIX.length);
  }

  static getNeoHome() {
    const execPath = process.execPath || process.argv[0] || '';
    if (!execPath || !path.isAbsolute(execPath)) {
      return '';
    }
    return path.dirname(execPath);
  }

  static inferNeoHomeFromAppRoot() {
    const marker = `${path.sep}public${path.sep}`;
    const idx = APP_ROOT.lastIndexOf(marker);
    if (idx < 0) {
      return '';
    }
    return APP_ROOT.slice(0, idx);
  }

  static getServiceDirectoryCandidates() {
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

    const neoHome = CGI.getNeoHome();
    if (neoHome) {
      push(path.join(neoHome, 'etc', 'services'));
    }

    const inferredNeoHome = CGI.inferNeoHomeFromAppRoot();
    if (inferredNeoHome) {
      push(path.join(inferredNeoHome, 'etc', 'services'));
    }

    return result;
  }

  static getServiceDefinitionPaths(name) {
    const result = [];
    const seen = {};
    for (const serviceDir of CGI.getServiceDirectoryCandidates()) {
      const filePath = path.join(serviceDir, `${CGI.serviceName(name)}.json`);
      if (!seen[filePath]) {
        seen[filePath] = true;
        result.push(filePath);
      }
    }
    return result;
  }

  static hasInstalledService(name) {
    for (const filePath of CGI.getServiceDefinitionPaths(name)) {
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          return true;
        }
      } catch (_) {}
    }
    return false;
  }

  static listInstalledServiceNames() {
    const result = [];
    const seen = {};

    for (const serviceDir of CGI.getServiceDirectoryCandidates()) {
      let stat;
      try {
        stat = fs.statSync(serviceDir);
      } catch (_) {
        stat = null;
      }
      if (!stat || !stat.isDirectory()) {
        continue;
      }

      let entries = [];
      try {
        entries = fs.readdirSync(serviceDir);
      } catch (_) {
        entries = [];
      }

      entries.forEach((entry) => {
        if (!entry.endsWith('.json') || !entry.startsWith(SERVICE_PREFIX)) {
          return;
        }
        const name = CGI.collectorNameFromServiceName(entry.replace(/\.json$/, ''));
        if (!name || seen[name]) {
          return;
        }
        seen[name] = true;
        result.push(name);
      });
    }

    return result;
  }

  static deleteServiceDefinition(name) {
    CGI.getServiceDefinitionPaths(name).forEach((filePath) => {
      try { fs.unlinkSync(filePath); } catch (_) {}
    });
  }

  static getCollectorScriptPath() {
    return path.join(ROOT, 'neo-collector.js');
  }

  static getServiceWorkingDir() {
    return APP_ROOT;
  }

  static buildServiceInstallConfig(name) {
    const executable = CGI.getCollectorScriptPath();
    if (!executable) {
      throw new Error('neo-collector.js path is not available');
    }
    return {
      name: CGI.serviceName(name),
      enable: false,
      working_dir: CGI.getServiceWorkingDir(),
      executable,
      args: [CGI.configPath(name)],
    };
  }

  static createServiceClient() {
    if (service && typeof service.Client === 'function') {
      try {
        return new service.Client();
      } catch (_) {}
    }
    return service;
  }

  static callService(method, args, callback) {
    const client = CGI.createServiceClient();
    if (!client || typeof client[method] !== 'function') {
      callback(new Error(`service.${method}() is not available`));
      return;
    }
    try {
      const callArgs = Array.isArray(args) ? args.slice() : [];
      callArgs.push(callback);
      client[method].apply(client, callArgs);
    } catch (err) {
      callback(err);
    }
  }

  static installService(name, callback) {
    CGI.callService('install', [CGI.buildServiceInstallConfig(name)], callback);
  }

  static getServiceStatus(name, callback) {
    CGI.callService('status', [CGI.serviceName(name)], callback);
  }

  static listServices(callback) {
    CGI.callService('status', [], (err, serviceInfos) => {
      if (err) {
        callback(err);
      } else if (Array.isArray(serviceInfos)) {
        callback(null, serviceInfos);
      } else if (serviceInfos) {
        callback(null, [serviceInfos]);
      } else {
        callback(null, []);
      }
    });
  }

  static uninstallService(name, callback) {
    CGI.callService('uninstall', [CGI.serviceName(name)], callback);
  }

  static startService(name, callback) {
    CGI.callService('start', [CGI.serviceName(name)], callback);
  }

  static stopService(name, callback) {
    CGI.callService('stop', [CGI.serviceName(name)], callback);
  }

  static isMissingServiceError(err) {
    const message = err && err.message ? String(err.message).toLowerCase() : '';
    return message.indexOf('does not exist') >= 0
      || message.indexOf('not found') >= 0
      || message.indexOf('no such service') >= 0
      || message.indexOf('unknown service') >= 0;
  }

  static isServiceRunningStatus(serviceInfo) {
    const status = serviceInfo && serviceInfo.status ? String(serviceInfo.status).toUpperCase() : '';
    return status === 'RUNNING';
  }

  static serviceInfoName(serviceInfo) {
    const rawName = serviceInfo && serviceInfo.config && serviceInfo.config.name
      ? serviceInfo.config.name
      : serviceInfo && serviceInfo.name
        ? serviceInfo.name
        : '';
    return CGI.collectorNameFromServiceName(rawName);
  }

  static restartServiceIfRunning(name, callback) {
    CGI.getServiceStatus(name, (err, serviceInfo) => {
      if (err) {
        if (CGI.isMissingServiceError(err)) {
          callback(null, false);
        } else {
          callback(err);
        }
        return;
      }
      if (!CGI.isServiceRunningStatus(serviceInfo)) {
        callback(null, false);
        return;
      }
      CGI.stopService(name, (stopErr) => {
        if (stopErr) {
          callback(stopErr);
          return;
        }
        CGI.startService(name, (startErr) => {
          if (startErr) {
            callback(startErr);
          } else {
            callback(null, true);
          }
        });
      });
    });
  }

  static stopServiceIfRunning(name, callback) {
    CGI.getServiceStatus(name, (err, serviceInfo) => {
      if (err) {
        if (CGI.isMissingServiceError(err)) {
          callback(null, false);
        } else {
          callback(err);
        }
        return;
      }
      if (!CGI.isServiceRunningStatus(serviceInfo)) {
        callback(null, false);
        return;
      }
      CGI.stopService(name, (stopErr) => {
        if (stopErr) {
          callback(stopErr);
        } else {
          callback(null, true);
        }
      });
    });
  }

  // ── 실행 상태 ──────────────────────────────────────────────────────────────

  static isRunning(name) {
    return fs.existsSync(path.join(RUN_DIR, `${name}.pid`));
  }
}

module.exports = CGI;
