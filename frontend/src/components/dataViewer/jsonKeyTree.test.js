import test from "node:test";
import assert from "node:assert/strict";
import { buildJsonKeyTree, jsonKeyDocumentHasKeys, jsonKeyTreeLeavesUnder, jsonKeyTreeSeriesCount, filterJsonKeyTree } from "./jsonKeyTree.js";
import { getJsonPathSegments, jsonPathSegment, jsonPathToSqlPath } from "../../utils/dashboardJsonValue.js";
import { jsonChartNumber } from "../../utils/jsonChartNumber.js";

test("OPC UA literal node names remain distinct from nested JSON paths", () => {
    const tree = buildJsonKeyTree(JSON.stringify({ "sensor.value": 1, sensor: { value: 2 }, "[TEST] RENAME_1": 3, "a'b": 4 }));
    const leaves = tree.filter((node) => node.leaf);
    assert.equal(new Set(leaves.map((node) => node.path)).size, 4);
    assert.deepEqual(getJsonPathSegments(leaves[0].path), ["sensor.value"]);
    assert.deepEqual(getJsonPathSegments(leaves[1].path), ["sensor", "value"]);
    assert.deepEqual(getJsonPathSegments(leaves[2].path), ["[TEST] RENAME_1"]);
    assert.deepEqual(getJsonPathSegments(leaves[3].path), ["a'b"]);
});

test("nested arrays, branch selection and filtering keep the original key identities", () => {
    const tree = buildJsonKeyTree({ sensor: { values: [{ temperature: 23.5 }, { temperature: "24" }], status: "on" } });
    assert.deepEqual(jsonKeyTreeLeavesUnder(tree, "[sensor][values]"), ["[sensor][values][0][temperature]", "[sensor][values][1][temperature]"]);
    assert.equal(jsonKeyTreeSeriesCount(tree, jsonKeyTreeLeavesUnder(tree, "[sensor]")), 2);
    assert.ok(filterJsonKeyTree(tree, "temperature").some((node) => node.path === "[sensor][values][1][temperature]"));
});

test("empty or invalid documents cannot open an empty picker", () => {
    for (const value of ["bad json", "123", '{"a":{},"b":[]}', "null"]) assert.equal(jsonKeyDocumentHasKeys(value), false);
    assert.equal(jsonKeyDocumentHasKeys('{"temperature":null}'), true);
});

test("unsupported Machbase keys are visible but cannot be selected", () => {
    const tree = buildJsonKeyTree({ "": 1, "a'\"]": 2, good: 3 });
    assert.equal(tree[0].queryable, false);
    assert.equal(tree[1].queryable, false);
    assert.deepEqual(jsonKeyTreeLeavesUnder(tree, "[good]"), ["[good]"]);
    assert.throws(() => jsonPathToSqlPath(jsonPathSegment("")), /cannot be queried/);
});

test("chart numbers follow Machbase conversion and do not turn status or null into zero", () => {
    for (const value of [true, null, "", "on", "0b10", "0o10", "NaN", "1e309"]) assert.equal(jsonChartNumber(value), null);
    assert.equal(jsonChartNumber("23.5"), 23.5);
    assert.equal(jsonChartNumber("0x10"), 16);
});
