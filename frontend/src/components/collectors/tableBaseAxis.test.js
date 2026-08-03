import test from "node:test";
import assert from "node:assert/strict";

import { baseAxisOfColumns, isDistanceBaseTable } from "./tableBaseAxis.js";

const timeBaseColumns = [
    { name: "NAME", type: "VARCHAR(100)", primaryKey: true, basetime: false, summarized: false },
    { name: "TIME", type: "DATETIME", primaryKey: false, basetime: true, summarized: false },
    { name: "VALUE", type: "DOUBLE", primaryKey: false, basetime: false, summarized: true },
];

const distanceBaseColumns = [
    { name: "NAME", type: "VARCHAR(100)", primaryKey: true, basetime: false, summarized: false },
    { name: "ODOMETER_M", type: "DOUBLE", primaryKey: false, basetime: true, summarized: false },
    { name: "VALUE", type: "DOUBLE", primaryKey: false, basetime: false, summarized: true },
];

test("baseAxisOfColumns reads the BASETIME-flagged column type, not the column name", () => {
    assert.equal(baseAxisOfColumns(timeBaseColumns), "time");
    assert.equal(baseAxisOfColumns(distanceBaseColumns), "distance");
});

test("baseAxisOfColumns ignores a DATETIME column that is not the base column", () => {
    // A DATETIME column without the BASETIME flag takes no part in deciding the base axis.
    const columns = [
        { name: "NAME", type: "VARCHAR(100)", basetime: false },
        { name: "ODOMETER_M", type: "DOUBLE", basetime: true },
        { name: "LOGGED_AT", type: "DATETIME", basetime: false },
    ];
    assert.equal(baseAxisOfColumns(columns), "distance");
});

test("baseAxisOfColumns is not fooled by a distance-looking name on a DATETIME base", () => {
    const columns = [{ name: "DISTANCE", type: "DATETIME", basetime: true }];
    assert.equal(baseAxisOfColumns(columns), "time");
});

test("baseAxisOfColumns treats a LONG base column as distance", () => {
    const columns = [{ name: "SEQ", type: "LONG", basetime: true }];
    assert.equal(baseAxisOfColumns(columns), "distance");
});

test("baseAxisOfColumns falls back to time when there is no BASETIME column", () => {
    assert.equal(baseAxisOfColumns([{ name: "NAME", type: "VARCHAR(100)", basetime: false }]), "time");
    assert.equal(baseAxisOfColumns([]), "time");
    assert.equal(baseAxisOfColumns(undefined), "time");
});

test("isDistanceBaseTable flags only distance-based TAG tables", () => {
    assert.equal(isDistanceBaseTable(distanceBaseColumns), true);
    assert.equal(isDistanceBaseTable(timeBaseColumns), false);
});
