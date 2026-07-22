'use strict';

const Expression = require('../src/expression/evaluator.js');

const iterations = 1000000;
const compiled = Expression.compile('sqrt(A*A+B*B) + sin(C) + <PI>', {
    variables: ['A', 'B', 'C'],
});

let checksum = 0;
for (let i = 0; i < 10000; i++) {
    checksum += compiled.evaluate({ A: 3, B: 4, C: i % 10 });
}

const startedAt = Date.now();
for (let i = 0; i < iterations; i++) {
    checksum += compiled.evaluate({ A: 3, B: 4, C: i % 10 });
}
const elapsedMs = Date.now() - startedAt;

console.log(JSON.stringify({
    iterations,
    elapsedMs,
    evaluationsPerSecond: elapsedMs > 0 ? Math.round(iterations * 1000 / elapsedMs) : null,
    checksum,
}));
