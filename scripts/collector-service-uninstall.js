'use strict';

const path = require('path');
const process = require('process');
const SCRIPT_DIR = (() => {
  const cwd = process.cwd && process.cwd ? process.cwd() : '.';
  const scriptPath = process.argv && process.argv[1] ? String(process.argv[1]) : '';
  if (scriptPath) {
    return path.dirname(path.isAbsolute(scriptPath) ? scriptPath : path.join(cwd, scriptPath));
  }
  return path.join(cwd, 'scripts');
})();
const common = require(path.join(SCRIPT_DIR, 'collector-service-common.js'));

async function main() {
  const discovery = await common.discoverCollectorServices();
  for (let i = 0; i < discovery.warnings.length; i++) {
    common.printWarn(discovery.warnings[i]);
  }

  const names = discovery.services.map((entry) => entry.name);
  common.printInfo(`collector service candidates: ${common.formatNames(names)}`);

  const stopRun = await common.runSequential(names, common.stopServiceIfRunning);
  const stopErrorsByName = {};
  for (let i = 0; i < stopRun.errors.length; i++) {
    stopErrorsByName[stopRun.errors[i].name] = true;
  }

  const stopped = stopRun.results.filter((item) => item.action === 'stopped').map((item) => item.name);
  const alreadyStopped = stopRun.results.filter((item) => item.action === 'skip' && item.reason === 'not_running').map((item) => item.name);
  const missingOnStop = stopRun.results.filter((item) => item.action === 'skip' && item.reason === 'missing').map((item) => item.name);

  common.printInfo(`stopped before uninstall: ${common.formatNames(stopped)}`);
  if (alreadyStopped.length > 0) {
    common.printInfo(`already stopped before uninstall: ${common.formatNames(alreadyStopped)}`);
  }
  if (missingOnStop.length > 0) {
    common.printWarn(`missing during stop phase: ${common.formatNames(missingOnStop)}`);
  }

  const uninstallTargets = [];
  for (let i = 0; i < names.length; i++) {
    if (!stopErrorsByName[names[i]]) uninstallTargets.push(names[i]);
  }

  const uninstallRun = await common.runSequential(uninstallTargets, common.uninstallService);
  const uninstalled = uninstallRun.results.filter((item) => item.action === 'uninstalled').map((item) => item.name);
  const missingOnUninstall = uninstallRun.results.filter((item) => item.action === 'skip' && item.reason === 'missing').map((item) => item.name);

  common.clearStoppedState();

  common.printInfo(`uninstalled services: ${common.formatNames(uninstalled)}`);
  if (missingOnUninstall.length > 0) {
    common.printWarn(`missing during uninstall phase: ${common.formatNames(missingOnUninstall)}`);
  }

  if (stopRun.errors.length > 0 || uninstallRun.errors.length > 0) {
    for (let i = 0; i < stopRun.errors.length; i++) {
      const item = stopRun.errors[i];
      common.printError(`stop ${item.name}: ${item.error.message}`);
    }
    for (let i = 0; i < uninstallRun.errors.length; i++) {
      const item = uninstallRun.errors[i];
      common.printError(`uninstall ${item.name}: ${item.error.message}`);
    }
    process.exit(1);
    return;
  }

  common.printInfo('uninstall completed');
}

const keepAlive = setInterval(() => {}, 1000);

main().then(() => {
  clearInterval(keepAlive);
  process.exit(0);
}).catch((err) => {
  clearInterval(keepAlive);
  common.printError(err && err.message ? err.message : String(err));
  process.exit(1);
});
