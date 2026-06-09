const NUMERIC_TYPES = new Set([
    "Boolean", "SByte", "Byte", "Int16", "UInt16",
    "Int32", "UInt32", "Int64", "UInt64", "Float", "Double",
]);

export function isNumericDataType(dataType) {
    return dataType ? NUMERIC_TYPES.has(dataType) : false;
}

export function isSelectableNodeRow(row, selectionMode = "numeric-only") {
    if (!row || row.isObject || row.isCycle) return false;
    if (selectionMode !== "numeric-only") return true;
    return isNumericDataType(row.node?.dataType);
}

export function getNodeRangeRows(allRows, anchorIndex, targetIndex, selectionMode = "numeric-only") {
    if (!Number.isInteger(anchorIndex) || !Number.isInteger(targetIndex)) return null;
    if (anchorIndex < 0 || targetIndex < 0) return null;
    if (anchorIndex >= allRows.length || targetIndex >= allRows.length) return null;

    const start = Math.min(anchorIndex, targetIndex);
    const end = Math.max(anchorIndex, targetIndex);
    return allRows.slice(start, end + 1).filter((row) => isSelectableNodeRow(row, selectionMode));
}

export function createNodeSelectionState() {
    return { selected: new Map(), removedIds: new Set() };
}

export function applyNodeCheckedState({ selected, removedIds, existingIds, rows, checked }) {
    const nextSelected = new Map(selected);
    const nextRemovedIds = new Set(removedIds);

    for (const row of rows) {
        const nodeId = row.node?.nodeId;
        if (!nodeId) continue;

        if (existingIds.has(nodeId)) {
            if (checked) nextRemovedIds.delete(nodeId);
            else nextRemovedIds.add(nodeId);
        } else if (checked) {
            nextSelected.set(nodeId, {
                path: row.parentPath,
                pathLabels: Array.isArray(row.pathLabels) ? row.pathLabels.slice() : [],
                node: row.node,
            });
        } else {
            nextSelected.delete(nodeId);
        }
    }

    return { selected: nextSelected, removedIds: nextRemovedIds };
}

export function applyNodeSelectionState(state, { existingIds, rows, checked }) {
    return applyNodeCheckedState({
        selected: state.selected,
        removedIds: state.removedIds,
        existingIds,
        rows,
        checked,
    });
}
