import test from "node:test";
import assert from "node:assert/strict";

import { normalizeTagName, validateTagName } from "./tagName.js";

test("normalizeTagName trims and leaves the rest alone", () => {
    // The backend does exactly this (handler.js normalizeText) and nothing more.
    assert.equal(normalizeTagName("  Temp  "), "Temp");
    assert.equal(normalizeTagName("Simulation Examples"), "Simulation Examples");
    assert.equal(normalizeTagName("Plant1.Line1"), "Plant1.Line1");
    assert.equal(normalizeTagName("펌프 A"), "펌프 A");
    assert.equal(normalizeTagName(null), "");
});

test("validateTagName accepts what the database and neo-web actually accept", () => {
    // Verified against a live Machbase: all of these store and read back unchanged.
    for (const name of ["Temp", "Simulation Examples", "Plant1.Line1", "Line-1", "펌프_유량", "a]b", "it's", "1abc"]) {
        assert.equal(validateTagName(name).ok, true, `${name} should pass`);
    }
});

test("validateTagName rejects a comma, which the request format cannot carry", () => {
    // names/jsonKeys travel as one comma-joined parameter, so such a name is split in transit.
    const r = validateTagName("Line1,Temp");
    assert.equal(r.ok, false);
    assert.match(r.reason, /comma/);
});

// 길이는 여기서 보지 않는다. 컬럼 폭은 백엔드가, 256자는 Tag Analyzer 핸드오프가 본다.
test("validateTagName does not judge length", () => {
    assert.equal(validateTagName("a".repeat(300)).ok, true);
});

test("validateTagName only rejects json-path characters for a JSON collector", () => {
    // A double quote closes the json path and the grammar has no escape for it.
    assert.equal(validateTagName('say "hi"').ok, true, "harmless for a scalar column");
    assert.equal(validateTagName('say "hi"', { jsonPayloadKey: true }).ok, false);
    // ] survives the quoted path form, so it must NOT be rejected here.
    assert.equal(validateTagName("a]b", { jsonPayloadKey: true }).ok, true);
});

test("validateTagName reports duplicates against the names already in use", () => {
    assert.equal(validateTagName("Temp", { taken: ["Other"] }).ok, true);
    assert.equal(validateTagName(" Temp ", { taken: ["Temp"] }).ok, false);
});
