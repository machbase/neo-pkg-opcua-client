'use strict';

const process = require('process');
const path = require('path');
const fs = require('fs');
const { CGI }= require('./src/cgi/cgi_util.js');
const ROOT = path.resolve(path.dirname(process.argv[1]));

const { init, getInstance } = require(path.join(ROOT, 'src', 'lib', 'logger.js'));
const Collector = require(path.join(ROOT, 'src', 'collector.js'));

const configName = process.argv[2];
if (!configName) {
  console.log(JSON.stringify({ level: 'ERROR', message: 'config name is required: neo-collector.js <config.json>' }));
  process.exit(1);
}

try {
  const config = CGI.getConfig(configName);
  const configName = path.basename(configName, '.json');
  init(config.log);
  const logger = getInstance();
  const pidFile = path.join(ROOT, `${configName}.pid`);
  fs.writeFileSync(pidFile, String(process.pid), 'utf-8');

  const collector = new Collector(config, { collectorName: configName });

  process.addShutdownHook(() => {
    logger.info('shutdown requested');
    try {
      fs.unlinkSync(pidFile);
    } catch (_) {}
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
