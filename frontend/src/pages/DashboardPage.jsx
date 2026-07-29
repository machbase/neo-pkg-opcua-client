import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { useApp } from "../context/AppContext";
import * as api from "../api/collectors";
import StatusBadge from "../components/common/StatusBadge";
import ConfirmDialog from "../components/common/ConfirmDialog";
import LogViewerModal from "../components/logs/LogViewerModal";
import LiveLogs from "../components/logs/LiveLogs";
import Icon from "../components/common/Icon";
import TruncatedText from "../components/common/TruncatedText";
import { ON_ERROR_LABELS } from "../components/collectors/derivedTag";
import { POLICIES } from "../components/collectors/CollectionPolicyCard";
import { buildDataViewerPath, getTagTreePath } from "./dataViewerModel";

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

// Saved-config shape: variables is an { alias: nodeName } map, so read it in alias order.
function variableEntries(dt) {
    const map = dt?.variables;
    if (!map || typeof map !== "object" || Array.isArray(map)) return [];
    return Object.keys(map)
        .filter((a) => /^[A-Z]$/.test(a))
        .sort()
        .map((alias) => ({ alias, node: map[alias] == null ? "" : String(map[alias]) }));
}

function formatVariables(dt) {
    const entries = variableEntries(dt);
    if (entries.length === 0) return null;
    return entries.map((v) => `${v.alias} = ${v.node}`).join(", ");
}

// "latest" (newest sourceTime among the used nodes) or a specific variable's sourceTime,
// shown as "A · Random8" so the alias and the node it resolves to are both readable.
function formatBaseTime(dt) {
    const timeSource = dt?.timeSource || "latest";
    if (timeSource === "latest") return "latest";
    const match = variableEntries(dt).find((v) => v.alias === timeSource);
    return match && match.node ? `${match.alias} · ${match.node}` : timeSource;
}

