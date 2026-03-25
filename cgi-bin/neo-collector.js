'use strict';

const process = require('process');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(path.dirname(process.argv[1]));

const { init, getLogger } = require(path.join(ROOT, 'src', 'logger.js'));
const Collector = require(path.join(ROOT, 'src', 'collector.js'));

const configPath = process.argv[2];
if (!configPath) {
  console.log(JSON.stringify({ level: 'ERROR', message: 'config path is required: neo-collector.js <config.json>' }));
  process.exit(1);
}

try {
  const config = JSON.parse(fs.readFile(configPath, 'utf-8'));
  init(config.log);
  const logger = getLogger('app');

  const collector = new Collector(config);

  process.addShutdownHook(() => {
    logger.info('shutdown requested');
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
