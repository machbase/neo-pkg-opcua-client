import { useState, useMemo } from "react";
import Icon from "../common/Icon";
import NodeBrowserPanel from "./NodeBrowserPanel";

const NODE_ID_PATTERN = /^ns=\d+;[isgb]=.+$/;

function validateNodeId(value) {
    if (!value.trim()) return null;
    if (!NODE_ID_PATTERN.test(value.trim())) {
        return "Format: ns=3;i=1001 or ns=2;s=MyTag";
    }
    return null;
}

function parseNumberInput(value) {
    const trimmed = String(value).trim();
    if (trimmed === "") return undefined;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : NaN;
}

export default function NodeListEditor({ nodes, onChange, endpoint }) {
    const [name, setName] = useState("");
    const [nodeId, setNodeId] = useState("");
    const [nodeIdError, setNodeIdError] = useState(null);
    const [dupError, setDupError] = useState(null);

    const [filter, setFilter] = useState("");
    const [sortKey, setSortKey] = useState("name");
    const [sortDir, setSortDir] = useState("asc");

    const [selectedRows, setSelectedRows] = useState(new Set());
    const [browserOpen, setBrowserOpen] = useState(false);

    const hasEndpoint = Boolean(endpoint?.trim());

    const isDuplicate = (id, excludeIdx = -1) =>
        nodes.some((n, i) => i !== excludeIdx && n.nodeId === id);

    const addNode = () => {
        const trimmedId = nodeId.trim();
        const trimmedName = name.trim();
        if (!trimmedId || !trimmedName) return;

        const err = validateNodeId(trimmedId);
        if (err) {
            setNodeIdError(err);
            return;
        }
        if (isDuplicate(trimmedId)) {
            setDupError(`"${trimmedId}" already exists`);
            return;
        }

        onChange([...nodes, { nodeId: trimmedId, name: trimmedName }]);
        setNodeId("");
        setName("");
        setNodeIdError(null);
        setDupError(null);
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            addNode();
        }
    };

    const patchNode = (origIdx, patch) => {
        onChange(
            nodes.map((n, i) => {
                if (i !== origIdx) return n;
                const next = { ...n, ...patch };
                for (const k of Object.keys(patch)) {
                    if (patch[k] === undefined) delete next[k];
                }
                return next;
            })
        );
    };

    const updateNumericField = (origIdx, field, raw) => {
        const parsed = parseNumberInput(raw);
        if (Number.isNaN(parsed)) return;
        patchNode(origIdx, { [field]: parsed });
    };

    const removeNode = (idx) => {
        onChange(nodes.filter((_, i) => i !== idx));
        setSelectedRows((prev) => {
            const next = new Set();
            for (const r of prev) {
                if (r < idx) next.add(r);
                else if (r > idx) next.add(r - 1);
            }
            return next;
        });
    };

    const bulkDelete = () => {
        const toDelete = new Set(selectedRows);
        onChange(nodes.filter((_, i) => !toDelete.has(i)));
        setSelectedRows(new Set());
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

    const filteredRows = useMemo(() => {
        const indexed = nodes.map((n, i) => ({ ...n, _idx: i }));
        const q = filter.trim().toLowerCase();
        const filtered = q
            ? indexed.filter(
                  (n) =>
                      (n.name || "").toLowerCase().includes(q) ||
                      (n.nodeId || "").toLowerCase().includes(q)
              )
            : indexed;
        const dir = sortDir === "asc" ? 1 : -1;
        return [...filtered].sort((a, b) => {
            const av = (a[sortKey] || "").toString().toLowerCase();
            const bv = (b[sortKey] || "").toString().toLowerCase();
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
            return 0;
        });
    }, [nodes, filter, sortKey, sortDir]);

    const toggleSelectAll = () => {
        if (selectedRows.size === filteredRows.length) {
            setSelectedRows(new Set());
        } else {
            setSelectedRows(new Set(filteredRows.map((r) => r._idx)));
        }
    };

    const toggleRow = (idx) => {
        setSelectedRows((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    };

    const handleBrowseAdd = (newNodes) => {
        const unique = newNodes.filter((n) => !isDuplicate(n.nodeId));
        if (unique.length > 0) onChange([...nodes, ...unique]);
    };

    return (
        <div>
            {/* Input row */}
            <div className="node-input-row">
                <div>
                    <label className="form-label">Tag Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="w-full"
                        placeholder="e.g. Tank_Temp_01"
                    />
                </div>
                <div>
                    <label className="form-label">Node ID</label>
                    <input
                        type="text"
                        value={nodeId}
                        onChange={(e) => {
                            setNodeId(e.target.value);
                            setNodeIdError(null);
                            setDupError(null);
                        }}
                        onKeyDown={handleKeyDown}
                        className={`w-full ${nodeIdError || dupError ? "!border-error" : ""}`}
                        placeholder="ns=2;s=Device.Sensor1"
                    />
                </div>
                <div className="node-input-actions">
                    <button
                        type="button"
                        onClick={addNode}
                        disabled={!nodeId.trim() || !name.trim()}
                        className="btn btn-primary"
                    >
                        Add
                    </button>
                    <button
                        type="button"
                        onClick={() => setBrowserOpen(true)}
                        disabled={!hasEndpoint}
                        className="btn btn-success"
                        title={hasEndpoint ? "Browse server nodes" : "Select an OPC UA server first"}
                    >
                        Browse
                    </button>
                </div>
            </div>
            {(nodeIdError || dupError) && (
                <p className="text-error text-xs mb-12">{nodeIdError || dupError}</p>
            )}

            {/* Filter */}
            <div className="node-filter-bar">
                <Icon name="search" className="icon-sm text-on-surface-tertiary" />
                <input
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="node-filter-input"
                    placeholder="Filter Nodes..."
                />
                {filter && (
                    <button
                        type="button"
                        className="opacity-60 hover:opacity-100"
                        onClick={() => setFilter("")}
                    >
                        <Icon name="close" className="icon-sm" />
                    </button>
                )}
            </div>

            {/* Count + bulk actions */}
            {nodes.length > 0 && (
                <div className="flex items-center gap-12 mb-8">
                    <span className="text-on-surface-tertiary text-xs font-semibold uppercase tracking-wide">
                        {nodes.length} Node{nodes.length !== 1 ? "s" : ""} Mapped
                    </span>
                    <button
                        type="button"
                        className="btn btn-sm btn-danger ml-auto"
                        onClick={bulkDelete}
                        style={{ visibility: selectedRows.size > 0 ? "visible" : "hidden" }}
                        aria-hidden={selectedRows.size === 0}
                    >
                        <Icon name="delete" className="icon-sm" />
                        Delete {selectedRows.size}
                    </button>
                </div>
            )}

            {/* Table */}
            {nodes.length > 0 ? (
                <div className="border border-border rounded-base overflow-hidden">
                    <div className="max-h-[420px] overflow-y-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th style={{ width: 40 }}>
                                        <input
                                            type="checkbox"
                                            checked={
                                                filteredRows.length > 0 &&
                                                selectedRows.size === filteredRows.length
                                            }
                                            onChange={toggleSelectAll}
                                        />
                                    </th>
                                    <th>
                                        <button
                                            type="button"
                                            className={`th-sort${sortKey === "name" ? " is-active" : ""}`}
                                            onClick={() => toggleSort("name")}
                                        >
                                            Tag Name
                                            <Icon name={sortIcon("name")} className="icon-sm" />
                                        </button>
                                    </th>
                                    <th>
                                        <button
                                            type="button"
                                            className={`th-sort${sortKey === "nodeId" ? " is-active" : ""}`}
                                            onClick={() => toggleSort("nodeId")}
                                        >
                                            Node ID
                                            <Icon name={sortIcon("nodeId")} className="icon-sm" />
                                        </button>
                                    </th>
                                    <th style={{ width: 110 }}>Bias</th>
                                    <th style={{ width: 110 }}>Multiplier</th>
                                    <th style={{ width: 60 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRows.map((row) => {
                                    const idx = row._idx;
                                    return (
                                        <tr key={`${row.nodeId}-${idx}`}>
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedRows.has(idx)}
                                                    onChange={() => toggleRow(idx)}
                                                />
                                            </td>
                                            <td className="font-semibold truncate" title={row.name}>
                                                {row.name}
                                            </td>
                                            <td
                                                className="mono text-on-surface-secondary truncate"
                                                title={row.nodeId}
                                            >
                                                {row.nodeId}
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={row.bias ?? ""}
                                                    onChange={(e) =>
                                                        updateNumericField(idx, "bias", e.target.value)
                                                    }
                                                    className="w-full text-right"
                                                    placeholder="0"
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={row.multiplier ?? ""}
                                                    onChange={(e) =>
                                                        updateNumericField(
                                                            idx,
                                                            "multiplier",
                                                            e.target.value
                                                        )
                                                    }
                                                    className="w-full text-right"
                                                    placeholder="1"
                                                />
                                            </td>
                                            <td>
                                                <button
                                                    type="button"
                                                    onClick={() => removeNode(idx)}
                                                    className="btn-icon-sm text-error"
                                                    title="Delete"
                                                >
                                                    <Icon name="delete" className="icon-sm" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {filter && filteredRows.length === 0 && (
                            <div className="empty-state">No nodes matching "{filter}"</div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="empty-state flex flex-col items-center gap-8 py-32">
                    <Icon name="sensors" className="icon-lg text-on-surface-disabled" />
                    <p className="text-on-surface-secondary font-semibold">No nodes mapped yet</p>
                    <p className="text-xs">Add manually above or browse server nodes</p>
                </div>
            )}

            {browserOpen && hasEndpoint && (
                <NodeBrowserPanel
                    endpoint={endpoint}
                    existingNodes={nodes}
                    onAdd={handleBrowseAdd}
                    onClose={() => setBrowserOpen(false)}
                />
            )}
        </div>
    );
}
