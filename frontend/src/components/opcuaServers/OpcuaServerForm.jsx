import { useEffect, useState } from "react";
import Icon from "../common/Icon";
import { koToEn } from "../../utils/korean";

const DEFAULT_CAPABILITIES = {
    maxNodesPerRead: null,
    maxNodesPerReadSource: "default",
    checkedAt: "",
};

const DEFAULT_FORM = {
    name: "",
    endpoint: "opc.tcp://127.0.0.1:4840",
    readBatchSize: 32,
    capabilities: DEFAULT_CAPABILITIES,
    securityMode: "None",
    securityPolicy: "None",
    authMode: "Anonymous",
    username: "",
    password: "",
    certificatePem: "",
    keyPem: "",
};

function initialForm(server) {
    if (!server) return { ...DEFAULT_FORM };
    const security = server.security || {};
    const secure = security.enabled === true && security.messageSecurityMode === "SignAndEncrypt";
    const capabilities = server.capabilities || DEFAULT_CAPABILITIES;
    const readBatchSize = Number(server.readBatchSize) > 0 ? Number(server.readBatchSize) : (capabilities.maxNodesPerRead || 32);
    return {
        ...DEFAULT_FORM,
        name: server.name || "",
        endpoint: server.endpoint || DEFAULT_FORM.endpoint,
        readBatchSize,
        capabilities,
        securityMode: secure ? "SignAndEncrypt" : "None",
        securityPolicy: secure ? security.securityPolicy || "Basic256Sha256" : "None",
        authMode: security.authMode || DEFAULT_FORM.authMode,
        username: security.username || "",
        password: "",
        certificatePem: "",
        keyPem: "",
    };
}

