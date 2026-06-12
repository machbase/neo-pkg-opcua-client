import test from "node:test";
import assert from "node:assert/strict";

import {
    buildOpcuaConnectionTarget,
    buildOpcuaDirectConnectionRequest,
    buildOpcuaServerPayload,
    mapOpcuaServerListItem,
} from "./opcuaServerModel.js";

test("mapOpcuaServerListItem flattens API config for the UI", () => {
    assert.deepEqual(
        mapOpcuaServerListItem({
            name: "opc-main",
            config: {
                endpoint: "opc.tcp://127.0.0.1:4840",
                readBatchSize: 64,
                capabilities: {
                    maxNodesPerRead: 64,
                    maxNodesPerReadSource: "server",
                    checkedAt: "2026-06-09T01:53:51.003Z",
                },
                security: {
                    enabled: true,
                    messageSecurityMode: "SignAndEncrypt",
                    securityPolicy: "Basic256Sha256",
                    authMode: "UserName",
                    username: "operator",
                    hasPassword: true,
                    hasCertificateFile: true,
                    hasKeyFile: true,
                },
            },
        }),
        {
            name: "opc-main",
            endpoint: "opc.tcp://127.0.0.1:4840",
            readBatchSize: 64,
            capabilities: {
                maxNodesPerRead: 64,
                maxNodesPerReadSource: "server",
                checkedAt: "2026-06-09T01:53:51.003Z",
            },
            security: {
                enabled: true,
                messageSecurityMode: "SignAndEncrypt",
                securityPolicy: "Basic256Sha256",
                authMode: "UserName",
                username: "operator",
                hasPassword: true,
                hasCertificateFile: true,
                hasKeyFile: true,
                hasCertificate: true,
            },
        }
    );
});

test("mapOpcuaServerListItem defaults read batch capability for old profiles", () => {
    assert.deepEqual(
        mapOpcuaServerListItem({
            name: "legacy-opc",
            config: {
                endpoint: "opc.tcp://127.0.0.1:4840",
                security: { enabled: false },
            },
        }),
        {
            name: "legacy-opc",
            endpoint: "opc.tcp://127.0.0.1:4840",
            readBatchSize: 32,
            capabilities: {
                maxNodesPerRead: null,
                maxNodesPerReadSource: "default",
                checkedAt: "",
            },
            security: {
                enabled: false,
                messageSecurityMode: "None",
                securityPolicy: "None",
                authMode: "Anonymous",
                username: "",
                hasPassword: false,
                hasCertificateFile: false,
                hasKeyFile: false,
                hasCertificate: false,
            },
        }
    );
});

test("mapOpcuaServerListItem normalizes unsupported Certificate auth mode", () => {
    assert.equal(
        mapOpcuaServerListItem({
            name: "cert-auth",
            config: {
                endpoint: "opc.tcp://127.0.0.1:4840",
                security: {
                    enabled: true,
                    messageSecurityMode: "SignAndEncrypt",
                    securityPolicy: "Basic256Sha256",
                    authMode: "Certificate",
                },
            },
        }).security.authMode,
        "Anonymous"
    );
});

test("buildOpcuaServerPayload includes read batch size and capabilities after connection test", () => {
    assert.deepEqual(
        buildOpcuaServerPayload({
            name: "opc-batch",
            endpoint: "opc.tcp://127.0.0.1:4840",
            readBatchSize: "16",
            capabilities: {
                maxNodesPerRead: 32,
                maxNodesPerReadSource: "server",
                checkedAt: "2026-06-09T01:53:51.003Z",
            },
            securityMode: "None",
            securityPolicy: "None",
            authMode: "Anonymous",
        }),
        {
            name: "opc-batch",
            endpoint: "opc.tcp://127.0.0.1:4840",
            readBatchSize: 16,
            capabilities: {
                maxNodesPerRead: 32,
                maxNodesPerReadSource: "server",
                checkedAt: "2026-06-09T01:53:51.003Z",
            },
            security: { enabled: false },
        }
    );
});

test("buildOpcuaServerPayload sends disabled security for None mode", () => {
    assert.deepEqual(
        buildOpcuaServerPayload({
            name: "opc-main",
            endpoint: "opc.tcp://127.0.0.1:4840",
            securityMode: "None",
            securityPolicy: "Basic256Sha256",
            authMode: "Anonymous",
            username: "",
            password: "",
        }),
        {
            name: "opc-main",
            endpoint: "opc.tcp://127.0.0.1:4840",
            security: { enabled: false },
        }
    );
});

test("buildOpcuaServerPayload allows Username auth with None security mode", () => {
    assert.deepEqual(
        buildOpcuaServerPayload({
            name: "opc-user",
            endpoint: "opc.tcp://127.0.0.1:4840",
            securityMode: "None",
            securityPolicy: "None",
            authMode: "UserName",
            username: "operator",
            password: "secret",
        }),
        {
            name: "opc-user",
            endpoint: "opc.tcp://127.0.0.1:4840",
            security: {
                enabled: true,
                messageSecurityMode: "None",
                securityPolicy: "None",
                authMode: "UserName",
                username: "operator",
                password: "secret",
            },
        }
    );
});

