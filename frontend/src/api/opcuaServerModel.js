function cleanText(value) {
    return value === undefined || value === null ? "" : String(value).trim();
}

function normalizeAuthMode(value) {
    return cleanText(value) === "UserName" ? "UserName" : "Anonymous";
}

const DEFAULT_READ_BATCH_SIZE = 300;
const DEFAULT_SELF_SIGNED_CERT_DAYS = 3650;
const DEFAULT_CAPABILITIES = {
    maxNodesPerRead: null,
    maxNodesPerReadSource: "default",
    checkedAt: "",
};

function positiveInteger(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && Math.floor(n) === n && n > 0 ? n : fallback;
}

function nonNegativeInteger(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && Math.floor(n) === n && n >= 0 ? n : fallback;
}

function normalizeCapabilities(capabilities) {
    const source = capabilities?.maxNodesPerReadSource === "server" ? "server" : "default";
    const maxNodesPerRead =
        capabilities?.maxNodesPerRead === undefined || capabilities?.maxNodesPerRead === null
            ? null
            : nonNegativeInteger(capabilities.maxNodesPerRead, null);
    return {
        maxNodesPerRead,
        maxNodesPerReadSource: maxNodesPerRead !== null ? "server" : source,
        checkedAt: cleanText(capabilities?.checkedAt),
    };
}

function normalizeReadBatchSize(value, capabilities) {
    const limit = capabilities.maxNodesPerRead > 0 ? capabilities.maxNodesPerRead : null;
    const batchSize = positiveInteger(value, limit || DEFAULT_READ_BATCH_SIZE);
    return limit ? Math.min(batchSize, limit) : batchSize;
}

export function resolveReadBatchSizeAfterConnection(currentValue, capabilities) {
    return normalizeReadBatchSize(currentValue, normalizeCapabilities(capabilities || DEFAULT_CAPABILITIES));
}

export function mapOpcuaServerListItem(item) {
    const config = item?.config || {};
    const security = config.security || {};
    const hasCertificate = Boolean(security.hasCertificateFile && security.hasKeyFile);
    const capabilities = normalizeCapabilities(config.capabilities || DEFAULT_CAPABILITIES);
    return {
        name: item?.name || "",
        endpoint: config.endpoint || "",
        readBatchSize: normalizeReadBatchSize(config.readBatchSize, capabilities),
        capabilities,
        security: {
            enabled: security.enabled === true,
            messageSecurityMode: security.messageSecurityMode || "None",
            securityPolicy: security.securityPolicy || "None",
            authMode: normalizeAuthMode(security.authMode),
            username: security.username || "",
            hasPassword: security.hasPassword === true,
            hasCertificateFile: security.hasCertificateFile === true,
            hasKeyFile: security.hasKeyFile === true,
            hasCertificate,
        },
    };
}

export function buildOpcuaServerPayload(form) {
    const authMode = normalizeAuthMode(form.authMode);
    const hasReadBatchInput = form.readBatchSize !== undefined || form.capabilities !== undefined;
    const capabilities = normalizeCapabilities(form.capabilities || DEFAULT_CAPABILITIES);
    const payload = {
        name: cleanText(form.name),
        endpoint: cleanText(form.endpoint),
        security: { enabled: false },
    };
    if (hasReadBatchInput) {
        payload.readBatchSize = normalizeReadBatchSize(form.readBatchSize, capabilities);
        payload.capabilities = capabilities;
    }

    if (form.securityMode !== "SignAndEncrypt") {
        if (authMode === "Anonymous") {
            return payload;
        }
        const security = {
            enabled: true,
            messageSecurityMode: "None",
            securityPolicy: "None",
            authMode,
        };
        const username = cleanText(form.username);
        const password = form.password === undefined || form.password === null ? "" : String(form.password);

        if (username) security.username = username;
        if (password) security.password = password;

        payload.security = security;
        return payload;
    }

    const security = {
        enabled: true,
        messageSecurityMode: "SignAndEncrypt",
        securityPolicy: cleanText(form.securityPolicy) || "Basic256Sha256",
        authMode,
    };
    const username = cleanText(form.username);
    const password = form.password === undefined || form.password === null ? "" : String(form.password);
    const certificatePem = form.certificatePem === undefined || form.certificatePem === null ? "" : String(form.certificatePem);
    const keyPem = form.keyPem === undefined || form.keyPem === null ? "" : String(form.keyPem);

    if (username) security.username = username;
    if (password) security.password = password;
    if (certificatePem.trim()) security.certificatePem = certificatePem;
    if (keyPem.trim()) security.keyPem = keyPem;

    payload.security = security;
    return payload;
}

export function buildOpcuaDirectConnectionRequest(form) {
    const payload = buildOpcuaServerPayload(form);
    const request = {
        endpoint: payload.endpoint,
        security: payload.security,
    };
    const existingName = cleanText(form.existingName);
    if (existingName) request.server = existingName;
    return request;
}

export function buildOpcuaSelfSignedCertificateRequest(form) {
    return {
        name: cleanText(form.name),
        days: positiveInteger(form.days, DEFAULT_SELF_SIGNED_CERT_DAYS),
    };
}

export function buildOpcuaConnectionTarget(source) {
    if (typeof source === "string") {
        const endpoint = cleanText(source);
        return endpoint ? { endpoint } : {};
    }
    const server = cleanText(source?.server);
    if (server) return { server };
    const endpoint = cleanText(source?.endpoint);
    if (endpoint) return { endpoint };
    return {};
}
