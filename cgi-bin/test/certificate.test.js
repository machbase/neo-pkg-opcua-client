const TestRunner = require('./runner.js');

const {
    DEFAULT_SELF_SIGNED_CERT_DAYS,
    buildOpcuaApplicationUri,
    certificatePemToDerBase64,
    createOpcuaSelfSignedCertificate,
} = require('../src/opcua/certificate.js');

const runner = new TestRunner();

const CERT_DER_BASE64 = 'AQIDBA==';
const CERT_PEM = [
    '-----BEGIN CERTIFICATE-----',
    'AQID',
    'BA==',
    '-----END CERTIFICATE-----',
    '',
].join('\n');

runner.run('OPC UA self-signed certificate generation', {
    'builds minimal RSA self-signed certificate request for Kepware': (t) => {
        const calls = {};
        const crypto = {
            generateAuthKeyPair(type) {
                calls.keyType = type;
                return {
                    publicKey: 'PUBLIC PEM',
                    privateKey: 'PRIVATE PEM',
                };
            },
            generateX509Certificate(request, publicKey, signerPrivateKey) {
                calls.request = request;
                calls.publicKey = publicKey;
                calls.signerPrivateKey = signerPrivateKey;
                return CERT_PEM;
            },
        };

        const result = createOpcuaSelfSignedCertificate({ name: 'opc-main' }, crypto);

        t.assertEqual(calls.keyType, 'rsa');
        t.assertDeepEqual(calls.request, {
            days: DEFAULT_SELF_SIGNED_CERT_DAYS,
            cn: 'opc-main',
            dns: ['opc-main'],
            uri: ['urn:machbase:neo-pkg-opcua-client:opc-main'],
        });
        t.assertEqual(calls.publicKey, 'PUBLIC PEM');
        t.assertEqual(calls.signerPrivateKey, 'PRIVATE PEM');
        t.assertEqual(result.commonName, 'opc-main');
        t.assertEqual(result.applicationUri, 'urn:machbase:neo-pkg-opcua-client:opc-main');
        t.assertEqual(result.certificatePem, CERT_PEM);
        t.assertEqual(result.keyPem, 'PRIVATE PEM');
        t.assertEqual(result.certificateDer, CERT_DER_BASE64);
    },

    'uses explicit positive validity days': (t) => {
        let request;
        const crypto = {
            generateAuthKeyPair() {
                return {
                    publicKey: 'PUBLIC PEM',
                    privateKey: 'PRIVATE PEM',
                };
            },
            generateX509Certificate(req) {
                request = req;
                return CERT_PEM;
            },
        };

        createOpcuaSelfSignedCertificate({ name: 'opc-main', days: 90 }, crypto);

        t.assertEqual(request.days, 90);
    },

    'rejects unsafe certificate names': (t) => {
        t.assertThrows(() => createOpcuaSelfSignedCertificate({ name: 'bad/name' }, {}), 'invalid certificate name');
        t.assertThrows(() => createOpcuaSelfSignedCertificate({ name: 'bad\\name' }, {}), 'invalid certificate name');
        t.assertThrows(() => createOpcuaSelfSignedCertificate({ name: '../bad' }, {}), 'invalid certificate name');
    },

    'converts certificate PEM to DER base64': (t) => {
        t.assertEqual(certificatePemToDerBase64(CERT_PEM), CERT_DER_BASE64);
    },

    'builds package-scoped application URI': (t) => {
        t.assertEqual(buildOpcuaApplicationUri('opc-main'), 'urn:machbase:neo-pkg-opcua-client:opc-main');
    },
});

if (!runner.summary()) process.exit(1);
