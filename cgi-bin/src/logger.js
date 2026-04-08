const fs = require("fs");
const path = require("path");

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const DEFAULT_LOG_FILE_NAME = "opcua.log";

// Parse size string like "10MB", "1GB", "500KB" to bytes
function parseSize(str) {
    const units = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
    const m = String(str).toUpperCase().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/);
    if (!m) throw new Error("Invalid size: " + str);
    return Math.floor(parseFloat(m[1]) * (units[m[2] || "B"] || 1));
}

function dateTag(date) {
    const d = date || new Date();
    return d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" +
        String(d.getDate()).padStart(2, "0");
}

function getAppRoot() {
    const scriptPath = process.argv[1] || "";
    const marker = `${path.sep}cgi-bin${path.sep}`;
    const idx = scriptPath.lastIndexOf(marker);
    if (idx >= 0) {
        return scriptPath.slice(0, idx);
    }
    return process.cwd ? process.cwd() : ".";
}

function resolveLogFilePath(filePath) {
    if (typeof filePath !== "string" || filePath.indexOf("${CWD}") < 0) {
        return filePath;
    }
    return path.normalize(filePath.split("${CWD}").join(getAppRoot()));
}

function looksLikeLegacyFilePath(filePath) {
    if (typeof filePath !== "string" || filePath.length === 0) {
        return false;
    }
    const base = path.basename(filePath);
    return base.indexOf(".") >= 0;
}

function resolveLogOutputPath(filePath, defaultFileName) {
    const resolved = resolveLogFilePath(filePath);
    if (typeof resolved !== "string" || resolved.length === 0) {
        return resolved;
    }
    if (looksLikeLegacyFilePath(resolved)) {
        return resolved;
    }
    return path.join(resolved, defaultFileName || DEFAULT_LOG_FILE_NAME);
}

function normalizeLoggerConfig(config, options) {
    if (!config || typeof config !== "object") {
        return {};
    }

    const opts = options || {};
    const normalized = { ...config };
    if (config.file && typeof config.file === "object") {
        normalized.file = { ...config.file };
        normalized.file.path = resolveLogOutputPath(config.file.path, opts.defaultFileName);
    }
    return normalized;
}

class LogRotator {
    constructor(filePath, maxSize, maxFiles, rotate) {
        this.filePath = filePath;
        this.maxSize = parseSize(maxSize || "10MB");
        this.maxFiles = maxFiles || 7;
        this.rotate = rotate || "size"; // "size" | "daily"
        this._currentDate = dateTag();
        this._writtenBytes = 0;

        // Ensure log directory exists
        const dir = this._dirname(filePath);
        if (dir && !fs.exists(dir)) {
            fs.mkdir(dir, { recursive: true });
        }
    }

    _dirname(p) {
        const idx = p.lastIndexOf("/");
        return idx > 0 ? p.slice(0, idx) : "";
    }

    _basename(p) {
        return p.slice(p.lastIndexOf("/") + 1);
    }

    _splitBaseName() {
        const base = this._basename(this.filePath);
        const idx = base.lastIndexOf(".");
        if (idx > 0) {
            return {
                stem: base.slice(0, idx),
                ext: base.slice(idx),
            };
        }
        return {
            stem: base,
            ext: "",
        };
    }

    _needsRotate() {
        if (this.rotate === "daily") {
            return dateTag() !== this._currentDate;
        }
        // size-based: use accumulated byte count to avoid fs.stat() on every write
        return this._writtenBytes >= this.maxSize;
    }

    _rotateSuffix() {
        if (this.rotate === "daily") return "." + this._currentDate;
        return "." + new Date().toISOString().replace(/[:.]/g, "-");
    }

    _rotatedFilePath() {
        const dir = this._dirname(this.filePath);
        const parts = this._splitBaseName();
        const rotated = parts.stem + this._rotateSuffix() + parts.ext;
        return dir ? dir + "/" + rotated : rotated;
    }

    _purgeOldFiles() {
        const dir = this._dirname(this.filePath) || ".";
        const base = this._basename(this.filePath);
        const parts = this._splitBaseName();
        try {
            const files = fs.readdir(dir)
                .filter(f => {
                    if (f === "." || f === ".." || f === base) return false;
                    if (!f.startsWith(parts.stem + ".")) return false;
                    if (parts.ext && !f.endsWith(parts.ext)) return false;
                    return true;
                })
                .sort();
            while (files.length >= this.maxFiles) {
                const oldest = files.shift();
                try { fs.unlink(dir + "/" + oldest); } catch (_) {}
            }
        } catch (_) {}
    }

    rotate_() {
        try { fs.rename(this.filePath, this._rotatedFilePath()); } catch (_) {}
        this._purgeOldFiles();
        this._currentDate = dateTag();
    }

    write(line) {
        if (this._needsRotate()) {
            this.rotate_();
            this._writtenBytes = 0;
        }
        const data = line + "\n";
        fs.appendFile(this.filePath, data);
        this._writtenBytes += data.length;
    }
}

class Logger {
    constructor(name, config) {
        this.name = name;
        this._config = config || {};
        this._rotator = null;
    }

    _format_(level, message, extra) {
        const fmt = this._config.format || "json";
        if (fmt === "text") {
            const ts = new Date().toISOString();
            const detail = extra !== undefined ? " " + JSON.stringify(extra) : "";
            return ts + " [" + level + "] [" + this.name + "] " + message + detail;
        }
        const entry = {
            ts: new Date().toISOString(),
            level,
            module: this.name,
            message,
        };
        if (extra !== undefined) entry.detail = extra;
        return JSON.stringify(entry);
    }

    _print(level, message, extra) {
        const minLevel = LEVELS[String(this._config.level || "INFO").toUpperCase()];
        if (LEVELS[level] < (minLevel !== undefined ? minLevel : LEVELS.INFO)) return;

        const line = this._format_(level, message, extra);
        const output = this._config.output || "console";

        if (output === "console" || output === "both") {
            console.log(line);
        }
        if (output === "file" || output === "both") {
            if (!this._rotator && this._config.file) {
                const f = this._config.file;
                this._rotator = new LogRotator(f.path, f.maxSize, f.maxFiles, f.rotate);
            }
            if (this._rotator) {
                try { this._rotator.write(line); } catch (_) {}
            }
        }
    }

    debug(message, extra) { this._print("DEBUG", message, extra); }
    info(message, extra)  { this._print("INFO",  message, extra); }
    warn(message, extra)  { this._print("WARN",  message, extra); }
    error(message, extra) { this._print("ERROR", message, extra); }

    // Create a child logger with the same config but different module name
    child(name) {
        return new Logger(name, this._config);
    }
}

// 동일 객체를 in-place로 갱신하여 기존 Logger 인스턴스에도 즉시 반영
const _rootConfig = {};

function init(config, options) {
    const cfg = normalizeLoggerConfig(config, options);
    Object.keys(_rootConfig).forEach(k => delete _rootConfig[k]);
    Object.assign(_rootConfig, cfg);
}

function getLogger(name) {
    return new Logger(name, _rootConfig);
}

module.exports = { Logger, init, getLogger };
