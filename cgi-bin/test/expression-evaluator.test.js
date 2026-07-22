'use strict';

const TestRunner = require('./runner.js');
const Expression = require('../src/expression/evaluator.js');

const runner = new TestRunner();

runner.run('Expression evaluator', {
    'evaluates arithmetic with precedence': (t) => {
        const compiled = Expression.compile('A + B * C', { variables: ['A', 'B', 'C'] });
        t.assertEqual(compiled.evaluate({ A: 2, B: 3, C: 4 }), 14);
        t.assertDeepEqual(compiled.usedVariables, ['A', 'B', 'C']);
    },

    'evaluates parentheses and unary operators': (t) => {
        const compiled = Expression.compile('-(A + B) * C', { variables: ['A', 'B', 'C'] });
        t.assertEqual(compiled.evaluate({ A: 2, B: 3, C: 4 }), -20);
    },

    'supports constants and math functions': (t) => {
        const compiled = Expression.compile('round(sin(A * <PI> / 180) + <E>)', { variables: ['A'] });
        t.assertEqual(compiled.evaluate({ A: 90 }), 4);
        t.assertDeepEqual(compiled.functions, ['round', 'sin']);
        t.assertDeepEqual(compiled.constants, ['E', 'PI']);
    },

    'supports min max sqrt pow and modulo': (t) => {
        const compiled = Expression.compile('max(A % B, sqrt(pow(C, 2)))', { variables: ['A', 'B', 'C'] });
        t.assertEqual(compiled.evaluate({ A: 7, B: 4, C: 5 }), 5);
    },

    'evaluates every documented math function': (t) => {
        const cases = [
            ['abs(A)', -2, 2],
            ['ceil(A)', 1.2, 2],
            ['floor(A)', 1.8, 1],
            ['round(A)', 1.6, 2],
            ['trunc(A)', -1.8, -1],
            ['min(A, 3)', 4, 3],
            ['max(A, 3)', 4, 4],
            ['sqrt(A)', 9, 3],
            ['pow(A, 3)', 2, 8],
            ['sin(A)', 0, 0],
            ['cos(A)', 0, 1],
            ['tan(A)', 0, 0],
            ['asin(A)', 0, 0],
            ['acos(A)', 1, 0],
            ['atan(A)', 0, 0],
            ['log(A)', 1, 0],
            ['log2(A)', 8, 3],
            ['log10(A)', 100, 2],
            ['exp(A)', 0, 1],
        ];
        for (const [expression, input, expected] of cases) {
            const compiled = Expression.compile(expression, { variables: ['A'] });
            t.assertEqual(compiled.evaluate({ A: input }), expected, expression);
        }
    },

    'validate can return sample result': (t) => {
        const data = Expression.validate('A * B / C', {
            variables: ['A', 'B', 'C'],
            sampleValues: { A: 10, B: 20, C: 2 },
        });
        t.assertEqual(data.result, 100);
        t.assertDeepEqual(data.usedVariables, ['A', 'B', 'C']);
    },

    'rejects lowercase variables': (t) => {
        t.assertThrows(() => Expression.compile('a + B', { variables: ['B'] }), "unknown function 'a'");
    },

    'rejects multi-character variables': (t) => {
        t.assertThrows(() => Expression.compile('AB + C', { variables: ['C'] }), "invalid variable 'AB'");
    },

    'rejects plain constants': (t) => {
        t.assertThrows(() => Expression.compile('PI + A', { variables: ['A'] }), 'use <PI>');
    },

    'rejects undeclared variables': (t) => {
        t.assertThrows(() => Expression.compile('A + B', { variables: ['A'] }), "unknown variable 'B'");
    },

    'rejects unknown functions': (t) => {
        t.assertThrows(() => Expression.compile('random(A)', { variables: ['A'] }), "unknown function 'random'");
    },

    'rejects constant division by zero at compile time': (t) => {
        t.assertThrows(() => Expression.compile('A / (1 - 1)', { variables: ['A'] }), 'division by zero');
        t.assertThrows(() => Expression.compile('A / -0', { variables: ['A'] }), 'division by zero');
        t.assertThrows(() => Expression.compile('A % (0 * -1)', { variables: ['A'] }), 'division by zero');
    },

    'rejects runtime division by zero': (t) => {
        const compiled = Expression.compile('A / B', { variables: ['A', 'B'] });
        t.assertThrows(() => compiled.evaluate({ A: 1, B: 0 }), 'division by zero');
        t.assertThrows(() => compiled.evaluate({ A: 1, B: -0 }), 'division by zero');
    },

    'rejects invalid function result': (t) => {
        const compiled = Expression.compile('sqrt(A)', { variables: ['A'] });
        t.assertThrows(() => compiled.evaluate({ A: -1 }), "function 'sqrt' returned invalid value");
    },

    'rejects missing and non-finite variable values': (t) => {
        const compiled = Expression.compile('A + B', { variables: ['A', 'B'] });
        t.assertThrows(() => compiled.evaluate({ A: 1 }), "missing variable 'B'");
        t.assertThrows(() => compiled.evaluate({ A: 1, B: NaN }), "variable 'B' is not finite");
    },

    'enforces expression limits': (t) => {
        const longExpression = 'A'.repeat(Expression.EXPRESSION_LIMITS.maxExpressionLength + 1);
        t.assertThrows(() => Expression.compile(longExpression, { variables: ['A'] }), 'expression length exceeds');
    },
});

if (!runner.summary()) process.exit(1);
