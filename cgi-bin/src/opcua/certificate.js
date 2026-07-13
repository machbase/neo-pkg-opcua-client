const DEFAULT_SELF_SIGNED_CERT_DAYS = 3650;
const APPLICATION_URI_PREFIX = 'urn:machbase:neo-pkg-opcua-client:';

function normalizeCertificateName(name) {
    const value = String(name || '').trim();
    if (!value) {
        throw new Error('name is required');
    }
    if (value.indexOf('/') >= 0 || value.indexOf('\\') >= 0 || value.indexOf('..') >= 0) {
        throw new Error('invalid certificate name');
    }
    return value;
}

function normalizeValidityDays(days) {
    if (days === undefined || days === null || days === '') {
        return DEFAULT_SELF_SIGNED_CERT_DAYS;
    }
    const n = Number(days);
    if (!Number.isFinite(n) || Math.floor(n) !== n || n <= 0) {
        throw new Error('days must be a positive integer');
    }
    return n;
}

function buildOpcuaApplicationUri(name) {
    return `${APPLICATION_URI_PREFIX}${normalizeCertificateName(name)}`;
}

function certificatePemToDerBase64(certificatePem) {
    const text = String(certificatePem || '');
    const match = text.match(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/);
    if (!match) {
        throw new Error('certificatePem must be PEM format');
    }
    return match[1].replace(/\s+/g, '');
}

function loadCryptoModule() {
    return require('crypto');
}

function assertCryptoModule(crypto) {
    if (!crypto || typeof crypto.generateAuthKeyPair !== 'function' || typeof crypto.generateX509Certificate !== 'function') {
        throw new Error('JSH crypto certificate generation API is required');
    }
}

function createOpcuaSelfSignedCertificate(input, cryptoModule) {
    const commonName = normalizeCertificateName(input && input.name);
    const days = normalizeValidityDays(input && input.days);
    const applicationUri = buildOpcuaApplicationUri(commonName);
    const crypto = cryptoModule || loadCryptoModule();
    assertCryptoModule(crypto);

    const pair = crypto.generateAuthKeyPair('rsa');
    const certificateRequest = {
        days,
        cn: commonName,
        dns: [commonName],
        uri: [applicationUri],
    };
    const certificatePem = crypto.generateX509Certificate(certificateRequest, pair.publicKey, pair.privateKey);

    return {
        certificatePem,
        keyPem: pair.privateKey,
        certificateDer: certificatePemToDerBase64(certificatePem),
        applicationUri,
        commonName,
    };
}

module.exports = {
    DEFAULT_SELF_SIGNED_CERT_DAYS,
    buildOpcuaApplicationUri,
    certificatePemToDerBase64,
    createOpcuaSelfSignedCertificate,
    normalizeCertificateName,
    normalizeValidityDays,
};
