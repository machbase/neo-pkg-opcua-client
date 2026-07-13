import { useEffect, useState } from "react";
import ConfirmDialog from "../common/ConfirmDialog";
import Icon from "../common/Icon";
import OpcuaCertificateGeneratorModal from "./OpcuaCertificateGeneratorModal";
import OpcuaServerForm from "./OpcuaServerForm";

const STATUS_BADGE = {
    checking: (
        <span className="server-status server-status--checking">
            <span className="server-status-dot" />
            Checking...
        </span>
    ),
    healthy: (
        <span className="server-status server-status--ok">
            <span className="server-status-dot" />
            Connected
        </span>
    ),
    unhealthy: (
        <span className="server-status server-status--fail">
            <span className="server-status-dot" />
            Failed
        </span>
    ),
};

function describeServer(srv) {
    const security = srv.security || {};
    const isEncrypted = security.messageSecurityMode === "SignAndEncrypt";
    const mode = isEncrypted ? "Sign & Encrypt" : "None";
    const auth = security.enabled ? security.authMode || "Anonymous" : "Anonymous";
    return `${srv.endpoint || ""} · ${mode} · ${auth}`;
}

export default function OpcuaServerSettingsModal({
    opcuaServers,
    loading,
    onAdd,
    onEdit,
    onDelete,
    onHealthCheck,
    onFormHealthCheck,
    onGenerateSelfSignedCertificate,
    onRefresh,
    onClose,
    autoOpenForm = false,
}) {
    const [showForm, setShowForm] = useState(autoOpenForm);
    const [showCertificateGenerator, setShowCertificateGenerator] = useState(false);
    const [editingServer, setEditingServer] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [healthResults, setHealthResults] = useState({});

    useEffect(() => {
        if (autoOpenForm) return;
        onRefresh?.();
    }, [autoOpenForm, onRefresh]);

    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === "Escape" && !showForm && !showCertificateGenerator && !confirmDelete) onClose();
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [onClose, showForm, showCertificateGenerator, confirmDelete]);

    const handleSave = async (data) => {
        try {
            if (editingServer) {
                await onEdit(editingServer.name, data);
            } else {
                await onAdd(data);
            }
            setShowForm(false);
            setEditingServer(null);
            if (autoOpenForm) onClose();
        } catch {
            return;
        }
    };

    const handleDelete = async () => {
        try {
            await onDelete(confirmDelete);
            setConfirmDelete(null);
        } catch {
            return;
        }
    };

    const handleHealthCheck = async (srv) => {
        setHealthResults((prev) => ({ ...prev, [srv.name]: "checking" }));
        try {
            await onHealthCheck(srv.name);
            setHealthResults((prev) => ({ ...prev, [srv.name]: "healthy" }));
        } catch {
            setHealthResults((prev) => ({ ...prev, [srv.name]: "unhealthy" }));
        }
    };

    const handleFormHealthCheck = async (data) => {
        if (!onFormHealthCheck) return;
        return onFormHealthCheck(data);
    };

    if (autoOpenForm) {
        return (
            <OpcuaServerForm
                server={null}
                onSave={handleSave}
                onConnectionTest={handleFormHealthCheck}
                onClose={onClose}
            />
        );
    }

    return (
        <>
            <div className="modal-overlay" onMouseDown={onClose}>
                <div className="modal modal-lg" onMouseDown={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                        <div className="modal-header-title">
                            <Icon name="sensors" className="text-primary" />
                            OPC UA Servers
                        </div>
                        <button
                            onClick={onClose}
                            className="p-4 hover:bg-surface-hover rounded-base tooltip"
                            data-tooltip="Close"
                        >
                            <Icon name="close" />
                        </button>
                    </div>

                    <div className="modal-body">
                        {loading ? (
                            <p className="text-on-surface-tertiary text-base py-8 text-center">Loading...</p>
                        ) : opcuaServers.length === 0 ? (
                            <div className="text-center py-32 text-on-surface-tertiary">
                                <Icon name="sensors" className="icon-lg mb-8 opacity-20" />
                                <p className="text-sm font-medium">No OPC UA servers configured</p>
                                <p className="text-xs mt-4 opacity-60">Add a server to get started</p>
                            </div>
                        ) : (
                            <div className="server-card-list">
                                {opcuaServers.map((srv) => (
                                    <div key={srv.name} className="server-card">
                                        <div className="server-card-info">
                                            <div className="server-card-name-row">
                                                <Icon name="sensors" className="text-primary" />
                                                <span className="server-card-name">{srv.name}</span>
                                                {srv.security?.messageSecurityMode === "SignAndEncrypt" && (
                                                    <span className="badge badge-primary" style={{ fontSize: 10, padding: "2px 6px" }}>
                                                        Sign &amp; Encrypt
                                                    </span>
                                                )}
                                                {healthResults[srv.name] && STATUS_BADGE[healthResults[srv.name]]}
                                            </div>
                                            <div className="server-card-detail">{describeServer(srv)}</div>
                                        </div>
                                        <div className="server-card-actions">
                                            <button
                                                onClick={() => handleHealthCheck(srv)}
                                                className="server-card-action tooltip"
                                                data-tooltip="Connection Test"
                                            >
                                                <Icon name="electrical_services" />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setEditingServer(srv);
                                                    setShowForm(true);
                                                }}
                                                className="server-card-action tooltip"
                                                data-tooltip="Edit"
                                            >
                                                <Icon name="edit" />
                                            </button>
                                            <button
                                                onClick={() => setConfirmDelete(srv.name)}
                                                className="server-card-action server-card-action--danger tooltip"
                                                data-tooltip="Delete"
                                            >
                                                <Icon name="delete" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="modal-footer">
                        <button
                            type="button"
                            onClick={() => setShowCertificateGenerator(true)}
                            disabled={!onGenerateSelfSignedCertificate}
                            className="btn btn-primary btn-icon tooltip mr-auto"
                            data-tooltip="Generate Certificate"
                            aria-label="Generate Certificate"
                        >
                            <Icon name="key" />
                        </button>
                        <button onClick={onClose} className="btn btn-content btn-ghost">
                            Close
                        </button>
                        <button
                            onClick={() => {
                                setEditingServer(null);
                                setShowForm(true);
                            }}
                            className="btn btn-content btn-primary"
                        >
                            <Icon name="add" />
                            Add OPC UA Server
                        </button>
                    </div>
                </div>
            </div>

            {showForm && (
                <OpcuaServerForm
                    server={editingServer}
                    onSave={handleSave}
                    onConnectionTest={handleFormHealthCheck}
                    onClose={() => {
                        setShowForm(false);
                        setEditingServer(null);
                        if (autoOpenForm) onClose();
                    }}
                />
            )}

            {showCertificateGenerator && (
                <OpcuaCertificateGeneratorModal
                    onGenerate={onGenerateSelfSignedCertificate}
                    onClose={() => setShowCertificateGenerator(false)}
                />
            )}

            {confirmDelete && (
                <ConfirmDialog
                    title="Delete OPC UA Server"
                    message={`Are you sure you want to delete OPC UA server "${confirmDelete}"?`}
                    confirmLabel="Delete"
                    onConfirm={handleDelete}
                    onCancel={() => setConfirmDelete(null)}
                />
            )}
        </>
    );
}
