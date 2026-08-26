import test from "node:test";
import assert from "node:assert/strict";

import {
    nextAlias,
    extractAliases,
    normalizeDerivedTag,
    serializeDerivedTag,
    timeSourceOptions,
    validateDerivedTagLocal,
} from "./derivedTag.js";

// ── nextAlias (stable: never reindex on delete) ──────────────────────────────

test("nextAlias returns 'A' for an empty variable list", () => {
    assert.equal(nextAlias([]), "A");
});

test("nextAlias returns the first free letter when A and B are taken", () => {
    assert.equal(nextAlias([{ alias: "A" }, { alias: "B" }]), "C");
});

test("nextAlias fills the gap left by a deleted alias (no reindex)", () => {
    // From [A, C] the freed 'B' is still the next free letter.
    assert.equal(nextAlias([{ alias: "A" }, { alias: "C" }]), "B");
});

// ── extractAliases (constants stripped before scanning) ──────────────────────

test("extractAliases ignores letters inside <PI>", () => {
    assert.deepEqual(extractAliases("A * B / <PI>"), ["A", "B"]);
});

test("extractAliases ignores letters inside <E>", () => {
    assert.deepEqual(extractAliases("<E> + A"), ["A"]);
});

// ── normalizeDerivedTag (config -> form) ─────────────────────────────────────

test("normalizeDerivedTag sorts the variables map into an alias-ordered array", () => {
    const norm = normalizeDerivedTag({
        name: "power",
        expression: "A*B",
        variables: { B: "cur", A: "volt" },
    });
    assert.deepEqual(norm.variables, [
        { alias: "A", node: "volt" },
        { alias: "B", node: "cur" },
    ]);
});

test("normalizeDerivedTag applies defaults and coerces an invalid onError to 'skip'", () => {
    const norm = normalizeDerivedTag({
        name: "power",
        expression: "A",
        variables: { A: "volt" },
        onError: "bogus",
    });
    assert.equal(norm.timeSource, "latest");
    assert.equal(norm.onChanged, false);
    assert.equal(norm.onError, "skip");
    assert.equal(norm.errorValue, "");
});

// ── serializeDerivedTag (form -> save payload) ───────────────────────────────

test("serializeDerivedTag emits a trimmed variables map, boolean onChanged, and numeric errorValue for onError:value", () => {
    const out = serializeDerivedTag({
        name: " power ",
        expression: "A * B",
        variables: [
            { alias: "A", node: "  volt " },
            { alias: "B", node: "cur" },
        ],
        timeSource: "latest",
        onChanged: 1,
        onError: "value",
        errorValue: "3.5",
    });
    assert.deepEqual(out.variables, { A: "volt", B: "cur" });
    assert.equal(out.name, "power");
    assert.equal(out.onChanged, true);
    assert.equal(out.errorValue, 3.5);
    assert.equal(typeof out.errorValue, "number");
});

test("serializeDerivedTag omits errorValue when onError is not 'value'", () => {
    const out = serializeDerivedTag({
        name: "p",
        expression: "A",
        variables: [{ alias: "A", node: "volt" }],
        onChanged: false,
        onError: "skip",
        errorValue: "99",
    });
    assert.equal("errorValue" in out, false);
});

// ── timeSourceOptions ────────────────────────────────────────────────────────

test("timeSourceOptions prepends 'latest' to the declared aliases", () => {
    const opts = timeSourceOptions({
        variables: [
            { alias: "A", node: "volt" },
            { alias: "B", node: "cur" },
        ],
    });
    assert.deepEqual(opts, ["latest", "A", "B"]);
});

// ── validateDerivedTagLocal ──────────────────────────────────────────────────

const OK_DT = {
    name: "power",
    expression: "A * B",
    variables: [
        { alias: "A", node: "volt" },
        { alias: "B", node: "cur" },
    ],
    timeSource: "latest",
    onChanged: false,
    onError: "skip",
    errorValue: "",
};
const OK_CTX = { nodeNames: ["volt", "cur"], derivedNames: [], summarizedValueColumn: false };

test("validateDerivedTagLocal accepts a well-formed derived tag", () => {
    const r = validateDerivedTagLocal(OK_DT, OK_CTX);
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, {});
});

