import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import Icon from "../common/Icon";
import { browseNodeChildren } from "../../api/collectors";
import {
    applyNodeSelectionState,
    createNodeSelectionState,
    getNodeRangeRows,
    isNumericDataType,
    isSelectableNodeRow,
} from "./nodeRangeSelection";
import { buildNodeTree } from "./nodeTree";
import { normalizeTagNameInput } from "./tagName";

const DEFAULT_ROOT = "ns=0;i=85";
const NODE_CLASS_OBJECT = 1;

function getDataType(node) {
    return node.dataType || null;
}

function getLabel(node) {
    return node.displayName || node.browseName || node.nodeId;
}

function tagPathPart(label) {
    return normalizeTagNameInput(label);
}

function flattenTree(parentId, childrenMap, expandedIds, depth, parentPath, parentLabels, visitedIds) {
    const children = childrenMap.get(parentId);
    if (!children) return [];

    const rows = [];
    for (const node of children) {
        const isObject = node.nodeClass === NODE_CLASS_OBJECT;
        const label = getLabel(node);
        const currentPath = parentPath ? `${parentPath}_${tagPathPart(label)}` : tagPathPart(label);
        const pathLabels = [...parentLabels, label];
        const isCycle = visitedIds.has(node.nodeId);

        rows.push({ node, depth, parentPath: currentPath, pathLabels, isObject, isCycle });

        if (isObject && expandedIds.has(node.nodeId) && !isCycle) {
            const nextVisited = new Set([...visitedIds, node.nodeId]);
            rows.push(...flattenTree(node.nodeId, childrenMap, expandedIds, depth + 1, currentPath, pathLabels, nextVisited));
        }
    }
    return rows;
}

function collectDescendants(parentId, cm, result) {
    const children = cm.get(parentId);
    if (!children) return;
    for (const child of children) {
        if (child.nodeClass === NODE_CLASS_OBJECT && !result.has(child.nodeId)) {
            result.add(child.nodeId);
            collectDescendants(child.nodeId, cm, result);
        }
    }
}

