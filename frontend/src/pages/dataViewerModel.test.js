import test from "node:test";
import assert from "node:assert/strict";

import {
    DATA_VIEWER_BACK_PATH,
    buildAssetRows,
    buildTagRows,
    buildTagChartSeries,
    buildDataViewerPath,
    buildDataViewerHeaderLabels,
    buildRawResultColumns,
    defaultSelectedTag,
    formatDataViewerTime,
    formatTimeRangeInput,
    formatTimeRangeLabel,
    getResultHeading,
    getScanDirectionLabel,
    getVisibleTagRows,
    hasAssetHierarchy,
    QUICK_TIME_RANGE_GROUPS,
    resolveTimeRangeInput,
    resolveTagNodes,
    showsDataViewerTimeControls,
} from "./dataViewerModel.js";

test("buildDataViewerPath encodes collector id for route navigation", () => {
    assert.equal(buildDataViewerPath("job/a b"), "/data-viewer/job%2Fa%20b");
});

test("DATA_VIEWER_BACK_PATH returns to the jobs dashboard", () => {
    assert.equal(DATA_VIEWER_BACK_PATH, "/");
});

test("buildDataViewerHeaderLabels places job name in title and table name in detail", () => {
    assert.deepEqual(buildDataViewerHeaderLabels("collector-a", "SYS.TAG_TABLE"), {
        title: "collector-a",
        detail: "SYS.TAG_TABLE",
    });
    assert.deepEqual(buildDataViewerHeaderLabels("collector-a", ""), {
        title: "collector-a",
        detail: "",
    });
});

test("buildRawResultColumns keeps time name value first and appends extra fields", () => {
    const columns = buildRawResultColumns([
        {
            str_value: "running",
            name: "sensor.a",
            value: 12.5,
            time: "2026-06-01",
            quality: "GOOD",
            buffer: ["internal"],
            names: ["TIME", "NAME", "VALUE"],
        },
        { extra_status: "ok", name: "sensor.a", value: 13.5, time: "2026-06-02" },
    ]);

    assert.deepEqual(columns.map((column) => column.key), [
        "time",
        "name",
        "value",
        "str_value",
        "quality",
        "extra_status",
    ]);
    assert.deepEqual(columns.map((column) => column.label), [
        "Time",
        "Name",
        "Value",
        "Str Value",
        "Quality",
        "Extra Status",
    ]);
});

test("buildRawResultColumns can hide asset metadata while keeping other metadata fields", () => {
    const columns = buildRawResultColumns([
        {
            time: "2026-06-01",
            name: "sensor.a",
            value: 12.5,
            asset: "{\"city\":\"Seoul\"}",
            spec: "{\"unit\":\"C\"}",
        },
    ], { hideAssetMetadata: true });

    assert.deepEqual(columns.map((column) => column.key), [
        "time",
        "name",
        "value",
        "spec",
    ]);
});

test("buildRawResultColumns returns default columns when rows are empty", () => {
    assert.deepEqual(buildRawResultColumns([]).map((column) => column.key), ["time", "name", "value"]);
});

test("getResultHeading hides raw and chart result titles", () => {
    assert.equal(getResultHeading("raw"), "");
    assert.equal(getResultHeading("chart"), "");
});

test("getScanDirectionLabel uses scan direction wording", () => {
    assert.equal(getScanDirectionLabel(true), "Backward");
    assert.equal(getScanDirectionLabel(false), "Forward");
});

test("showsDataViewerTimeControls keeps time controls available for raw and chart", () => {
    assert.equal(showsDataViewerTimeControls("raw"), true);
    assert.equal(showsDataViewerTimeControls("chart"), true);
});

test("buildTagRows keeps ordinary tags as a flat list", () => {
    const rows = buildTagRows([
        { name: "sensor_a", nodeId: "ns=1;s=sensor.a", dataType: "Double" },
        { name: "sensor_b", nodeId: "ns=1;s=sensor.b", dataType: "Double" },
    ]);

    assert.deepEqual(rows.map((row) => [row.type, row.depth, row.label]), [
        ["tag", 0, "sensor_a"],
        ["tag", 0, "sensor_b"],
    ]);
});

