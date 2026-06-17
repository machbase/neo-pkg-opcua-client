import test from "node:test";
import assert from "node:assert/strict";

import { encodeDataViewerQuery } from "./dataViewerQuery.js";

test("encodeDataViewerQuery uses percent encoding instead of plus for spaces", () => {
    assert.equal(
        encodeDataViewerQuery({
            server: "local db",
            table: "EXAMPLE OPCUA TAG",
            name: "Simulation Examples_Functions_Ramp4",
            empty: "",
        }),
        "server=local%20db&table=EXAMPLE%20OPCUA%20TAG&name=Simulation%20Examples_Functions_Ramp4"
    );
});