test("buildOpcuaServerPayload ignores PEM fields with None security mode", () => {
    assert.deepEqual(
        buildOpcuaServerPayload({
            name: "opc-user",
            endpoint: "opc.tcp://127.0.0.1:4840",
            securityMode: "None",
            securityPolicy: "None",
            authMode: "UserName",
            username: "operator",
            password: "secret",
            certificatePem: "-----BEGIN CERTIFICATE-----\nCERT\n-----END CERTIFICATE-----\n",
            keyPem: "-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----\n",
        }),
        {
            name: "opc-user",
            endpoint: "opc.tcp://127.0.0.1:4840",
            security: {
                enabled: true,
                messageSecurityMode: "None",
                securityPolicy: "None",
                authMode: "UserName",
                username: "operator",
                password: "secret",
            },
        }
    );
});

test("buildOpcuaServerPayload omits unchanged None mode password on edit", () => {
    assert.deepEqual(
        buildOpcuaServerPayload({
            name: "opc-user",
            endpoint: "opc.tcp://127.0.0.1:4840",
            securityMode: "None",
            securityPolicy: "None",
            authMode: "UserName",
            username: "operator",
            password: "",
        }),
        {
            name: "opc-user",
            endpoint: "opc.tcp://127.0.0.1:4840",
            security: {
                enabled: true,
                messageSecurityMode: "None",
                securityPolicy: "None",
                authMode: "UserName",
                username: "operator",
            },
        }
    );
});

test("buildOpcuaServerPayload sends SignAndEncrypt security without exposing Sign mode", () => {
    assert.deepEqual(
        buildOpcuaServerPayload({
            name: "opc-secure",
            endpoint: "opc.tcp://secure:4840",
            securityMode: "SignAndEncrypt",
            securityPolicy: "Basic256Sha256",
            authMode: "UserName",
            username: "operator",
            password: "secret",
            certificatePem: "-----BEGIN CERTIFICATE-----\nCERT\n-----END CERTIFICATE-----\n",
            keyPem: "-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----\n",
        }),
        {
            name: "opc-secure",
            endpoint: "opc.tcp://secure:4840",
            security: {
                enabled: true,
                messageSecurityMode: "SignAndEncrypt",
                securityPolicy: "Basic256Sha256",
                authMode: "UserName",
                username: "operator",
                password: "secret",
                certificatePem: "-----BEGIN CERTIFICATE-----\nCERT\n-----END CERTIFICATE-----\n",
                keyPem: "-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----\n",
            },
        }
    );
});

test("buildOpcuaServerPayload omits unchanged edit secrets", () => {
    assert.deepEqual(
        buildOpcuaServerPayload({
            name: "opc-secure",
            endpoint: "opc.tcp://secure:4840",
            securityMode: "SignAndEncrypt",
            securityPolicy: "Basic256Sha256",
            authMode: "UserName",
            username: "operator",
            password: "",
            certificatePem: "",
            keyPem: "",
        }),
        {
            name: "opc-secure",
            endpoint: "opc.tcp://secure:4840",
            security: {
                enabled: true,
                messageSecurityMode: "SignAndEncrypt",
                securityPolicy: "Basic256Sha256",
                authMode: "UserName",
                username: "operator",
            },
        }
    );
});

test("buildOpcuaConnectionTarget prefers server profile over legacy endpoint", () => {
    assert.deepEqual(
        buildOpcuaConnectionTarget({
            server: "opc-main",
            endpoint: "opc.tcp://legacy:4840",
        }),
        { server: "opc-main" }
    );
    assert.deepEqual(
        buildOpcuaConnectionTarget({
            server: "",
            endpoint: "opc.tcp://legacy:4840",
        }),
        { endpoint: "opc.tcp://legacy:4840" }
    );
    assert.deepEqual(
        buildOpcuaConnectionTarget("opc.tcp://legacy:4840"),
        { endpoint: "opc.tcp://legacy:4840" }
    );
});

test("buildOpcuaDirectConnectionRequest sends current form endpoint and security", () => {
    assert.deepEqual(
        buildOpcuaDirectConnectionRequest({
            name: "not-saved-yet",
            endpoint: "opc.tcp://secure:4840",
            securityMode: "SignAndEncrypt",
            securityPolicy: "Basic256Sha256",
            authMode: "Anonymous",
            certificatePem: "-----BEGIN CERTIFICATE-----\nCERT\n-----END CERTIFICATE-----\n",
            keyPem: "-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----\n",
        }),
        {
            endpoint: "opc.tcp://secure:4840",
            security: {
                enabled: true,
                messageSecurityMode: "SignAndEncrypt",
                securityPolicy: "Basic256Sha256",
                authMode: "Anonymous",
                certificatePem: "-----BEGIN CERTIFICATE-----\nCERT\n-----END CERTIFICATE-----\n",
                keyPem: "-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----\n",
            },
        }
    );
});

test("buildOpcuaDirectConnectionRequest preserves None username security for backend connect", () => {
    assert.deepEqual(
        buildOpcuaDirectConnectionRequest({
            name: "not-saved-yet",
            endpoint: " opc.tcp://user:4840 ",
            securityMode: "None",
            securityPolicy: "None",
            authMode: "UserName",
            username: "operator",
            password: "secret",
        }),
        {
            endpoint: "opc.tcp://user:4840",
            security: {
                enabled: true,
                messageSecurityMode: "None",
                securityPolicy: "None",
                authMode: "UserName",
                username: "operator",
                password: "secret",
            },
        }
    );
});
