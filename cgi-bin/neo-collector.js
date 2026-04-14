'use strict';

const process = require('process');
const path = require('path');
const { CGI } = require('./src/cgi/cgi_util.js');
const ROOT = path.resolve(path.dirname(process.argv[1]));

const { init, getInstance } = require(path.join(ROOT, 'src', 'lib', 'logger.js'));
const Collector = require(path.join(ROOT, 'src', 'collector.js'));

const arg = process.argv[2];
if (!arg) {
  console.println(JSON.stringify({ level: 'ERROR', message: 'config name is required: neo-collector.js <name>' }));
  process.exit(1);
}

const configName = path.basename(arg, '.json');

try {
  const config = CGI.getConfig(configName);
  if (!config) {
    console.println(JSON.stringify({ level: 'ERROR', message: 'config not found: ' + configName }));
    process.exit(1);
  }

  init(config.log, { name: configName });
  const logger = getInstance();

  const collector = new Collector(config, { collectorName: configName });

  process.addShutdownHook(() => {
    logger.info('shutdown requested');
    collector.close();
  });

  logger.info('starting', { name: configName });

  function startWithRetry() {
    try {
      collector.start();
    } catch (e) {
      logger.warn('start failed, retrying', { error: e.message });
      setTimeout(startWithRetry, 5000);
    }
  }

  startWithRetry();
} catch (err) {
  console.println(JSON.stringify({ level: 'ERROR', message: err && err.message ? err.message : String(err) }));
  process.exit(1);
}
