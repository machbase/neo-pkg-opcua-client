import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../common/Icon";
import NodeBrowserPanel from "./NodeBrowserPanel";
import NodeRenameModal from "./NodeRenameModal";
import { normalizeCollectorNode } from "./nodeTree";
import { normalizeTagName, validateTagName } from "./tagName";

// NODE PATH breadcrumb cell: OPC UA tree path with depth badge; falls back to nodeId.
function NodePathCell({ node }) {
    const path = Array.isArray(node.treePath) && node.treePath.length ? node.treePath : null;
    if (!path) {
        return <span className="text-xs text-on-surface-disabled">— no path</span>;
    }
    const last = path.length - 1;
    return (
        <span className="inline-flex flex-wrap items-center gap-4 text-sm">
            {path.map((seg, i) => (
                <span key={i} className="inline-flex items-center gap-4">
                    {i > 0 && <span className="text-on-surface-disabled">›</span>}
                    <span className={i === last ? "font-semibold" : "text-on-surface-secondary"}>{seg}</span>
                </span>
            ))}
            <span className="badge badge-primary" style={{ fontSize: 10, padding: "2px 5px" }}>depth {path.length}</span>
        </span>
    );
}

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
                        <span key={`wrap-${key}`} className="node-calc-group">
                            {seg}
                            <span className="node-calc-seg-paren">)</span>
                        </span>
                    );
                return seg;
            })}
        </div>
    );
}

