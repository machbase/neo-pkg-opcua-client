'use strict';

const fs = require('fs');
const path = require('path');
const process = require('process');

function println() {
  const args = Array.prototype.slice.call(arguments);
  if (console.println) {
    console.println.apply(console, args);
  } else {
    console.log.apply(console, args);
  }
}

function resolvePackageRoot() {
  const cwd = process.cwd && process.cwd() ? process.cwd() : '.';
  const scriptPath = process.argv && process.argv[1] ? String(process.argv[1]) : '';
  if (!scriptPath) return cwd;
  const absoluteScriptPath = path.isAbsolute(scriptPath) ? scriptPath : path.join(cwd, scriptPath);
  return path.dirname(path.dirname(absoluteScriptPath));
}

const PKG_DIR = resolvePackageRoot();
const SCRIPT_DIR = path.join(PKG_DIR, 'scripts');
const SERVERS_DIR = path.join(PKG_DIR, 'cgi-bin', 'conf.d', 'servers');
const DEFAULT_SOURCE = path.join(SCRIPT_DIR, 'localhost.json.default');
const DEFAULT_TARGET = path.join(SERVERS_DIR, 'localhost.json');

fs.mkdirSync(SERVERS_DIR, { recursive: true });

if (fs.existsSync(DEFAULT_TARGET)) {
  println('default DB server already exists:', DEFAULT_TARGET);
  process.exit(0);
}

if (!fs.existsSync(DEFAULT_SOURCE)) {
  println('ERROR: default DB server template missing:', DEFAULT_SOURCE);
  process.exit(1);
}

fs.copyFileSync(DEFAULT_SOURCE, DEFAULT_TARGET);
println('default DB server created:', DEFAULT_TARGET);
