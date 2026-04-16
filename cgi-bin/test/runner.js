// Simple test runner for JSH environment
class TestRunner {
    constructor() {
        this.passed = 0;
        this.failed = 0;
        this.errors = [];
    }

    assert(condition, message) {
        if (!condition) {
            throw new Error("Assertion failed: " + message);
        }
    }

    assertEqual(actual, expected, message) {
        if (actual !== expected) {
            throw new Error((message || "assertEqual") + " => expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
        }
    }

    assertNull(value, message) {
        if (value !== null) {
            throw new Error((message || "assertNull") + " => expected null, got " + JSON.stringify(value));
        }
    }

    assertNotNull(value, message) {
        if (value === null || value === undefined) {
            throw new Error((message || "assertNotNull") + " => expected non-null");
        }
    }

    assertDeepEqual(actual, expected, message) {
        const a = JSON.stringify(actual);
        const e = JSON.stringify(expected);
        if (a !== e) {
            throw new Error((message || "assertDeepEqual") + " => expected " + e + ", got " + a);
        }
    }

    assertThrows(fn, expectedMessage) {
        try {
            fn();
            throw new Error("assertThrows => expected exception but none was thrown");
        } catch (e) {
            if (e.message === "assertThrows => expected exception but none was thrown") throw e;
            if (expectedMessage && !e.message.includes(expectedMessage)) {
                throw new Error("assertThrows => expected message to include " + JSON.stringify(expectedMessage) + ", got " + JSON.stringify(e.message));
            }
        }
    }

    run(suiteName, tests) {
        console.log(JSON.stringify({ level: "INFO", suite: suiteName, message: "start" }));
        for (const [name, fn] of Object.entries(tests)) {
            try {
                fn(this);
                this.passed++;
                console.log(JSON.stringify({ level: "PASS", suite: suiteName, test: name }));
            } catch (e) {
                this.failed++;
                this.errors.push({ suite: suiteName, test: name, error: e.message });
                console.log(JSON.stringify({ level: "FAIL", suite: suiteName, test: name, error: e.message }));
            }
        }
    }

    summary() {
        console.log(JSON.stringify({
            level: "SUMMARY",
            passed: this.passed,
            failed: this.failed,
            total: this.passed + this.failed,
        }));
        return this.failed === 0;
    }
}

module.exports = TestRunner;
