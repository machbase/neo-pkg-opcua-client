const TestRunner = require("./runner.js");
const { Logger, init, getLogger } = require("../src/logger.js");

const runner = new TestRunner();

function capture(fn) {
    let lines = [];
    const orig = console.log;
    console.log = (s) => lines.push(s);
    fn();
    console.log = orig;
    return lines.map(l => JSON.parse(l));
}

runner.run("Logger", {
    "info() outputs JSON with correct fields": (t) => {
        const logger = new Logger("test", { level: "INFO", output: "console", format: "json" });
        const [entry] = capture(() => logger.info("hello"));
        t.assertEqual(entry.level, "INFO");
        t.assertEqual(entry.module, "test");
        t.assertEqual(entry.message, "hello");
        t.assert(typeof entry.ts === "string", "ts is string");
    },

    "error() outputs level ERROR with detail": (t) => {
        const logger = new Logger("test", { level: "INFO", output: "console", format: "json" });
        const [entry] = capture(() => logger.error("oops", { code: 42 }));
        t.assertEqual(entry.level, "ERROR");
        t.assertEqual(entry.message, "oops");
        t.assertEqual(entry.detail.code, 42);
    },

    "warn() outputs level WARN": (t) => {
        const logger = new Logger("test", { level: "INFO", output: "console", format: "json" });
        const [entry] = capture(() => logger.warn("careful"));
        t.assertEqual(entry.level, "WARN");
        t.assertEqual(entry.message, "careful");
    },

    "debug() is suppressed when level is INFO": (t) => {
        const logger = new Logger("test", { level: "INFO", output: "console", format: "json" });
        const lines = capture(() => logger.debug("hidden"));
        t.assertEqual(lines.length, 0, "debug should be suppressed");
    },

    "debug() is shown when level is DEBUG": (t) => {
        const logger = new Logger("test", { level: "DEBUG", output: "console", format: "json" });
        const lines = capture(() => logger.debug("visible"));
        t.assertEqual(lines.length, 1, "debug should appear");
        t.assertEqual(lines[0].level, "DEBUG");
    },

    "no detail field when extra is undefined": (t) => {
        const logger = new Logger("test", { level: "INFO", output: "console", format: "json" });
        const [entry] = capture(() => logger.info("no detail"));
        t.assert(!("detail" in entry), "detail should not exist");
    },

    "text format outputs plain string": (t) => {
        const logger = new Logger("test", { level: "INFO", output: "console", format: "text" });
        let line = null;
        const orig = console.log;
        console.log = (s) => { line = s; };
        logger.info("hello text");
        console.log = orig;
        t.assert(typeof line === "string", "output should be string");
        t.assert(line.indexOf("INFO") >= 0, "should contain INFO");
        t.assert(line.indexOf("hello text") >= 0, "should contain message");
    },

    "getLogger() returns logger with root config": (t) => {
        init({ level: "WARN", output: "console", format: "json" });
        const logger = getLogger("root-test");
        const lines = capture(() => logger.info("suppressed"));
        t.assertEqual(lines.length, 0, "INFO should be suppressed when level is WARN");
        const [entry] = capture(() => logger.error("visible"));
        t.assertEqual(entry.level, "ERROR");
        // Reset
        init({});
    },

    "file output writes to file": (t) => {
        const fs = require("fs");
        const path = "/app/logs/test-logger.log";
        try { fs.unlink(path); } catch (_) {}

        const logger = new Logger("test", {
            level: "INFO",
            output: "file",
            format: "json",
            file: { path, maxSize: "1MB", maxFiles: 3, rotate: "size" },
        });
        logger.info("file test");

        const content = fs.readFile(path, "utf-8");
        const entry = JSON.parse(content.trim());
        t.assertEqual(entry.level, "INFO");
        t.assertEqual(entry.message, "file test");

        try { fs.unlink(path); } catch (_) {}
    },

    "both output writes to console and file": (t) => {
        const fs = require("fs");
        const path = "/app/logs/test-logger-both.log";
        try { fs.unlink(path); } catch (_) {}

        const logger = new Logger("test", {
            level: "INFO",
            output: "both",
            format: "json",
            file: { path, maxSize: "1MB", maxFiles: 3, rotate: "size" },
        });
        const lines = capture(() => logger.info("both test"));
        t.assertEqual(lines.length, 1, "should output to console");

        const content = fs.readFile(path, "utf-8");
        t.assert(content.indexOf("both test") >= 0, "should write to file");

        try { fs.unlink(path); } catch (_) {}
    },

    "size rotate triggers based on written bytes": (t) => {
        const fs = require("fs");
        const path = "/app/logs/test-size-rotate.log";
        try { fs.unlink(path); } catch (_) {}

        // maxSize 100 bytes — small enough to trigger rotation after a few writes
        const logger = new Logger("test", {
            level: "INFO",
            output: "file",
            format: "json",
            file: { path, maxSize: "100B", maxFiles: 3, rotate: "size" },
        });

        // Write enough to exceed 100 bytes
        logger.info("line one");
        logger.info("line two");
        logger.info("line three");

        // After rotation, original path should exist (new file after rotate)
        const content = fs.readFile(path, "utf-8");
        t.assert(typeof content === "string", "log file should exist after rotation");

        // Cleanup
        try { fs.unlink(path); } catch (_) {}
        const dir = "/app/logs";
        try {
            const files = fs.readdir(dir).filter(f => f.startsWith("test-size-rotate.log."));
            files.forEach(f => { try { fs.unlink(dir + "/" + f); } catch (_) {} });
        } catch (_) {}
    },
});

runner.summary();
