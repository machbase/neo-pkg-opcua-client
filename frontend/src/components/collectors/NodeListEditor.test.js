import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { normalizeTagName, validateTagName } from "./tagName.js";
import { normalizeCollectorNode } from "./nodeTree.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "NodeListEditor.jsx"), "utf8");

// JSX 는 node --test 가 못 읽으므로 컴포넌트를 렌더할 수 없다. 대신 검사 대상 핸들러는 JSX 를
// 담지 않는 순수 JS 라서, 소스에서 그 선언만 잘라내 실제 tagName.js 와 함께 실행한다.
// 정규식으로 "호출하더라" 만 확인하면 taken 에 무엇이 들어갔는지는 못 보기 때문이다.
function extractArrowFn(name) {
    const head = `const ${name} = `;
    const start = source.indexOf(head);
    assert.notEqual(start, -1, `${name} declaration not found`);
    // 화살표 파라미터의 구조분해({ add, remove })가 먼저 닫혀 버리므로 => 뒤부터 센다.
    const bodyStart = source.indexOf("=>", start);
    let depth = 0;
    let seen = false;
    for (let i = bodyStart; i < source.length; i += 1) {
        const ch = source[i];
        if (ch === "{") {
            depth += 1;
            seen = true;
        } else if (ch === "}") {
            depth -= 1;
            if (seen && depth === 0) return source.slice(start, i + 1) + ";";
        }
    }
    throw new Error(`${name} body not balanced`);
}

function buildFn(name, deps) {
    const keys = Object.keys(deps);
    const factory = new Function(...keys, `${extractArrowFn(name)}\nreturn ${name};`);
    return factory(...keys.map((k) => deps[k]));
}

