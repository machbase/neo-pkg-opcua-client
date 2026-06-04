'use strict';

const PREFIX = 'jsh-obf-v1:';
const KEY = 'neo-pkg-opcua-client';

function _padHex(value) {
  let hex = value.toString(16);
  while (hex.length < 4) hex = '0' + hex;
  return hex;
}

function _xorCode(code, index) {
  return code ^ KEY.charCodeAt(index % KEY.length);
}

function obfuscateSecret(value) {
  const text = value == null ? '' : String(value);
  let out = '';
  for (let i = 0; i < text.length; i++) {
    out += _padHex(_xorCode(text.charCodeAt(i), i));
  }
  return PREFIX + out;
}

function revealSecret(value) {
  const text = value == null ? '' : String(value);
  if (text.indexOf(PREFIX) !== 0) return text;
  const body = text.slice(PREFIX.length);
  if (body.length % 4 !== 0) return text;
  let out = '';
  for (let i = 0; i < body.length; i += 4) {
    const code = parseInt(body.slice(i, i + 4), 16);
    if (!Number.isFinite(code)) return text;
    out += String.fromCharCode(_xorCode(code, i / 4));
  }
  return out;
}

function protectServerConfig(config) {
  const next = { ...(config || {}) };
  if (next.password !== undefined && next.password !== null && next.password !== '') {
    next.password = obfuscateSecret(next.password);
  }
  return next;
}

function revealServerConfig(config) {
  if (!config) return config;
  const next = { ...config };
  if (next.password !== undefined && next.password !== null && next.password !== '') {
    next.password = revealSecret(next.password);
  }
  return next;
}

module.exports = {
  obfuscateSecret,
  revealSecret,
  protectServerConfig,
  revealServerConfig,
};
