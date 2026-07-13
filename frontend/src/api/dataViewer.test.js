import test from "node:test";
import assert from "node:assert/strict";

import {
    buildSeriesFromChartRows,
    buildDataViewerChartQueryPath,
    queryTagBoundaryTime,
    queryTagData,
    queryTagDataTotal,
    queryTagChartData,
} from "./dataViewer.js";
import { encodeDataViewerQuery } from "./dataViewerQuery.js";

test("encodeDataViewerQuery uses percent encoding instead of plus for spaces", () => {
    assert.equal(
        encodeDataViewerQuery({
            server: "local db",
            table: "EXAMPLE OPCUA TAG",
            names: ["Simulation Examples_Functions_Ramp4"],
            empty: "",
        }),
        "server=local%20db&table=EXAMPLE%20OPCUA%20TAG&names=Simulation%20Examples_Functions_Ramp4"
    );
});

test("encodeDataViewerQuery encodes cleaned array values as repeated query params", () => {
    assert.equal(
        encodeDataViewerQuery({
            names: ["sensor.a", "", null, "sensor.b"],
        }),
        "names=sensor.a&names=sensor.b"
    );
});

test("encodeDataViewerQuery omits empty optional values before string conversion", () => {
    assert.equal(
        encodeDataViewerQuery({
            server: "local",
            table: "TAG",
            names: ["sensor.a"],
            from: undefined,
            to: null,
            empty: "",
        }),
        "server=local&table=TAG&names=sensor.a"
    );
});

test("encodeDataViewerQuery preserves commas inside tag names", () => {
    assert.equal(
        encodeDataViewerQuery({
            names: ["area,1"],
        }),
        "names=area%2C1"
    );
});

test("buildDataViewerChartQueryPath uses chart endpoint with repeated names", () => {
    assert.equal(
        buildDataViewerChartQueryPath({
            server: "local",
            table: "TAG",
            names: ["sensor.a", "sensor.b"],
            from: "2026-06-01T00:00:00.000Z",
            to: "2026-06-01T01:00:00.000Z",
        }),
        "/cgi-bin/api/db/table/chart?server=local&table=TAG&names=sensor.a&names=sensor.b&from=2026-06-01T00%3A00%3A00.000Z&to=2026-06-01T01%3A00%3A00.000Z"
    );
});

