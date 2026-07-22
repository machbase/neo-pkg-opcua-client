'use strict';

const process = require('process');

// The other suites use Node's module resolver/cache for dependency injection.
const suites = [
    './cgi-util.test.js',
    './logger.test.js',
    './machbase-stream.test.js',
    './types.test.js',
    './expression-evaluator.test.js',
    './certificate.test.js',
];

let allPassed = true;
for (const suite of suites) {
    try {
        require(suite);
    } catch (e) {
        console.log(JSON.stringify({ level: 'ERROR', suite, error: e.message }));
        allPassed = false;
    }
}

process.exit(allPassed ? 0 : 1);
