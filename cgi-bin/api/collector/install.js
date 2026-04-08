/**
 * POST /cgi-bin/api/collector/install?name=xxx  -- collector service 설치
 */

const path = require('path');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const CGI = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));

const { name } = CGI.parseQuery();

function errorMessage(err) {
  return err && err.message ? err.message : String(err);
}

function installedServiceMap(serviceInfos) {
  const result = {};
  (serviceInfos || []).forEach((serviceInfo) => {
    const collectorName = CGI.serviceInfoName(serviceInfo);
    if (collectorName) {
      result[collectorName] = true;
    }
  });
  return result;
}

function installCollector(name) {
  CGI.installService(name, (err) => {
    if (err) {
      CGI.reply({ ok: false, reason: errorMessage(err) });
    } else {
      CGI.reply({ ok: true, data: { name } });
    }
  });
}

function POST() {
  if (!name) return CGI.reply({ ok: false, reason: 'name is required' });
  if (!CGI.readConfig(name)) return CGI.reply({ ok: false, reason: `collector '${name}' not found` });

  CGI.listServices((err, serviceInfos) => {
    if (!err) {
      const servicesByName = installedServiceMap(serviceInfos);
      if (servicesByName[name]) {
        CGI.reply({ ok: false, reason: `collector '${name}' service already installed` });
        return;
      }
      installCollector(name);
      return;
    }

    if (CGI.hasInstalledService(name)) {
      CGI.reply({ ok: false, reason: `collector '${name}' service already installed` });
      return;
    }

    installCollector(name);
  });
}

const handlers = { POST };
const method = (process.env.get('REQUEST_METHOD') || 'GET').toUpperCase();
try {
  (handlers[method] || (() => CGI.reply({ ok: false, reason: 'method not allowed' })))();
} catch (err) {
  CGI.reply({ ok: false, reason: errorMessage(err) });
}
