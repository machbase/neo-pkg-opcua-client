import { useState } from "react";
import Icon from "../common/Icon";

const DEFAULT_DAYS = 3650;

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[i] = c >>> 0;
    }
    return table;
})();

function normalizeDays(value) {
    const n = Number(value);
    return Number.isFinite(n) && Math.floor(n) === n && n > 0 ? n : DEFAULT_DAYS;
}

function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
    const year = Math.max(date.getFullYear(), 1980);
    return {
        date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
        time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    };
}

function pushUint16(bytes, value) {
    bytes.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushUint32(bytes, value) {
    bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function createZipBlob(files) {
    const encoder = new TextEncoder();
    const { date, time } = dosDateTime(new Date());
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    files.forEach((file) => {
        const nameBytes = encoder.encode(file.name);
        const dataBytes = encoder.encode(file.content);
        const checksum = crc32(dataBytes);

        const localHeader = [];
        pushUint32(localHeader, 0x04034b50);
        pushUint16(localHeader, 20);
        pushUint16(localHeader, 0x0800);
        pushUint16(localHeader, 0);
        pushUint16(localHeader, time);
        pushUint16(localHeader, date);
        pushUint32(localHeader, checksum);
        pushUint32(localHeader, dataBytes.length);
        pushUint32(localHeader, dataBytes.length);
        pushUint16(localHeader, nameBytes.length);
        pushUint16(localHeader, 0);

        localParts.push(new Uint8Array(localHeader), nameBytes, dataBytes);

        const centralHeader = [];
        pushUint32(centralHeader, 0x02014b50);
        pushUint16(centralHeader, 20);
        pushUint16(centralHeader, 20);
        pushUint16(centralHeader, 0x0800);
        pushUint16(centralHeader, 0);
        pushUint16(centralHeader, time);
        pushUint16(centralHeader, date);
        pushUint32(centralHeader, checksum);
        pushUint32(centralHeader, dataBytes.length);
        pushUint32(centralHeader, dataBytes.length);
        pushUint16(centralHeader, nameBytes.length);
        pushUint16(centralHeader, 0);
        pushUint16(centralHeader, 0);
        pushUint16(centralHeader, 0);
        pushUint16(centralHeader, 0);
        pushUint32(centralHeader, 0);
        pushUint32(centralHeader, offset);

        centralParts.push(new Uint8Array(centralHeader), nameBytes);
        offset += localHeader.length + nameBytes.length + dataBytes.length;
    });

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const endHeader = [];
    pushUint32(endHeader, 0x06054b50);
    pushUint16(endHeader, 0);
    pushUint16(endHeader, 0);
    pushUint16(endHeader, files.length);
    pushUint16(endHeader, files.length);
    pushUint32(endHeader, centralSize);
    pushUint32(endHeader, offset);
    pushUint16(endHeader, 0);

    return new Blob([...localParts, ...centralParts, new Uint8Array(endHeader)], { type: "application/zip" });
}

export default function OpcuaCertificateGeneratorModal({ onGenerate, onClose }) {
    const [name, setName] = useState("");
    const [days, setDays] = useState(DEFAULT_DAYS);
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState(null);
    const [message, setMessage] = useState(null);

    const downloadBlob = (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    const handleGenerate = async (e) => {
        e.preventDefault();
        if (!name.trim()) {
            setMessage({ type: "error", text: "Name is required" });
            return;
        }
        if (!onGenerate || generating) return;

        setGenerating(true);
        setMessage(null);
        setResult(null);
        try {
            const certificate = await onGenerate({ name, days: normalizeDays(days) });
            setResult(certificate);
            setMessage(null);
        } catch (err) {
            setMessage({ type: "error", text: err.reason || err.message || "Certificate generation failed" });
        } finally {
            setGenerating(false);
        }
    };

    const handleDownloadZip = () => {
        if (!result?.certificatePem || !result?.keyPem) return;
        const baseName = name || result.commonName || "opcua-client";
        const zip = createZipBlob([
            { name: `${baseName}_cert.pem`, content: result.certificatePem },
            { name: `${baseName}_key.pem`, content: result.keyPem },
        ]);
        downloadBlob(zip, `${baseName}_certificate.zip`);
    };

    return (
        <div className="modal-overlay" onMouseDown={onClose}>
            <div className="modal modal-md" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="modal-header-title">
                        <Icon name="verified_user" className="text-primary" />
                        Generate Certificate
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-4 hover:bg-surface-hover rounded-base tooltip"
                        data-tooltip="Close"
                    >
                        <Icon name="close" />
                    </button>
                </div>

                <form onSubmit={handleGenerate}>
                    <div className="modal-body space-y-16">
                        <div className="grid grid-cols-2 gap-8">
                            <div>
                                <label className="form-label">Name</label>
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => {
                                        setName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""));
                                        setResult(null);
                                    }}
                                    className="w-full"
                                    placeholder="e.g. opc-main"
                                />
                            </div>
                            <div>
                                <label className="form-label">Valid days</label>
                                <input
                                    type="number"
                                    min="1"
                                    required
                                    value={days}
                                    onChange={(e) => {
                                        setDays(e.target.value);
                                        setResult(null);
                                    }}
                                    className="w-full"
                                />
                            </div>
                        </div>

                        {result?.applicationUri && (
                            <div className="text-xs text-on-surface-tertiary" style={{ wordBreak: "break-all" }}>
                                applicationUri: {result.applicationUri}
                            </div>
                        )}

                        {result && (
                            <div className="grid grid-cols-2 gap-8">
                                <div>
                                    <label className="form-label">Cert PEM</label>
                                    <textarea
                                        readOnly
                                        value={result.certificatePem || ""}
                                        className="w-full pem-drop-input"
                                        rows={6}
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Key PEM</label>
                                    <textarea
                                        readOnly
                                        value={result.keyPem || ""}
                                        className="w-full pem-drop-input"
                                        rows={6}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="modal-footer">
                        {message && (
                            <span
                                className="text-xs mr-auto"
                                style={{ color: message.type === "success" ? "var(--color-success)" : "var(--color-danger)" }}
                            >
                                {message.text}
                            </span>
                        )}
                        {result?.certificatePem && result?.keyPem && (
                            <button
                                type="button"
                                onClick={handleDownloadZip}
                                className="btn btn-content btn-primary"
                            >
                                <Icon name="download" className="icon-sm" />
                                Download ZIP
                            </button>
                        )}
                        <button type="button" onClick={onClose} className="btn btn-ghost">
                            Close
                        </button>
                        {!result && (
                            <button type="submit" disabled={generating || !onGenerate} className="btn btn-content btn-primary">
                                <Icon name={generating ? "progress_activity" : "verified_user"} className="icon-sm" />
                                {generating ? "Generating..." : "Generate"}
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}
