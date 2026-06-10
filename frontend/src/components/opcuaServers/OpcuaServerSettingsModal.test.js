import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSource(fileName) {
    return readFileSync(join(__dirname, fileName), "utf8");
}

test("OpcuaServerForm exposes None and SignAndEncrypt but not Sign-only mode", () => {
    const source = readSource("OpcuaServerForm.jsx");

    assert.match(source, /value="None"/);
    assert.match(source, /value="SignAndEncrypt"/);
    assert.doesNotMatch(source, /value="Sign"/);
});

test("OpcuaServerSettingsModal supports list actions and connection test", () => {
    const source = readSource("OpcuaServerSettingsModal.jsx");

    assert.match(source, /onHealthCheck/);
    assert.match(source, /onEdit/);
    assert.match(source, /onDelete/);
    assert.match(source, /Add OPC UA Server/);
    assert.match(source, /return onFormHealthCheck\(data\)/);
});

test("OpcuaServerSettingsModal labels encrypted mode by message security mode", () => {
    const source = readSource("OpcuaServerSettingsModal.jsx");

    assert.match(source, /messageSecurityMode === "SignAndEncrypt"/);
    assert.doesNotMatch(source, /const mode = security\.enabled \? "Sign & Encrypt" : "None"/);
});

test("OpcuaServerForm keeps credentials hidden until their auth mode needs them", () => {
    const source = readSource("OpcuaServerForm.jsx");

    assert.match(source, /const availableAuthModes = isSecure/);
    assert.match(source, /usesUserName && \(/);
    assert.doesNotMatch(source, /disabled=\{!usesUserName\}/);
    assert.match(source, /type="text"[\s\S]*placeholder="e\.g\. opc-main"/);
    assert.match(source, /type="text"[\s\S]*placeholder="opc\.tcp:\/\/192\.168\.1\.100:4840"/);
    assert.match(source, /type="text"[\s\S]*value=\{form\.username\}/);
    assert.match(source, /type="password"[\s\S]*value=\{form\.password\}/);
    assert.match(source, /usesCertificate && \(/);
    assert.match(source, /const usesCertificate = isSecure \|\| form\.authMode === "Certificate"/);
});

test("OpcuaServerForm supports in-form connection test and PEM file drop", () => {
    const source = readSource("OpcuaServerForm.jsx");

    assert.match(source, /Connection Test/);
    assert.match(source, /type="file"/);
    assert.match(source, /handlePemFileChange\(e, "certificatePem"\)/);
    assert.match(source, /handlePemFileChange\(e, "keyPem"\)/);
    assert.match(source, /onDrop=\{\(e\) => handlePemDrop\(e, "certificatePem"\)\}/);
    assert.match(source, /onDrop=\{\(e\) => handlePemDrop\(e, "keyPem"\)\}/);
});

test("OpcuaServerForm separates server and security inputs into tabs", () => {
    const source = readSource("OpcuaServerForm.jsx");

    assert.match(source, /activeTab/);
    assert.match(source, /Server Input/);
    assert.match(source, /Security/);
    assert.match(source, /opcua-form-tabs/);
});

test("OpcuaServerForm keeps create and readBatchSize locked until connection test succeeds", () => {
    const source = readSource("OpcuaServerForm.jsx");

    assert.match(source, /connectionReady/);
    assert.match(source, /Read Batch Size/);
    assert.match(source, /disabled=\{!connectionReady\}/);
    assert.match(source, /disabled=\{saving \|\| \(!isEdit && !connectionReady\)\}/);
    assert.match(source, /setConnectionReady\(true\)/);
});

test("OpcuaSection leaves connection test to the OPC UA server modal", () => {
    const source = readFileSync(join(__dirname, "../collectors/OpcuaSection.jsx"), "utf8");

    assert.doesNotMatch(source, /Connection Test/);
    assert.doesNotMatch(source, /testOpcuaConnection/);
});
