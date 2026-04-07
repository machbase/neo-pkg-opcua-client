import { useState, useRef, useMemo } from "react";
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

export default function NodeListEditor({ nodes, onChange, endpoint }) {
    // Manual add
    const [nodeId, setNodeId] = useState("");
    const [name, setName] = useState("");
    const [nodeIdError, setNodeIdError] = useState(null);
    const [dupError, setDupError] = useState(null);

    // Browse
    const [browserOpen, setBrowserOpen] = useState(false);

    // Tab: 'browse' | 'manual'
    const [activeTab, setActiveTab] = useState("browse");

    // Table filter
    const [tableFilter, setTableFilter] = useState("");

    // Bulk select
    const [selectedRows, setSelectedRows] = useState(new Set());

    // Inline edit
    const [editingIdx, setEditingIdx] = useState(null);
    const [editName, setEditName] = useState("");
    const [editNodeId, setEditNodeId] = useState("");
    const [editError, setEditError] = useState(null);

    const containerRef = useRef(null);
    const hasEndpoint = Boolean(endpoint?.trim());

    // Filtered nodes for table
    const filteredNodes = useMemo(() => {
        if (!tableFilter.trim()) return nodes.map((n, i) => ({ ...n, _idx: i }));
        const q = tableFilter.toLowerCase();
        return nodes.map((n, i) => ({ ...n, _idx: i })).filter((n) => n.name.toLowerCase().includes(q) || n.nodeId.toLowerCase().includes(q));
    }, [nodes, tableFilter]);

    // Check duplicate
    const isDuplicate = (id, excludeIdx = -1) => nodes.some((n, i) => i !== excludeIdx && n.nodeId === id);

    // Manual add
    const addNode = () => {
        const trimmedId = nodeId.trim();
        const trimmedName = name.trim();
        if (!trimmedId || !trimmedName) return;

        const valErr = validateNodeId(trimmedId);
        if (valErr) {
            setNodeIdError(valErr);
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

    const removeNode = (index) => {
        onChange(nodes.filter((_, i) => i !== index));
        setSelectedRows((prev) => {
            const next = new Set(prev);
            next.delete(index);
            // Re-index
            const reindexed = new Set();
            for (const idx of next) {
                if (idx < index) reindexed.add(idx);
                else if (idx > index) reindexed.add(idx - 1);
            }
            return reindexed;
        });
        if (editingIdx === index) cancelEdit();
    };

    const bulkDelete = () => {
        const toDelete = new Set(selectedRows);
        onChange(nodes.filter((_, i) => !toDelete.has(i)));
        setSelectedRows(new Set());
        if (editingIdx !== null && toDelete.has(editingIdx)) cancelEdit();
    };

    const toggleSelectAll = () => {
        if (selectedRows.size === filteredNodes.length) {
            setSelectedRows(new Set());
        } else {
            setSelectedRows(new Set(filteredNodes.map((n) => n._idx)));
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

    // Inline edit
    const startEdit = (idx, node) => {
        setEditingIdx(idx);
        setEditName(node.name);
        setEditNodeId(node.nodeId);
        setEditError(null);
    };

    const cancelEdit = () => {
        setEditingIdx(null);
        setEditName("");
        setEditNodeId("");
        setEditError(null);
    };

    const saveEdit = () => {
        const trimmedId = editNodeId.trim();
        const trimmedName = editName.trim();
        if (!trimmedId || !trimmedName) return;

        const valErr = validateNodeId(trimmedId);
        if (valErr) {
            setEditError(valErr);
            return;
        }

        if (isDuplicate(trimmedId, editingIdx)) {
            setEditError(`"${trimmedId}" already exists`);
            return;
        }

        const updated = nodes.map((n, i) => (i === editingIdx ? { nodeId: trimmedId, name: trimmedName } : n));
        onChange(updated);
        cancelEdit();
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            addNode();
        }
    };

    const handleEditKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            saveEdit();
        }
        if (e.key === "Escape") {
            e.preventDefault();
            cancelEdit();
        }
    };

    const handleBrowseAdd = (newNodes) => {
        // Filter out duplicates from browse selection
        const unique = newNodes.filter((n) => !isDuplicate(n.nodeId));
        if (unique.length < newNodes.length) {
            // Some were duplicates — still add unique ones
        }
        if (unique.length > 0) onChange([...nodes, ...unique]);
    };

    const handleClose = () => {
        setBrowserOpen(false);
    };

    return (
        <div className="pt-2">
            <div className="form-label mb-5">Active Node Mapping</div>

            {/* Tab switcher */}
            <div className="tab-bar mb-4">
                <button type="button" className={`tab-item ${activeTab === "browse" ? "active" : ""}`} onClick={() => setActiveTab("browse")}>
                    <Icon name="account_tree" className="icon-sm" />
                    Browse Server
                </button>
                <button type="button" className={`tab-item ${activeTab === "manual" ? "active" : ""}`} onClick={() => setActiveTab("manual")}>
                    <Icon name="edit" className="icon-sm" />
                    Add Manually
                </button>
            </div>

            {/* Browse tab */}
            {activeTab === "browse" && (
                <div className="relative mb-4" ref={containerRef}>
                    <button
                        type="button"
                        className="btn btn-ghost w-full justify-start gap-8"
                        disabled={!hasEndpoint}
                        onClick={() => setBrowserOpen(true)}
                    >
                        <Icon name="account_tree" className="icon-sm text-primary" />
                        <span>{hasEndpoint ? "Browse server nodes..." : "Enter endpoint URL first"}</span>
                        <Icon name="arrow_forward" className="icon-sm text-on-surface-disabled ml-auto" />
                    </button>

                    {browserOpen && hasEndpoint && (
                        <NodeBrowserPanel endpoint={endpoint} existingNodes={nodes} filter="" onAdd={handleBrowseAdd} onClose={handleClose} containerRef={containerRef} />
                    )}
                </div>
            )}

            {/* Manual tab */}
            {activeTab === "manual" && (
                <div className="mb-4">
                    <div className="grid gap-8 mb-1" style={{ gridTemplateColumns: "1fr 1fr auto" }}>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={handleKeyDown} className="w-full min-w-0" placeholder="Tag Name" />
                        <input
                            type="text"
                            value={nodeId}
                            onChange={(e) => {
                                setNodeId(e.target.value);
                                setNodeIdError(null);
                                setDupError(null);
                            }}
                            onKeyDown={handleKeyDown}
                            className={`w-full min-w-0 ${nodeIdError || dupError ? "!border-error" : ""}`}
                            placeholder="ns=3;i=1001"
                        />
                        <button type="button" onClick={addNode} disabled={!nodeId.trim() || !name.trim()} className="btn btn-icon btn-primary shrink-0">
                            <Icon name="add" className="icon-sm" />
                        </button>
                    </div>
                    {(nodeIdError || dupError) && <p className="text-error text-xs mt-1 ml-0.5">{nodeIdError || dupError}</p>}
                    <p className="text-on-surface-muted text-xs mt-1.5 ml-0.5">Format: ns=N;i=NUMBER or ns=N;s=STRING</p>
                </div>
            )}

            {/* Node table */}
            {nodes.length > 0 ? (
                <div className="mt-3">
                    {/* Table toolbar */}
                    <div className="flex items-center gap-10 mb-2">
                        <span className="text-on-surface-tertiary text-xs font-semibold uppercase tracking-wide">
                            {nodes.length} node{nodes.length !== 1 ? "s" : ""}
                        </span>
                        <div className="flex-1" />
                        {selectedRows.size > 0 && (
                            <button type="button" className="btn btn-sm btn-danger" onClick={bulkDelete}>
                                <Icon name="delete" className="icon-sm" />
                                Delete {selectedRows.size}
                            </button>
                        )}
                        {nodes.length > 5 && (
                            <div className="input-icon-wrap">
                                <input
                                    type="text"
                                    value={tableFilter}
                                    onChange={(e) => {
                                        setTableFilter(e.target.value);
                                        setSelectedRows(new Set());
                                    }}
                                    className="h-[26px] w-[180px] text-xs"
                                    placeholder="Filter nodes..."
                                />
                                <span className="input-icon-trailing">
                                    <Icon name="search" className="icon-sm" />
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Table */}
                    <div className="node-table-wrapper">
                        {/* Sticky Header */}
                        <div className="node-table-header">
                            <span className="node-table-cell-check">
                                <input type="checkbox" checked={filteredNodes.length > 0 && selectedRows.size === filteredNodes.length} onChange={toggleSelectAll} />
                            </span>
                            <span className="node-table-cell-name">Node Name</span>
                            <span className="node-table-cell-addr">Address</span>
                            <span className="node-table-cell-actions" />
                        </div>

                        {/* Scrollable body */}
                        <div className="node-table-body">
                            {filteredNodes.map((node) => {
                                const idx = node._idx;
                                const isEditing = editingIdx === idx;

                                if (isEditing) {
                                    return (
                                        <div key={`edit-${idx}`} className="node-table-row node-table-row-editing">
                                            <span className="node-table-cell-check" />
                                            <span className="node-table-cell-name">
                                                <input
                                                    type="text"
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    onKeyDown={handleEditKeyDown}
                                                    className="w-full h-[26px] text-xs"
                                                    autoFocus
                                                />
                                            </span>
                                            <span className="node-table-cell-addr">
                                                <input
                                                    type="text"
                                                    value={editNodeId}
                                                    onChange={(e) => {
                                                        setEditNodeId(e.target.value);
                                                        setEditError(null);
                                                    }}
                                                    onKeyDown={handleEditKeyDown}
                                                    className={`w-full h-[26px] text-xs font-mono ${editError ? "!border-error" : ""}`}
                                                />
                                            </span>
                                            <span className="node-table-cell-actions">
                                                <button type="button" onClick={(e) => { e.stopPropagation(); saveEdit() }} className="opacity-60 hover:opacity-100 text-success transition-opacity">
                                                    <Icon name="check" className="icon-sm" />
                                                </button>
                                                <button type="button" onClick={(e) => { e.stopPropagation(); cancelEdit() }} className="opacity-60 hover:opacity-100 transition-opacity">
                                                    <Icon name="close" className="icon-sm" />
                                                </button>
                                            </span>
                                            {editError && <span className="col-span-full text-error text-xs px-3 pb-1">{editError}</span>}
                                        </div>
                                    );
                                }

                                return (
                                    <div
                                        key={`row-${idx}`}
                                        className={`node-table-row ${selectedRows.has(idx) ? "node-table-row-selected" : ""}`}
                                        onClick={() => toggleRow(idx)}
                                        style={{ cursor: "pointer" }}
                                    >
                                        <span className="node-table-cell-check">
                                            <input type="checkbox" checked={selectedRows.has(idx)} readOnly />
                                        </span>
                                        <span className="node-table-cell-name truncate">{node.name}</span>
                                        <span className="node-table-cell-addr font-mono text-on-surface-secondary truncate">{node.nodeId}</span>
                                        <span className="node-table-cell-actions">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); startEdit(idx, node) }}
                                                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                                            >
                                                <Icon name="edit" className="icon-sm" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); removeNode(idx) }}
                                                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-error transition-opacity"
                                            >
                                                <Icon name="delete" className="icon-sm" />
                                            </button>
                                        </span>
                                    </div>
                                );
                            })}

                            {tableFilter && filteredNodes.length === 0 && (
                                <div className="px-3 py-4 text-center text-on-surface-disabled text-xs">No nodes matching "{tableFilter}"</div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                /* Empty state */
                <div className="node-empty-state">
                    <Icon name="sensors" className="text-on-surface-disabled" style={{ fontSize: 36 }} />
                    <p className="text-on-surface-secondary text-sm font-semibold mt-3">No nodes added yet</p>
                    <p className="text-on-surface-disabled text-xs mt-1 max-w-[240px] text-center leading-relaxed">
                        Browse server nodes or add them manually to start collecting telemetry data.
                    </p>
                    <div className="flex gap-2 mt-4">
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setActiveTab("browse")}>
                            <Icon name="account_tree" className="icon-sm" />
                            Browse
                        </button>
                        <button type="button" className="btn btn-sm btn-primary" onClick={() => setActiveTab("manual")}>
                            <Icon name="edit" className="icon-sm" />
                            Add Manually
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
