/**
 * GET /cgi-bin/api/collector/list  -- 목록 조회
 */

const path = require('path');
const process = require('process');
const _argv = process.argv[1];
const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
const CGI = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));

function errorMessage(err) {
  return err && err.message ? err.message : String(err);
}

function uniqueNames() {
  const names = CGI.listConfigs();
  const result = [];
  const seen = {};
  names.forEach((name) => {
    if (!name || seen[name]) return;
    seen[name] = true;
    result.push(name);
  });
  return result.sort();
}

function serviceInfoMap(serviceInfos) {
  const result = {};
  (serviceInfos || []).forEach((serviceInfo) => {
    const name = CGI.serviceInfoName(serviceInfo);
    if (name) {
      result[name] = serviceInfo;
    }
  });
  return result;
}

function replyStatuses(names, index, data, servicesByName, hasServiceSnapshot) {
  if (index >= names.length) {
    CGI.reply({ ok: true, data });
    return;
  }

  const name = names[index];
  const listedService = servicesByName[name];
  if (listedService) {
    data.push({
      name,
      installed: true,
      running: CGI.isServiceRunningStatus(listedService),
    });
    replyStatuses(names, index + 1, data, servicesByName, hasServiceSnapshot);
    return;
  }

  if (hasServiceSnapshot) {
    data.push({
      name,
      installed: false,
      running: CGI.isRunning(name),
    });
    replyStatuses(names, index + 1, data, servicesByName, hasServiceSnapshot);
    return;
  }

  const installed = CGI.hasInstalledService(name);
  CGI.getServiceStatus(name, (err, serviceInfo) => {
    if (err) {
      if (!installed) {
        data.push({
          name,
          installed: false,
          running: CGI.isRunning(name),
        });
        replyStatuses(names, index + 1, data, servicesByName, hasServiceSnapshot);
        return;
      }

      data.push({
        name,
        installed: true,
        running: CGI.isRunning(name),
      });
      replyStatuses(names, index + 1, data, servicesByName, hasServiceSnapshot);
      return;
    }

    data.push({
      name,
      installed: true,
      running: CGI.isServiceRunningStatus(serviceInfo),
    });
    replyStatuses(names, index + 1, data, servicesByName, hasServiceSnapshot);
  });
}

function GET() {
  CGI.listServices((err, serviceInfos) => {
    if (err) {
      replyStatuses(uniqueNames(), 0, [], {}, false);
      return;
    }
    replyStatuses(uniqueNames(), 0, [], serviceInfoMap(serviceInfos), true);
  });
}

const handlers = { GET };
const method = (process.env.get('REQUEST_METHOD') || 'GET').toUpperCase();
try {
  (handlers[method] || (() => CGI.reply({ ok: false, reason: 'method not allowed' })))();
} catch (err) {
  CGI.reply({ ok: false, reason: errorMessage(err) });
}
