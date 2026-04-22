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
  const state = common.loadStoppedState();
  let names = [];

  if (state) {
    names = state.serviceNames.slice();
    common.printInfo(`using stop-state from ${Math.floor(state.ageMs / 1000)}s ago`);
  } else {
    const discovery = await common.discoverCollectorServices();
    for (let i = 0; i < discovery.warnings.length; i++) {
      common.printWarn(discovery.warnings[i]);
    }
    names = discovery.services.map((entry) => entry.name);
    common.printInfo('no valid stop-state found, starting all installed collector services');
  }

  common.printInfo(`start targets: ${common.formatNames(names)}`);

  if (names.length === 0) {
    common.printInfo('nothing to start');
    return;
  }

  const run = await common.runSequential(names, common.startServiceIfNeeded);
  const started = run.results.filter((item) => item.action === 'started').map((item) => item.name);
  const alreadyRunning = run.results.filter((item) => item.action === 'skip' && item.reason === 'already_running').map((item) => item.name);

  common.printInfo(`started services: ${common.formatNames(started)}`);
  if (alreadyRunning.length > 0) {
    common.printInfo(`already running services: ${common.formatNames(alreadyRunning)}`);
  }

  if (run.errors.length > 0) {
    for (let i = 0; i < run.errors.length; i++) {
      const item = run.errors[i];
      common.printError(`${item.name}: ${item.error.message}`);
    }
    process.exit(1);
    return;
  }

  common.printInfo('start completed');
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