export default function NodeBrowserPanel({ endpoint, endpointTarget, existingNodes, onSync, onClose, selectionMode = "numeric-only" }) {
    const [rootNodeId, setRootNodeId] = useState(DEFAULT_ROOT);
    const [rootInput, setRootInput] = useState(DEFAULT_ROOT);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectionState, setSelectionState] = useState(() => createNodeSelectionState());
    const [lastRangeAnchor, setLastRangeAnchor] = useState(null);
    const [filter, setFilter] = useState("");

    const [childrenMap, setChildrenMap] = useState(new Map());
    const [expandedIds, setExpandedIds] = useState(new Set());
    const [loadingIds, setLoadingIds] = useState(new Set());

    const panelRef = useRef(null);
    const loadedRef = useRef(false);

    const existingIds = useMemo(() => new Set(existingNodes.map((n) => n.nodeId)), [existingNodes]);
    const { selected, removedIds } = selectionState;
    const selectedIds = useMemo(() => new Set(selected.keys()), [selected]);

    const loadChildren = useCallback(
        async (parentId) => {
            setLoadingIds((prev) => new Set([...prev, parentId]));
            try {
                const data = await browseNodeChildren(endpointTarget || endpoint, parentId);
                setChildrenMap((prev) => {
                    const next = new Map(prev);
                    next.set(parentId, data || []);
                    return next;
                });
            } catch (e) {
                setExpandedIds((prev) => {
                    const next = new Set(prev);
                    next.delete(parentId);
                    return next;
                });
            } finally {
                setLoadingIds((prev) => {
                    const next = new Set(prev);
                    next.delete(parentId);
                    return next;
                });
            }
        },
        [endpoint, endpointTarget]
    );

    const browse = useCallback(
        (nodeId) => {
            setLoading(true);
            setError(null);
            setChildrenMap(new Map());
            setExpandedIds(new Set());
            browseNodeChildren(endpointTarget || endpoint, nodeId)
                .then((data) => {
                    const map = new Map();
                    map.set(nodeId, data || []);
                    setChildrenMap(map);
                    setRootNodeId(nodeId);
                    loadedRef.current = true;
                })
                .catch((e) => setError(e.reason || e.message || "Failed to connect"))
                .finally(() => setLoading(false));
        },
        [endpoint, endpointTarget]
    );

    useEffect(() => {
        if (loadedRef.current) return;
        browse(rootNodeId);
    }, [browse, rootNodeId]);

    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [onClose]);

    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "";
        };
    }, []);

    useEffect(() => {
        setLastRangeAnchor(null);
    }, [rootNodeId, selectionMode]);

    const handleRootSubmit = () => {
        const trimmed = rootInput.trim();
        if (trimmed === rootNodeId) return;
        setFilter("");
        setSelectionState(createNodeSelectionState());
        setLastRangeAnchor(null);
        if (!trimmed) {
            setRootNodeId("");
            setChildrenMap(new Map());
            setExpandedIds(new Set());
            loadedRef.current = true;
            return;
        }
        loadedRef.current = true;
        browse(trimmed);
    };

    const handleToggleExpand = (nodeId) => {
        if (expandedIds.has(nodeId)) {
            const toRemove = new Set([nodeId]);
            collectDescendants(nodeId, childrenMap, toRemove);
            setExpandedIds((prev) => {
                const next = new Set(prev);
                for (const id of toRemove) next.delete(id);
                return next;
            });
            setChildrenMap((prev) => {
                const next = new Map(prev);
                for (const id of toRemove) next.delete(id);
                return next;
            });
        } else {
            setExpandedIds((prev) => new Set([...prev, nodeId]));
            loadChildren(nodeId);
        }
    };

    const allRows = useMemo(() => {
        if (!childrenMap.has(rootNodeId)) return [];
        return flattenTree(rootNodeId, childrenMap, expandedIds, 0, "", [], new Set([rootNodeId]));
    }, [rootNodeId, childrenMap, expandedIds]);

    useEffect(() => {
        setLastRangeAnchor(null);
    }, [allRows]);

    const rows = useMemo(() => {
        if (!filter?.trim()) return allRows;
        const q = filter.toLowerCase();
        return allRows.filter((r) => getLabel(r.node).toLowerCase().includes(q) || r.node.nodeId.toLowerCase().includes(q));
    }, [allRows, filter]);

    const applySelectionRows = useCallback(
        (selectionRows, checked) => {
            setSelectionState((prev) => applyNodeSelectionState(prev, {
                existingIds,
                rows: selectionRows,
                checked,
            }));
        },
        [existingIds]
    );

    const handleVariableToggle = useCallback(
        (row, rowIndex, checked, shiftKey) => {
            const rangeRows =
                shiftKey && lastRangeAnchor
                    ? getNodeRangeRows(allRows, lastRangeAnchor.rowIndex, rowIndex, selectionMode)
                    : null;

            if (rangeRows) {
                applySelectionRows(rangeRows, lastRangeAnchor.checked);
                return;
            }

            applySelectionRows([row], checked);
            setLastRangeAnchor({ rowIndex, checked });
        },
        [allRows, applySelectionRows, lastRangeAnchor, selectionMode]
    );

    const handleApply = () => {
        const add = Array.from(selected.entries()).map(([nodeId, { path, pathLabels, node }]) => ({
            nodeId,
            name: path,
            treePath: pathLabels,
            dataType: getDataType(node) || undefined,
            nodeTree: buildNodeTree({ rootNodeId, pathLabels, node }),
        }));
        onSync({ add, remove: Array.from(removedIds) });
        onClose();
    };

    const hasChanges = selected.size > 0 || removedIds.size > 0;

    const SkeletonTree = () => (
        <div className="node-tree-skeleton" style={{ padding: "8px" }}>
            {[70, 50, 60, 40, 55].map((w, i) => (
                <div key={i} className="skeleton-row">
                    <span className="skeleton-bar" style={{ width: `${w}%` }} />
                    <span className="skeleton-bar" style={{ width: `${90 - w}%` }} />
                </div>
            ))}
        </div>
    );

    const mouseDownTarget = useRef(null);

    return createPortal(
        <div
            className="modal-overlay"
            onMouseDown={(e) => {
                mouseDownTarget.current = e.target;
            }}
            onMouseUp={(e) => {
                if (e.target === e.currentTarget && mouseDownTarget.current === e.currentTarget) onClose();
                mouseDownTarget.current = null;
            }}
        >
            <div ref={panelRef} className="node-browser-modal animate-fade-in">
                {/* Header */}
                <div className="node-browser-modal-header">
                    <div className="flex items-center gap-8">
                        <Icon name="account_tree" className="icon-sm text-primary" />
                        <span className="font-semibold">Node Browser</span>
                    </div>
                    <button type="button" className="opacity-60 hover:opacity-100" onClick={onClose}>
                        <Icon name="close" className="icon-sm" />
                    </button>
                </div>

                {/* Browse From */}
                <div className="node-browser-modal-bar">
                    <span className="text-on-surface-disabled text-xs font-semibold uppercase tracking-wide shrink-0">Browse From</span>
                    <div className="input-icon-wrap flex-1">
                        <input
                            type="text"
                            value={rootInput}
                            onChange={(e) => setRootInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleRootSubmit();
                                }
                            }}
                            className="w-full font-mono text-sm"
                            placeholder="ns=0;i=85"
                        />
                        <span className="input-icon-trailing">
                            <Icon name="search" className="icon-sm" />
                        </span>
                    </div>
                </div>

                {/* Filter */}
                <div className="node-browser-modal-search">
                    <Icon name="filter_list" className="icon-sm text-on-surface-disabled" />
                    <input
                        type="text"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") e.preventDefault();
                        }}
                        className="node-browser-modal-search-input"
                        placeholder="Filter results by name or address..."
                        autoFocus
                    />
                    {filter && (
                        <button type="button" className="opacity-60 hover:opacity-100" onClick={() => setFilter("")}>
                            <Icon name="close" className="icon-sm" />
                        </button>
                    )}
                </div>

                {/* Hint */}
                <div className="px-4 py-2 text-on-surface-disabled text-xs border-b border-border">Click folders to expand, check variables to select</div>

                {/* Tree body — simple scroll, no virtualization */}
                <div className="node-browser-modal-body">
                    {loading && <SkeletonTree />}

                    {error && (
                        <div className="node-browser-error">
                            <Icon name="error" className="icon-sm text-error" />
                            <span>{error}</span>
                            <button type="button" className="btn btn-sm btn-ghost ml-auto" onClick={() => browse(rootNodeId)}>
                                Retry
                            </button>
                        </div>
                    )}

                    {!loading && !error && rows.length === 0 && childrenMap.has(rootNodeId) && (
                        <div className="node-browser-empty">{filter ? "No matching nodes" : "No child nodes found"}</div>
                    )}

                    {rows.map((row, i) => {
                        const { node, depth, parentPath, isObject, isCycle } = row;
                        const rowIndex = allRows.indexOf(row);
                        const isExpanded = expandedIds.has(node.nodeId) && !isCycle;
                        const isNodeLoading = loadingIds.has(node.nodeId);
                        const alreadyAdded = existingIds.has(node.nodeId);
                        const isSelected = selectedIds.has(node.nodeId);
                        const isRemoved = removedIds.has(node.nodeId);
                        const isNumeric = isObject || isNumericDataType(getDataType(node));
                        const isDisabled = !isObject && !isSelectableNodeRow(row, selectionMode);
                        const isChecked = alreadyAdded ? !isRemoved : isSelected;

                        const handleRowClick = (e) => {
                            if (e.target.tagName === "INPUT") return;
                            if (isObject) {
                                if (!isCycle) handleToggleExpand(node.nodeId);
                            } else if (!isDisabled) {
                                handleVariableToggle(row, rowIndex, !isChecked, e.shiftKey);
                            }
                        };

                        return (
                            <div
                                key={node.nodeId + "-" + i}
                                className={`node-tree-row ${isObject ? "node-tree-row-folder" : ""} ${isDisabled ? "node-tree-row-disabled" : ""} ${
                                    isCycle ? "node-tree-row-disabled" : ""
                                }`}
                                style={{
                                    paddingLeft: depth * 16,
                                    cursor: isDisabled || isCycle ? "default" : "pointer",
                                }}
                                onClick={handleRowClick}
                                title={
                                    isCycle
                                        ? `${getLabel(node)}  —  ${node.nodeId} (circular reference)`
                                        : isDisabled
                                        ? selectionMode === "numeric-only"
                                            ? `${getLabel(node)}  —  ${node.nodeId} (non-numeric — set String Value Column or use a JSON column to enable)`
                                            : `${getLabel(node)}  —  ${node.nodeId} (unsupported data type)`
                                        : `${getLabel(node)}  —  ${node.nodeId}`
                                }
                            >
                                <span className="node-tree-toggle">
                                    {isObject ? (
                                        isCycle ? (
                                            <Icon name="subdirectory_arrow_right" className="icon-sm opacity-30" />
                                        ) : (
                                            <Icon name={isNodeLoading ? "more_horiz" : isExpanded ? "expand_more" : "chevron_right"} className="icon-sm" />
                                        )
                                    ) : (
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            disabled={isDisabled}
                                            aria-label={`${getLabel(node)} select`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (isDisabled) return;
                                                handleVariableToggle(row, rowIndex, !isChecked, e.shiftKey);
                                            }}
                                            onChange={(e) => {
                                                handleVariableToggle(row, rowIndex, e.target.checked, e.nativeEvent?.shiftKey);
                                            }}
                                        />
                                    )}
                                </span>

                                <span className="node-tree-label">
                                    <span className="truncate">{getLabel(node)}</span>
                                    {!isObject &&
                                        (() => {
                                            const dt = getDataType(node);
                                            return dt ? (
                                                <span className={`badge ${isNumeric ? "badge-success" : "badge-muted"}`} style={{ fontSize: 10, padding: "2px 5px" }}>
                                                    {dt}
                                                </span>
                                            ) : null;
                                        })()}
                                </span>

                                <span className={`badge ${isObject ? "badge-muted" : "badge-primary"}`} style={{ fontSize: 10, padding: "2px 5px", flexShrink: 0 }}>
                                    {isObject ? "OBJ" : "VAR"}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="node-browser-modal-footer">
                    <span className="text-on-surface-tertiary text-sm">
                        {selected.size > 0 && `+${selected.size}`}
                        {selected.size > 0 && removedIds.size > 0 && " / "}
                        {removedIds.size > 0 && `−${removedIds.size}`}
                        {!hasChanges && "Select variable nodes to add or uncheck to remove"}
                    </span>
                    <div className="flex gap-8">
                        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="button" className="btn btn-sm btn-primary" disabled={!hasChanges} onClick={handleApply}>
                            <Icon name="check" className="icon-sm" />
                            Apply
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
