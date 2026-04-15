'use strict';

const TestRunner = require("./runner.js");
const { Logger, init, getInstance } = require("../src/lib/logger.js");

const runner = new TestRunner();

runner.run("Logger", {
    "_format contains level label": (t) => {
        const logger = new Logger({ level: "debug" });
        const line = logger._format("info", "test-stage", {});
        t.assert(line.indexOf("[INFO]") >= 0, "should contain [INFO]");
    },

    "_format contains stage": (t) => {
        const logger = new Logger({ level: "debug" });
        const line = logger._format("warn", "my-stage", {});
        t.assert(line.indexOf("my-stage") >= 0, "should contain stage");
    },

    "_format contains msg from fields": (t) => {
        const logger = new Logger({ level: "debug" });
        const line = logger._format("info", "stage", { msg: "hello world" });
        t.assert(line.indexOf("hello world") >= 0, "should contain msg");
    },

    "_format contains key=value pairs": (t) => {
        const logger = new Logger({ level: "debug" });
        const line = logger._format("error", "stage", { error: "bad input" });
        t.assert(line.indexOf("error=bad input") >= 0, "should contain key=value");
    },

    "_format quotes values with spaces": (t) => {
        const logger = new Logger({ level: "debug" });
        const line = logger._format("info", "stage", { msg: "the message", key: "hello world" });
        t.assert(line.indexOf('key="hello world"') >= 0, "value with space should be quoted");
    },

    "_format omits null/undefined fields": (t) => {
        const logger = new Logger({ level: "debug" });
        const line = logger._format("info", "stage", { key: null, other: undefined });
        t.assert(line.indexOf("key=") < 0, "null value should be omitted");
        t.assert(line.indexOf("other=") < 0, "undefined value should be omitted");
    },

    "debug is suppressed when level is info": (t) => {
        const logger = new Logger({ level: "info" });
        t.assertEqual(logger._minLevel, 1, "minLevel should be 1 (info)");
        // debug level is 0, which is < 1, so it is suppressed
        t.assert(0 < logger._minLevel, "debug (0) should be below minLevel (1)");
    },

    "debug is enabled when level is debug": (t) => {
        const logger = new Logger({ level: "debug" });
        t.assertEqual(logger._minLevel, 0, "minLevel should be 0 (debug)");
    },

    "trace level is below debug": (t) => {
        const logger = new Logger({ level: "debug" });
        // LEVELS.trace = -1
        t.assert(-1 < logger._minLevel === false, "trace (-1) is below debug (0)");
    },

    "disabled logger sets _disabled flag": (t) => {
        const logger = new Logger({ disable: true });
        t.assertEqual(logger._disabled, true, "_disabled should be true");
    },

    "maxFiles defaults to 10": (t) => {
        const logger = new Logger({});
        t.assertEqual(logger._maxFiles, 10, "default maxFiles should be 10");
    },

    "maxFiles respects config": (t) => {
        const logger = new Logger({ maxFiles: 5 });
        t.assertEqual(logger._maxFiles, 5, "maxFiles should be 5");
    },

    "maxFiles rejects zero, defaults to 10": (t) => {
        const logger = new Logger({ maxFiles: 0 });
        t.assertEqual(logger._maxFiles, 10, "maxFiles 0 should fall back to 10");
    },

    "_activeFilePath returns name.log": (t) => {
        const logger = new Logger({});
        const p = logger._activeFilePath();
        t.assert(p.endsWith("repli.log"), "active file should be repli.log");
    },

    "init() replaces singleton instance": (t) => {
        const before = getInstance();
        init({ level: "warn" });
        const after = getInstance();
        t.assert(before !== after, "getInstance should return new instance after init");
        // restore
        init({});
    },

    "getInstance() returns Logger instance": (t) => {
        init({});
        const logger = getInstance();
        t.assert(logger instanceof Logger, "should be instance of Logger");
    },
});

runner.summary();
