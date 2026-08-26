import test from "node:test";
import assert from "node:assert/strict";

import {
    lastSegment,
    nameFromMask,
    commonPrefixLength,
    commonPrefixApplicable,
    maskTrim,
    maskTrimChained,
    applyLastSegment,
    applyRemoveCommonPrefix,
    applyNumbering,
    applyTrim,
} from "./renameRules.js";
import { normalizeTagName } from "./tagName.js";

const PATHS = [
    ["Simulation", "Examples", "Functions", "Tank_Pressure_Sensor_01"],
    ["Simulation", "Examples", "Counter"],
];
const SAME_DEPTH = [
    ["Plant", "Line1", "Temp"],
    ["Plant", "Line1", "Pressure"],
];

test("lastSegment returns the final segment", () => {
    assert.equal(lastSegment(PATHS[0]), "Tank_Pressure_Sensor_01");
    assert.equal(lastSegment([]), "");
});

test("applyLastSegment keeps only the last segment", () => {
    assert.deepEqual(applyLastSegment(PATHS), ["Tank_Pressure_Sensor_01", "Counter"]);
});

test("commonPrefixLength counts shared leading segments, never the last", () => {
    assert.equal(commonPrefixLength(PATHS), 2); // Simulation, Examples
    assert.equal(commonPrefixLength(SAME_DEPTH), 2); // Plant, Line1
    assert.equal(commonPrefixLength([["A", "B"], ["X", "Y"]]), 0);
});

test("commonPrefixApplicable reflects whether a shared prefix exists", () => {
    assert.equal(commonPrefixApplicable(PATHS), true);
    assert.equal(commonPrefixApplicable([["A", "B"], ["X", "Y"]]), false);
});

test("applyRemoveCommonPrefix strips the shared prefix", () => {
    assert.deepEqual(applyRemoveCommonPrefix(PATHS), ["Functions_Tank_Pressure_Sensor_01", "Counter"]);
    assert.deepEqual(applyRemoveCommonPrefix(SAME_DEPTH), ["Temp", "Pressure"]);
});

test("applyNumbering assigns sequential names with a prefix", () => {
    assert.deepEqual(applyNumbering(PATHS, { prefix: "sensor" }), ["sensor_1", "sensor_2"]);
    assert.deepEqual(applyNumbering(PATHS), ["tag_1", "tag_2"]);
});

test("applyTrim removes front segments but always preserves the last", () => {
    // remove 2 segments from the front starting at position 1
    assert.deepEqual(
        applyTrim(PATHS, { fromStart: 1, countStart: 2 }),
        ["Functions_Tank_Pressure_Sensor_01", "Counter"]
    );
});

test("applyTrim removes back segments (excluding the last identifier)", () => {
    // remove 1 segment from the back starting just before the last
    assert.deepEqual(
        applyTrim([["A", "B", "C", "D"]], { fromEnd: 1, countEnd: 1 }),
        ["A_B_D"]
    );
});

test("maskTrim never marks the last segment as removed", () => {
    const mask = maskTrim(["A", "B", "C"], { fromEnd: 1, countEnd: 5, fromStart: 1, countStart: 5 });
    assert.equal(mask[mask.length - 1], false);
    assert.deepEqual(mask, [true, true, false]);
});

test("nameFromMask joins kept segments with underscores", () => {
    assert.equal(nameFromMask(["A", "B", "C"], [true, false, false]), "B_C");
});

test("trim chaining: applying maskTrim to an already-trimmed path preserves the last", () => {
    const once = applyTrim([["A", "B", "C", "D"]], { fromStart: 1, countStart: 1 })[0]; // "B_C_D"
    const twice = applyTrim([once.split("_")], { fromStart: 1, countStart: 1 })[0]; // "C_D"
    assert.equal(twice, "C_D");
});

test("maskTrimChained accumulates removals over the currently-kept segments", () => {
    const path = ["A", "B", "C", "D", "E"];
    // first trim: remove 1 from the front -> A struck, kept B C D E
    const m1 = maskTrimChained(path, null, { fromStart: 1, countStart: 1 });
    assert.deepEqual(m1, [true, false, false, false, false]);
    assert.equal(nameFromMask(path, m1), "B_C_D_E");
    // chain: remove 1 more from the front of the KEPT (B) -> A,B struck
    const m2 = maskTrimChained(path, m1, { fromStart: 1, countStart: 1 });
    assert.deepEqual(m2, [true, true, false, false, false]);
    assert.equal(nameFromMask(path, m2), "C_D_E");
    // chain: remove 1 from the back of the kept (excluding last E) -> D struck too
    const m3 = maskTrimChained(path, m2, { fromEnd: 1, countEnd: 1 });
    assert.equal(nameFromMask(path, m3), "C_E");
});

test("maskTrimChained never removes the last kept segment", () => {
    const path = ["A", "B"];
    const m = maskTrimChained(path, null, { fromStart: 1, countStart: 5, fromEnd: 1, countEnd: 5 });
    assert.equal(m[m.length - 1], false);
    assert.equal(nameFromMask(path, m), "B");
});

// Segments are trimmed and joined; characters are left alone. tagName.js explains why the old
// alphanumeric rewriting had no basis, so the point here is that nothing is rewritten.
test("nameFromMask keeps segment characters as the server gave them", () => {
    assert.equal(
        nameFromMask(["Simulation Examples", "Functions", "Random8"], [false, false, false]),
        "Simulation Examples_Functions_Random8"
    );
    assert.equal(nameFromMask(["Plant1.Line1", "Temp"], [false, false]), "Plant1.Line1_Temp");
    assert.equal(nameFromMask(["Tank_Pressure_01", "Raw"], [false, false]), "Tank_Pressure_01_Raw");
});

test("nameFromMask trims each segment and drops the empty ones", () => {
    // An empty segment would otherwise leave a bare separator behind.
    assert.equal(nameFromMask(["Area", "", "Pump"], [false, false, false]), "Area_Pump");
    assert.equal(nameFromMask(["  Area  ", " Pump "], [false, false]), "Area_Pump");
    assert.equal(nameFromMask(["Area 1", " ", "Pump"], [false, false, false]), "Area 1_Pump");
});

test("nameFromMask matches what picking the same node produces", () => {
    const path = ["Simulation Examples", "Functions", "Random8"];
    assert.equal(
        nameFromMask(path, [false, false, false]),
        path.map(normalizeTagName).join("_")
    );
});
