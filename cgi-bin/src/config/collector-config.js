'use strict';

const DEFAULT_COLLECTOR_CONFIG = {
  timePolicy: 'sourceTime',
  badStatusPolicy: 'skip',
  derivedTags: [],
  stringOnly: false,
  opcua: {
    interval: 1000,
    readRetryInterval: 100,
    nodes: [],
  },
  log: {
    level: 'info',
    maxFiles: 10,
  },
};

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function mergeCollectorConfig(...configs) {
  let merged = cloneJson(DEFAULT_COLLECTOR_CONFIG);

  for (const value of configs) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;

    const config = cloneJson(value);
    const opcua = config.opcua && typeof config.opcua === 'object' && !Array.isArray(config.opcua)
      ? config.opcua
      : {};
    const log = config.log && typeof config.log === 'object' && !Array.isArray(config.log)
      ? config.log
      : {};

    merged = {
      ...merged,
      ...config,
      opcua: {
        ...merged.opcua,
        ...opcua,
      },
      log: {
        ...merged.log,
        ...log,
      },
    };
  }

  return merged;
}

module.exports = {
  DEFAULT_COLLECTOR_CONFIG,
  mergeCollectorConfig,
};