test("validateDerivedTagLocal accepts a dotted tag name", () => {
    const r = validateDerivedTagLocal({ ...OK_DT, name: "line1.power" }, OK_CTX);
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, {});
});

// A derived tag name lands in the same NAME column as a source tag, and the backend puts no
// character rule on either -- verified against a live Machbase. Only what the request format
// cannot carry is refused, which is the comma.
test("validateDerivedTagLocal accepts names the database accepts", () => {
    for (const name of [".power", "1power", "line1.power", "Line-1", "펌프_유량"]) {
        const r = validateDerivedTagLocal({ ...OK_DT, name }, OK_CTX);
        assert.equal(r.ok, true, `${name} should pass`);
    }
});

test("validateDerivedTagLocal rejects a name holding the request separator", () => {
    const r = validateDerivedTagLocal({ ...OK_DT, name: "a,b" }, OK_CTX);
    assert.equal(r.ok, false);
    assert.deepEqual(Object.keys(r.errors), ["name"]);
});

test("validateDerivedTagLocal flags a name that conflicts with a source node", () => {
    const r = validateDerivedTagLocal(
        { ...OK_DT, name: "volt", expression: "A", variables: [{ alias: "A", node: "volt" }] },
        OK_CTX
    );
    assert.equal(r.ok, false);
    assert.deepEqual(Object.keys(r.errors), ["name"]);
    assert.match(r.errors.name, /source node/);
});

test("validateDerivedTagLocal flags a name that conflicts with another derived tag", () => {
    const r = validateDerivedTagLocal(
        { ...OK_DT, name: "power", expression: "A", variables: [{ alias: "A", node: "volt" }] },
        { ...OK_CTX, derivedNames: ["power"] }
    );
    assert.equal(r.ok, false);
    assert.deepEqual(Object.keys(r.errors), ["name"]);
    assert.match(r.errors.name, /another derived tag/);
});

test("validateDerivedTagLocal flags an undeclared alias referenced by the expression", () => {
    const r = validateDerivedTagLocal(
        { ...OK_DT, expression: "A * C", variables: [{ alias: "A", node: "volt" }] },
        OK_CTX
    );
    assert.equal(r.ok, false);
    assert.deepEqual(Object.keys(r.errors), ["expression"]);
    assert.match(r.errors.expression, /C/);
});

test("validateDerivedTagLocal requires errorValue when onError is 'value'", () => {
    const r = validateDerivedTagLocal(
        { ...OK_DT, expression: "A", variables: [{ alias: "A", node: "volt" }], onError: "value", errorValue: "" },
        OK_CTX
    );
    assert.equal(r.ok, false);
    assert.deepEqual(Object.keys(r.errors), ["errorValue"]);
});

test("validateDerivedTagLocal rejects onError:null against a SUMMARIZED value column", () => {
    const r = validateDerivedTagLocal(
        { ...OK_DT, expression: "A", variables: [{ alias: "A", node: "volt" }], onError: "null" },
        { ...OK_CTX, summarizedValueColumn: true }
    );
    assert.equal(r.ok, false);
    assert.deepEqual(Object.keys(r.errors), ["errorValue"]);
});

// JSON collector 는 파생 태그 값도 payload 에 넣으므로(collector.js 의 payload[derived.name])
// 그 이름이 json 경로에 실린다. 노드 이름과 같은 문자 제약을 받아야 한다.
test("validateDerivedTagLocal rejects a json-unsafe name only for a JSON collector", () => {
    const dt = { ...OK_DT, name: 'say "hi"' };
    assert.equal(validateDerivedTagLocal(dt, OK_CTX).ok, true, "스칼라 컬럼에서는 문제없다");
    const json = validateDerivedTagLocal(dt, { ...OK_CTX, jsonPayloadKey: true });
    assert.equal(json.ok, false);
    assert.deepEqual(Object.keys(json.errors), ["name"]);
});

test("validateDerivedTagLocal still accepts ] in a JSON collector", () => {
    // 따옴표 형태 json 경로가 ] 를 담을 수 있으므로 거부 대상이 아니다.
    const dt = { ...OK_DT, name: "a]b" };
    assert.equal(validateDerivedTagLocal(dt, { ...OK_CTX, jsonPayloadKey: true }).ok, true);
});
