import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { useApp } from "../context/AppContext";
import * as api from "../api/collectors";
import StatusBadge from "../components/common/StatusBadge";
import ConfirmDialog from "../components/common/ConfirmDialog";
import LogViewerModal from "../components/logs/LogViewerModal";
import LiveLogs from "../components/logs/LiveLogs";
import Icon from "../components/common/Icon";

function timeAgo(ts) {
    if (!ts) return "-";
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 5) return "just now";
    if (sec < 60) return `${sec} seconds ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return min === 1 ? "1 minute ago" : `${min} minutes ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr === 1 ? "1 hour ago" : `${hr} hours ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return day === 1 ? "yesterday" : `${day} days ago`;
    const week = Math.floor(day / 7);
    if (week < 5) return week === 1 ? "1 week ago" : `${week} weeks ago`;
    const month = Math.floor(day / 30);
    if (month < 12) return month === 1 ? "1 month ago" : `${month} months ago`;
    const year = Math.floor(day / 365);
    return year === 1 ? "last year" : `${year} years ago`;
}

const LEVEL_ORDER = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"];

const LEVEL_COLOR = {
    TRACE: "var(--color-on-surface-disabled)",
    DEBUG: "var(--color-primary-hover)",
    INFO: "var(--color-success)",
    WARN: "var(--color-warning)",
    ERROR: "var(--color-error)",
};

const LEVEL_BADGE_CLASS = {
    TRACE: "badge badge-muted",
    DEBUG: "badge badge-primary",
    INFO: "badge badge-success",
    WARN: "badge badge-warning",
    ERROR: "badge badge-error",
};

function recordedLevels(level) {
    const idx = LEVEL_ORDER.indexOf(level);
    if (idx === -1) return [];
    return LEVEL_ORDER.slice(idx);
}

function formatTransform(node) {
    const bias = node.bias != null ? Number(node.bias) : null;
    const mult = node.multiplier != null ? Number(node.multiplier) : null;
    const hasBias = bias != null && !Number.isNaN(bias) && bias !== 0;
    const hasMult = mult != null && !Number.isNaN(mult) && mult !== 1;
    if (!hasBias && !hasMult) return null;
    if (hasBias && hasMult) {
        if (node.calcOrder === "mb") return `(value × ${mult}) + ${bias}`;
        return `(value + ${bias}) × ${mult}`;
    }
    if (hasBias) return `value + ${bias}`;
    return `value × ${mult}`;
}

export default function DashboardPage({ collectors, detail, onDelete }) {
    const navigate = useNavigate();
    const { selectedCollectorId, setSelectedCollectorId } = useApp();
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [showLogs, setShowLogs] = useState(false);
    const [lastCollectedAt, setLastCollectedAt] = useState(null);
    const [opcuaReachable, setOpcuaReachable] = useState(null);
    const [opcuaError, setOpcuaError] = useState(null);
    const [nodeFilter, setNodeFilter] = useState("");
    const [sortKey, setSortKey] = useState("name");
    const [sortDir, setSortDir] = useState("asc");
    const intervalRef = useRef(null);
    const abnormalCheckedRef = useRef(false);

    const collector = collectors.find((c) => c.id === selectedCollectorId);

    const config = detail?.config;
    const opcua = config?.opcua;

    const fetchLastTime = useCallback(async (name, params) => {
        let ts = null;
        try {
            ts = await api.getLastCollectedTime(name);
            setLastCollectedAt(ts);
        } catch {
            setLastCollectedAt(null);
            return;
        }
        const { interval, endpoint, readRetryInterval, running } = params;
        const abnormal =
            running && interval > 0 && (ts == null || Date.now() - ts > 3 * interval);

        if (!abnormal) {
            abnormalCheckedRef.current = false;
            setOpcuaReachable(null);
            setOpcuaError(null);
            return;
        }

        if (abnormalCheckedRef.current || !endpoint) return;
        abnormalCheckedRef.current = true;

        try {
            await api.testOpcuaConnection(endpoint, readRetryInterval);
            setOpcuaReachable(true);
            setOpcuaError(null);
        } catch (e) {
            setOpcuaReachable(false);
            setOpcuaError(e.reason || e.message || "connection failed");
        }
    }, []);

    useEffect(() => {
        clearInterval(intervalRef.current);
        setLastCollectedAt(null);
        setOpcuaReachable(null);
        setOpcuaError(null);
        abnormalCheckedRef.current = false;
        if (!collector) return;
        const params = {
            interval: Number(opcua?.interval) || 0,
            endpoint: opcua?.endpoint,
            readRetryInterval: opcua?.readRetryInterval != null ? Number(opcua.readRetryInterval) : undefined,
            running: collector.status === "running",
        };
        fetchLastTime(collector.id, params);
        intervalRef.current = setInterval(() => fetchLastTime(collector.id, params), 5000);
        return () => clearInterval(intervalRef.current);
    }, [collector?.id, collector?.status, opcua?.interval, opcua?.endpoint, opcua?.readRetryInterval, fetchLastTime]);

    const dbServer = typeof config?.db === "string" ? config.db : "";
    const dbTable = config?.dbTable || "";
    const valueColumn = config?.valueColumn || "";
    const stringValueColumn = config?.stringValueColumn || "";
    const stringOnly = Boolean(config?.stringOnly);
    const nodes = opcua?.nodes || [];
    const logLevel = (config?.log?.level || "INFO").toUpperCase();
    const logLevels = recordedLevels(logLevel);
    const logMaxFiles = config?.log?.maxFiles;

    const displayNodes = useMemo(() => {
        const q = nodeFilter.trim().toLowerCase();
        const filtered = q
            ? nodes.filter(
                  (n) =>
                      (n.name || "").toLowerCase().includes(q) ||
                      (n.nodeId || "").toLowerCase().includes(q)
              )
            : nodes.slice();
        const dir = sortDir === "asc" ? 1 : -1;
        filtered.sort((a, b) => {
            const av = (a[sortKey] || "").toString().toLowerCase();
            const bv = (b[sortKey] || "").toString().toLowerCase();
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
            return 0;
        });
        return filtered;
    }, [nodes, nodeFilter, sortKey, sortDir]);

    if (!collector) {
        return (
            <div className="empty-state flex flex-col items-center justify-center h-full">
                <Icon name="inbox" className="icon-lg opacity-30 mb-12" />
                <p className="text-md font-medium text-on-surface-tertiary">{collectors.length === 0 ? "No jobs yet" : "Select a job from the sidebar"}</p>
                {collectors.length === 0 && <p className="text-sm mt-4">Click "New" to get started</p>}
            </div>
        );
    }

    const handleDelete = async () => {
        await onDelete(collector.id);
        setSelectedCollectorId(null);
        setConfirmDelete(false);
    };

    const toggleSort = (key) => {
        if (sortKey === key) {
            setSortDir(sortDir === "asc" ? "desc" : "asc");
        } else {
            setSortKey(key);
            setSortDir("asc");
        }
    };

    const sortIcon = (key) => {
        if (sortKey !== key) return "unfold_more";
        return sortDir === "asc" ? "arrow_upward" : "arrow_downward";
    };

    return (
        <div className="page">
            <header className="page-header">
                <div className="page-header-inner">
                    <div className="flex items-center gap-12">
                        <h2 className="page-title truncate">{collector.id}</h2>
                        <StatusBadge status={collector.status} />
                    </div>
                    <div className="flex gap-8 shrink-0">
                        <button
                            disabled={collector.status === "running"}
                            onClick={() => navigate(`/collectors/${encodeURIComponent(collector.id)}/edit`)}
                            className="btn btn-primary"
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
            </header>
            <div className="page-body">
                <div className="page-body-inner">
            {config && (
                <div className="space-y-16">
                    {/* Row 1: Hero Summary — OPC UA / Nodes / Database */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
                        {/* OPC UA Server */}
                        <div className="form-card flex flex-col">
                            <div className="flex items-start justify-between mb-16">
                                <div className="flex items-center gap-12">
                                    <div className="form-card-header !mb-0">OPC UA</div>
                                    {opcuaReachable === false && (
                                        <span
                                            className="badge badge-error"
                                            title={opcuaError || undefined}
                                            style={{ fontSize: 10, padding: "2px 6px" }}
                                        >
                                            Disconnected
                                        </span>
                                    )}
                                    {opcuaReachable === true && (
                                        <span
                                            className="badge badge-warning"
                                            title="Server is reachable but the collector hasn't updated for a while"
                                            style={{ fontSize: 10, padding: "2px 6px" }}
                                        >
                                            Stale
                                        </span>
                                    )}
                                </div>
                                <Icon name="sensors" className="text-primary" />
                            </div>
                            <div className="form-label">Server</div>
                            <div className="text-lg font-bold truncate mb-20" title={opcua?.endpoint}>
                                {opcua?.endpoint || "-"}
                            </div>
                            <div className="flex gap-24 mt-auto">
                                <div>
                                    <div className="form-label">Interval</div>
                                    <div className="flex items-baseline gap-4">
                                        <span className="text-base font-mono font-semibold">{opcua?.interval || "-"}</span>
                                        <span className="text-xs text-on-surface-disabled">ms</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="form-label">Read Retry</div>
                                    <div className="flex items-baseline gap-4">
                                        <span className="text-base font-mono font-semibold">{opcua?.readRetryInterval ?? 100}</span>
                                        <span className="text-xs text-on-surface-disabled">ms</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Nodes Monitored */}
                        <div className="form-card flex flex-col items-center justify-center text-center">
                            <div className="text-5xl font-bold text-primary-hover leading-none mb-12">{nodes.length}</div>
                            <div className="form-label">Nodes Monitored</div>
                            <div className="flex flex-col items-center gap-2 text-xs">
                                <div className="flex items-center gap-6">
                                    <Icon name="timer" className="icon-sm text-on-surface-tertiary" />
                                    <span className="text-on-surface-secondary">{timeAgo(lastCollectedAt)}</span>
                                </div>
                                {lastCollectedAt && (
                                    <span className="text-on-surface-tertiary opacity-50">
                                        {new Date(lastCollectedAt).toLocaleString()}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Database */}
                        <div className="form-card flex flex-col">
                            <div className="flex items-start justify-between mb-16">
                                <div className="form-card-header !mb-0">Database</div>
                                <Icon name="database" className="text-primary" />
                            </div>
                            <div className="form-label">Server</div>
                            <div className="text-lg font-bold truncate mb-20" title={dbServer}>
                                {dbServer || "-"}
                            </div>
                            <div className="flex gap-24 mt-auto">
                                <div className="min-w-0 flex-1">
                                    <div className="form-label">Table</div>
                                    <div className="text-base font-mono font-semibold truncate" title={dbTable}>
                                        {dbTable || "-"}
                                    </div>
                                </div>
                                {!stringOnly && (
                                    <div className="min-w-0 flex-1">
                                        <div className="form-label">Value Column</div>
                                        <div className="text-base font-mono font-semibold truncate" title={valueColumn}>
                                            {valueColumn || "-"}
                                        </div>
                                    </div>
                                )}
                                {(stringOnly || stringValueColumn) && (
                                    <div className="min-w-0 flex-1">
                                        <div className="form-label">
                                            String Column
                                            {stringOnly && (
                                                <span className="badge badge-muted ml-4" style={{ fontSize: 10, padding: "2px 5px" }}>
                                                    only
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-base font-mono font-semibold truncate" title={stringValueColumn}>
                                            {stringValueColumn || "-"}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Row 2: Monitored Nodes — full width */}
                    <div className="form-card">
                        <div className="flex items-center justify-between mb-16">
                            <div className="form-card-header !mb-0">
                                <Icon name="account_tree" className="text-primary" />
                                Monitored Nodes
                                <span className="badge badge-primary ml-8">{nodes.length} Nodes</span>
                            </div>
                            {nodes.length > 0 && (
                                <input
                                    type="text"
                                    value={nodeFilter}
                                    onChange={(e) => setNodeFilter(e.target.value)}
                                    className="w-[240px]"
                                    placeholder="Filter nodes..."
                                />
                            )}
                        </div>
                        {nodes.length > 0 ? (
                            <div className="max-h-[420px] overflow-y-auto">
                                <table className="table-clean">
                                    <thead>
                                        <tr>
                                            <th>
                                                <button type="button" className={`th-sort${sortKey === "name" ? " is-active" : ""}`} onClick={() => toggleSort("name")}>
                                                    Tag Name
                                                    <Icon name={sortIcon("name")} className="icon-sm" />
                                                </button>
                                            </th>
                                            <th>
                                                <button type="button" className={`th-sort${sortKey === "nodeId" ? " is-active" : ""}`} onClick={() => toggleSort("nodeId")}>
                                                    Node ID
                                                    <Icon name={sortIcon("nodeId")} className="icon-sm" />
                                                </button>
                                            </th>
                                            <th>Transform</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {displayNodes.map((node, i) => {
                                            const transform = formatTransform(node);
                                            return (
                                                <tr key={`${node.nodeId}-${i}`}>
                                                    <td className="font-semibold" title={node.name}>{node.name}</td>
                                                    <td className="mono" title={node.nodeId}>{node.nodeId}</td>
                                                    <td className="mono" style={{ color: "var(--color-primary-hover)" }} title={transform || undefined}>{transform || "—"}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                {nodeFilter && displayNodes.length === 0 && (
                                    <div className="empty-state">No nodes matching "{nodeFilter}"</div>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-on-surface-disabled">No nodes configured</p>
                        )}
                    </div>

                    {/* Row 3: Logging Controls — summary bar */}
                    <div className="form-card" style={{ paddingTop: 16, paddingBottom: 16 }}>
                        <div className="flex items-center justify-between gap-24 flex-wrap">
                            <div className="form-card-header !mb-0">
                                <Icon name="terminal" className="text-primary" />
                                Logging Controls
                            </div>
                            <div className="flex items-center gap-24 flex-wrap">
                                <div className="flex items-center gap-8">
                                    <span className="form-label !mb-0">Log Level</span>
                                    <span className={LEVEL_BADGE_CLASS[logLevel] || "badge badge-muted"}>
                                        {logLevel}
                                    </span>
                                </div>
                                {logLevels.length > 0 && (
                                    <span className="text-sm text-on-surface-tertiary">
                                        Records{" "}
                                        {logLevels.map((lvl, i) => (
                                            <span key={lvl}>
                                                <span style={{ color: LEVEL_COLOR[lvl], fontWeight: 600 }}>
                                                    {lvl}
                                                </span>
                                                {i < logLevels.length - 1 ? ", " : ""}
                                            </span>
                                        ))}
                                        {" "}messages
                                    </span>
                                )}
                                <div className="flex items-center gap-8">
                                    <span className="form-label !mb-0">File Limit</span>
                                    <span className="text-base font-mono font-semibold">
                                        {logMaxFiles ?? "-"}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowLogs(true)}
                                    className="btn btn-sm btn-primary-outline"
                                >
                                    <Icon name="description" className="icon-sm" />
                                    View Logs
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Row 4: Live Logs */}
                    <LiveLogs collectorId={collector.id} />

                </div>
            )}
              </div>
            </div>
            {confirmDelete && (
                <ConfirmDialog
                    title="Delete Job"
                    message={`Are you sure you want to delete "${collector.id}"? This action cannot be undone.`}
                    confirmLabel="Delete"
                    onConfirm={handleDelete}
                    onCancel={() => setConfirmDelete(false)}
                />
            )}
            {showLogs && (
                <LogViewerModal
                    collectorId={collector.id}
                    onClose={() => setShowLogs(false)}
                />
            )}
        </div>
    );
}
