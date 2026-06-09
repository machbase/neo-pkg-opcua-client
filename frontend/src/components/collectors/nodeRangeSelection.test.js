import test from "node:test";
import assert from "node:assert/strict";

import {
    applyNodeCheckedState,
    applyNodeSelectionState,
    createNodeSelectionState,
    getNodeRangeRows,
    isNumericDataType,
} from "./nodeRangeSelection.js";

const variable = (nodeId, dataType = "Double") => ({
    node: { nodeId, dataType },
    parentPath: `Area_${nodeId}`,
    pathLabels: ["Area", nodeId],
    isObject: false,
    isCycle: false,
});

const object = (nodeId) => ({
    node: { nodeId, dataType: "" },
    parentPath: `Area_${nodeId}`,
    isObject: true,
    isCycle: false,
});

const cycleVariable = (nodeId) => ({
    node: { nodeId, dataType: "Double" },
    parentPath: `Area_${nodeId}`,
    isObject: false,
    isCycle: true,
});

test("getNodeRangeRows returns selectable variable rows between anchor and target", () => {
    const rows = [
        variable("A"),
        object("Folder"),
        variable("B"),
        variable("C", "String"),
        cycleVariable("D"),
        variable("E"),
    ];

    assert.deepEqual(
        getNodeRangeRows(rows, 0, 5, "numeric-only").map((row) => row.node.nodeId),
        ["A", "B", "E"]
    );
});

test("getNodeRangeRows returns null when anchor is not in the expanded tree", () => {
    assert.equal(getNodeRangeRows([variable("A")], -1, 0, "numeric-only"), null);
});

test("getNodeRangeRows uses row position when duplicate node ids appear", () => {
    const rows = [
        variable("A"),
        variable("X"),
        variable("B"),
        variable("X"),
        variable("C"),
    ];

    assert.deepEqual(
        getNodeRangeRows(rows, 3, 4, "numeric-only").map((row) => row.node.nodeId),
        ["X", "C"]
    );
});

test("getNodeRangeRows includes string variables when selection mode allows supported value types", () => {
    const rows = [variable("A"), variable("B", "String"), variable("C")];

    assert.deepEqual(
        getNodeRangeRows(rows, 0, 2, "all").map((row) => row.node.nodeId),
        ["A", "B", "C"]
    );
});

test("getNodeRangeRows excludes unsupported data types even when selection mode allows all nodes", () => {
    const rows = [
        variable("A", "Double"),
        variable("B", "String"),
        variable("C", "Structure"),
        variable("D", ""),
    ];

    assert.deepEqual(
        getNodeRangeRows(rows, 0, 3, "all").map((row) => row.node.nodeId),
        ["A", "B"]
    );
});

test("applyNodeCheckedState selects new nodes and restores existing nodes", () => {
    const selected = new Map([["old", { path: "Old", node: { nodeId: "old" } }]]);
    const removedIds = new Set(["existing"]);
    const existingIds = new Set(["existing"]);

    const result = applyNodeCheckedState({
        selected,
        removedIds,
        existingIds,
        rows: [variable("new"), variable("existing")],
        checked: true,
    });

    assert.deepEqual([...result.selected.keys()].sort(), ["new", "old"]);
    assert.deepEqual(result.selected.get("new").pathLabels, ["Area", "new"]);
    assert.deepEqual([...result.removedIds], []);
    assert.deepEqual([...selected.keys()], ["old"]);
    assert.deepEqual([...removedIds], ["existing"]);
});

test("applyNodeCheckedState deselects new nodes and marks existing nodes for removal", () => {
    const selected = new Map([
        ["new", { path: "Area_new", node: { nodeId: "new" } }],
        ["keep", { path: "Area_keep", node: { nodeId: "keep" } }],
    ]);
    const removedIds = new Set();
    const existingIds = new Set(["existing"]);

    const result = applyNodeCheckedState({
        selected,
        removedIds,
        existingIds,
        rows: [variable("new"), variable("existing")],
        checked: false,
    });

    assert.deepEqual([...result.selected.keys()], ["keep"]);
    assert.deepEqual([...result.removedIds], ["existing"]);
});

test("applyNodeSelectionState composes sequential updates from the latest state", () => {
    const existingIds = new Set(["existing"]);
    let state = createNodeSelectionState();

    state = applyNodeSelectionState(state, {
        existingIds,
        rows: [variable("new")],
        checked: true,
    });
    state = applyNodeSelectionState(state, {
        existingIds,
        rows: [variable("existing")],
        checked: false,
    });

    assert.deepEqual([...state.selected.keys()], ["new"]);
    assert.deepEqual([...state.removedIds], ["existing"]);
});

test("isNumericDataType treats OPC UA numeric and boolean types as selectable", () => {
    assert.equal(isNumericDataType("Boolean"), true);
    assert.equal(isNumericDataType("Double"), true);
    assert.equal(isNumericDataType("Integer"), true);
    assert.equal(isNumericDataType("Number"), true);
    assert.equal(isNumericDataType("String"), false);
    assert.equal(isNumericDataType(""), false);
});