test("NodeListEditor normalizes manual tag name input and edits", () => {
    assert.match(source, /import \{ normalizeTagName, validateTagName \} from "\.\/tagName";/);
    assert.match(source, /const trimmedName = normalizeTagName\(name\);/);
    // 타이핑 중에 필드를 고쳐 쓰지 않는다. 이름 검사는 추가 시점에 한다.
    assert.match(source, /validateTagName\(trimmedName/);
});

function makeAddNode({ nodes, derivedNames, name, nodeId, jsonPayloadKey = false }) {
    const calls = { onChange: [], nameError: [], dupError: [] };
    const fn = buildFn("addNode", {
        nodes,
        derivedNames,
        name,
        nodeId,
        jsonPayloadKey,
        normalizeTagName,
        validateTagName,
        validateNodeId: () => null,
        isDuplicate: (id) => nodes.some((n) => n.nodeId === id),
        onChange: (next) => calls.onChange.push(next),
        setNameError: (v) => calls.nameError.push(v),
        setNodeIdError: () => {},
        setDupError: (v) => calls.dupError.push(v),
        setNodeId: () => {},
        setName: () => {},
    });
    return { fn, calls };
}

test("addNode counts derived tag names as taken", () => {
    const nodes = [{ nodeId: "ns=2;s=A", name: "A" }];
    const { fn, calls } = makeAddNode({
        nodes,
        derivedNames: ["Ratio"],
        name: "Ratio",
        nodeId: "ns=2;s=B",
    });
    fn();
    assert.deepEqual(calls.onChange, []);
    assert.equal(calls.nameError.length, 1);
    assert.match(calls.nameError[0], /already used/);
});

test("addNode still accepts a name no node or derived tag holds", () => {
    const nodes = [{ nodeId: "ns=2;s=A", name: "A" }];
    const { fn, calls } = makeAddNode({
        nodes,
        derivedNames: ["Ratio"],
        name: " Flow ",
        nodeId: "ns=2;s=B",
    });
    fn();
    assert.equal(calls.onChange.length, 1);
    assert.equal(calls.onChange[0].at(-1).name, "Flow");
});

function makeSaveNameEdit({ nodes, derivedNames, editingNameValue, jsonPayloadKey = false }) {
    const calls = { patch: [], error: [], cancel: 0 };
    const fn = buildFn("saveNameEdit", {
        nodes,
        derivedNames,
        editingNameValue,
        jsonPayloadKey,
        normalizeTagName,
        validateTagName,
        patchNode: (idx, patch) => calls.patch.push([idx, patch]),
        setEditNameError: (v) => calls.error.push(v),
        cancelNameEdit: () => {
            calls.cancel += 1;
        },
    });
    return { fn, calls };
}

test("saveNameEdit counts derived tag names as taken", () => {
    const nodes = [{ name: "A" }, { name: "B" }];
    const { fn, calls } = makeSaveNameEdit({
        nodes,
        derivedNames: ["Ratio"],
        editingNameValue: "Ratio",
    });
    fn(0);
    assert.deepEqual(calls.patch, []);
    assert.equal(calls.error.length, 1);
    assert.match(calls.error[0], /already used/);
});

test("saveNameEdit still excludes the row being edited from its own duplicate check", () => {
    // 자기 자신을 taken 에 넣으면 " A " -> "A" 같은 공백 정리만으로도 중복이라며 막힌다.
    const nodes = [{ name: " A " }, { name: "B" }];
    const { fn, calls } = makeSaveNameEdit({
        nodes,
        derivedNames: ["Ratio"],
        editingNameValue: "A",
    });
    fn(0);
    assert.deepEqual(calls.error, []);
    assert.deepEqual(calls.patch, [[0, { name: "A" }]]);
});

function makeBrowseSync({ nodes, derivedNames, jsonPayloadKey = false }) {
    const calls = { onChange: [], syncError: [], nameError: [] };
    const fn = buildFn("handleBrowseSync", {
        nodes,
        derivedNames,
        jsonPayloadKey,
        validateTagName,
        normalizeCollectorNode,
        isDuplicate: (id) => nodes.some((n) => n.nodeId === id),
        onChange: (next) => calls.onChange.push(next),
        setSyncError: (v) => calls.syncError.push(v),
        setNameError: (v) => calls.nameError.push(v),
    });
    return { fn, calls };
}

test("handleBrowseSync clears a stale add-form error so it cannot mask the sync reason", () => {
    // 오류 슬롯이 하나뿐이라, 상단 폼에서 낸 옛 오류가 남아 있으면 이번 sync 의 사유가 안 보인다.
    const { fn, calls } = makeBrowseSync({ nodes: [], derivedNames: [] });
    fn({ add: [{ nodeId: "ns=2;s=A", name: "Line1.Temp" }], remove: [] });
    assert.deepEqual(calls.nameError, [null]);
});

test("handleBrowseSync validates incoming names and keeps the good ones", () => {
    const { fn, calls } = makeBrowseSync({ nodes: [], derivedNames: [] });
    fn({
        add: [
            { nodeId: "ns=2;s=A", name: "Line1.Temp" },
            { nodeId: "ns=2;s=B", name: "Line1,Temp" },
        ],
        remove: [],
    });
    assert.equal(calls.onChange.length, 1);
    assert.deepEqual(calls.onChange[0].map((n) => n.name), ["Line1.Temp"]);
    assert.equal(calls.syncError.length, 1);
    assert.match(calls.syncError[0], /^Skipped 1 browsed node:/);
    assert.match(calls.syncError[0], /comma/);
});

test("handleBrowseSync clears the skip notice when nothing was rejected", () => {
    const { fn, calls } = makeBrowseSync({ nodes: [], derivedNames: [] });
    fn({ add: [{ nodeId: "ns=2;s=A", name: "Temp" }], remove: [] });
    assert.deepEqual(calls.syncError, [null]);
});

test("handleBrowseSync rejects incoming names that collide with each other", () => {
    const { fn, calls } = makeBrowseSync({ nodes: [], derivedNames: [] });
    fn({
        add: [
            { nodeId: "ns=2;s=A", name: "Temp" },
            { nodeId: "ns=2;s=B", name: "Temp" },
        ],
        remove: [],
    });
    assert.deepEqual(calls.onChange[0].map((n) => n.nodeId), ["ns=2;s=A"]);
    assert.match(calls.syncError[0], /Skipped 1 browsed node:/);
    assert.match(calls.syncError[0], /already used/);
});

test("handleBrowseSync rejects incoming names taken by a kept node or a derived tag", () => {
    const nodes = [{ nodeId: "ns=2;s=Keep", name: "Kept" }];
    const { fn, calls } = makeBrowseSync({ nodes, derivedNames: ["Ratio"] });
    fn({
        add: [
            { nodeId: "ns=2;s=A", name: "Kept" },
            { nodeId: "ns=2;s=B", name: "Ratio" },
            { nodeId: "ns=2;s=C", name: "Fresh" },
        ],
        remove: [],
    });
    assert.deepEqual(calls.onChange[0].map((n) => n.name), ["Kept", "Fresh"]);
    assert.match(calls.syncError[0], /^Skipped 2 browsed nodes:/);
});

test("handleBrowseSync frees the name of a node removed in the same sync", () => {
    const nodes = [{ nodeId: "ns=2;s=Old", name: "Temp" }];
    const { fn, calls } = makeBrowseSync({ nodes, derivedNames: [] });
    fn({ add: [{ nodeId: "ns=2;s=New", name: "Temp" }], remove: ["ns=2;s=Old"] });
    assert.deepEqual(calls.onChange[0].map((n) => n.nodeId), ["ns=2;s=New"]);
    assert.deepEqual(calls.syncError, [null]);
});

test("handleBrowseSync rejects json payload keys a json path cannot carry", () => {
    const { fn, calls } = makeBrowseSync({ nodes: [], derivedNames: [], jsonPayloadKey: true });
    fn({
        add: [
            { nodeId: "ns=2;s=A", name: 'Say"Hi"' },
            { nodeId: "ns=2;s=B", name: "Plain" },
        ],
        remove: [],
    });
    assert.deepEqual(calls.onChange[0].map((n) => n.name), ["Plain"]);
    assert.match(calls.syncError[0], /json payload key/);
});