test("buildTagRows uses nodeTree when browse selection stores tree structure", () => {
    const rows = buildTagRows([
        {
            name: "Area1_PumpA_Temperature",
            nodeId: "ns=1;s=area1.pumpA.temperature",
            dataType: "Double",
            treePath: ["legacy", "wrong"],
            nodeTree: {
                Objects: {
                    Area1: {
                        PumpA: {
                            Temperature: {
                                label: "Temperature",
                                nodeId: "ns=1;s=area1.pumpA.temperature",
                                dataType: "Double",
                            },
                        },
                    },
                },
            },
        },
        {
            name: "Area1_PumpA_Pressure",
            nodeId: "ns=1;s=area1.pumpA.pressure",
            dataType: "Double",
            nodeTree: {
                Objects: {
                    Area1: {
                        PumpA: {
                            Pressure: {
                                label: "Pressure",
                                nodeId: "ns=1;s=area1.pumpA.pressure",
                                dataType: "Double",
                            },
                        },
                    },
                },
            },
        },
    ]);

    assert.deepEqual(rows.map((row) => [row.type, row.depth, row.label]), [
        ["folder", 0, "Area1"],
        ["folder", 1, "PumpA"],
        ["tag", 2, "Temperature"],
        ["tag", 2, "Pressure"],
    ]);
});

test("getVisibleTagRows hides descendants of collapsed folders", () => {
    const rows = buildTagRows([
        {
            name: "Area1_PumpA_Temperature",
            nodeId: "ns=1;s=area1.pumpA.temperature",
            nodeTree: {
                Objects: {
                    Area1: {
                        PumpA: {
                            Temperature: {
                                label: "Temperature",
                                nodeId: "ns=1;s=area1.pumpA.temperature",
                            },
                        },
                    },
                },
            },
        },
        {
            name: "Area1_PumpA_Pressure",
            nodeId: "ns=1;s=area1.pumpA.pressure",
            nodeTree: {
                Objects: {
                    Area1: {
                        PumpA: {
                            Pressure: {
                                label: "Pressure",
                                nodeId: "ns=1;s=area1.pumpA.pressure",
                            },
                        },
                    },
                },
            },
        },
    ]);

    assert.deepEqual(
        getVisibleTagRows(rows, new Set(["folder:Area1/PumpA"])).map((row) => [row.type, row.depth, row.label]),
        [
            ["folder", 0, "Area1"],
            ["folder", 1, "PumpA"],
        ]
    );
});

test("buildTagRows uses treePath only when nodeTree is missing", () => {
    const rows = buildTagRows([
        {
            name: "Line1_Temperature",
            nodeId: "ns=1;s=line1.temperature",
            dataType: "Double",
            treePath: ["Line1", "Temperature"],
        },
        {
            name: "Line1_Pressure",
            nodeId: "ns=1;s=line1.pressure",
            dataType: "Double",
            treePath: ["Line1", "Pressure"],
        },
    ]);

    assert.deepEqual(rows.map((row) => [row.type, row.depth, row.label]), [
        ["folder", 0, "Line1"],
        ["tag", 1, "Temperature"],
        ["tag", 1, "Pressure"],
    ]);
});

test("hasAssetHierarchy returns true for valid asset hierarchy even with configured nodeTree", () => {
    const assetHierarchy = {
        schema: ["country", "city", "equipment"],
        tree: [{ key: "country", value: "Korea", children: [] }],
    };

    assert.equal(hasAssetHierarchy(assetHierarchy), true);
    assert.equal(hasAssetHierarchy(null), false);
    assert.equal(hasAssetHierarchy({ schema: ["country"], tree: [] }), false);
});

