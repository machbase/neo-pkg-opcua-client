import test from "node:test";
import assert from "node:assert/strict";

import {
    DATA_VIEWER_BACK_PATH,
    buildAssetRows,
    buildDataViewerChartXAxis,
    buildDataViewerChartGroups,
    buildDataViewerEChartOption,
    buildDataViewerSplitGroups,
    buildTagRows,
    buildTagChartSeries,
    buildDataViewerPath,
    buildDataViewerHeaderLabels,
    buildRawResultColumns,
    defaultSelectedTag,
    extractDataViewerDataZoomRange,
    formatDataViewerAxisTime,
    formatDataViewerTime,
    formatTimeRangeInput,
    formatTimeRangeLabel,
    getDataViewerChartRangeMs,
    getResultHeading,
    getScanDirectionLabel,
    getVisibleTagRows,
    hasExplicitDataViewerDataZoomEventRange,
    hasAssetHierarchy,
    isSameDataViewerChartRange,
    normalizeSelectedTagNames,
    QUICK_TIME_RANGE_GROUPS,
    resolveTimeRangeInput,
    resolveTagNodes,
    showsDataViewerTimeControls,
    toggleSelectedTagName,
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

test("buildRawResultColumns can hide hierarchy metadata while keeping other metadata fields", () => {
    const columns = buildRawResultColumns([
        {
            time: "2026-06-01",
            name: "sensor.a",
            value: 12.5,
            asset_path: "{\"city\":\"Seoul\"}",
            spec: "{\"unit\":\"C\"}",
        },
    ], { hiddenKeys: ["asset_path"] });

    assert.deepEqual(columns.map((column) => column.key), [
        "time",
        "name",
        "value",
        "spec",
    ]);
});

test("buildRawResultColumns hides hierarchy metadata case-insensitively", () => {
    const columns = buildRawResultColumns([
        {
            time: "2026-06-01",
            name: "sensor.a",
            value: 12.5,
            ASSET_PATH: "{\"city\":\"Seoul\"}",
            spec: "{\"unit\":\"C\"}",
        },
    ], { hiddenKeys: ["asset_path"] });

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
    assert.equal(hasAssetHierarchy({ schema: ["country"], tree: [] }), true);
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

test("normalizeSelectedTagNames keeps existing selected tags and drops missing tags", () => {
    const rows = buildTagRows([
        { name: "sensor.a" },
        { name: "sensor.b" },
        { name: "sensor.c" },
    ]);

    assert.deepEqual(
        normalizeSelectedTagNames(["sensor.c", "sensor.missing", "sensor.a"], rows),
        ["sensor.c", "sensor.a"]
    );
});

test("normalizeSelectedTagNames selects the first selectable tag when none remain", () => {
    const rows = buildTagRows([
        { name: "sensor.a" },
        { name: "sensor.b" },
    ]);

    assert.deepEqual(normalizeSelectedTagNames(["sensor.missing"], rows), ["sensor.a"]);
    assert.deepEqual(normalizeSelectedTagNames([], []), []);
});

test("toggleSelectedTagName removes existing tags or appends new tags", () => {
    assert.deepEqual(toggleSelectedTagName(["sensor.a", "sensor.b"], "sensor.a"), ["sensor.b"]);
    assert.deepEqual(toggleSelectedTagName(["sensor.a"], "sensor.b"), ["sensor.a", "sensor.b"]);
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

test("buildDataViewerChartXAxis uses selected range instead of data extent", () => {
    const from = "2026-06-17T00:00:00.000Z";
    const to = "2026-06-17T00:10:00.000Z";
    const axis = buildDataViewerChartXAxis([
        [Date.parse("2026-06-17T00:04:00.000Z"), 1],
        [Date.parse("2026-06-17T00:05:00.000Z"), 2],
    ], { from, to });

    assert.equal(axis.min, Date.parse(from));
    assert.equal(axis.max, Date.parse(to));
    assert.equal(axis.tickInterval, 2 * 60 * 1000);
});

test("buildDataViewerChartXAxis falls back to data extent when range is empty", () => {
    const first = Date.parse("2026-06-17T00:04:00.000Z");
    const last = Date.parse("2026-06-17T00:05:00.000Z");
    const axis = buildDataViewerChartXAxis([
        [last, 2],
        [first, 1],
    ]);

    assert.equal(axis.min, first);
    assert.equal(axis.max, last);
});

test("buildDataViewerChartXAxis handles large multi-tag point sets without stack overflow", () => {
    const first = Date.parse("2026-06-17T00:00:00.000Z");
    const points = Array.from({ length: 150000 }, (_, index) => [first + index * 1000, index % 100]);
    const axis = buildDataViewerChartXAxis(points);

    assert.equal(axis.min, first);
    assert.equal(axis.max, first + 149999 * 1000);
});

test("buildDataViewerChartGroups keeps one default chart and splits selected tag groups", () => {
    const groups = buildDataViewerChartGroups({
        selectedTagNames: ["sensor.a", "sensor.b", "sensor.c", "sensor.d"],
        splitGroups: [
            { id: "split:bc", title: "B and C", tagNames: ["sensor.b", "sensor.c"] },
        ],
        globalRange: { from: "now-1h", to: "now" },
        splitRanges: {
            "split:bc": { from: "2026-06-01 00:00:00", to: "2026-06-01 01:00:00" },
        },
    });

    assert.deepEqual(groups, [
        {
            id: "default",
            title: "Selected Tags",
            tagNames: ["sensor.a", "sensor.d"],
            range: { from: "now-1h", to: "now" },
            split: false,
        },
        {
            id: "split:bc",
            title: "B and C",
            tagNames: ["sensor.b", "sensor.c"],
            range: { from: "2026-06-01 00:00:00", to: "2026-06-01 01:00:00" },
            split: true,
        },
    ]);
});

test("buildDataViewerChartGroups keeps the last remaining tag in the default chart", () => {
    const groups = buildDataViewerChartGroups({
        selectedTagNames: ["sensor.a", "sensor.b"],
        splitGroups: [
            { id: "split:a", title: "sensor.a", tagNames: ["sensor.a"] },
        ],
        globalRange: { from: "now-1h", to: "now" },
    });

    assert.deepEqual(groups, [
        {
            id: "default",
            title: "Selected Tags",
            tagNames: ["sensor.b"],
            range: { from: "now-1h", to: "now" },
            split: false,
        },
        {
            id: "split:a",
            title: "sensor.a",
            tagNames: ["sensor.a"],
            range: { from: "now-1h", to: "now" },
            split: true,
        },
    ]);
});

test("buildDataViewerChartGroups omits the default chart when every tag is split", () => {
    const groups = buildDataViewerChartGroups({
        selectedTagNames: ["sensor.a", "sensor.b"],
        splitGroups: [
            { id: "split:a", title: "sensor.a", tagNames: ["sensor.a"] },
            { id: "split:b", title: "sensor.b", tagNames: ["sensor.b"] },
        ],
        globalRange: { from: "now-1h", to: "now" },
    });

    assert.deepEqual(groups, [
        {
            id: "split:a",
            title: "sensor.a",
            tagNames: ["sensor.a"],
            range: { from: "now-1h", to: "now" },
            split: true,
        },
        {
            id: "split:b",
            title: "sensor.b",
            tagNames: ["sensor.b"],
            range: { from: "now-1h", to: "now" },
            split: true,
        },
    ]);
});

test("buildDataViewerSplitGroups creates one split chart per selected tag", () => {
    const groups = buildDataViewerSplitGroups({
        tagNames: ["sensor.a", "sensor.b", "sensor.c"],
        selectedTagNames: ["sensor.a", "sensor.b", "sensor.c"],
        assignedTagNames: [],
        createId: (name, index) => `split:${index}:${name}`,
    });

    assert.deepEqual(groups, [
        { id: "split:0:sensor.a", title: "sensor.a", tagNames: ["sensor.a"] },
        { id: "split:1:sensor.b", title: "sensor.b", tagNames: ["sensor.b"] },
        { id: "split:2:sensor.c", title: "sensor.c", tagNames: ["sensor.c"] },
    ]);
});

test("buildDataViewerSplitGroups skips duplicates, missing tags, and already split tags", () => {
    const groups = buildDataViewerSplitGroups({
        tagNames: ["sensor.a", "sensor.b", "sensor.a", "sensor.c", ""],
        selectedTagNames: ["sensor.a", "sensor.b"],
        assignedTagNames: ["sensor.b"],
        createId: (name, index) => `split:${index}:${name}`,
    });

    assert.deepEqual(groups, [
        { id: "split:0:sensor.a", title: "sensor.a", tagNames: ["sensor.a"] },
    ]);
});

test("buildDataViewerEChartOption creates line chart options with data zoom", () => {
    const option = buildDataViewerEChartOption({
        series: [
            {
                name: "sensor.a",
                data: [
                    [Date.parse("2026-06-01T00:00:00Z"), 10],
                    [Date.parse("2026-06-01T00:01:00Z"), 11],
                ],
            },
        ],
        timeRange: {
            from: "2026-06-01T00:00:00.000Z",
            to: "2026-06-01T00:10:00.000Z",
        },
        timeFormat: "2006-01-02 15:04:05",
        timeZone: "UTC",
    });

    assert.equal(option.backgroundColor, "#252525");
    assert.equal(option.grid.length, 2);
    assert.equal(option.xAxis.length, 3);
    assert.equal(option.yAxis.length, 3);
    assert.equal(option.xAxis[0].type, "time");
    assert.equal(option.xAxis[0].min, Date.parse("2026-06-01T00:00:00.000Z"));
    assert.equal(option.xAxis[0].max, Date.parse("2026-06-01T00:10:00.000Z"));
    assert.equal(option.series[0].type, "line");
    assert.equal(option.series[0].id, "main-series-0");
    assert.equal(option.series[0].name, "sensor.a");
    assert.equal(option.series[1].id, "navigator-series-0");
    assert.equal(option.series[1].yAxisIndex, 2);
    assert.equal(option.series[1].tooltip.show, false);
    assert.equal(option.dataZoom.length, 2);
    assert.deepEqual(option.dataZoom.map((zoom) => zoom.type), ["inside", "slider"]);
    assert.deepEqual(option.dataZoom.map((zoom) => zoom.xAxisIndex), [[1], [1]]);
});

test("buildDataViewerEChartOption lays out large multi-tag data by time range", () => {
    const start = Date.parse("2026-06-01T00:00:00.000Z");
    const series = [
        {
            name: "sensor.a",
            data: Array.from({ length: 75000 }, (_, index) => [start + index * 1000, index % 20]),
        },
        {
            name: "sensor.b",
            data: Array.from({ length: 75000 }, (_, index) => [start + index * 1000, 100 + (index % 20)]),
        },
    ];

    const option = buildDataViewerEChartOption({
        series,
        timeRange: {
            from: "2026-06-01T00:10:00.000Z",
            to: "2026-06-01T00:20:00.000Z",
        },
        timeFormat: "2006-01-02 15:04:05",
        timeZone: "UTC",
    });

    assert.equal(option.xAxis[0].min, Date.parse("2026-06-01T00:10:00.000Z"));
    assert.equal(option.xAxis[0].max, Date.parse("2026-06-01T00:20:00.000Z"));
    assert.equal(option.series.length, 4);
});

test("buildDataViewerEChartOption can show a zoomed display range over a wider navigator range", () => {
    const option = buildDataViewerEChartOption({
        series: [
            {
                name: "sensor.a",
                data: [
                    [Date.parse("2026-06-01T00:00:00Z"), 10],
                    [Date.parse("2026-06-01T00:10:00Z"), 20],
                ],
            },
        ],
        timeRange: {
            from: "2026-06-01T00:00:00.000Z",
            to: "2026-06-01T00:10:00.000Z",
        },
        displayRange: {
            from: "2026-06-01T00:02:00.000Z",
            to: "2026-06-01T00:04:00.000Z",
        },
        timeZone: "UTC",
    });

    assert.equal(option.xAxis[0].min, Date.parse("2026-06-01T00:02:00.000Z"));
    assert.equal(option.xAxis[0].max, Date.parse("2026-06-01T00:04:00.000Z"));
    assert.equal(option.xAxis[1].min, Date.parse("2026-06-01T00:00:00.000Z"));
    assert.equal(option.xAxis[1].max, Date.parse("2026-06-01T00:10:00.000Z"));
    assert.equal(option.dataZoom[0].startValue, Date.parse("2026-06-01T00:02:00.000Z"));
    assert.equal(option.dataZoom[0].endValue, Date.parse("2026-06-01T00:04:00.000Z"));
});

test("extractDataViewerDataZoomRange maps navigator percentage into timestamps", () => {
    const range = extractDataViewerDataZoomRange(
        { start: 20, end: 40 },
        { startTime: 0, endTime: 100 },
        { startTime: 1000, endTime: 2000 }
    );

    assert.deepEqual(range, { startTime: 1200, endTime: 1400 });
    assert.equal(hasExplicitDataViewerDataZoomEventRange({ batch: [{ startValue: 10, endValue: 20 }] }), true);
    assert.equal(isSameDataViewerChartRange({ startTime: 10.4, endTime: 20.2 }, { startTime: 10.1, endTime: 20.9 }), true);
});

test("getDataViewerChartRangeMs resolves explicit and data-driven chart ranges", () => {
    const points = [
        [Date.parse("2026-06-01T00:00:00Z"), 10],
        [Date.parse("2026-06-01T00:10:00Z"), 20],
    ];

    assert.deepEqual(getDataViewerChartRangeMs(points, {
        from: "2026-06-01T00:01:00.000Z",
        to: "2026-06-01T00:02:00.000Z",
    }), {
        startTime: Date.parse("2026-06-01T00:01:00.000Z"),
        endTime: Date.parse("2026-06-01T00:02:00.000Z"),
    });
});

test("formatDataViewerTime supports default millisecond format", () => {
    const text = formatDataViewerTime("2026-06-01T12:34:56.789Z", "YYYY-MM-DD HH24:MI:SS.mmm");

    assert.match(text, /^2026-06-01 \d\d:34:56\.789$/);
});

test("formatDataViewerAxisTime uses compact labels based on visible range", () => {
    const value = Date.parse("2026-06-17T09:43:15.984Z");

    assert.equal(
        formatDataViewerAxisTime(value, {
            min: Date.parse("2026-06-17T09:40:00.000Z"),
            max: Date.parse("2026-06-17T09:50:00.000Z"),
        }, "UTC"),
        "09:43:15"
    );
    assert.equal(
        formatDataViewerAxisTime(value, {
            min: Date.parse("2026-06-17T00:00:00.000Z"),
            max: Date.parse("2026-06-17T12:00:00.000Z"),
        }, "UTC"),
        "09:43"
    );
    assert.equal(
        formatDataViewerAxisTime(value, {
            min: Date.parse("2026-06-01T00:00:00.000Z"),
            max: Date.parse("2026-06-10T00:00:00.000Z"),
        }, "UTC"),
        "06-17 09:43"
    );
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
