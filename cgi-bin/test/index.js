const process = require("process");

const suites = [
    "./cgi-util.test.js",
    "./logger.test.js",
    "./machbase-stream.test.js",
    "./types.test.js",
    "./collector-logic.test.js",
    "./handler.test.js",
];

let allPassed = true;
for (const suite of suites) {
    try {
        require(suite);
    } catch (e) {
        console.log(JSON.stringify({ level: "ERROR", suite, error: e.message }));
        allPassed = false;
    }
}

process.exit(allPassed ? 0 : 1);
