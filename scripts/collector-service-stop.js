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

  const run = await common.runSequential(names, common.stopServiceIfRunning);
  const stopped = run.results.filter((item) => item.action === 'stopped').map((item) => item.name);
  const alreadyStopped = run.results.filter((item) => item.action === 'skip' && item.reason === 'not_running').map((item) => item.name);
  const missing = run.results.filter((item) => item.action === 'skip' && item.reason === 'missing').map((item) => item.name);

  common.saveStoppedState(stopped);

  common.printInfo(`stopped services: ${common.formatNames(stopped)}`);
  if (alreadyStopped.length > 0) {
    common.printInfo(`already stopped services: ${common.formatNames(alreadyStopped)}`);
  }
  if (missing.length > 0) {
    common.printWarn(`missing services skipped: ${common.formatNames(missing)}`);
  }

  if (run.errors.length > 0) {
    for (let i = 0; i < run.errors.length; i++) {
      const item = run.errors[i];
      common.printError(`${item.name}: ${item.error.message}`);
    }
    process.exit(1);
    return;
  }

  common.printInfo('stop completed');
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
