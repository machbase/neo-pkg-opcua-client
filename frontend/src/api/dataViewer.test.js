import test from "node:test";
import assert from "node:assert/strict";

import { encodeDataViewerQuery } from "./dataViewerQuery.js";

test("encodeDataViewerQuery uses percent encoding instead of plus for spaces", () => {
    assert.equal(
        encodeDataViewerQuery({
            server: "local db",
            table: "EXAMPLE OPCUA TAG",
            names: ["Simulation Examples_Functions_Ramp4"],
            empty: "",
        }),
        "server=local%20db&table=EXAMPLE%20OPCUA%20TAG&names=Simulation%20Examples_Functions_Ramp4"
    );
});

test("encodeDataViewerQuery encodes cleaned array values as repeated query params", () => {
    assert.equal(
        encodeDataViewerQuery({
            names: ["sensor.a", "", null, "sensor.b"],
        }),
        "names=sensor.a&names=sensor.b"
    );
});

test("encodeDataViewerQuery omits empty optional values before string conversion", () => {
    assert.equal(
        encodeDataViewerQuery({
            server: "local",
            table: "TAG",
            names: ["sensor.a"],
            from: undefined,
            to: null,
            empty: "",
        }),
        "server=local&table=TAG&names=sensor.a"
    );
});

test("encodeDataViewerQuery preserves commas inside tag names", () => {
    assert.equal(
        encodeDataViewerQuery({
            names: ["area,1"],
        }),
        "names=area%2C1"
    );
});
