import test from "node:test";
import assert from "node:assert/strict";

import {
    buildNodeTree,
    nodeTreeKey,
    normalizeCollectorNode,
    normalizeCollectorNodes,
} from "./nodeTree.js";

test("normalizeCollectorNode adds nodeTree null for legacy or manual nodes", () => {
    assert.deepEqual(
        normalizeCollectorNode({ nodeId: "ns=1;s=A", name: "A" }),
        { nodeId: "ns=1;s=A", name: "A", nodeTree: null }
    );
});

test("normalizeCollectorNode preserves object nodeTree", () => {
    const nodeTree = { Objects: { A: { label: "A", nodeId: "ns=1;s=A", dataType: "Double" } } };

    assert.equal(normalizeCollectorNode({ nodeTree }).nodeTree, nodeTree);
    assert.deepEqual(normalizeCollectorNodes([{ nodeTree }])[0].nodeTree, nodeTree);
});

test("buildNodeTree creates object tree rooted at Objects for default browse root", () => {
    assert.deepEqual(
        buildNodeTree({
            rootNodeId: "ns=0;i=85",
            pathLabels: ["signals.wave", "sin.value"],
            node: { nodeId: "ns=1;s=signals.wave.sin.value", dataType: "Double" },
        }),
        {
            Objects: {
                "signals.wave": {
                    "sin.value": {
                        label: "sin.value",
                        nodeId: "ns=1;s=signals.wave.sin.value",
                        dataType: "Double",
                    },
                },
            },
        }
    );
});

test("buildNodeTree uses custom root node id when browse root label is unknown", () => {
    const tree = buildNodeTree({
        rootNodeId: "ns=1;i=5000",
        pathLabels: ["Value"],
        node: { nodeId: "ns=1;s=Value", dataType: "Int32" },
    });

    assert.deepEqual(Object.keys(tree), ["ns=1;i=5000"]);
});

test("nodeTreeKey protects dangerous object keys", () => {
    assert.equal(nodeTreeKey("__proto__"), "___proto__");
    assert.equal(nodeTreeKey("constructor"), "_constructor");
    assert.equal(nodeTreeKey("prototype"), "_prototype");
});
