import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useApp } from "../context/AppContext";
import * as api from "../api/collectors";
import StatusBadge from "../components/common/StatusBadge";
import ConfirmDialog from "../components/common/ConfirmDialog";
import Icon from "../components/common/Icon";

export default function DashboardPage({ collectors, onDelete }) {
    const navigate = useNavigate();
    const { selectedCollectorId, setSelectedCollectorId, notify } = useApp();
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [detail, setDetail] = useState(null);

    const collector = collectors.find((c) => c.id === selectedCollectorId);

    useEffect(() => {
        if (!selectedCollectorId && collectors.length > 0) {
            setSelectedCollectorId(collectors[0].id);
        }
    }, [collectors, selectedCollectorId, setSelectedCollectorId]);

    useEffect(() => {
        if (!selectedCollectorId) {
            setDetail(null);
            return;
        }
        api.getCollector(selectedCollectorId)
            .then((data) => setDetail(data))
            .catch((e) => {
                notify(e.reason || e.message, "error");
                setDetail(null);
            });
    }, [selectedCollectorId, notify]);

    if (!collector) {
        return (
            <div className="empty-state flex flex-col items-center justify-center h-full">
                <Icon name="inbox" className="icon-lg opacity-30 mb-3" />
                <p className="text-md font-medium text-on-surface-tertiary">{collectors.length === 0 ? "No collectors yet" : "Select a collector from the sidebar"}</p>
                {collectors.length === 0 && <p className="text-sm mt-1">Click "New" to get started</p>}
            </div>
        );
    }

    const handleDelete = async () => {
        await onDelete(collector.id);
        setSelectedCollectorId(null);
        setConfirmDelete(false);
    };

    const config = detail?.config;
    const opcua = config?.opcua;
    const db = config?.db;
    const log = config?.log;
    const nodes = opcua?.nodes || [];

    return (
        <div className="page">
            <div className="page-header">
                <div className="page-header-inner">
                    <div className="page-title-group min-w-0 !mb-0">
                        <div className="flex items-center gap-3">
                            <h1 className="page-title truncate">{collector.id}</h1>
                            <StatusBadge status={collector.status} />
                        </div>
                        <p className="page-desc">
                            {collector.status === "running"
                                ? "Active session connected. Collecting data from OPC UA server."
                                : "Collector is stopped. Configuration available for editing."}
                        </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <button
                            disabled={collector.status === "running"}
                            onClick={() => navigate(`/collectors/${encodeURIComponent(collector.id)}/edit`)}
                            className="btn btn-primary-outline"
                        >
                            <Icon name="edit" className="icon-sm" />
                            <span>Edit</span>
                        </button>
                        <button disabled={collector.status === "running"} onClick={() => setConfirmDelete(true)} className="btn btn-danger">
                            <Icon name="delete" className="icon-sm" />
                            <span>Delete</span>
                        </button>
                    </div>
                </div>
            </div>
            <div className="page-body">
              <div className="page-body-inner">
            {config && (
                <div className="space-y-4">
                    {/* Row 1: OPC UA + Database */}
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                        {/* OPC UA — 3/5 */}
                        <div className="form-card lg:col-span-3">
                            <div className="form-card-header">
                                <Icon name="sensors" className="text-primary" />
                                OPC UA Configuration
                            </div>
                            <div className="space-y-6">
                                {/* Row 1: Interval / ReadRetry */}
                                <div className="flex gap-10">
                                    <div>
                                        <div className="form-label">Interval</div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-xl font-bold">{opcua?.interval || "-"}</span>
                                            <span className="text-sm text-on-surface-disabled">ms</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="form-label">Read Retry</div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-xl font-bold">{opcua?.readRetryInterval ?? 100}</span>
                                            <span className="text-sm text-on-surface-disabled">ms</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Row 2: Endpoint */}
                                <div>
                                    <div className="form-label">Endpoint URL</div>
                                    <div className="dash-field-box w-full font-mono">{opcua?.endpoint || "-"}</div>
                                </div>
                            </div>
                        </div>

                        {/* Database — 2/5 */}
                        <div className="form-card lg:col-span-2">
                            <div className="form-card-header">
                                <Icon name="database" className="text-primary" />
                                Database Sync
                            </div>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="form-label !mb-0">Target Table</span>
                                    <span className="font-bold">{db?.table || "-"}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="form-label !mb-0">Host Address</span>
                                    <span className="font-mono">
                                        {db?.host || "127.0.0.1"}:{db?.port || 5656}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="form-label !mb-0">User Authority</span>
                                    <span className="font-semibold">{db?.user || "sys"}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Row 2: Monitored Nodes — full width */}
                    <div className="form-card">
                        <div className="form-card-header">
                            <Icon name="account_tree" className="text-primary" />
                            Monitored Nodes
                            <span className="badge badge-primary ml-2">{nodes.length} Nodes</span>
                            <button
                                type="button"
                                disabled={collector.status === "running"}
                                onClick={() => navigate(`/collectors/${encodeURIComponent(collector.id)}/edit`)}
                                className="ml-auto text-primary text-xs font-semibold uppercase tracking-wide hover:text-primary-hover transition-colors"
                            >
                                Manage All
                            </button>
                        </div>
                        {nodes.length > 0 ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                                {nodes.map((node, i) => (
                                    <div key={i} className="px-4 py-3 bg-surface-alt border border-border rounded-base">
                                        <div className="font-semibold mb-1">{node.name}</div>
                                        <div className="text-xs text-on-surface-disabled font-mono">{node.nodeId}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-on-surface-disabled">No nodes configured</p>
                        )}
                    </div>

                    {/* Row 3: Logging — full width */}
                    <div className="form-card">
                        <div className="form-card-header">
                            <Icon name="description" className="text-primary" />
                            Logging & Diagnostics
                        </div>
                        <div className="space-y-6">
                            {/* Row 1: Level / Format / Output + Rotation */}
                            <div className="flex justify-between items-start">
                                <div className="flex gap-10">
                                    <div>
                                        <div className="form-label">Level</div>
                                        <span className="badge badge-primary">{log?.level || "INFO"}</span>
                                    </div>
                                    <div>
                                        <div className="form-label">Format</div>
                                        <span className="badge">{(log?.format || "json").toUpperCase()}</span>
                                    </div>
                                    <div>
                                        <div className="form-label">Output</div>
                                        <div className="font-semibold uppercase text-sm">
                                            {log?.output || "console"}
                                            {log?.output === "both" && <span className="text-on-surface-disabled font-normal"> (CLI + File)</span>}
                                        </div>
                                    </div>
                                </div>

                                {(log?.output === "file" || log?.output === "both") && log?.file && (
                                    <div className="text-right">
                                        <div className="form-label">Rotation Policy</div>
                                        <div className="font-bold uppercase">
                                            {log.file.rotate || "size"} / {log.file.maxSize || "10MB"}
                                        </div>
                                        <div className="text-xs text-on-surface-disabled mt-1">Max retention: {log.file.maxFiles || 7} files</div>
                                    </div>
                                )}
                            </div>

                            {/* Row 2: File Path */}
                            {(log?.output === "file" || log?.output === "both") && log?.file && (
                                <div>
                                    <div className="form-label">File Path</div>
                                    <div className="dash-field-box w-full font-mono">{log.file.path || "-"}</div>
                                </div>
                            )}

                            {log?.output === "console" && <div className="text-sm text-on-surface-disabled">File logging disabled</div>}
                        </div>
                    </div>
                </div>
            )}
              </div>
            </div>
            {confirmDelete && (
                <ConfirmDialog
                    title="Delete Collector"
                    message={`Are you sure you want to delete "${collector.id}"? This action cannot be undone.`}
                    onConfirm={handleDelete}
                    onCancel={() => setConfirmDelete(false)}
                />
            )}
        </div>
    );
}