test("buildAssetRows renders hierarchy folders and matching tag leaves", () => {
    const rows = buildAssetRows(
        {
            schema: ["country", "city", "equipment", "sensor"],
            tree: [
                {
                    key: "country",
                    value: "Korea",
                    children: [
                        {
                            key: "city",
                            value: "Seoul",
                            children: [
                                {
                                    key: "equipment",
                                    value: "Boiler-01",
                                    children: [],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        [
            {
                name: "GLOBAL.SEOUL.BOILER01.TEMP",
                asset: {
                    country: "Korea",
                    city: "Seoul",
                    equipment: "Boiler-01",
                    sensor: "Temperature",
                },
            },
            {
                name: "GLOBAL.SEOUL.PARTIAL",
                asset: {
                    country: "Korea",
                    city: "Seoul",
                    equipment: "",
                    sensor: "",
                },
            },
            {
                name: "GLOBAL.BUSAN.UNMATCHED",
                asset: {
                    country: "Korea",
                    city: "Busan",
                    equipment: "Pump-01",
                    sensor: "Pressure",
                },
            },
        ]
    );

    assert.deepEqual(rows.map((row) => [row.type, row.depth, row.label]), [
        ["folder", 0, "Korea"],
        ["folder", 1, "Seoul"],
        ["tag", 2, "GLOBAL.SEOUL.PARTIAL"],
        ["folder", 2, "Boiler-01"],
        ["tag", 3, "GLOBAL.SEOUL.BOILER01.TEMP"],
    ]);
    assert.equal(rows.find((row) => row.type === "tag").selectable, true);
});

test("defaultSelectedTag returns the first selectable tag", () => {
    const rows = buildTagRows([
        { name: "Line1_Temperature", treePath: ["Line1", "Temperature"] },
    ]);

    assert.equal(defaultSelectedTag(rows).name, "Line1_Temperature");
});

test("resolveTagNodes falls back to DB tag names when collector nodes are empty", () => {
    const nodes = resolveTagNodes([], [
        { name: "sensor.a" },
        { name: "sensor.b" },
    ]);

    assert.deepEqual(nodes, [
        { name: "sensor.a" },
        { name: "sensor.b" },
    ]);
});

test("buildTagChartSeries uses real time values and sorts points by time", () => {
    const series = buildTagChartSeries([
        { time: "2026-06-04T10:02:00Z", name: "sensor.a", value: "12.5" },
        { time: "2026-06-04T10:00:00Z", name: "sensor.a", value: "10.5" },
        { time: "bad-time", name: "sensor.a", value: "99" },
        { time: "2026-06-04T10:01:00Z", name: "sensor.a", value: "not-number" },
    ]);

    assert.equal(series.length, 1);
    assert.equal(series[0].name, "sensor.a");
    assert.deepEqual(series[0].data, [
        [Date.parse("2026-06-04T10:00:00Z"), 10.5],
        [Date.parse("2026-06-04T10:02:00Z"), 12.5],
    ]);
});

test("formatDataViewerTime supports default millisecond format", () => {
    const text = formatDataViewerTime("2026-06-01T12:34:56.789Z", "YYYY-MM-DD HH24:MI:SS.mmm");

    assert.match(text, /^2026-06-01 \d\d:34:56\.789$/);
});

test("formatDataViewerTime supports Neo time format and timezone", () => {
    const text = formatDataViewerTime("2026-06-01T12:34:56.789Z", "2006-01-02 15:04:05.000", "UTC");

    assert.equal(text, "2026-06-01 12:34:56.789");
});

test("formatTimeRangeInput renders stored ISO values as editable text", () => {
    const text = formatTimeRangeInput("2026-06-01T12:34:56.000Z");

    assert.match(text, /^2026-06-01 \d\d:34:56$/);
});

test("quick ranges match Neo now and last-of-data groups", () => {
    assert.deepEqual(QUICK_TIME_RANGE_GROUPS[0][2].value, ["now-5m", "now"]);
    assert.equal(QUICK_TIME_RANGE_GROUPS[1][2].name, "Last 5 minutes of data");
    assert.deepEqual(QUICK_TIME_RANGE_GROUPS[1][2].value, ["last-5m", "last"]);
    assert.deepEqual(QUICK_TIME_RANGE_GROUPS[1][9].value, ["last-1y", "last"]);
});

test("resolveTimeRangeInput supports now and last quick ranges", () => {
    const base = new Date("2026-06-01T12:00:00.000Z");

    assert.equal(resolveTimeRangeInput("now", base), "2026-06-01T12:00:00.000Z");
    assert.equal(resolveTimeRangeInput("last", base), "2026-06-01T12:00:00.000Z");
    assert.equal(resolveTimeRangeInput("now-5m", base), "2026-06-01T11:55:00.000Z");
    assert.equal(resolveTimeRangeInput("last-5m", base), "2026-06-01T11:55:00.000Z");
});

test("formatTimeRangeLabel keeps relative quick ranges readable", () => {
    assert.equal(formatTimeRangeLabel("last-5m", "last"), "last-5m ~ last");
    assert.equal(formatTimeRangeLabel("", ""), "Time range not set");
});

test("formatTimeRangeLabel shortens concrete date ranges", () => {
    assert.equal(
        formatTimeRangeLabel("2026-06-01 12:34:56.789", "2026-06-01 12:35:01.789"),
        "2026-06-01 12:34:56 ~ 2026-06-01 12:35:01"
    );
});