export default function OpcuaServerForm({ server, onSave, onConnectionTest, onClose }) {
    const isEdit = Boolean(server);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [draggingField, setDraggingField] = useState(null);
    const [activeTab, setActiveTab] = useState("server");
    const [connectionReady, setConnectionReady] = useState(() => isEdit);
    const [form, setForm] = useState(() => initialForm(server));

    const isSecure = form.securityMode === "SignAndEncrypt";
    const availableAuthModes = ["Anonymous", "UserName"];
    const usesUserName = form.authMode === "UserName";
    const usesCertificate = isSecure;
    const hasStoredCertificate = Boolean(server?.security?.hasCertificate);
    const readBatchLimit = Number(form.capabilities?.maxNodesPerRead) > 0 ? Number(form.capabilities.maxNodesPerRead) : 32;

    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [onClose]);

    const update = (patch, options = {}) => {
        setForm((prev) => ({ ...prev, ...patch }));
        if (options.resetConnection) {
            setConnectionReady(false);
            setTestResult(null);
        }
    };

    const handlePemDragOver = (e, field) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDraggingField(field);
    };

    const handlePemDrop = async (e, field) => {
        e.preventDefault();
        setDraggingField(null);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        update({ [field]: await file.text() }, { resetConnection: true });
    };

    const handlePemFileChange = async (e, field) => {
        const file = e.target.files?.[0];
        if (!file) return;
        update({ [field]: await file.text() }, { resetConnection: true });
        e.target.value = "";
    };

    const handleSecurityModeChange = (securityMode) => {
        if (securityMode === "SignAndEncrypt") {
            update({
                securityMode,
                securityPolicy: form.securityPolicy && form.securityPolicy !== "None" ? form.securityPolicy : "Basic256Sha256",
            }, { resetConnection: true });
            return;
        }
        update({
            securityMode: "None",
            securityPolicy: "None",
            authMode: availableAuthModes.includes(form.authMode) ? form.authMode : "Anonymous",
            certificatePem: "",
            keyPem: "",
        }, { resetConnection: true });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await onSave(form);
        } finally {
            setSaving(false);
        }
    };

    const handleConnectionTest = async () => {
        if (!onConnectionTest || !form.endpoint || testing) return;
        setTesting(true);
        setTestResult(null);
        try {
            const result = await onConnectionTest(form);
            const capabilities = result?.capabilities || DEFAULT_CAPABILITIES;
            const readBatchSize = Number(result?.readBatchSize) > 0
                ? Number(result.readBatchSize)
                : (Number(capabilities.maxNodesPerRead) > 0 ? Number(capabilities.maxNodesPerRead) : 32);
            update({ readBatchSize, capabilities });
            setConnectionReady(true);
            setActiveTab("server");
            setTestResult({ type: "success", message: "Connected" });
        } catch (e) {
            setConnectionReady(false);
            setTestResult({ type: "error", message: e.reason || e.message || "Connection failed" });
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="modal-overlay" onMouseDown={onClose}>
            <div className="modal modal-md" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="modal-header-title">
                        <Icon name={isEdit ? "edit" : "add_circle"} className="text-primary" />
                        {isEdit ? "Edit OPC UA Server" : "Add OPC UA Server"}
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

                <form onSubmit={handleSubmit}>
                    <div className="modal-body space-y-16">
                        <div className="opcua-form-tabs" role="tablist">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={activeTab === "server"}
                                className={`opcua-form-tab${activeTab === "server" ? " opcua-form-tab--active" : ""}`}
                                onClick={() => setActiveTab("server")}
                            >
                                Server Input
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={activeTab === "security"}
                                className={`opcua-form-tab${activeTab === "security" ? " opcua-form-tab--active" : ""}`}
                                onClick={() => setActiveTab("security")}
                            >
                                Security
                            </button>
                        </div>

                        {activeTab === "server" && (
                            <div className="space-y-16">
                                <div>
                                    <label className="form-label">Name</label>
                                    <input
                                        type="text"
                                        required
                                        disabled={isEdit}
                                        value={form.name}
                                        onChange={(e) => update({ name: koToEn(e.target.value).replace(/[^a-zA-Z0-9_-]/g, "") })}
                                        className="w-full disabled:opacity-50"
                                        placeholder="e.g. opc-main"
                                    />
                                </div>

                                <div>
                                    <label className="form-label">Endpoint URL</label>
                                    <input
                                        type="text"
                                        required
                                        value={form.endpoint}
                                        onChange={(e) => update({ endpoint: e.target.value }, { resetConnection: true })}
                                        className="w-full"
                                        placeholder="opc.tcp://192.168.1.100:4840"
                                    />
                                </div>

                                <div>
                                    <label className="form-label">Read Batch Size ({readBatchLimit})</label>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        max={readBatchLimit}
                                        disabled={!connectionReady}
                                        value={form.readBatchSize}
                                        onChange={(e) => update({ readBatchSize: e.target.value })}
                                        className="w-full disabled:opacity-50"
                                    />
                                    <p className="text-xs text-on-surface-tertiary mt-4">
                                        {connectionReady
                                            ? `Max Nodes Per Read: ${form.capabilities?.maxNodesPerRead || "Not provided"}`
                                            : "Run Connection Test to enable this value."}
                                    </p>
                                </div>
                            </div>
                        )}

                        {activeTab === "security" && (
                            <div className="space-y-16">
                                <div className="grid grid-cols-2 gap-8">
                                    <div>
                                        <label className="form-label">Security Mode</label>
                                        <select
                                            value={form.securityMode}
                                            onChange={(e) => handleSecurityModeChange(e.target.value)}
                                            className="w-full"
                                        >
                                            <option value="None">None</option>
                                            <option value="SignAndEncrypt">Sign &amp; Encrypt</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="form-label">Security Policy</label>
                                        <select
                                            value={isSecure ? form.securityPolicy : "None"}
                                            onChange={(e) => update({ securityPolicy: e.target.value }, { resetConnection: true })}
                                            disabled={!isSecure}
                                            className="w-full disabled:opacity-50"
                                        >
                                            {!isSecure && <option value="None">None</option>}
                                            <option value="Basic256Sha256">Basic256Sha256</option>
                                            <option value="Basic256">Basic256</option>
                                            <option value="Aes128_Sha256_RsaOaep">Aes128_Sha256_RsaOaep</option>
                                            <option value="Aes256_Sha256_RsaPss">Aes256_Sha256_RsaPss</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="form-label">Auth Mode</label>
                                    <select
                                        value={availableAuthModes.includes(form.authMode) ? form.authMode : "Anonymous"}
                                        onChange={(e) => update({ authMode: e.target.value }, { resetConnection: true })}
                                        className="w-full"
                                    >
                                        {availableAuthModes.map((mode) => (
                                            <option key={mode} value={mode}>
                                                {mode === "UserName" ? "Username & Password" : mode}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {usesUserName && (
                            <div className="grid grid-cols-2 gap-8">
                                <div>
                                    <label className="form-label">Username</label>
                                    <input
                                        type="text"
                                        required
                                        value={form.username}
                                        onChange={(e) => update({ username: e.target.value }, { resetConnection: true })}
                                        className="w-full"
                                        placeholder="OPC UA user"
                                    />
                                </div>
                                <div>
                                    <label className="form-label">
                                        Password
                                        {isEdit && server?.security?.hasPassword && (
                                            <span className="text-on-surface-tertiary font-normal ml-4">(saved)</span>
                                        )}
                                    </label>
                                    <input
                                        type="password"
                                        required={!server?.security?.hasPassword}
                                        value={form.password}
                                        onChange={(e) => update({ password: koToEn(e.target.value) }, { resetConnection: true })}
                                        className="w-full input-password"
                                        placeholder={isEdit ? "Leave blank to keep" : "Enter password"}
                                        autoComplete="new-password"
                                    />
                                </div>
                            </div>
                                )}

                                {usesCertificate && (
                            <div className="grid grid-cols-2 gap-8">
                                <div>
                                    <label className="form-label pem-field-header">
                                        <span>
                                            Client Certificate PEM
                                            {isEdit && hasStoredCertificate && (
                                                <span className="text-on-surface-tertiary font-normal ml-4">(saved)</span>
                                            )}
                                        </span>
                                        <span className="pem-file-btn">
                                            Choose file
                                            <input
                                                type="file"
                                                accept=".pem,.crt,.cer,text/plain,application/x-pem-file"
                                                onChange={(e) => handlePemFileChange(e, "certificatePem")}
                                                style={{ display: "none" }}
                                            />
                                        </span>
                                    </label>
                                    <textarea
                                        required={!isEdit && !hasStoredCertificate}
                                        value={form.certificatePem}
                                        onChange={(e) => update({ certificatePem: e.target.value }, { resetConnection: true })}
                                        onDragOver={(e) => handlePemDragOver(e, "certificatePem")}
                                        onDragLeave={() => setDraggingField(null)}
                                        onDrop={(e) => handlePemDrop(e, "certificatePem")}
                                        className={`w-full pem-drop-input${draggingField === "certificatePem" ? " pem-drop-input--active" : ""}`}
                                        rows={6}
                                        placeholder={isEdit ? "Leave blank to keep" : "Paste PEM text or drop certificate file"}
                                    />
                                </div>
                                <div>
                                    <label className="form-label pem-field-header">
                                        <span>
                                            Client Key PEM
                                            {isEdit && hasStoredCertificate && (
                                                <span className="text-on-surface-tertiary font-normal ml-4">(saved)</span>
                                            )}
                                        </span>
                                        <span className="pem-file-btn">
                                            Choose file
                                            <input
                                                type="file"
                                                accept=".pem,.key,text/plain,application/x-pem-file"
                                                onChange={(e) => handlePemFileChange(e, "keyPem")}
                                                style={{ display: "none" }}
                                            />
                                        </span>
                                    </label>
                                    <textarea
                                        required={!isEdit && !hasStoredCertificate}
                                        value={form.keyPem}
                                        onChange={(e) => update({ keyPem: e.target.value }, { resetConnection: true })}
                                        onDragOver={(e) => handlePemDragOver(e, "keyPem")}
                                        onDragLeave={() => setDraggingField(null)}
                                        onDrop={(e) => handlePemDrop(e, "keyPem")}
                                        className={`w-full pem-drop-input${draggingField === "keyPem" ? " pem-drop-input--active" : ""}`}
                                        rows={6}
                                        placeholder={isEdit ? "Leave blank to keep" : "Paste PEM text or drop key file"}
                                    />
                                </div>
                            </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="modal-footer">
                        {testResult && (
                            <span
                                className="text-xs mr-auto"
                                style={{ color: testResult.type === "success" ? "var(--color-success)" : "var(--color-danger)" }}
                            >
                                {testResult.message}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={handleConnectionTest}
                            disabled={testing || !form.endpoint || !onConnectionTest}
                            className="btn btn-primary-outline"
                        >
                            <Icon name={testing ? "progress_activity" : "electrical_services"} className="icon-sm" />
                            {testing ? "Testing..." : "Connection Test"}
                        </button>
                        <button type="button" onClick={onClose} className="btn btn-ghost">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving || (!isEdit && !connectionReady)} className="btn btn-primary">
                            {isEdit ? "Update" : "Create"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
