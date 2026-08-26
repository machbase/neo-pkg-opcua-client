import test from "node:test";
import assert from "node:assert/strict";

import {
    monoDisplayWidth,
    DATA_VIEWER_BACK_PATH,
    buildAssetRows,
    buildDataViewerChartXAxis,
    buildDataViewerChartGroups,
    buildDataViewerEChartOption,
    buildDataViewerGlobalTimeUpdate,
    buildDataViewerChartResultsFromRawRows,
    buildDataViewerRawPageBounds,
    buildDataViewerRawPageRequest,
    buildDataViewerRawRowsPerTagChange,
    buildDataViewerDefaultChartShiftRawPageUpdate,
    buildDataViewerSplitRangeUpdate,
    buildDataViewerSplitGroups,
    buildDataViewerShiftMainRangeUpdate,
    buildDataViewerDragRangeUpdate,
    buildDataViewerTagSelectionUpdate,
    buildDerivedTagRows,
    buildDataViewerWheelZoomRange,
    buildDataViewerZoomControlRange,
    buildNeoWebTagAnalyzerMessage,
    toTagAnalyzerJsonKey,
    TAG_ANALYZER_MAX_TAGS,
    buildNeoWebTagAnalyzerRange,
    buildTagRows,
    buildTagChartSeries,
    buildDataViewerPath,
    buildDataViewerHeaderLabels,
    buildRawColumnWidths,
    buildRawResultColumns,
    buildSeriesColorMap,
    buildRawRowNameColors,
    defaultSelectedTag,
    DEFAULT_DATA_VIEWER_TIME_RANGE,
    extractDataViewerDataZoomRange,
    formatDataViewerAxisTime,
    formatDataViewerNavigatorRangeLabels,
    formatDataViewerTime,
    formatTimeRangeInput,
    formatTimeRangeLabel,
    getDataViewerChartRangeMs,
    getDataViewerRawPageSize,
    isJsonValueColumn,
    usesLastDataAnchor,
    normalizeDataViewerRowsPerTag,
    getResultHeading,
    getScanDirectionLabel,
    getVisibleTagRows,
    buildTagRowTree,
    hasDataViewerRawNextPage,
    hasExplicitDataViewerDataZoomEventRange,
    hasAssetHierarchy,
    isSameDataViewerChartRange,
    normalizeSelectedTagNames,
    QUICK_TIME_RANGE_GROUPS,
    resolveTagAnalyzerKeyColumns,
    resolveTimeRangeInput,
    resolveTagNodes,
    expandProjectedRows,
    encodePayloadKeyId,
    splitPayloadKeySelection,
    buildPayloadKeyRows,
    sendNeoWebTagAnalyzerMessage,
    shouldFetchDataViewerRowsForMode,
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

test("shouldFetchDataViewerRowsForMode keeps raw rows active for raw and chart", () => {
    assert.equal(shouldFetchDataViewerRowsForMode("raw"), true);
    assert.equal(shouldFetchDataViewerRowsForMode("chart"), true);
    assert.equal(shouldFetchDataViewerRowsForMode("other"), false);
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

test("buildRawRowNameColors assigns colors in first-appearance order, matching the chart", () => {
    const rows = [
        { name: "norm", time: 3, value: 1 },
        { name: "pwr", time: 3, value: 2 },
        { name: "norm", time: 2, value: 3 },
        { name: "pick", time: 2, value: 4 },
    ];
    const colors = buildRawRowNameColors(rows);

    assert.deepEqual(Object.keys(colors), ["norm", "pwr", "pick"]);
    assert.notEqual(colors.norm, colors.pwr);
    // The dot only matches the chart line if both walk the palette in the same order.
    assert.deepEqual(Object.keys(colors), buildTagChartSeries(rows).map((series) => series.name));
});

test("buildTagRows keeps branches intact when the node list moves between them and back", () => {
    // Config order does this: several Functions nodes, one _System node, then more Functions.
    const node = (leaf, folder) => ({
        name: leaf,
        nodeId: `ns=1;s=${leaf}`,
        treePath: ["Simulation Examples", folder, leaf],
    });
    const rows = buildTagRows([
        node("Ramp1", "Functions"),
        node("_EnableDiagnostics", "_System"),
        node("Sine1", "Functions"),
        node("Sine2", "Functions"),
    ]);

    assert.deepEqual(rows.map((row) => [row.type, row.depth, row.label]), [
        ["folder", 0, "Simulation Examples"],
        ["folder", 1, "Functions"],
        ["tag", 2, "Ramp1"],
        ["tag", 2, "Sine1"],
        ["tag", 2, "Sine2"],
        ["folder", 1, "_System"],
        ["tag", 2, "_EnableDiagnostics"],
    ]);
    // Every leaf still collapses with its own folder.
    const sine1 = rows.find((row) => row.label === "Sine1");
    assert.deepEqual(sine1.ancestorKeys, [
        "folder:Simulation Examples",
        "folder:Simulation Examples/Functions",
    ]);
});

test("buildRawColumnWidths sizes columns from every row, not the visible ones", () => {
    const rows = [
        { time: "t", name: "short", value: "1" },
        { time: "t", name: "a_very_long_tag_name_far_below_the_fold", value: "1" },
    ];
    const columns = [{ key: "time", label: "Time" }, { key: "name", label: "Name" }, { key: "value", label: "Value" }];
    const widths = buildRawColumnWidths(rows, columns, { timeSample: "2026-07-29 16:00:16.165" });

    // Row 2 is what the name column has to fit, even though row 1 is the one on screen.
    assert.ok(widths.name > buildRawColumnWidths([rows[0]], columns, {}).name);
    // A timestamp that fits exactly must not land a fraction of a pixel short and get ellipsized.
    const stamp = "2026-07-29 16:00:16.165";
    assert.ok(widths.time > stamp.length * 8.401 + 32);
    // Short columns never collapse below the floor, long ones never blow past the cap.
    assert.ok(widths.value >= 90);
    assert.ok(buildRawColumnWidths([{ name: "x".repeat(500) }], [{ key: "name", label: "Name" }], {}).name <= 640);
    // A full OPC UA path is ordinary content, so it must fit rather than hit the cap.
    const longPath = "Simulation_Examples_Functions__System__Description";
    const pathWidth = buildRawColumnWidths([{ name: longPath }], [{ key: "name", label: "Name" }], { extra: { name: 15 } }).name;
    assert.ok(pathWidth > longPath.length * 8.401);
});

test("buildSeriesColorMap keeps a tag's colour when it is split into its own panel", () => {
    const mainPanel = ["Ramp1", "Ramp2", "norm", "pwr"];
    const colors = buildSeriesColorMap(mainPanel);

    // A split panel renders one series; without the shared map it would take the first colour.
    const splitColors = buildSeriesColorMap(["pwr"]);
    assert.notEqual(colors.pwr, splitColors.pwr);
    assert.equal(colors.pwr, buildSeriesColorMap(mainPanel).pwr);
    assert.equal(new Set(Object.values(colors)).size, mainPanel.length);
});

test("buildRawRowNameColors ignores blank names and non-array input", () => {
    assert.deepEqual(buildRawRowNameColors(null), {});
    assert.deepEqual(Object.keys(buildRawRowNameColors([{ name: "" }, { value: 1 }, { name: "a" }])), ["a"]);
});

test("buildDerivedTagRows marks derived tags as flat depth-0 rows", () => {
    const rows = buildDerivedTagRows([
        { name: "power", expression: "A * B" },
        { name: "norm", expression: "sqrt(A)" },
    ]);

    assert.deepEqual(rows.map((row) => [row.type, row.depth, row.label, row.derived]), [
        ["tag", 0, "power", true],
        ["tag", 0, "norm", true],
    ]);
    assert.deepEqual(rows.map((row) => row.tag.name), ["power", "norm"]);
});

test("buildDerivedTagRows skips names already listed as source tags", () => {
    const rows = buildDerivedTagRows([{ name: "power" }, { name: "norm" }], ["power"]);

    assert.deepEqual(rows.map((row) => row.label), ["norm"]);
});

test("buildDerivedTagRows ignores blank, duplicate, and non-array input", () => {
    assert.deepEqual(buildDerivedTagRows(null), []);
    assert.deepEqual(buildDerivedTagRows(undefined), []);
    assert.deepEqual(
        buildDerivedTagRows([{ name: "  " }, { name: "power" }, { name: "power" }, {}]).map((row) => row.label),
        ["power"]
    );
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

test("getDataViewerRawPageSize uses configurable rows per selected tag", () => {
    assert.equal(getDataViewerRawPageSize(["sensor.a"]), 500);
    assert.equal(getDataViewerRawPageSize(["sensor.a", "sensor.b", "sensor.c"]), 1500);
    assert.equal(getDataViewerRawPageSize([]), 500);
    assert.equal(getDataViewerRawPageSize(["sensor.a"], 100), 100);
    assert.equal(getDataViewerRawPageSize(["sensor.a", "sensor.b", "sensor.c"], 100), 300);
    assert.equal(getDataViewerRawPageSize([], 100), 100);
});

test("normalizeDataViewerRowsPerTag keeps positive integer values", () => {
    assert.equal(normalizeDataViewerRowsPerTag("100", 1000), 100);
    assert.equal(normalizeDataViewerRowsPerTag("100.9", 1000), 100);
    assert.equal(normalizeDataViewerRowsPerTag("", 1000), 1000);
    assert.equal(normalizeDataViewerRowsPerTag("0", 1000), 1000);
    assert.equal(normalizeDataViewerRowsPerTag("abc", 1000), 1000);
});

test("buildDataViewerRawRowsPerTagChange resets raw paging to page one", () => {
    assert.deepEqual(
        buildDataViewerRawRowsPerTagChange({
            value: "100",
            currentRowsPerTag: 1000,
            selectedTagNames: ["sensor.a", "sensor.b", "sensor.c"],
        }),
        {
            rowsPerTag: 100,
            pageSize: 300,
            page: 1,
            rawPageRequest: { page: 1 },
        }
    );
    assert.equal(
        buildDataViewerRawRowsPerTagChange({
            value: "0",
            currentRowsPerTag: 1000,
            selectedTagNames: ["sensor.a"],
        }),
        null
    );
});

test("buildDataViewerRawPageBounds returns first, last, and time range for the current page", () => {
    assert.deepEqual(
        buildDataViewerRawPageBounds([
            { time: "2026-06-25T05:10:01.001Z", name: "sensor.a" },
            { time: "2026-06-25T05:09:58.534Z", name: "sensor.b" },
            { time: "2026-06-25T05:09:56.100Z", name: "sensor.a" },
        ]),
        {
            pageStart: { time: "2026-06-25T05:10:01.001Z", name: "sensor.a" },
            pageEnd: { time: "2026-06-25T05:09:56.100Z", name: "sensor.a" },
            pageBounds: {
                from: "2026-06-25T05:09:56.100Z",
                to: "2026-06-25T05:10:01.001Z",
            },
        }
    );

    assert.equal(buildDataViewerRawPageBounds([{ time: "", name: "sensor.a" }]), null);
});

test("buildDataViewerRawPageRequest uses cursor boundaries for page movement", () => {
    const currentBounds = {
        pageStart: { time: "2026-06-25T05:10:01.001Z", name: "sensor.a" },
        pageEnd: { time: "2026-06-25T05:09:56.100Z", name: "sensor.c" },
        pageBounds: {
            from: "2026-06-25T05:09:56.100Z",
            to: "2026-06-25T05:10:01.001Z",
        },
    };

    assert.deepEqual(
        buildDataViewerRawPageRequest({
            currentPage: 1,
            nextPage: 2,
            pageSize: 3000,
            currentBounds,
            reason: "page",
        }),
        {
            page: 2,
            cursorSide: "next",
            cursorTime: "2026-06-25T05:09:56.100Z",
            cursorName: "sensor.c",
            cursorOffset: 0,
        }
    );

    assert.deepEqual(
        buildDataViewerRawPageRequest({
            currentPage: 1,
            nextPage: 3,
            pageSize: 3000,
            currentBounds,
            reason: "page",
        }),
        {
            page: 3,
        }
    );

    assert.deepEqual(
        buildDataViewerRawPageRequest({
            currentPage: 3,
            nextPage: 2,
            pageSize: 3000,
            currentBounds,
            reason: "page",
        }),
        {
            page: 2,
            cursorSide: "prev",
            cursorTime: "2026-06-25T05:10:01.001Z",
            cursorName: "sensor.a",
            cursorOffset: 0,
        }
    );

    assert.deepEqual(
        buildDataViewerRawPageRequest({
            currentPage: 3,
            nextPage: 3,
            pageSize: 3000,
            currentBounds,
            reason: "tags",
        }),
        {
            page: 3,
            from: "2026-06-25T05:09:56.100Z",
            to: "2026-06-25T05:10:01.001Z",
            boundedRange: true,
        }
    );
});

test("buildDataViewerDefaultChartShiftRawPageUpdate maps chart movement through raw scan direction", () => {
    const currentBounds = {
        pageStart: { time: "2026-06-01T00:00:00.000Z", name: "sensor.a" },
        pageEnd: { time: "2026-06-01T00:10:00.000Z", name: "sensor.a" },
        pageBounds: {
            from: "2026-06-01T00:00:00.000Z",
            to: "2026-06-01T00:10:00.000Z",
        },
    };

    assert.deepEqual(
        buildDataViewerDefaultChartShiftRawPageUpdate({
            direction: "backward",
            backwardScan: true,
            currentPage: 2,
            pageSize: 1000,
            currentBounds,
        }),
        {
            page: 3,
            rawPageRequest: {
                page: 3,
                cursorSide: "next",
                cursorTime: "2026-06-01T00:10:00.000Z",
                cursorName: "sensor.a",
                cursorOffset: 0,
            },
        }
    );

    assert.deepEqual(
        buildDataViewerDefaultChartShiftRawPageUpdate({
            direction: "forward",
            backwardScan: true,
            currentPage: 2,
            pageSize: 1000,
            currentBounds,
        }),
        {
            page: 1,
            rawPageRequest: {
                page: 1,
                cursorSide: "prev",
                cursorTime: "2026-06-01T00:00:00.000Z",
                cursorName: "sensor.a",
                cursorOffset: 0,
            },
        }
    );

    assert.deepEqual(
        buildDataViewerDefaultChartShiftRawPageUpdate({
            direction: "forward",
            backwardScan: false,
            currentPage: 2,
            pageSize: 1000,
            currentBounds,
        })?.page,
        3
    );

    assert.deepEqual(
        buildDataViewerDefaultChartShiftRawPageUpdate({
            direction: "backward",
            backwardScan: false,
            currentPage: 2,
            pageSize: 1000,
            currentBounds,
        })?.page,
        1
    );

    assert.equal(
        buildDataViewerDefaultChartShiftRawPageUpdate({
            direction: "forward",
            backwardScan: true,
            currentPage: 1,
            pageSize: 1000,
            currentBounds,
        }),
        null
    );

    assert.equal(
        buildDataViewerDefaultChartShiftRawPageUpdate({
            direction: "backward",
            backwardScan: true,
            currentPage: 2,
            pageSize: 1000,
            rowCount: 999,
            currentBounds,
        }),
        null
    );
});

test("hasDataViewerRawNextPage opens next page during bounded tag refresh", () => {
    assert.equal(
        hasDataViewerRawNextPage({
            rowCount: 100,
            pageSize: 2000,
            forceOpen: false,
        }),
        false
    );
    assert.equal(
        hasDataViewerRawNextPage({
            rowCount: 100,
            pageSize: 2000,
            forceOpen: true,
        }),
        true
    );
});

test("toggleSelectedTagName removes existing tags or appends new tags", () => {
    assert.deepEqual(toggleSelectedTagName(["sensor.a", "sensor.b"], "sensor.a"), ["sensor.b"]);
    assert.deepEqual(toggleSelectedTagName(["sensor.a"], "sensor.b"), ["sensor.a", "sensor.b"]);
});

test("buildDataViewerTagSelectionUpdate preserves chart ranges while refreshing raw rows", () => {
    const update = buildDataViewerTagSelectionUpdate({
        selectedTagNames: ["sensor.a"],
        tagName: "sensor.b",
        currentPage: 3,
        currentBounds: {
            pageBounds: {
                from: "2026-06-01T00:00:00.000Z",
                to: "2026-06-01T00:10:00.000Z",
            },
        },
    });

    assert.deepEqual(update.selectedTagNames, ["sensor.a", "sensor.b"]);
    assert.deepEqual(update.rawPageRequest, {
        page: 3,
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-01T00:10:00.000Z",
        boundedRange: true,
    });
    assert.equal(update.preserveChartRanges, true);
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

test("resolveTagNodes prefers DB tag names over collector nodes when the payload is JSON keyed", () => {
    // A JSON value column stores one row per cycle keyed by the collector name, so the configured
    // node names match no row and would make the query come back empty.
    const configuredNodes = [
        { name: "Temperature", nodeId: "ns=1;s=Plant1.Line1.Temperature" },
        { name: "Pressure", nodeId: "ns=1;s=Plant1.Line1.Pressure" },
    ];
    const tableTags = [{ name: "collector-a" }];

    assert.deepEqual(
        resolveTagNodes(configuredNodes, tableTags, { payloadKeyedNodes: true }),
        [{ name: "collector-a" }]
    );
});

test("resolveTagNodes keeps collector nodes when the payload is not JSON keyed", () => {
    const configuredNodes = [{ name: "Temperature", nodeId: "ns=1;s=Plant1.Line1.Temperature" }];
    const tableTags = [{ name: "Temperature" }, { name: "Pressure" }];

    assert.deepEqual(resolveTagNodes(configuredNodes, tableTags), configuredNodes);
    assert.deepEqual(
        resolveTagNodes(configuredNodes, tableTags, { payloadKeyedNodes: false }),
        configuredNodes,
        "an explicit false behaves like the default"
    );
});

test("resolveTagNodes still falls back to DB tag names when JSON keyed and nodes are empty", () => {
    assert.deepEqual(
        resolveTagNodes([], [{ name: "collector-a", dataType: "JSON" }], { payloadKeyedNodes: true }),
        [{ name: "collector-a", dataType: "JSON" }]
    );
});










test("buildPayloadKeyRows nests configured keys under the collector row", () => {
    const rows = buildPayloadKeyRows({
        collectorName: "collector-a",
        configuredNodes: [
            { name: "Plant1.Line1.Temperature", dataType: "Double" },
            { name: "power" },
        ],
        derivedTags: [{ name: "derived1" }],
    });

    assert.equal(rows[0].type, "folder");
    assert.equal(rows[0].label, "collector-a");
    assert.equal(rows[0].depth, 0);

    assert.deepEqual(rows.slice(1).map((row) => row.label), [
        "Plant1.Line1.Temperature",
        "power",
        "derived1",
    ], "config order is preserved");

    assert.ok(rows.slice(1).every((row) => row.depth === 1 && row.ancestorKeys[0] === rows[0].key));
    assert.equal(rows[1].tag.dataType, "Double");
    assert.equal(rows[3].derived, true);
    assert.equal(rows[1].tag.name, "collector-a / Plant1.Line1.Temperature",
        "a dotted key survives inside the pair identity");
});





test("buildPayloadKeyRows dedupes a name that is both a node and a derived tag", () => {
    const rows = buildPayloadKeyRows({
        collectorName: "c",
        configuredNodes: [{ name: "dup" }],
        derivedTags: [{ name: "dup" }],
    });

    assert.equal(rows.filter((row) => row.type === "tag").length, 1);
});

test("buildPayloadKeyRows still renders the collector row with no keys at all", () => {
    const rows = buildPayloadKeyRows({ collectorName: "collector-a" });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, "folder");
});








test("toTagAnalyzerJsonKey wraps keys in brackets so dots stay literal", () => {
    // Verified against a live Machbase: $[a.b] reads the literal key, $.a.b traverses nesting.
    assert.deepEqual(toTagAnalyzerJsonKey("Plant1.Line1.Temperature"), {
        ok: true,
        path: "[Plant1.Line1.Temperature]",
    });
    assert.deepEqual(toTagAnalyzerJsonKey("  power  "), { ok: true, path: "[power]" });
});

test("toTagAnalyzerJsonKey refuses keys it cannot address", () => {
    assert.equal(toTagAnalyzerJsonKey("").ok, false);
    assert.equal(toTagAnalyzerJsonKey(undefined).ok, false);

    const bracket = toTagAnalyzerJsonKey("we]rd");
    assert.equal(bracket.ok, false, "a closing bracket cannot be escaped in a json path");
    assert.match(bracket.reason, /\]/);

    const long = toTagAnalyzerJsonKey("x".repeat(255));
    assert.equal(long.ok, false, "neo-web silently truncates over 256 chars, which would repoint the path");
});

test("buildNeoWebTagAnalyzerMessage maps each payload key to its own series", () => {
    const built = buildNeoWebTagAnalyzerMessage({
        table: "JSONTEST",
        // The viewer selects (record, key) pairs, which is what reaches the builder.
        tagNames: [
            encodePayloadKeyId("collector-a", "Plant1.Line1.Temperature"),
            encodePayloadKeyId("collector-a", "power"),
        ],
        valueColumn: "PAYLOAD",
        jsonValueColumn: true,
        collectorName: "collector-a",
    });

    assert.equal(built.ok, true);
    const tags = built.message.payload.tags;
    assert.equal(tags.length, 2, "two keys must not collapse into one tag");
    assert.deepEqual(tags.map((tag) => tag.tagName), ["collector-a", "collector-a"]);
    assert.deepEqual(tags.map((tag) => tag.colName.jsonKey), ["[Plant1.Line1.Temperature]", "[power]"]);
    assert.deepEqual(tags.map((tag) => tag.alias), ["Plant1.Line1.Temperature", "power"],
        "without an alias every series would be labelled PAYLOAD -> ...");
    assert.equal(tags[0].colName.value, "PAYLOAD");
});

test("buildNeoWebTagAnalyzerMessage strips the record before building the json path", () => {
    // Wrapping the whole "record / key" pair asks for a key that does not exist, and the series comes
    // back empty with no error anywhere — the one place this bridge can fail silently.
    const built = buildNeoWebTagAnalyzerMessage({
        table: "JSON_TEST",
        tagNames: [encodePayloadKeyId("LINE_01", "Simulation_Examples_Functions_Random1")],
        valueColumn: "JV",
        jsonValueColumn: true,
        collectorName: "LINE_01",
    });

    const tag = built.message.payload.tags[0];
    assert.equal(tag.colName.jsonKey, "[Simulation_Examples_Functions_Random1]",
        "the record must not appear inside the json path");
    assert.equal(tag.tagName, "LINE_01", "the record is the tag name instead");
    assert.equal(tag.alias, "Simulation_Examples_Functions_Random1",
        "the legend reads as the key, not the pair");
});

test("buildNeoWebTagAnalyzerMessage keeps scalar behaviour untouched", () => {
    const built = buildNeoWebTagAnalyzerMessage({
        table: "TAGDATA",
        tagNames: ["sensor.a", "sensor.b"],
    });

    assert.equal(built.ok, true);
    const tags = built.message.payload.tags;
    assert.deepEqual(tags.map((tag) => tag.tagName), ["sensor.a", "sensor.b"]);
    assert.deepEqual(tags.map((tag) => tag.colName.jsonKey), ["", ""]);
    assert.deepEqual(tags.map((tag) => tag.alias), ["", ""]);
});

test("buildNeoWebTagAnalyzerMessage refuses more keys than neo-web accepts", () => {
    const keys = Array.from({ length: TAG_ANALYZER_MAX_TAGS + 1 }, (_, i) => `k${i}`);
    const built = buildNeoWebTagAnalyzerMessage({
        table: "JSONTEST",
        tagNames: keys,
        jsonValueColumn: true,
        collectorName: "collector-a",
    });

    // neo-web rejects the entire payload past the limit, so sending it would just fail silently.
    assert.equal(built.ok, false);
    assert.match(built.reason, /up to 12 keys/);

    const atLimit = buildNeoWebTagAnalyzerMessage({
        table: "JSONTEST",
        tagNames: keys.slice(0, TAG_ANALYZER_MAX_TAGS),
        jsonValueColumn: true,
        collectorName: "collector-a",
    });
    assert.equal(atLimit.ok, true, "exactly at the limit is fine");
});

test("buildNeoWebTagAnalyzerMessage needs the collector name and rejects unaddressable keys", () => {
    assert.equal(buildNeoWebTagAnalyzerMessage({
        table: "JSONTEST", tagNames: ["a"], jsonValueColumn: true, collectorName: "",
    }).ok, false);

    const bad = buildNeoWebTagAnalyzerMessage({
        table: "JSONTEST", tagNames: ["ok", "we]rd"], jsonValueColumn: true, collectorName: "c",
    });
    assert.equal(bad.ok, false, "one unaddressable key fails the whole handoff rather than dropping it");
});




test("splitPayloadKeySelection recovers records by matching, not by splitting", () => {
    const records = ["a", "a / b"];
    // "a / b / k" is ambiguous when split naively; the longer record wins.
    assert.deepEqual(
        splitPayloadKeySelection(["a / b / k"], records),
        { records: ["a / b"], keys: ["k"] }
    );
    // A key containing the separator survives too.
    assert.deepEqual(
        splitPayloadKeySelection(["a / x / y"], ["a"]),
        { records: ["a"], keys: ["x / y"] }
    );
    assert.deepEqual(
        splitPayloadKeySelection(["r1 / k1", "r2 / k1", "r1 / k2"], ["r1", "r2"]),
        { records: ["r1", "r2"], keys: ["k1", "k2"] },
        "the query asks for every selected record and key"
    );
    assert.deepEqual(splitPayloadKeySelection([], ["r"]), { records: [], keys: [] });
});

test("expandProjectedRows emits only the selected pairs, keyed by record and key", () => {
    // The query returns the cross product of the selected records and keys, which is a superset.
    const rows = [
        { time: "t1", name: "r1", values: [1, 2] },
        { time: "t1", name: "r2", values: [3, 4] },
    ];
    const selected = ["r1 / a", "r2 / b"];

    assert.deepEqual(expandProjectedRows(rows, ["a", "b"], selected), [
        { time: "t1", name: "r1 / a", value: 1 },
        { time: "t1", name: "r2 / b", value: 4 },
    ], "the unticked pairs r1/b and r2/a are dropped");

    // The raw grid builds its columns from the row's own keys, so the transport array must not ride
    // along or every row grows a "Values" column holding the whole projection.
    assert.ok(
        expandProjectedRows(rows, ["a", "b"], selected).every((row) => !("values" in row)),
        "the projection array is consumed, not forwarded"
    );
});

test("expandProjectedRows keeps falsy values and pads a short projection", () => {
    const rows = [{ time: "t1", name: "r", values: [0, false, null] }];
    const out = expandProjectedRows(rows, ["zero", "off", "nil", "missing"]);

    assert.deepEqual(out.map((row) => [row.name, row.value]), [
        ["r / zero", 0], ["r / off", false], ["r / nil", null], ["r / missing", null],
    ]);
    assert.deepEqual(expandProjectedRows(rows, []), [], "no keys means no rows");
    assert.deepEqual(expandProjectedRows(undefined, ["a"]), []);
});

test("encodePayloadKeyId matches what the tree and the expander both produce", () => {
    assert.equal(encodePayloadKeyId("rec", "key"), "rec / key");
    assert.equal(encodePayloadKeyId("  rec  ", "  key  "), "rec / key");
});



test("buildTagRowTree nests rows so each folder bounds its own subtree", () => {
    // A sticky header is bounded by its parent, so the nesting is what makes a folder slide away
    // only when its subtree does.
    const rows = [
        { type: "folder", key: "f:a", label: "Plant1", depth: 0 },
        { type: "folder", key: "f:a/b", label: "Line1", depth: 1 },
        { type: "tag", key: "t:temp", label: "Temperature", depth: 2 },
        { type: "tag", key: "t:pres", label: "Pressure", depth: 2 },
        { type: "folder", key: "f:c", label: "Plant2", depth: 0 },
        { type: "tag", key: "t:flow", label: "Flow", depth: 1 },
    ];

    const tree = buildTagRowTree(rows);
    assert.deepEqual(tree.map((n) => n.row.label), ["Plant1", "Plant2"]);
    assert.deepEqual(tree[0].children.map((n) => n.row.label), ["Line1"]);
    assert.deepEqual(tree[0].children[0].children.map((n) => n.row.label), ["Temperature", "Pressure"]);
    assert.deepEqual(tree[1].children.map((n) => n.row.label), ["Flow"]);
});

test("buildTagRowTree keeps a flat list flat and tolerates bad input", () => {
    const flat = [
        { type: "tag", key: "a", depth: 0 },
        { type: "tag", key: "b", depth: 0 },
    ];
    assert.equal(buildTagRowTree(flat).length, 2);
    assert.equal(buildTagRowTree(flat)[0].children.length, 0);

    assert.deepEqual(buildTagRowTree([]), []);
    assert.deepEqual(buildTagRowTree(undefined), []);

    // A depth that jumps past its parent still lands somewhere rather than being dropped.
    const jumped = buildTagRowTree([
        { type: "folder", key: "f", depth: 0 },
        { type: "tag", key: "t", depth: 5 },
    ]);
    assert.equal(jumped.length, 1);
    assert.equal(jumped[0].children.length, 1);
});

test("buildPayloadKeyRows lists only this collector's own record", () => {
    // The keys can only come from THIS collector's config, so putting them under another job's
    // record would show that job's data with the wrong key list.
    const rows = buildPayloadKeyRows({
        collectorName: "line2",
        configuredNodes: [
            { name: "Random1", nodeId: "ns=2;s=Simulation Examples.Functions.Random1", treePath: ["Simulation Examples", "Functions", "Random1"] },
            { name: "Sine1", nodeId: "ns=2;s=Simulation Examples.Functions.Sine1" },
        ],
        derivedTags: [{ name: "derived1" }],
    });

    assert.deepEqual(rows.map((row) => `${"  ".repeat(row.depth)}${row.label}`), [
        "line2",
        "  Random1",
        "  Sine1",
        "  derived1",
    ], "one record, then its keys — no other record and no path folders");

    assert.equal(rows.filter((row) => row.type === "folder").length, 1);
    assert.ok(rows.every((row) => row.depth <= 1), "never deeper than two levels");
    assert.ok(!rows.some((row) => row.label === "Functions"), "the node path contributes no rows");

    // The nodeId travels as provenance on the row rather than as structure.
    assert.equal(rows[1].tag.nodeId, "ns=2;s=Simulation Examples.Functions.Random1");
    assert.deepEqual(rows.slice(1).map((row) => row.tag.name), [
        "line2 / Random1", "line2 / Sine1", "line2 / derived1",
    ]);
    assert.equal(rows[3].derived, true);
});

test("buildPayloadKeyRows gives two same-named nodes a single leaf", () => {
    // The payload is a flat map, so nodes sharing a name are one key. Two leaves would put two rows
    // on one identity and ticking either would tick both.
    const rows = buildPayloadKeyRows({
        collectorName: "r",
        configuredNodes: [
            { name: "Random1", treePath: ["Plant", "Functions", "Random1"] },
            { name: "Random1", treePath: ["Plant", "System", "Random1"] },
        ],
        records: ["r"],
    });

    const leaves = rows.filter((row) => row.type === "tag");
    assert.equal(leaves.length, 1);
    assert.equal(leaves[0].tag.name, "r / Random1");
    assert.ok(!rows.some((row) => row.label === "System"), "the losing path contributes no folder");
});

test("buildTagChartSeries uses real time values and sorts points by time", () => {
    const series = buildTagChartSeries([
        { time: "2026-06-04T10:02:00Z", name: "sensor.a", value: "12.5" },
        { time: "2026-06-04T10:00:00Z", name: "sensor.a", value: "10.5" },
        { time: "bad-time", name: "sensor.a", value: "99" },
        { time: "2026-06-04T10:01:00Z", name: "sensor.a", value: "not-number" },
        { TIME: "2026-06-04T10:03:00Z", NAME: "sensor.b", VALUE: "20.5" },
    ]);

    assert.equal(series.length, 2);
    assert.equal(series[0].name, "sensor.a");
    assert.deepEqual(series[0].data, [
        [Date.parse("2026-06-04T10:00:00Z"), 10.5],
        [Date.parse("2026-06-04T10:02:00Z"), 12.5],
    ]);
    assert.equal(series[1].name, "sensor.b");
    assert.deepEqual(series[1].data, [
        [Date.parse("2026-06-04T10:03:00Z"), 20.5],
    ]);
});

test("buildTagChartSeries charts booleans as 1/0 but drops non-numeric text", () => {
    // boolean 복원은 서버(projectedValue)가 한다 — 여기서 "true"/"false" 문자열을 숫자로 바꾸면
    // 이 함수를 공유하는 스칼라 collector 까지 영향을 받는다. STR_VALUE 에 "false" 를 담는
    // stringOnly collector 가 시리즈 없음에서 0 을 그리는 쪽으로 조용히 바뀌기 때문이다.
    const series = buildTagChartSeries([
        { time: "2026-06-04T10:00:00Z", name: "c1 / flag", value: true },
        { time: "2026-06-04T10:01:00Z", name: "c1 / flag", value: false },
        { time: "2026-06-04T10:02:00Z", name: "c1 / note", value: "false" },
    ]);

    assert.equal(series.length, 1);
    assert.equal(series[0].name, "c1 / flag");
    assert.deepEqual(series[0].data, [
        [Date.parse("2026-06-04T10:00:00Z"), 1],
        [Date.parse("2026-06-04T10:01:00Z"), 0],
    ]);
});

test("buildTagChartSeries still charts numeric strings and drops non-numeric ones", () => {
    // 그리드가 "007" 을 그대로 보여줘야 해서 서버가 변환을 안 한다. 숫자로 만드는 건 여기뿐이고,
    // 진짜 문자열 값은 예전처럼 차트에서 빠진다.
    const series = buildTagChartSeries([
        { time: "2026-06-04T10:00:00Z", name: "c1 / serial", value: "007" },
        { time: "2026-06-04T10:01:00Z", name: "c1 / label", value: "hi" },
        { time: "2026-06-04T10:02:00Z", name: "c1 / gap", value: null },
    ]);

    assert.deepEqual(series.map((one) => one.name), ["c1 / serial"]);
    assert.deepEqual(series[0].data, [[Date.parse("2026-06-04T10:00:00Z"), 7]]);
});

test("buildDataViewerChartResultsFromRawRows builds chart groups from visible raw rows", () => {
    const rows = [
        { TIME: "2026-06-25T05:10:00.000Z", NAME: "sensor.a", VALUE: 1 },
        { time: "2026-06-25T05:10:01.000Z", name: "sensor.b", value: 2 },
        { time: "2026-06-25T05:10:02.000Z", name: "sensor.a", value: 3 },
    ];
    const chartGroups = [
        { id: "default", title: "Selected Tags", tagNames: ["sensor.a", "sensor.b"], range: { from: "raw-from", to: "raw-to" }, split: false },
        { id: "split:a", title: "sensor.a", tagNames: ["sensor.a"], range: { from: "split-from", to: "split-to" }, split: true },
    ];

    assert.deepEqual(buildDataViewerChartResultsFromRawRows({ rows, chartGroups }), {
        default: {
            range: { from: "raw-from", to: "raw-to" },
            series: [
                { name: "sensor.a", data: [[Date.parse("2026-06-25T05:10:00.000Z"), 1], [Date.parse("2026-06-25T05:10:02.000Z"), 3]] },
                { name: "sensor.b", data: [[Date.parse("2026-06-25T05:10:01.000Z"), 2]] },
            ],
        },
        "split:a": {
            range: { from: "split-from", to: "split-to" },
            series: [
                { name: "sensor.a", data: [[Date.parse("2026-06-25T05:10:00.000Z"), 1], [Date.parse("2026-06-25T05:10:02.000Z"), 3]] },
            ],
        },
    });
});

test("buildDataViewerChartResultsFromRawRows can use split specific raw rows", () => {
    const parentRows = [
        { time: "2026-06-25T05:10:00.000Z", name: "sensor.a", value: 1 },
        { time: "2026-06-25T05:10:01.000Z", name: "sensor.b", value: 2 },
    ];
    const splitRows = [
        { time: "2026-06-25T05:20:00.000Z", name: "sensor.a", value: 10 },
    ];
    const chartGroups = [
        { id: "default", title: "Selected Tags", tagNames: ["sensor.a", "sensor.b"], range: { from: "parent-from", to: "parent-to" }, split: false },
        { id: "split:a", title: "sensor.a", tagNames: ["sensor.a"], range: { from: "split-from", to: "split-to" }, split: true },
    ];

    const results = buildDataViewerChartResultsFromRawRows({
        rows: parentRows,
        rowsByGroup: {
            "split:a": splitRows,
        },
        chartGroups,
    });

    assert.deepEqual(results.default.series.find((item) => item.name === "sensor.a").data, [
        [Date.parse("2026-06-25T05:10:00.000Z"), 1],
    ]);
    assert.deepEqual(results["split:a"].series[0].data, [
        [Date.parse("2026-06-25T05:20:00.000Z"), 10],
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
            tagNames: ["sensor.a", "sensor.b", "sensor.c", "sensor.d"],
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

test("buildDataViewerChartGroups keeps split tags in the default chart", () => {
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
            tagNames: ["sensor.a", "sensor.b"],
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

test("buildDataViewerChartGroups keeps the default chart when every tag is split", () => {
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
            id: "default",
            title: "Selected Tags",
            tagNames: ["sensor.a", "sensor.b"],
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

test("buildDataViewerSplitRangeUpdate preserves display ranges without seeding split ranges", () => {
    const update = buildDataViewerSplitRangeUpdate({
        nextGroups: [
            { id: "split:a", title: "sensor.a", tagNames: ["sensor.a"] },
            { id: "split:b", title: "sensor.b", tagNames: ["sensor.b"] },
        ],
        chartViewRanges: {
            default: { startTime: 1000, endTime: 2000 },
            "split:old": { startTime: 3000, endTime: 4000 },
        },
        chartNavigatorRanges: {
            default: { startTime: 0, endTime: 5000 },
            "split:old": { startTime: 2500, endTime: 4500 },
        },
        splitRanges: {
            "split:old": { startTime: 2500, endTime: 4500 },
        },
    });

    assert.deepEqual(update, {
        chartViewRanges: {
            default: { startTime: 1000, endTime: 2000 },
            "split:old": { startTime: 3000, endTime: 4000 },
            "split:a": { startTime: 1000, endTime: 2000 },
            "split:b": { startTime: 1000, endTime: 2000 },
        },
        chartNavigatorRanges: {
            default: { startTime: 0, endTime: 5000 },
            "split:old": { startTime: 2500, endTime: 4500 },
            "split:a": { startTime: 0, endTime: 5000 },
            "split:b": { startTime: 0, endTime: 5000 },
        },
        splitRanges: {
            "split:old": { startTime: 2500, endTime: 4500 },
        },
    });
});

test("buildDataViewerGlobalTimeUpdate uses the source chart time and display ranges globally", () => {
    const update = buildDataViewerGlobalTimeUpdate({
        sourceGroupId: "split:b",
        chartGroups: [
            { id: "default", title: "Selected Tags", tagNames: ["sensor.a"], range: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" }, split: false },
            { id: "split:b", title: "sensor.b", tagNames: ["sensor.b"], range: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" }, split: true },
            { id: "split:c", title: "sensor.c", tagNames: ["sensor.c"], range: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" }, split: true },
        ],
        chartViewRanges: {
            "split:b": { from: "2026-06-01T00:10:00.000Z", to: "2026-06-01T00:20:00.000Z" },
        },
        chartNavigatorRanges: {
            "split:b": { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" },
        },
        chartResults: {
            "split:b": { range: { from: "2026-06-01T00:05:00.000Z", to: "2026-06-01T00:25:00.000Z" } },
        },
    });

    assert.deepEqual(update, {
        range: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" },
        splitRanges: {
            "split:b": { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" },
            "split:c": { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" },
        },
        viewRanges: {
            default: { from: "2026-06-01T00:10:00.000Z", to: "2026-06-01T00:20:00.000Z" },
            "split:b": { from: "2026-06-01T00:10:00.000Z", to: "2026-06-01T00:20:00.000Z" },
            "split:c": { from: "2026-06-01T00:10:00.000Z", to: "2026-06-01T00:20:00.000Z" },
        },
        navigatorRanges: {
            default: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" },
            "split:b": { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" },
            "split:c": { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" },
        },
    });
});

test("buildDataViewerGlobalTimeUpdate falls back to query range and rejects unavailable global time", () => {
    const chartGroups = [
        { id: "split:a", title: "sensor.a", tagNames: ["sensor.a"], range: { from: "now-1h", to: "now" }, split: true },
        { id: "split:b", title: "sensor.b", tagNames: ["sensor.b"], range: { from: "now-1h", to: "now" }, split: true },
    ];

    assert.deepEqual(buildDataViewerGlobalTimeUpdate({
        sourceGroupId: "split:a",
        chartGroups,
        chartResults: {
            "split:a": { range: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" } },
        },
    }), {
        range: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" },
        splitRanges: {
            "split:a": { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" },
            "split:b": { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" },
        },
        viewRanges: {
            "split:a": { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" },
            "split:b": { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" },
        },
        navigatorRanges: {
            "split:a": { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" },
            "split:b": { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" },
        },
    });

    assert.equal(buildDataViewerGlobalTimeUpdate({ sourceGroupId: "only", chartGroups: [{ id: "only", range: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" }, split: false }] }), undefined);
    assert.equal(buildDataViewerGlobalTimeUpdate({ sourceGroupId: "split:a", chartGroups }), undefined);
});

test("buildNeoWebTagAnalyzerRange prefers explicit units and rejects invalid ranges", () => {
    assert.deepEqual(buildNeoWebTagAnalyzerRange({
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-01T01:00:00.000Z",
    }), {
        startIso: "2026-06-01T00:00:00.000Z",
        endIso: "2026-06-01T01:00:00.000Z",
    });
    assert.deepEqual(buildNeoWebTagAnalyzerRange({
        startEpochMs: 1000,
        endEpochMs: 2000,
    }), {
        startEpochMs: 1000,
        endEpochMs: 2000,
    });
    assert.deepEqual(buildNeoWebTagAnalyzerRange({
        startTime: Date.parse("2026-06-01T00:10:00.000Z"),
        endTime: Date.parse("2026-06-01T00:20:00.000Z"),
    }), {
        startEpochMs: Date.parse("2026-06-01T00:10:00.000Z"),
        endEpochMs: Date.parse("2026-06-01T00:20:00.000Z"),
    });
    assert.equal(buildNeoWebTagAnalyzerRange({ from: "bad", to: "2026-06-01T00:00:00.000Z" }), undefined);
    assert.equal(buildNeoWebTagAnalyzerRange({ from: 2000, to: 1000 }), undefined);
    assert.equal(buildNeoWebTagAnalyzerRange({ startTime: 2000, endTime: 1000 }), undefined);
});

test("buildNeoWebTagAnalyzerMessage builds chart-group scoped Tag Analyzer payload", () => {
    const built = buildNeoWebTagAnalyzerMessage({
        title: "Selected Tags",
        table: "TAG",
        tagNames: ["sensor.a", "sensor.b", "sensor.a", ""],
        range: {
            from: "2026-06-01T00:00:00.000Z",
            to: "2026-06-01T01:00:00.000Z",
        },
        valueColumn: "VALUE",
    });

    assert.equal(built.ok, true);
    assert.equal(built.message.source, "neo-package");
    assert.equal(built.message.type, "neo.openTagAnalyzer");
    assert.equal(built.message.version, 1);
    assert.equal(built.message.appName, "neo-pkg-opcua-client");
    assert.deepEqual(built.message.payload.range, {
        startIso: "2026-06-01T00:00:00.000Z",
        endIso: "2026-06-01T01:00:00.000Z",
    });
    assert.deepEqual(built.message.payload.tags.map((tag) => tag.tagName), ["sensor.a", "sensor.b"]);
    assert.deepEqual(built.message.payload.tags[0], {
        tagName: "sensor.a",
        table: "TAG",
        calculationMode: "avg",
        alias: "",
        weight: 1,
        colName: {
            name: "NAME",
            time: "TIME",
            value: "VALUE",
            timeType: 6,
            timeBaseTime: true,
            jsonKey: "",
        },
    });
});

test("resolveTagAnalyzerKeyColumns reads the TAG key columns from the flags, not the names", () => {
    assert.deepEqual(
        resolveTagAnalyzerKeyColumns([
            { name: "TAG_ID", type: "VARCHAR(100)", primaryKey: true },
            { name: "TS", type: "DATETIME", basetime: true },
            { name: "READING", type: "DOUBLE", summarized: true },
        ]),
        { nameColumn: "TAG_ID", timeColumn: "TS" }
    );
    assert.deepEqual(
        resolveTagAnalyzerKeyColumns([
            { name: "NAME", type: "VARCHAR(100)", primaryKey: true },
            { name: "TIME", type: "DATETIME", basetime: true },
        ]),
        { nameColumn: "NAME", timeColumn: "TIME" }
    );
    assert.deepEqual(
        resolveTagAnalyzerKeyColumns([{ name: "VALUE", type: "DOUBLE", summarized: true }]),
        { nameColumn: "", timeColumn: "" },
        "unflagged columns leave the fallback to the message builder"
    );
    assert.deepEqual(resolveTagAnalyzerKeyColumns(undefined), { nameColumn: "", timeColumn: "" });
});

test("buildNeoWebTagAnalyzerMessage sends the table's real key columns", () => {
    const built = buildNeoWebTagAnalyzerMessage({
        table: "TAG",
        tagNames: ["sensor.a"],
        range: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" },
        valueColumn: "READING",
        nameColumn: "TAG_ID",
        timeColumn: "TS",
    });

    assert.equal(built.ok, true);
    assert.deepEqual(built.message.payload.tags[0].colName, {
        name: "TAG_ID",
        time: "TS",
        value: "READING",
        timeType: 6,
        timeBaseTime: true,
        jsonKey: "",
    });
});

test("buildNeoWebTagAnalyzerMessage falls back to NAME/TIME when the key columns are unknown", () => {
    const built = buildNeoWebTagAnalyzerMessage({
        table: "TAG",
        tagNames: ["sensor.a"],
        valueColumn: "VALUE",
        nameColumn: "",
        timeColumn: "",
    });

    assert.equal(built.ok, true);
    assert.equal(built.message.payload.tags[0].colName.name, "NAME");
    assert.equal(built.message.payload.tags[0].colName.time, "TIME");
});

test("buildNeoWebTagAnalyzerMessage rejects unsupported payloads", () => {
    assert.equal(buildNeoWebTagAnalyzerMessage({ table: "", tagNames: ["sensor.a"] }).ok, false);
    assert.equal(buildNeoWebTagAnalyzerMessage({ table: "TAG", tagNames: [] }).ok, false);
    assert.deepEqual(buildNeoWebTagAnalyzerMessage({ table: "TAG", tagNames: ["sensor.a"], stringOnly: true }), {
        ok: false,
        reason: "Tag Analyzer requires a numeric value column.",
    });
});

test("sendNeoWebTagAnalyzerMessage posts to the provided parent window", () => {
    const calls = [];
    const targetWindow = {
        postMessage: (message, origin) => calls.push({ message, origin }),
    };
    const message = { type: "neo.openTagAnalyzer" };

    assert.equal(sendNeoWebTagAnalyzerMessage(message, targetWindow, "http://127.0.0.1:5654"), true);
    assert.deepEqual(calls, [{ message, origin: "http://127.0.0.1:5654" }]);
    assert.equal(sendNeoWebTagAnalyzerMessage(null, targetWindow, "x"), false);
    assert.equal(sendNeoWebTagAnalyzerMessage(message, {}, "x"), false);
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
    assert.equal(option.toolbox.show, false);
});

test("buildDataViewerEChartOption keeps the plot size independent of the tag count", () => {
    // The legend is type "scroll": it stays on one line and paginates however many tags are
    // selected, so reserving vertical space per legend row only squashed the plot.
    const build = (count) => buildDataViewerEChartOption({
        series: Array.from({ length: count }, (_, index) => ({
            name: `sensor.${index}`,
            data: [[Date.parse("2026-06-01T00:00:00Z"), index]],
        })),
        timeRange: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T00:10:00.000Z" },
        timeZone: "UTC",
    });

    const few = build(2);
    const many = build(39);

    assert.equal(many.grid[0].top, few.grid[0].top);
    assert.equal(many.grid[0].height, few.grid[0].height);
    assert.equal(many.legend.type, "scroll");
    // The legend still gets a row to draw in, and never grows into the plot.
    assert.ok(many.legend.height > 0);
    assert.ok(many.legend.top + many.legend.height <= many.grid[0].top);
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

test("buildDataViewerEChartOption keeps explicit ranges when series is empty", () => {
    const option = buildDataViewerEChartOption({
        series: [],
        timeRange: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-01T01:00:00.000Z" },
        displayRange: { from: "2026-06-01T00:15:00.000Z", to: "2026-06-01T00:30:00.000Z" },
    });

    assert.equal(option.xAxis[0].min, Date.parse("2026-06-01T00:15:00.000Z"));
    assert.equal(option.xAxis[0].max, Date.parse("2026-06-01T00:30:00.000Z"));
    assert.equal(option.xAxis[1].min, Date.parse("2026-06-01T00:00:00.000Z"));
    assert.equal(option.xAxis[1].max, Date.parse("2026-06-01T01:00:00.000Z"));
    assert.equal(option.dataZoom[0].startValue, Date.parse("2026-06-01T00:15:00.000Z"));
    assert.equal(option.dataZoom[0].endValue, Date.parse("2026-06-01T00:30:00.000Z"));
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

test("buildDataViewerZoomControlRange matches Tag Analyzer zoom ratios within navigator bounds", () => {
    const currentRange = { startTime: 200, endTime: 600 };
    const navigatorRange = { startTime: 0, endTime: 1000 };

    assert.deepEqual(buildDataViewerZoomControlRange("zoom-in", currentRange, navigatorRange, 0.4), {
        startTime: 360,
        endTime: 440,
    });
    assert.deepEqual(buildDataViewerZoomControlRange("zoom-out", currentRange, navigatorRange, 0.2), {
        startTime: 120,
        endTime: 680,
    });
    assert.deepEqual(buildDataViewerZoomControlRange("focus", currentRange, navigatorRange), {
        startTime: 360,
        endTime: 440,
    });
    assert.deepEqual(buildDataViewerZoomControlRange("pan-left", currentRange, navigatorRange), {
        startTime: 0,
        endTime: 400,
    });
    assert.deepEqual(buildDataViewerZoomControlRange("pan-right", currentRange, navigatorRange), {
        startTime: 400,
        endTime: 800,
    });
});

test("buildDataViewerShiftMainRangeUpdate shifts visible main range like Tag Analyzer", () => {
    const currentRange = { startTime: 1000, endTime: 2000 };
    const navigatorRange = { startTime: 0, endTime: 3000 };

    assert.deepEqual(buildDataViewerShiftMainRangeUpdate({ direction: "backward", currentRange, navigatorRange }), {
        range: {
            from: new Date(100).toISOString(),
            to: new Date(1100).toISOString(),
        },
        navigatorRange: {
            from: new Date(-900).toISOString(),
            to: new Date(2100).toISOString(),
        },
    });
    assert.deepEqual(buildDataViewerShiftMainRangeUpdate({ direction: "forward", currentRange, navigatorRange }), {
        range: {
            from: new Date(1900).toISOString(),
            to: new Date(2900).toISOString(),
        },
        navigatorRange: {
            from: new Date(900).toISOString(),
            to: new Date(3900).toISOString(),
        },
    });
});

test("buildDataViewerShiftMainRangeUpdate moves the full navigator range for page navigation", () => {
    assert.deepEqual(
        buildDataViewerShiftMainRangeUpdate({
            direction: "backward",
            currentRange: { startTime: 1000, endTime: 2000 },
            navigatorRange: { startTime: 900, endTime: 2500 },
        }),
        {
            range: {
                from: new Date(520).toISOString(),
                to: new Date(1520).toISOString(),
            },
            navigatorRange: {
                from: new Date(420).toISOString(),
                to: new Date(2020).toISOString(),
            },
        }
    );
    assert.equal(buildDataViewerShiftMainRangeUpdate({ direction: "backward", currentRange: {}, navigatorRange: {} }), null);
});

test("buildDataViewerWheelZoomRange zooms around the pointer anchor", () => {
    const currentRange = { startTime: 200, endTime: 600 };
    const navigatorRange = { startTime: 0, endTime: 1000 };

    assert.deepEqual(buildDataViewerWheelZoomRange(-100, 300, currentRange, navigatorRange), {
        startTime: 218,
        endTime: 546,
    });
    assert.deepEqual(buildDataViewerWheelZoomRange(100, 300, currentRange, navigatorRange), {
        startTime: 178,
        endTime: 666,
    });
    assert.deepEqual(buildDataViewerWheelZoomRange(100, 200, { startTime: 0, endTime: 900 }, navigatorRange), {
        startTime: 0,
        endTime: 1000,
    });
});

test("buildDataViewerDragRangeUpdate zooms into a left-button drag range", () => {
    assert.deepEqual(
        buildDataViewerDragRangeUpdate({
            mode: "zoom-in",
            dragStartTime: 800,
            dragEndTime: 300,
            currentRange: { startTime: 0, endTime: 1000 },
            navigatorRange: { startTime: 0, endTime: 1000 },
        }),
        { startTime: 300, endTime: 800 }
    );
});

test("buildDataViewerDragRangeUpdate pans with middle-button drag inside navigator", () => {
    assert.deepEqual(
        buildDataViewerDragRangeUpdate({
            mode: "pan",
            dragStartTime: 500,
            dragEndTime: 650,
            currentRange: { startTime: 200, endTime: 800 },
            navigatorRange: { startTime: 0, endTime: 1000 },
        }),
        { startTime: 50, endTime: 650 }
    );
    assert.equal(
        buildDataViewerDragRangeUpdate({
            mode: "pan",
            dragStartTime: 500,
            dragEndTime: 650,
            currentRange: { startTime: 0, endTime: 1000 },
            navigatorRange: { startTime: 0, endTime: 1000 },
        }),
        undefined
    );
});

test("buildDataViewerDragRangeUpdate zooms out with right-button drag", () => {
    assert.deepEqual(
        buildDataViewerDragRangeUpdate({
            mode: "zoom-out",
            dragStartTime: 400,
            dragEndTime: 600,
            currentRange: { startTime: 200, endTime: 800 },
            navigatorRange: { startTime: 0, endTime: 1000 },
        }),
        { startTime: 100, endTime: 900 }
    );
    assert.deepEqual(
        buildDataViewerDragRangeUpdate({
            mode: "zoom-out",
            dragStartTime: 0,
            dragEndTime: 1000,
            currentRange: { startTime: 200, endTime: 800 },
            navigatorRange: { startTime: 0, endTime: 1000 },
        }),
        { startTime: 0, endTime: 1000 }
    );
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

test("formatDataViewerNavigatorRangeLabels renders mini chart boundary labels", () => {
    assert.deepEqual(
        formatDataViewerNavigatorRangeLabels(
            { startTime: Date.parse("2026-06-01T12:34:56.789Z"), endTime: Date.parse("2026-06-01T12:35:01.789Z") },
            "YYYY-MM-DD HH24:MI:SS.mmm",
            "UTC"
        ),
        {
            start: "2026-06-01 12:34:56",
            end: "2026-06-01 12:35:01",
        }
    );
    assert.deepEqual(formatDataViewerNavigatorRangeLabels({}, "YYYY-MM-DD HH24:MI:SS.mmm", "UTC"), { start: "", end: "" });
});

test("getDataViewerChartRangeMs prefers resolved query range over data extent", () => {
    const resolvedStart = Date.parse("2026-06-01T12:00:00.000Z");
    const resolvedEnd = Date.parse("2026-06-01T12:00:10.000Z");
    const points = [
        [Date.parse("2026-06-01T12:00:03.000Z"), 1],
        [Date.parse("2026-06-01T12:00:07.000Z"), 2],
    ];

    assert.deepEqual(
        getDataViewerChartRangeMs(points, {
            from: new Date(resolvedStart).toISOString(),
            to: new Date(resolvedEnd).toISOString(),
        }),
        {
            startTime: resolvedStart,
            endTime: resolvedEnd,
        }
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

test("resolveTimeRangeInput keeps last range end inclusive after precision loss", () => {
    const base = new Date("2026-07-07T16:18:09.016Z");

    assert.equal(resolveTimeRangeInput("last-5m", base, "from"), "2026-07-07T16:13:09.016Z");
    assert.equal(resolveTimeRangeInput("last", base, "to"), "2026-07-07T16:18:09.017Z");
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

test("formatTimeRangeLabel renders the pinned range in the selected time zone", () => {
    assert.equal(
        formatTimeRangeLabel("2026-06-01T00:34:56.789Z", "2026-06-01T00:35:01.789Z", "Asia/Seoul"),
        "2026-06-01 09:34:56 ~ 2026-06-01 09:35:01"
    );
});

test("DEFAULT_DATA_VIEWER_TIME_RANGE is a bounded last-1-hour window", () => {
    // Starting from an empty range leaves no bounded query window, so pagination has nothing to page against.
    assert.deepEqual(DEFAULT_DATA_VIEWER_TIME_RANGE, { from: "now-1h", to: "now" });
    assert.ok(DEFAULT_DATA_VIEWER_TIME_RANGE.from);
    assert.ok(DEFAULT_DATA_VIEWER_TIME_RANGE.to);
});

test("DEFAULT_DATA_VIEWER_TIME_RANGE resolves to a one hour window ending now", () => {
    const base = new Date("2026-06-01T12:00:00.000Z");
    assert.equal(resolveTimeRangeInput(DEFAULT_DATA_VIEWER_TIME_RANGE.from, base, "from"), "2026-06-01T11:00:00.000Z");
    assert.equal(resolveTimeRangeInput(DEFAULT_DATA_VIEWER_TIME_RANGE.to, base, "to"), "2026-06-01T12:00:00.001Z");
});

test("usesLastDataAnchor separates data-anchored ranges from wall-clock ranges", () => {
    assert.equal(usesLastDataAnchor({ from: "last-5m", to: "last" }), true);
    assert.equal(usesLastDataAnchor({ from: "last-1h", to: "now" }), true);
    assert.equal(usesLastDataAnchor({ from: "now-1h", to: "now" }), false);
    assert.equal(usesLastDataAnchor(DEFAULT_DATA_VIEWER_TIME_RANGE), false);
    assert.equal(usesLastDataAnchor({ from: "2026-06-01 00:00:00", to: "2026-06-02 00:00:00" }), false);
    assert.equal(usesLastDataAnchor({}), false);
});

test("isJsonValueColumn detects a JSON value column by the configured column name", () => {
    const columns = [
        { name: "JN", type: "VARCHAR(100)", primaryKey: true },
        { name: "JT", type: "DATETIME", basetime: true },
        { name: "JV", type: "JSON" },
    ];
    assert.equal(isJsonValueColumn(columns, "JV"), true);
    assert.equal(isJsonValueColumn(columns, "jv"), true, "column names are case-insensitive");
    assert.equal(isJsonValueColumn(columns, " JV "), true);
    assert.equal(isJsonValueColumn(columns, "JT"), false);
});

test("isJsonValueColumn is false for ordinary value columns and unknown input", () => {
    const columns = [
        { name: "NAME", type: "VARCHAR(100)" },
        { name: "TIME", type: "DATETIME" },
        { name: "VALUE", type: "DOUBLE" },
    ];
    assert.equal(isJsonValueColumn(columns, "VALUE"), false);
    assert.equal(isJsonValueColumn(columns, "MISSING"), false);
    assert.equal(isJsonValueColumn(columns, ""), false);
    assert.equal(isJsonValueColumn(undefined, "VALUE"), false);
    assert.equal(isJsonValueColumn([{ name: "VALUE" }], "VALUE"), false, "a column with no type is not JSON");
});

// 256자 제한의 출처는 neo-web Tag Analyzer 어댑터 한 곳뿐이라, 이름을 만들 때가 아니라
// 넘길 때 본다. jsonKey 는 toTagAnalyzerJsonKey 가 보고, tagName 은 빌더가 직접 본다.
test("buildNeoWebTagAnalyzerMessage refuses a tag name neo-web would truncate", () => {
    const long = "T".repeat(257);
    const r = buildNeoWebTagAnalyzerMessage({
        table: "TAG",
        tagNames: [long],
        range: { from: "2026-01-01T00:00:00Z", to: "2026-01-01T01:00:00Z" },
    });
    assert.equal(r.ok, false);
    assert.match(r.reason, /too long for Tag Analyzer/);
});

test("buildNeoWebTagAnalyzerMessage accepts a name at the limit", () => {
    const atLimit = "T".repeat(256);
    const r = buildNeoWebTagAnalyzerMessage({
        table: "TAG",
        tagNames: [atLimit],
        range: { from: "2026-01-01T00:00:00Z", to: "2026-01-01T01:00:00Z" },
    });
    assert.equal(r.ok, true);
    assert.equal(r.message.payload.tags[0].tagName, atLimit);
});

// 이름을 바꾼 태그는 화면(노드 이름)과 DB(태그 이름)가 달라 어느 행인지 알 수 없었다.
// 기본 이름이면 leaf 를 유지하고(계층이 짧게 읽힌다), 바꿨을 때만 태그 이름을 앞세운다.
test("buildTagRows keeps the leaf label when the name is the path default", () => {
    const rows = buildTagRows([
        { name: "Simulation Examples_Functions_Ramp1", nodeId: "ns=2;s=x",
          treePath: ["Simulation Examples", "Functions", "Ramp1"] },
    ]);
    const tag = rows.find((r) => r.type === "tag");
    assert.equal(tag.label, "Ramp1");
    assert.equal(tag.secondaryLabel, "");
});

test("buildTagRows shows the tag name once it differs from the path default", () => {
    const renamed = "Simulation Examples~!@#";
    const rows = buildTagRows([
        { name: renamed, nodeId: "ns=2;s=x", treePath: ["Simulation Examples", "Functions", "Ramp3"] },
    ]);
    const tag = rows.find((r) => r.type === "tag");
    assert.equal(tag.label, renamed, "바꾼 이름이 라벨이어야 한다");
    assert.equal(tag.secondaryLabel, "Ramp3", "원래 노드는 흐린 보조 라벨로 남는다");
});

// 컬럼 폭을 글자 수로 재면 한글이 절반으로 잡혀, 폭주 값만 막으려던 상한에 닿기 전에 잘렸다.
test("monoDisplayWidth counts full-width characters as two cells", () => {
    assert.equal(monoDisplayWidth("abc"), 3);
    assert.equal(monoDisplayWidth("펌프"), 4);
    assert.equal(monoDisplayWidth("a ㄷㄷ"), 6);
    // U+20A9 WON SIGN 은 유니코드 East Asian Width 로 Narrow 다. 전각은 U+FFE6.
    assert.equal(monoDisplayWidth("\u20A9"), 1);
    assert.equal(monoDisplayWidth("\uFFE6"), 2);
    assert.equal(monoDisplayWidth(null), 0);
});
