import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../common/Icon";
import NodeBrowserPanel from "./NodeBrowserPanel";

const NODE_ID_PATTERN = /^ns=\d+;[isgb]=.+$/;

const NUMERIC_OPCUA_TYPES = new Set([
    "Boolean", "SByte", "Byte", "Int16", "UInt16",
    "Int32", "UInt32", "Int64", "UInt64", "Float", "Double",
]);

function isNonNumericNode(node) {
    const dt = node.dataType;
    if (!dt) return false;
    if (dt.toLowerCase() === "boolean") return false;
    return !NUMERIC_OPCUA_TYPES.has(dt);
}

const CALC_STEP_DEF = {
    b: { op: "+", field: "bias", placeholder: "0" },
    m: { op: "×", field: "multiplier", placeholder: "1" },
};

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

function CalcSteps({ node, onFieldChange, onOrderChange }) {
    const raw = node.calcOrder === "mb" ? "mb" : "bm";
    const steps = raw.split("");
    const [dragIdx, setDragIdx] = useState(null);
    const [dropIdx, setDropIdx] = useState(null);

    const handleDragStart = (e, idx) => {
        setDragIdx(idx);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(idx));
    };
    const handleDragEnd = () => {
        setDragIdx(null);
        setDropIdx(null);
    };
    const handleDragOver = (e, idx) => {
        if (dragIdx === null || idx === dragIdx) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dropIdx !== idx) setDropIdx(idx);
    };
    const handleDragLeave = (e, idx) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        if (dropIdx === idx) setDropIdx(null);
    };
    const handleDrop = (e, idx) => {
        e.preventDefault();
        setDragIdx(null);
        setDropIdx(null);
        const from = Number(e.dataTransfer.getData("text/plain"));
        if (!Number.isFinite(from) || from === idx) return;
        const next = [...steps];
        [next[from], next[idx]] = [next[idx], next[from]];
        onOrderChange(next.join(""));
    };

    return (
        <div className="node-calc-inline">
            <span className="node-calc-seg-paren">(</span>
            <span className="node-calc-seg-val">value</span>
            {steps.map((key, idx) => {
                const step = CALC_STEP_DEF[key];
                const seg = (
                    <div
                        key={key}
                        className={`node-calc-seg${dragIdx === idx ? " node-calc-seg--dragging" : ""}${dropIdx === idx ? " node-calc-seg--drop-target" : ""}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragLeave={(e) => handleDragLeave(e, idx)}
                        onDrop={(e) => handleDrop(e, idx)}
                    >
                        <Icon name="drag_indicator" className="node-calc-seg-grip" />
                        <span className="node-calc-seg-op">{step.op}</span>
                        <input
                            type="number"
                            step="any"
                            className="node-calc-seg-input"
                            placeholder={step.placeholder}
                            value={node[step.field] ?? ""}
                            onChange={(e) => onFieldChange(step.field, e.target.value)}
                        />
                    </div>
                );
                if (idx === 0)
                    return (
                        <span key={`wrap-${key}`} className="node-calc-inline" style={{ gap: "var(--spacing-4)" }}>
                            {seg}
                            <span className="node-calc-seg-paren">)</span>
                        </span>
                    );
                return seg;
            })}
        </div>
    );
}

export default function NodeListEditor({ nodes, onChange, endpoint, selectionMode = "numeric-only", storageMode = "default" }) {
    const [name, setName] = useState("");
    const [nodeId, setNodeId] = useState("");
    const [nodeIdError, setNodeIdError] = useState(null);
    const [dupError, setDupError] = useState(null);
    const [editingNameIdx, setEditingNameIdx] = useState(null);
    const [editingNameValue, setEditingNameValue] = useState("");

    const [filter, setFilter] = useState("");
    const [sortKey, setSortKey] = useState("name");
    const [sortDir, setSortDir] = useState("asc");

    const [selectedRows, setSelectedRows] = useState(new Set());
    const [browserOpen, setBrowserOpen] = useState(false);
    const editingNameInputRef = useRef(null);

    const hasEndpoint = Boolean(endpoint?.trim());

    useEffect(() => {
        if (editingNameIdx === null) return;
        editingNameInputRef.current?.focus();
        editingNameInputRef.current?.select();
    }, [editingNameIdx]);

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

        onChange([...nodes, { nodeId: trimmedId, name: trimmedName, calcOrder: "bm" }]);
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
        if (editingNameIdx != null) {
            if (editingNameIdx === idx) {
                setEditingNameIdx(null);
                setEditingNameValue("");
            } else if (editingNameIdx > idx) {
                setEditingNameIdx(editingNameIdx - 1);
            }
        }
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
        if (editingNameIdx != null && toDelete.has(editingNameIdx)) {
            setEditingNameIdx(null);
            setEditingNameValue("");
        }
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

    const handleBrowseSync = ({ add, remove }) => {
        const removeSet = new Set(remove);
        const kept = removeSet.size > 0 ? nodes.filter((n) => !removeSet.has(n.nodeId)) : nodes;
        const unique = add
            .filter((n) => !isDuplicate(n.nodeId))
            .map((n) => ({ ...n, calcOrder: n.calcOrder || "bm" }));
        if (unique.length > 0 || removeSet.size > 0) onChange([...kept, ...unique]);
    };

    const startNameEdit = (idx, currentName) => {
        setEditingNameIdx(idx);
        setEditingNameValue(currentName || "");
    };

    const cancelNameEdit = () => {
        setEditingNameIdx(null);
        setEditingNameValue("");
    };

    const saveNameEdit = (idx) => {
        const trimmed = editingNameValue.trim();
        if (trimmed && trimmed !== (nodes[idx]?.name || "")) {
            patchNode(idx, { name: trimmed });
        }
        cancelNameEdit();
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

            {selectionMode === "numeric-only" && nodes.some(isNonNumericNode) && (
                <div className="text-warning bg-warning/10 border border-warning/40 rounded-base px-12 py-8 mb-12 flex items-start gap-8 text-xs">
                    <Icon name="warning" className="icon-sm shrink-0 mt-1" />
                    <span>
                        {nodes.filter(isNonNumericNode).length} node
                        {nodes.filter(isNonNumericNode).length === 1 ? "" : "s"} have
                        non-numeric data types and will not be stored. Add a String
                        Value Column or pick a JSON column to include them.
                    </span>
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
                                    <th>Transform</th>
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
                                            <td title={row.name}>
                                                {editingNameIdx === idx ? (
                                                    <input
                                                        ref={editingNameInputRef}
                                                        type="text"
                                                        value={editingNameValue}
                                                        onChange={(e) => setEditingNameValue(e.target.value)}
                                                        onBlur={() => saveNameEdit(idx)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") {
                                                                e.preventDefault();
                                                                saveNameEdit(idx);
                                                            } else if (e.key === "Escape") {
                                                                e.preventDefault();
                                                                cancelNameEdit();
                                                            }
                                                        }}
                                                        className="w-full"
                                                    />
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => startNameEdit(idx, row.name)}
                                                        title="Click to edit tag name"
                                                        className="w-full truncate text-left font-semibold"
                                                        style={{
                                                            background: "transparent",
                                                            border: 0,
                                                            padding: 0,
                                                            color: "inherit",
                                                            cursor: "text",
                                                        }}
                                                    >
                                                        {row.name}
                                                    </button>
                                                )}
                                            </td>
                                            <td
                                                className="mono text-on-surface-secondary"
                                                title={row.nodeId}
                                            >
                                                <div className="flex items-center gap-6">
                                                    <span className="truncate">{row.nodeId}</span>
                                                    {row.dataType && (
                                                        <span className="badge badge-success" style={{ fontSize: 10, padding: '2px 5px', flexShrink: 0 }}>
                                                            {row.dataType}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                {storageMode === "string" ||
                                                row.dataType?.toLowerCase() === "boolean" ||
                                                isNonNumericNode(row) ? null : (
                                                    <CalcSteps
                                                        node={row}
                                                        onFieldChange={(field, raw) =>
                                                            updateNumericField(idx, field, raw)
                                                        }
                                                        onOrderChange={(order) =>
                                                            patchNode(idx, { calcOrder: order })
                                                        }
                                                    />
                                                )}
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
                    onSync={handleBrowseSync}
                    onClose={() => setBrowserOpen(false)}
                    selectionMode={selectionMode}
                />
            )}
        </div>
    );
}
