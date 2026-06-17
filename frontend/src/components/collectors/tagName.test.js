import test from "node:test";
import assert from "node:assert/strict";

import { normalizeTagNameInput } from "./tagName.js";

test("normalizeTagNameInput replaces whitespace with underscores", () => {
    assert.equal(normalizeTagNameInput("Simulation Examples"), "Simulation_Examples");
    assert.equal(normalizeTagNameInput("Area 1   Pump A"), "Area_1_Pump_A");
    assert.equal(normalizeTagNameInput("Line\tOne\nValue"), "Line_One_Value");
});
