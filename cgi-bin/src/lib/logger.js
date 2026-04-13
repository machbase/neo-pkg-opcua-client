'use strict';

const fs = require('fs');
const path = require('path');
const process = require('process');

const HOME = process.env.get('HOME');
const LOG_DIR = path.join(HOME, 'public', 'logs');

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
 * 출력 디렉토리: $HOME/public/logs  (고정)
 * 파일명: repli.log, repli_0001.log, repli_0002.log, ...
 * 파일당 최대 크기: 10 MB
 *
 * 포맷: [LEVEL] YYYY-MM-DD HH:MM:SS.sss  stage  message  (key=value ...)
 *
 * 설정 (config.logging):
 *   disable  : boolean                                 (기본 false, true이면 모든 출력 비활성화)
 *   level    : "trace"|"debug"|"info"|"warn"|"error"  (기본 "info")
 *   maxFiles : number                                  (기본 10, 최대 파일 개수)
 */
class Logger {
  constructor(loggingConfig = {}) {
    this._disabled = loggingConfig.disable === true;
    this._minLevel = LEVELS[loggingConfig.level] ?? LEVELS.info;
    this._maxFiles = (loggingConfig.maxFiles > 0 ? loggingConfig.maxFiles : 10);
    this._fileDir = LOG_DIR;

    this._filePath = null;
    this._fileIndex = 0;
    this._fileSize = 0;

    if (!this._disabled) {
      try {
        fs.mkdirSync(this._fileDir, { recursive: true });
      } catch (err) {
        console.error(`[Logger] failed to create log directory: ${err.message}`);
      }
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
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 23);
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
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 23);
    const label = LEVEL_LABEL[level] || level.toUpperCase();

    const { msg, ...rest } = fields;
    const kvParts = Object.entries(rest)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${_quoteIfNeeded(String(v))}`);

    const msgStr = msg !== undefined ? String(msg) : '';
    const kv = kvParts.length > 0 ? `  (${kvParts.join(' ')})` : '';
    return `[${label}] ${ts}  ${stage}  ${msgStr}${kv}`;
  }

  // index 0: repli.log, index 1+: repli_0001.log, repli_0002.log, ...
  _resolveFilePath(index) {
    const suffix = index === 0 ? '' : `_${String(index).padStart(4, '0')}`;
    return path.join(this._fileDir, `repli${suffix}.log`);
  }

  _ensurePath() {
    if (this._filePath) {
      return;
    }

    try {
      // 10 MB 미만인 첫 번째 파일을 찾아 이어씀
      while (this._fileIndex < this._maxFiles) {
        const candidate = this._resolveFilePath(this._fileIndex);
        let size = 0;
        try {
          size = fs.statSync(candidate).size;
        } catch (_) {}
        if (size < MAX_FILE_SIZE) {
          this._filePath = candidate;
          this._fileSize = size;
          break;
        }
        this._fileIndex++;
      }
    } catch (err) {
      console.error(`[Logger] failed to open log file: ${err.message}`);
    }
  }

  _appendToFile(text) {
    this._ensurePath();
    if (!this._filePath) {
      return;
    }

    // 파일 크기 초과 시 다음 인덱스 파일로 전환
    if (this._fileSize + text.length > MAX_FILE_SIZE) {
      if (this._fileIndex + 1 >= this._maxFiles) {
        return; // 최대 파일 개수 도달, 쓰기 중단
      }
      this._fileIndex++;
      this._filePath = this._resolveFilePath(this._fileIndex);
      this._fileSize = 0;
    }

    try {
      fs.appendFileSync(this._filePath, text, 'utf8');
      this._fileSize += text.length;
    } catch (err) {
      this._filePath = null;
      console.error(`[Logger] failed to write log file: ${err.message}`);
    }
  }
}

function _quoteIfNeeded(str) {
  return /[ ="]/.test(str) ? `"${str.replace(/"/g, '\\"')}"` : str;
}

let _instance = new Logger();

function init(loggingConfig) {
  _instance.close();
  _instance = new Logger(loggingConfig);
}

function getInstance() {
  return _instance;
}

module.exports = { Logger, init, getInstance };