export default function NodeListEditor({ nodes, onChange, endpoint, endpointTarget, selectionMode = "numeric-only", storageMode = "default", derivedTags = [] }) {
    const jsonPayloadKey = storageMode === "json";
    const [renameItems, setRenameItems] = useState(null);
    const [name, setName] = useState("");
    const [nodeId, setNodeId] = useState("");
    const [nodeIdError, setNodeIdError] = useState(null);
    const [dupError, setDupError] = useState(null);
    const [nameError, setNameError] = useState(null);
    // 인라인 이름 수정은 자기 오류 상태를 따로 쓴다. 예전에는 nameError 하나를 상단 추가 폼과
    // 공유해서, 행에서 낸 오류가 엉뚱하게 상단 "Tag Name" 입력을 빨갛게 만들고 정작 값을 담고
    // 있는 행에는 아무 표시도 남지 않았다. 오류는 그 값이 들어 있는 입력에 붙어야 한다.
    const [editNameError, setEditNameError] = useState(null);
    const [editingNameIdx, setEditingNameIdx] = useState(null);
    const [editingNameValue, setEditingNameValue] = useState("");

    const [filter, setFilter] = useState("");
    const [sortKey, setSortKey] = useState("name");
    const [sortDir, setSortDir] = useState("asc");

    const [selectedRows, setSelectedRows] = useState(new Set());
    const [browserOpen, setBrowserOpen] = useState(false);
    // 브라우저 sync 는 입력 하나가 아니라 여러 행을 한꺼번에 만든다. nameError 에 실어 보내면
    // 아무 잘못 없는 상단 "Tag Name" 입력이 빨개지므로 상태를 따로 둔다.
    const [syncError, setSyncError] = useState(null);
    const editingNameInputRef = useRef(null);

    const hasEndpoint = Boolean(endpointTarget?.server || endpointTarget?.endpoint || endpoint?.trim());

    // 파생 태그는 노드와 같은 이름 공간을 쓴다. 중복 검사에서 빼 두면 파생 태그와 같은 이름을
    // 붙여도 행에는 아무 표시가 없고, 저장할 때에야 사용자가 건드린 적 없는 파생 태그를 지목하는
    // 토스트만 뜬다 — 어느 행이 문제인지 알 수 없다.
    const derivedNames = useMemo(
        () => derivedTags.map((c) => c && c.name).filter(Boolean),
        [derivedTags]
    );

    useEffect(() => {
        if (editingNameIdx === null) return;
        editingNameInputRef.current?.focus();
        editingNameInputRef.current?.select();
    }, [editingNameIdx]);

    const isDuplicate = (id, excludeIdx = -1) =>
        nodes.some((n, i) => i !== excludeIdx && n.nodeId === id);

    const addNode = () => {
        const trimmedId = nodeId.trim();
        const trimmedName = normalizeTagName(name);
        if (!trimmedId || !trimmedName) return;

        // 컬럼 폭은 테이블을 아는 백엔드에 맡긴다. 여기서 보는 건 백엔드가 알 수 없는 두 가지다 —
        // 콤마는 전송 중 이름을 쪼개고, 256자를 넘으면 neo-web 이 말없이 자른다.
        const verdict = validateTagName(trimmedName, {
            taken: [...nodes.map((n) => n.name), ...derivedNames],
            jsonPayloadKey,
        });
        if (!verdict.ok) {
            setNameError(verdict.reason);
            return;
        }

        const err = validateNodeId(trimmedId);
        if (err) {
            setNodeIdError(err);
            return;
        }
        if (isDuplicate(trimmedId)) {
            setDupError(`"${trimmedId}" already exists`);
            return;
        }

        onChange([...nodes, { nodeId: trimmedId, name: trimmedName, calcOrder: "bm", nodeTree: null }]);
        setNodeId("");
        setName("");
        // setName("") 은 onChange 를 태우지 않으므로 직전 실패의 오류가 남는다. 입력은 비었는데
        // 빨간 테두리만 남아 방금 성공한 추가가 실패한 것처럼 보인다.
        setNameError(null);
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

    const openRename = (indices) => {
        const sorted = [...indices].sort((a, b) => a - b);
        setRenameItems(
            sorted.map((idx) => ({
                nodeIdx: idx,
                treePath: Array.isArray(nodes[idx]?.treePath) ? nodes[idx].treePath : [],
                originalName: nodes[idx]?.name || "",
            }))
        );
    };

    const applyRenames = (renames) => {
        const byIdx = new Map(renames.map((r) => [r.nodeIdx, r.name]));
        onChange(nodes.map((n, i) => (byIdx.has(i) ? { ...n, name: byIdx.get(i) } : n)));
        setRenameItems(null);
    };

    const removeNode = (idx) => {
        onChange(nodes.filter((_, i) => i !== idx));
        if (editingNameIdx != null) {
            if (editingNameIdx === idx) {
                setEditingNameIdx(null);
                setEditingNameValue("");
                setEditNameError(null);
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
            setEditNameError(null);
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
        // 오류 슬롯이 하나라, 상단 폼에서 낸 옛 오류가 남아 있으면 이번 sync 의 사유를 가린다.
        setNameError(null);
        const removeSet = new Set(remove);
        const kept = removeSet.size > 0 ? nodes.filter((n) => !removeSet.has(n.nodeId)) : nodes;

        // 서버 라벨이 그대로 이름이 되는 유일한 경로다. 손으로 치면 거부당하는 이름이 여기로는
        // 검사 없이 들어와, 저장은 되는데 조회만 조용히 비는 설정이 만들어졌다.
        // taken 에 이번 sync 에서 방금 받아들인 이름까지 누적하는 이유는, 트리의 서로 다른
        // 노드가 같은 라벨을 가질 수 있어 들어오는 것들끼리도 부딪히기 때문이다.
        const taken = [...kept.map((n) => n.name), ...derivedNames];
        const unique = [];
        const skipped = [];
        for (const n of add) {
            if (isDuplicate(n.nodeId)) continue;
            const verdict = validateTagName(n.name, { taken, jsonPayloadKey });
            if (!verdict.ok) {
                skipped.push(verdict.reason);
                continue;
            }
            taken.push(verdict.name);
            unique.push({
                ...normalizeCollectorNode(n),
                name: verdict.name,
                calcOrder: n.calcOrder || "bm",
            });
        }

        // 통째로 거부하면 라벨 하나에 콤마가 들었다고 체크한 수십 개가 전부 날아간다.
        // 받을 수 있는 건 받고, 빠진 것은 개수와 이유를 남긴다 — 조용히 버리면 사용자는
        // 자기가 체크한 노드가 없어진 것을 눈치채지 못한다.
        setSyncError(
            skipped.length > 0
                ? `Skipped ${skipped.length} browsed node${skipped.length === 1 ? "" : "s"}: ${skipped
                      .slice(0, 3)
                      .join(" ")}${skipped.length > 3 ? " …" : ""}`
                : null
        );

        if (unique.length > 0 || removeSet.size > 0) onChange([...kept, ...unique]);
    };

    const startNameEdit = (idx, currentName) => {
        setEditingNameIdx(idx);
        setEditingNameValue(String(currentName || ""));
        setEditNameError(null);
    };

    const cancelNameEdit = () => {
        setEditingNameIdx(null);
        setEditingNameValue("");
        setEditNameError(null);
    };

    const saveNameEdit = (idx) => {
        const trimmed = normalizeTagName(editingNameValue);
        if (trimmed && trimmed !== (nodes[idx]?.name || "")) {
            const verdict = validateTagName(trimmed, {
                taken: [
                    ...nodes.filter((_, i) => i !== idx).map((n) => n.name),
                    ...derivedNames,
                ],
                jsonPayloadKey,
            });
            if (!verdict.ok) {
                setEditNameError(verdict.reason);
                return;
            }
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
                        onChange={(e) => { setName(e.target.value); setNameError(null); }}
                        onKeyDown={handleKeyDown}
                        className={`w-full ${nameError ? "!border-error" : ""}`}
                        title={nameError || undefined}
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
            {(nameError || nodeIdError || dupError || syncError) && (
                <p className="text-error text-xs mb-12">{nameError || nodeIdError || dupError || syncError}</p>
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
                        className="btn btn-sm btn-ghost ml-auto"
                        onClick={() => openRename([...selectedRows])}
                        style={{ visibility: selectedRows.size > 0 ? "visible" : "hidden" }}
                        aria-hidden={selectedRows.size === 0}
                    >
                        <Icon name="edit" className="icon-sm" />
                        Rename {selectedRows.size} selected
                    </button>
                    <button
                        type="button"
                        className="btn btn-sm btn-danger"
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
                                            Node ID / Path
                                            <Icon name={sortIcon("nodeId")} className="icon-sm" />
                                        </button>
                                    </th>
                                    <th>Transform</th>
                                    <th style={{ width: 88 }}>Actions</th>
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
                                                    <>
                                                    <input
                                                        ref={editingNameInputRef}
                                                        type="text"
                                                        value={editingNameValue}
                                                        onChange={(e) => {
                                                            setEditingNameValue(e.target.value);
                                                            setEditNameError(null);
                                                        }}
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
                                                        className={`w-full ${editNameError ? "!border-error" : ""}`}
                                                        title={editNameError || undefined}
                                                        aria-invalid={editNameError ? "true" : undefined}
                                                    />
                                                    {/* 툴팁만으로는 왜 안 되는지 알 수 없다. 이유를 값 바로 아래에 적는다. */}
                                                    {editNameError && (
                                                        <p className="text-error text-xs mt-2">{editNameError}</p>
                                                    )}
                                                    </>
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
                                            <td title={row.nodeId}>
                                                <div className="flex flex-col gap-4">
                                                    <div className="flex items-center gap-6 mono text-on-surface-secondary">
                                                        <span className="truncate">{row.nodeId}</span>
                                                        {row.dataType && (
                                                            <span className="badge badge-success" style={{ fontSize: 10, padding: '2px 5px', flexShrink: 0 }}>
                                                                {row.dataType}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <NodePathCell node={row} />
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
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => openRename([idx])}
                                                        className="btn-icon-sm"
                                                        title="Rename"
                                                    >
                                                        <Icon name="edit" className="icon-sm" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeNode(idx)}
                                                        className="btn-icon-sm text-error"
                                                        title="Delete"
                                                    >
                                                        <Icon name="delete" className="icon-sm" />
                                                    </button>
                                                </div>
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
                    endpointTarget={endpointTarget}
                    existingNodes={nodes}
                    onSync={handleBrowseSync}
                    onClose={() => setBrowserOpen(false)}
                    selectionMode={selectionMode}
                />
            )}

            {renameItems && renameItems.length > 0 && (
                <NodeRenameModal
                    items={renameItems}
                    allNodeNames={nodes
                        .map((n, i) => (renameItems.some((it) => it.nodeIdx === i) ? null : n.name))
                        .filter(Boolean)}
                    derivedNames={derivedNames}
                    jsonPayloadKey={jsonPayloadKey}
                    onApply={applyRenames}
                    onClose={() => setRenameItems(null)}
                />
            )}
        </div>
    );
}