// OPC UA tree path breadcrumb + depth badge, same shape as the edit form's NODE ID / PATH cell.
// getTagTreePath reads nodeTree first and falls back to the legacy treePath field.
function NodePath({ node }) {
    const path = getTagTreePath(node);
    if (!path) return null;
    const last = path.length - 1;
    return (
        <span className="inline-flex flex-wrap items-center gap-4 min-w-0">
            {path.map((seg, i) => (
                <span key={i} className="inline-flex items-center gap-4">
                    {i > 0 && <span className="text-on-surface-disabled">›</span>}
                    <span className={i === last ? "font-semibold text-on-surface" : "text-on-surface-secondary"}>{seg}</span>
                </span>
            ))}
            <span className="badge badge-primary badge-xs shrink-0">depth {path.length}</span>
        </span>
    );
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
    const [showLiveLogs, setShowLiveLogs] = useState(false);
    const [lastCollectedAt, setLastCollectedAt] = useState(null);
    const [opcuaReachable, setOpcuaReachable] = useState(null);
    const [opcuaError, setOpcuaError] = useState(null);
    const [nodeFilter, setNodeFilter] = useState("");
    const [sortKey, setSortKey] = useState("name");
    const [sortDir, setSortDir] = useState("asc");
    const [derivedFilter, setDerivedFilter] = useState("");
    const [derivedSortDir, setDerivedSortDir] = useState("asc");
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
        const { interval, target, readRetryInterval, running } = params;
        const abnormal = running && interval > 0 && (ts == null || Date.now() - ts > 3 * interval);

        if (!abnormal) {
            abnormalCheckedRef.current = false;
            setOpcuaReachable(null);
            setOpcuaError(null);
            return;
        }

        if (abnormalCheckedRef.current || (!target?.server && !target?.endpoint)) return;
        abnormalCheckedRef.current = true;

        try {
            await api.testOpcuaConnection(target, readRetryInterval);
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
            target: opcua?.server ? { server: opcua.server } : { endpoint: opcua?.endpoint },
            readRetryInterval: opcua?.readRetryInterval != null ? Number(opcua.readRetryInterval) : undefined,
            running: collector.status === "running",
        };
        fetchLastTime(collector.id, params);
        intervalRef.current = setInterval(() => fetchLastTime(collector.id, params), 5000);
        return () => clearInterval(intervalRef.current);
    }, [collector?.id, collector?.status, opcua?.interval, opcua?.server, opcua?.endpoint, opcua?.readRetryInterval, fetchLastTime]);

    const dbServer = typeof config?.db === "string" ? config.db : "";
    const opcuaServer = opcua?.server || "";
    const opcuaEndpoint = opcua?.endpoint || "";
    const opcuaDisplay = opcuaServer || opcuaEndpoint || "";
    const dbTable = config?.dbTable || "";
    const valueColumn = config?.valueColumn || "";
    const stringValueColumn = config?.stringValueColumn || "";
    const stringOnly = Boolean(config?.stringOnly);
    const nodes = opcua?.nodes || [];
    const derivedTags = Array.isArray(config?.derivedTags) ? config.derivedTags : [];
    const policyValues = { timePolicy: config?.timePolicy, badStatusPolicy: config?.badStatusPolicy };
    const logLevel = (config?.log?.level || "INFO").toUpperCase();
    const logLevels = recordedLevels(logLevel);
    const logMaxFiles = config?.log?.maxFiles;

    const displayNodes = useMemo(() => {
        const q = nodeFilter.trim().toLowerCase();
        const filtered = q ? nodes.filter((n) => (n.name || "").toLowerCase().includes(q) || (n.nodeId || "").toLowerCase().includes(q)) : nodes.slice();
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

    // Derived tags sort by name only — the config order carries no meaning, since a derived
    // expression can only reference source nodes, never another derived tag.
    const displayDerivedTags = useMemo(() => {
        const q = derivedFilter.trim().toLowerCase();
        const filtered = q
            ? derivedTags.filter((dt) => {
                  const haystack = [dt?.name, dt?.expression, formatVariables(dt)].filter(Boolean).join(" ").toLowerCase();
                  return haystack.includes(q);
              })
            : derivedTags.slice();
        const dir = derivedSortDir === "asc" ? 1 : -1;
        filtered.sort((a, b) => {
            const av = (a?.name || "").toString().toLowerCase();
            const bv = (b?.name || "").toString().toLowerCase();
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
            return 0;
        });
        return filtered;
    }, [derivedTags, derivedFilter, derivedSortDir]);

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
                        <button type="button" onClick={() => setShowLiveLogs((v) => !v)} className="btn btn-secondary">
                            <Icon name="terminal" className="icon-sm" />
                            <span>Live Logs</span>
                        </button>
                        <button type="button" onClick={() => navigate(buildDataViewerPath(collector.id))} className="btn btn-primary-outline">
                            <Icon name="query_stats" className="icon-sm" />
                            <span>Data Viewer</span>
                        </button>
                        <button
                            disabled={collector.status === "running"}
                            onClick={() => navigate(`/collectors/${encodeURIComponent(collector.id)}/edit`)}
                            className="btn btn-secondary"
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
                            {/* Row 1: Hero Summary — OPC UA / counts / Database */}
                            <div className="detail-grid">
                                {/* OPC UA Server */}
                                <div className="form-card flex flex-col">
                                    <div className="flex items-start justify-between mb-16">
                                        <div className="flex items-center gap-12">
                                            <div className="form-card-header !mb-0">OPC UA</div>
                                            {opcuaReachable === false && (
                                                <span className="badge badge-error" title={opcuaError || undefined} style={{ fontSize: 10, padding: "2px 6px" }}>
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
                                    <div className="text-lg font-bold truncate mb-20" title={opcuaDisplay}>
                                        {opcuaDisplay || "-"}
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
                                            <div className="form-label">Read Retry Interval</div>
                                            <div className="flex items-baseline gap-4">
                                                <span className="text-base font-mono font-semibold">{opcua?.readRetryInterval ?? 100}</span>
                                                <span className="text-xs text-on-surface-disabled">ms</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Counts — nodes / derived tags, plus the one collect time we know */}
                                <div className="form-card detail-count-card flex flex-col justify-center">
                                    <div className="detail-count-row">
                                        <div>
                                            <div className="detail-count-num">{nodes.length}</div>
                                            <div className="form-label !mb-0">Nodes</div>
                                        </div>
                                        <div className="detail-count-rule" />
                                        <div>
                                            <div className="detail-count-num">{derivedTags.length}</div>
                                            <div className="form-label !mb-0">Derived</div>
                                        </div>
                                    </div>
                                    <div className="detail-count-time">
                                        <Icon name="timer" className="icon-sm text-on-surface-tertiary" />
                                        <span>{timeAgo(lastCollectedAt)}</span>
                                    </div>
                                    {lastCollectedAt && <div className="detail-count-abs">{new Date(lastCollectedAt).toLocaleString()}</div>}
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
                                        {/* stringOnly configs have no numeric column, so the string column is the value column. */}
                                        {(stringOnly || stringValueColumn) && (
                                            <div className="min-w-0 flex-1">
                                                <div className="form-label">
                                                    String Column
                                                    {stringOnly && <span className="detail-count-badge detail-count-badge-muted ml-4">only</span>}
                                                </div>
                                                <div className="text-base font-mono font-semibold truncate" title={stringValueColumn}>
                                                    {stringValueColumn || "-"}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Row 3: Monitored Nodes — full width */}
                            <div className="form-card">
                                <div className="detail-section-head">
                                    <div className="detail-section-title">
                                        Monitored Nodes
                                        <span className="detail-count-badge">{nodes.length} Nodes</span>
                                    </div>
                                    {nodes.length > 0 && (
                                        <input
                                            type="text"
                                            value={nodeFilter}
                                            onChange={(e) => setNodeFilter(e.target.value)}
                                            className="detail-filter"
                                            placeholder="Filter nodes..."
                                        />
                                    )}
                                </div>
                                {nodes.length > 0 ? (
                                    <div className="detail-table-scroll">
                                        <table className="table-clean detail-table detail-table-nodes">
                                            <colgroup>
                                                <col className="col-tag" />
                                                <col />
                                                <col className="col-transform" />
                                            </colgroup>
                                            <thead>
                                                <tr>
                                                    <th className="col-head-tag">
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
                                                            <td className="truncate" title={node.name}>
                                                                {node.name}
                                                            </td>
                                                            <td title={node.nodeId}>
                                                                <div className="flex flex-col gap-4 min-w-0">
                                                                    <div className="flex items-center gap-6 min-w-0">
                                                                        <span className="cell-secondary truncate">{node.nodeId}</span>
                                                                        {node.dataType && <span className="badge badge-success badge-xs shrink-0">{node.dataType}</span>}
                                                                    </div>
                                                                    <NodePath node={node} />
                                                                </div>
                                                            </td>
                                                            <td className={`truncate ${transform ? "cell-expr" : "cell-muted"}`} title={transform || undefined}>
                                                                {transform || "–"}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        {nodeFilter && displayNodes.length === 0 && <div className="empty-state">No nodes matching "{nodeFilter}"</div>}
                                    </div>
                                ) : (
                                    <p className="text-sm text-on-surface-disabled">No nodes configured</p>
                                )}
                            </div>

                            {/* Row 4: Derived Tags — per-tag settings live here, not in the policy card */}
                            {derivedTags.length > 0 && (
                                <div className="form-card">
                                    <div className="detail-section-head">
                                        <div className="detail-section-title">
                                            Derived Tags
                                            <span className="detail-count-badge">{derivedTags.length} Tags</span>
                                        </div>
                                        <input
                                            type="text"
                                            value={derivedFilter}
                                            onChange={(e) => setDerivedFilter(e.target.value)}
                                            className="detail-filter"
                                            placeholder="Filter tags..."
                                        />
                                    </div>
                                    <div className="detail-table-scroll">
                                        <table className="table-clean detail-table detail-table-derived">
                                            <colgroup>
                                                <col className="col-tag" />
                                                <col className="col-expr" />
                                                <col />
                                                <col className="col-basetime" />
                                                <col className="col-onerror" />
                                            </colgroup>
                                            <thead>
                                                <tr>
                                                    <th className="col-head-tag">
                                                        <button
                                                            type="button"
                                                            className="th-sort is-active"
                                                            onClick={() => setDerivedSortDir(derivedSortDir === "asc" ? "desc" : "asc")}
                                                        >
                                                            Tag Name
                                                            <Icon name={derivedSortDir === "asc" ? "arrow_upward" : "arrow_downward"} className="icon-sm" />
                                                        </button>
                                                    </th>
                                                    <th>Expression</th>
                                                    <th>Variables</th>
                                                    <th>Base Time</th>
                                                    <th>On Error</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {displayDerivedTags.map((dt, i) => {
                                                    const variables = formatVariables(dt);
                                                    return (
                                                        <tr key={`${dt?.name || "derived"}-${i}`}>
                                                            <td className="truncate" title={dt?.name}>
                                                                {dt?.name || "–"}
                                                            </td>
                                                            {/* Expression and variables are the two cells that outgrow their column,
                                                                so they carry the hover tooltip rather than a native title. */}
                                                            <td>
                                                                <TruncatedText text={dt?.expression} className="cell-expr" />
                                                            </td>
                                                            <td>
                                                                <TruncatedText text={variables} className={variables ? "cell-secondary" : "cell-muted"} />
                                                            </td>
                                                            <td className="truncate" title={formatBaseTime(dt)}>
                                                                {formatBaseTime(dt)}
                                                            </td>
                                                            <td className="truncate" title={ON_ERROR_LABELS[dt?.onError] || "skip"}>
                                                                {ON_ERROR_LABELS[dt?.onError] || "skip"}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        {derivedFilter && displayDerivedTags.length === 0 && <div className="empty-state">No tags matching "{derivedFilter}"</div>}
                                    </div>
                                </div>
                            )}

                            {/* Row 2: Collection Policy — collector-wide settings frame the tag
                                lists below, same order as the editor form */}
                            <div className="form-card">
                                <div className="detail-section-head">
                                    <div className="detail-section-title">Collection Policy</div>
                                </div>
                                <div className="detail-policy-grid">
                                    {POLICIES.map((policy) => {
                                        const value = policyValues[policy.key] || policy.fallback;
                                        const selected = policy.options.find((opt) => opt.value === value);
                                        return (
                                            <div key={policy.key} className="detail-policy-box">
                                                <Icon name={policy.icon} className="icon-sm detail-policy-icon" />
                                                <div className="min-w-0">
                                                    <div className="detail-policy-head">
                                                        <span className="form-label !mb-0">{policy.shortLabel}</span>
                                                        <span className="detail-policy-value">{value}</span>
                                                    </div>
                                                    <div className="detail-policy-help">{selected?.help || ""}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Row 5: Logging Controls — summary bar */}
                            <div className="form-card" style={{ paddingTop: 16, paddingBottom: 16 }}>
                                <div className="flex items-center justify-between gap-24 flex-wrap">
                                    <div className="form-card-header !mb-0">
                                        <Icon name="terminal" className="text-primary" />
                                        Logging Controls
                                    </div>
                                    <div className="flex items-center gap-24 flex-wrap">
                                        <div className="flex items-center gap-8">
                                            <span className="form-label !mb-0">Log Level</span>
                                            <span className={LEVEL_BADGE_CLASS[logLevel] || "badge badge-muted"}>{logLevel}</span>
                                        </div>
                                        {logLevels.length > 0 && (
                                            <span className="text-sm text-on-surface-tertiary">
                                                Records{" "}
                                                {logLevels.map((lvl, i) => (
                                                    <span key={lvl}>
                                                        <span style={{ color: LEVEL_COLOR[lvl], fontWeight: 600 }}>{lvl}</span>
                                                        {i < logLevels.length - 1 ? ", " : ""}
                                                    </span>
                                                ))}{" "}
                                                messages
                                            </span>
                                        )}
                                        <div className="flex items-center gap-8">
                                            <span className="form-label !mb-0">File Limit</span>
                                            <span className="text-base font-mono font-semibold">{logMaxFiles ?? "-"}</span>
                                        </div>
                                        <button type="button" onClick={() => setShowLogs(true)} className="btn btn-sm btn-primary-outline">
                                            <Icon name="description" className="icon-sm" />
                                            View Logs
                                        </button>
                                    </div>
                                </div>
                            </div>
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
            {showLogs && <LogViewerModal collectorId={collector.id} onClose={() => setShowLogs(false)} />}
            <LiveLogs collectorId={collector.id} open={showLiveLogs} onClose={() => setShowLiveLogs(false)} />
        </div>
    );
}