test("queryTagData sends raw cursor parameters", async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), options });
        return {
            status: 200,
            text: async () => JSON.stringify({
                ok: true,
                data: { rows: [], page: 3, pageSize: 3000 },
            }),
        };
    };

    try {
        await queryTagData({
            server: "local",
            table: "TAG",
            names: ["sensor.a", "sensor.b"],
            direction: "latest",
            page: 3,
            pageSize: 3000,
            cursorSide: "next",
            cursorTime: "2026-06-25T05:09:56.100Z",
            cursorName: "sensor.b",
            cursorOffset: 3000,
        });

        const call = calls[0];
        assert.ok(call.url.includes("names=sensor.a%2Csensor.b"));
        assert.equal(call.url.includes("names=sensor.a&names=sensor.b"), false);
        assert.ok(call.url.includes("cursorSide=next"));
        assert.ok(call.url.includes("cursorTime=2026-06-25T05%3A09%3A56.100Z"));
        assert.ok(call.url.includes("cursorName=sensor.b"));
        assert.ok(call.url.includes("cursorOffset=3000"));
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("queryTagData omits page when refreshing within current page bounds", async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), options });
        return {
            status: 200,
            text: async () => JSON.stringify({
                ok: true,
                data: { rows: [], page: 1, pageSize: 3000 },
            }),
        };
    };

    try {
        await queryTagData({
            server: "local",
            table: "TAG",
            names: ["sensor.a", "sensor.b", "sensor.c"],
            direction: "latest",
            page: 4,
            pageSize: 3000,
            from: "2026-06-25T05:09:56.100Z",
            to: "2026-06-25T05:10:01.001Z",
            boundedRange: true,
        });

        const url = calls[0].url;
        assert.ok(url.includes("names=sensor.a%2Csensor.b%2Csensor.c"));
        assert.equal(url.includes("names=sensor.a&names=sensor.b"), false);
        assert.ok(url.includes("boundedRange=true"));
        assert.ok(url.includes("pageSize=3000"));
        assert.ok(url.includes("from=2026-06-25T05%3A09%3A56.100Z"));
        assert.ok(url.includes("to=2026-06-25T05%3A10%3A01.001Z"));
        assert.equal(url.includes("page=4"), false);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("queryTagBoundaryTime loads one boundary row and returns its time", async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), options });
        return {
            status: 200,
            text: async () => JSON.stringify({
                ok: true,
                data: { rows: [{ TIME: "2026-07-07 16:18:09.016" }] },
            }),
        };
    };

    try {
        const time = await queryTagBoundaryTime({
            server: "local",
            table: "TAG",
            names: ["sensor.a", "sensor.b"],
            direction: "latest",
        });

        assert.equal(time, "2026-07-07 16:18:09.016");
        const url = calls[0].url;
        assert.ok(url.includes("direction=latest"));
        assert.ok(url.includes("pageSize=1"));
        assert.ok(url.includes("names=sensor.a%2Csensor.b"));
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("queryTagDataTotal sends raw total names as one comma-separated value", async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), options });
        return {
            status: 200,
            text: async () => JSON.stringify({
                ok: true,
                data: { total: 403703, pageSize: 2000, lastPage: 202 },
            }),
        };
    };

    try {
        await queryTagDataTotal({
            server: "local",
            table: "TAG",
            names: ["sensor.a", "sensor.b"],
            direction: "latest",
            pageSize: 2000,
        });

        const url = calls[0].url;
        assert.ok(url.includes("names=sensor.a%2Csensor.b"));
        assert.equal(url.includes("names=sensor.a&names=sensor.b"), false);
        assert.ok(url.includes("includeTotal=true"));
        assert.ok(url.includes("pageSize=2000"));
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("buildSeriesFromChartRows groups web query rows by tag name", () => {
    assert.deepEqual(
        buildSeriesFromChartRows([
            ["2026-06-01T00:02:00.000Z", "sensor.a", 12.5],
            ["2026-06-01T00:01:00.000Z", "sensor.a", 11.5],
            ["2026-06-01T00:02:00.000Z", "sensor.b", null],
        ]),
        [
            {
                name: "sensor.a",
                data: [
                    [Date.parse("2026-06-01T00:01:00.000Z"), 11.5],
                    [Date.parse("2026-06-01T00:02:00.000Z"), 12.5],
                ],
            },
            {
                name: "sensor.b",
                data: [[Date.parse("2026-06-01T00:02:00.000Z"), null]],
            },
        ]
    );
});

test("queryTagChartData loads chart rows through web api query instead of db tql", async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.localStorage = {
        getItem(key) {
            return key === "accessToken" ? "test-token" : "";
        },
    };
    globalThis.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), options });
        if (String(url).includes("/cgi-bin/api/db/table/chart?")) {
            return {
                status: 200,
                text: async () => JSON.stringify({
                    ok: true,
                    data: {
                        type: "query",
                        query: "SELECT TIME AS TIME, NAME AS NAME, VALUE AS VALUE FROM TAG",
                        range: {},
                    },
                }),
            };
        }
        if (String(url).startsWith("/web/api/query?")) {
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({
                    success: true,
                    data: {
                        columns: ["TIME", "NAME", "VALUE"],
                        rows: [
                            ["2026-06-01T00:00:00.000Z", "sensor.a", 10],
                            ["2026-06-01T00:01:00.000Z", "sensor.a", 11],
                        ],
                    },
                }),
            };
        }
        return {
            ok: false,
            status: 404,
            text: async () => "not found",
        };
    };

    try {
        const result = await queryTagChartData({
            server: "local",
            table: "TAG",
            names: ["sensor.a"],
        });

        assert.deepEqual(result.series, [
            {
                name: "sensor.a",
                data: [
                    [Date.parse("2026-06-01T00:00:00.000Z"), 10],
                    [Date.parse("2026-06-01T00:01:00.000Z"), 11],
                ],
            },
        ]);
        assert.equal(calls.some((call) => call.url === "/db/tql"), false);
        const queryCall = calls.find((call) => call.url.startsWith("/web/api/query?"));
        assert.ok(queryCall, "should call web api query");
        assert.equal(queryCall.options.headers.Authorization, "Bearer test-token");
    } finally {
        globalThis.fetch = originalFetch;
        delete globalThis.localStorage;
    }
});
