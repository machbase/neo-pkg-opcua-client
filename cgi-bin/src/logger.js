const fs = require("fs");

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

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

    _purgeOldFiles() {
        const dir = this._dirname(this.filePath) || ".";
        const base = this._basename(this.filePath);
        try {
            const files = fs.readdir(dir)
                .filter(f => f !== base && f.startsWith(base + "."))
                .sort();
            while (files.length >= this.maxFiles) {
                const oldest = files.shift();
                try { fs.unlink(dir + "/" + oldest); } catch (_) {}
            }
        } catch (_) {}
    }

    rotate_() {
        const suffix = this._rotateSuffix();
        try { fs.rename(this.filePath, this.filePath + suffix); } catch (_) {}
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
        const lvl = LEVELS[String(this._config.level || "INFO").toUpperCase()];
        this._minLevel = lvl !== undefined ? lvl : LEVELS.INFO;
        this._output = this._config.output || "console"; // "console" | "file" | "both"
        this._format = this._config.format || "json";    // "json" | "text"
        this._rotator = null;

        if ((this._output === "file" || this._output === "both") && this._config.file) {
            const f = this._config.file;
            this._rotator = new LogRotator(f.path, f.maxSize, f.maxFiles, f.rotate);
        }
    }

    _format_(level, message, extra) {
        if (this._format === "text") {
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
        if (LEVELS[level] < this._minLevel) return;

        const line = this._format_(level, message, extra);

        if (this._output === "console" || this._output === "both") {
            console.log(line);
        }
        if ((this._output === "file" || this._output === "both") && this._rotator) {
            try { this._rotator.write(line); } catch (_) {}
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

// Singleton root logger — replaced by init()
let _rootConfig = {};

function init(config) {
    _rootConfig = config || {};
}

function getLogger(name) {
    return new Logger(name, _rootConfig);
}

module.exports = { Logger, init, getLogger };
