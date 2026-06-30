import test from "node:test";
import assert from "node:assert/strict";

import { webRequest } from "./webClient.js";

test("webRequest sends web api requests with bearer token from localStorage", async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.localStorage = {
        getItem(key) {
            return key === "accessToken" ? "test-token" : "";
        },
    };
    globalThis.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), options });
        return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ success: true, data: { rows: [[1]] } }),
        };
    };

    try {
        const result = await webRequest("/api/query?q=select%201");

        assert.deepEqual(result, { rows: [[1]] });
        assert.equal(calls[0].url, "/web/api/query?q=select%201");
        assert.equal(calls[0].options.headers.Authorization, "Bearer test-token");
        assert.equal(calls[0].options.headers["Content-Type"], "application/json");
    } finally {
        globalThis.fetch = originalFetch;
        delete globalThis.localStorage;
    }
});

test("webRequest sends console id when available", async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.localStorage = {
        getItem(key) {
            if (key === "accessToken") return "test-token";
            if (key === "consoleId") return "console-1";
            return "";
        },
    };
    globalThis.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), options });
        return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ success: true, data: { rows: [[1]] } }),
        };
    };

    try {
        await webRequest("/api/query?q=select%201");

        assert.equal(calls[0].options.headers.Authorization, "Bearer test-token");
        assert.equal(calls[0].options.headers["X-Console-Id"], "console-1");
    } finally {
        globalThis.fetch = originalFetch;
        delete globalThis.localStorage;
    }
});

test("webRequest fails before fetch when access token is missing", async () => {
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.localStorage = {
        getItem() {
            return "";
        },
    };
    globalThis.fetch = async () => {
        called = true;
        return {
            ok: false,
            status: 401,
            text: async () => JSON.stringify({ success: false, reason: "missing authorization header" }),
        };
    };

    try {
        await assert.rejects(
            () => webRequest("/api/query?q=select%201"),
            /Neo Web login is required/
        );
        assert.equal(called, false);
    } finally {
        globalThis.fetch = originalFetch;
        delete globalThis.localStorage;
    }
});

test("webRequest reports web api error reason", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.localStorage = {
        getItem(key) {
            return key === "accessToken" ? "test-token" : "";
        },
    };
    globalThis.fetch = async () => ({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ success: false, reason: "missing authorization header" }),
    });

    try {
        await assert.rejects(
            () => webRequest("/api/query?q=select%201"),
            /missing authorization header/
        );
    } finally {
        globalThis.fetch = originalFetch;
        delete globalThis.localStorage;
    }
});
