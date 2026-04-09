'use strict';

const process = require('process');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(path.dirname(process.argv[1]));

const { init, getInstance } = require(path.join(ROOT, 'src', 'lib', 'logger.js'));
const Collector = require(path.join(ROOT, 'src', 'collector.js'));

const configPath = process.argv[2];
if (!configPath) {
  console.log(JSON.stringify({ level: 'ERROR', message: 'config path is required: neo-collector.js <config.json>' }));
  process.exit(1);
}

try {
  const config = JSON.parse(fs.readFile(configPath, 'utf-8'));
  const configName = path.basename(configPath, '.json');
  init(config.log);
  const logger = getInstance();
  const pidFile = path.join(ROOT, 'run', `${configName}.pid`);
  fs.mkdirSync(path.dirname(pidFile), { recursive: true });
  fs.writeFileSync(pidFile, String(process.pid), 'utf-8');

  const collector = new Collector(config, { collectorName: configName });

  process.addShutdownHook(() => {
    logger.info('shutdown requested');
    try { fs.unlinkSync(pidFile); } catch (_) {}
    collector.close();
  });

  function startWithRetry() {
    try {
      collector.start();
    } catch (e) {
      logger.error('failed to start collector, retrying...', { error: e.message });
      setTimeout(startWithRetry, 5000);
    }
  }

  startWithRetry();
} catch (err) {
  console.log(JSON.stringify({ level: 'ERROR', message: err.message }));
  process.exit(1);
}
