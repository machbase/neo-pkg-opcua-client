'use strict';

const fs = require('fs');
const path = require('path');
const process = require('process');

const _cgiBinIdx = process.argv[1].lastIndexOf('/cgi-bin/');
const _appDir = _cgiBinIdx >= 0 ? process.argv[1].slice(0, _cgiBinIdx) : null;
const LOG_DIR = path.join(_appDir, 'logs');
const PKG_NAME = _appDir ? path.basename(_appDir) : 'neo-pkg-opcua-client';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const LEVELS = {
  trace: -1,
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};
const LEVEL_LABEL = {
  trace: 'TRACE',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

/**
 * Logger — 크기 기반 로테이션, file 출력
 *
 * 출력 디렉토리: $HOME/public/logs/{pkg}  (pkg = process.argv[1] 기반 패키지 디렉토리명)
 * 파일명: repli.log  (현재 활성 파일)
 * 로테이션: repli.log 가 MAX_FILE_SIZE 초과 시 repli_20260415_034234.log 로 rename
 * 파일당 최대 크기: 10 MB
 *
 * 포맷: [LEVEL] YYYY-MM-DD HH:MM:SS.sss TZ  stage  message  (key=value ...)
 *
 * 설정 (config.log):
 *   disable  : boolean                                 (기본 false, true이면 모든 출력 비활성화)
 *   level    : "trace"|"debug"|"info"|"warn"|"error"  (기본 "info")
 *   maxFiles : number                                  (기본 10, 최대 rotate 파일 개수)
 */
class Logger {
  constructor(loggingConfig = {}, options = {}) {
    this._disabled = loggingConfig.disable === true;
    const levelVal = LEVELS[loggingConfig.level];
    this._minLevel = (levelVal !== undefined && levelVal !== null) ? levelVal : LEVELS.info;
    this._maxFiles = (loggingConfig.maxFiles > 0 ? loggingConfig.maxFiles : 10);
    this._name = options.name || PKG_NAME;
    this._fileDir = LOG_DIR;

    this._filePath = null;
    this._fileSize = 0;

    if (!this._disabled) {
      try {
        fs.mkdirSync(this._fileDir, { recursive: true });
      } catch (_) {}
    }
  }

  trace(stage, fields) { this._write('trace', stage, fields); }
  debug(stage, fields) { this._write('debug', stage, fields); }
  info(stage, fields)  { this._write('info',  stage, fields); }
  warn(stage, fields)  { this._write('warn',  stage, fields); }
  error(stage, fields) { this._write('error', stage, fields); }

  banner(msg) {
    if (this._disabled) {
      return;
    }
    const ts = _formatLocalTimestamp(new Date());
    const line = '-'.repeat(72);
    const text = `${line}\n  ${ts}  ${msg}\n${line}`;
    this._appendToFile(text + '\n');
  }

  close() {}

  _write(level, stage, fields = {}) {
    if (this._disabled) {
      return;
    }
    if (LEVELS[level] < this._minLevel) {
      return;
    }
    this._appendToFile(this._format(level, stage, fields) + '\n');
  }

  _format(level, stage, fields) {
    const ts = _formatLocalTimestamp(new Date());
    const label = LEVEL_LABEL[level] || level.toUpperCase();

    const msg = fields && fields.msg !== undefined ? String(fields.msg) : '';
    const kvParts = [];
    if (fields) {
      const keys = Object.keys(fields);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (k === 'msg') continue;
        const v = fields[k];
        if (v === undefined || v === null) continue;
        kvParts.push(k + '=' + _quoteIfNeeded(String(v)));
      }
    }

    const kv = kvParts.length > 0 ? '  (' + kvParts.join(' ') + ')' : '';
    return '[' + label + '] ' + ts + '  ' + stage + '  ' + msg + kv;
  }

  // 활성 로그 파일 경로: 항상 ${name}.log
  _activeFilePath() {
    return path.join(this._fileDir, `${this._name}.log`);
  }

  _ensurePath() {
    if (this._filePath) {
      return;
    }
    this._filePath = this._activeFilePath();
    try {
      this._fileSize = fs.statSync(this._filePath).size;
    } catch (_) {
      this._fileSize = 0;
    }
  }

  // 현재 파일을 datetime 접미사로 rename 후 오래된 rotate 파일 정리
  _rotate() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const rotated = path.join(this._fileDir, `${this._name}_${ts}.log`);
    try {
      fs.renameSync(this._filePath, rotated);
    } catch (_) {}
    this._fileSize = 0;
    this._purgeOldFiles();
  }

  // rotate된 파일이 maxFiles 초과 시 가장 오래된 것부터 삭제
  _purgeOldFiles() {
    try {
      const prefix = `${this._name}_`;
      const files = fs.readdirSync(this._fileDir)
        .filter(f => f !== `${this._name}.log` && f.startsWith(prefix) && f.endsWith('.log'))
        .sort();
      while (files.length >= this._maxFiles) {
        const oldest = files.shift();
        try { fs.unlinkSync(path.join(this._fileDir, oldest)); } catch (_) {}
      }
    } catch (_) {}
  }

  _appendToFile(text) {
    this._ensurePath();
    if (!this._filePath) {
      return;
    }

    // 파일 크기 초과 시 현재 파일을 datetime으로 rename 후 새 파일에 이어씀
    if (this._fileSize + text.length > MAX_FILE_SIZE) {
      this._rotate();
    }

    try {
      fs.appendFileSync(this._filePath, text);
      this._fileSize += text.length;
    } catch (err) {
      this._filePath = null;
    }
  }
}

function _quoteIfNeeded(str) {
  return /[ ="]/.test(str) ? `"${str.replace(/"/g, '\\"')}"` : str;
}

function _formatLocalTimestamp(date) {
  return [
    date.getFullYear(),
    '-',
    _pad2(date.getMonth() + 1),
    '-',
    _pad2(date.getDate()),
    ' ',
    _pad2(date.getHours()),
    ':',
    _pad2(date.getMinutes()),
    ':',
    _pad2(date.getSeconds()),
    '.',
    String(date.getMilliseconds()).padStart(3, '0'),
    ' ',
    _formatLocalTimezone(date),
  ].join('');
}

function _formatLocalTimezone(date) {
  const match = String(date).match(/\(([^)]+)\)$/);
  if (!match || !match[1]) {
    return 'LOC';
  }
  const label = match[1].trim();
  if (/^[A-Z]{3}$/.test(label)) {
    return label;
  }
  return label
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 3) || 'LOC';
}

function _pad2(value) {
  return String(value).padStart(2, '0');
}

let _instance = new Logger();

function init(loggingConfig, options) {
  _instance.close();
  _instance = new Logger(loggingConfig, options);
}

function getInstance() {
  return _instance;
}

module.exports = { Logger, init, getInstance, LOG_DIR };
