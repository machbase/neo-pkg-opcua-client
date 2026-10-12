// Adapted from neo-web PR #737 (JSON value key exploration).
import { useEffect, useMemo, useRef, useState } from 'react';
import { VscChevronDown, VscChevronRight, VscChromeClose, VscClearAll, VscClose, VscListSelection, VscSymbolArray, VscSymbolBoolean, VscSymbolNamespace, VscSymbolNumeric, VscSymbolString, } from './JsonKeyIcons';
import Modal from './JsonKeyModal';
import DataViewerModalPortal from './DataViewerModalPortal';
import useModalDialog from '../../hooks/useModalDialog';
import { displayJsonPathSegments } from '../../utils/dashboardJsonValue.js';
import { jsonKeyPathLabel } from '../../utils/jsonKeyCatalog.js';
import { buildJsonKeyTree, filterJsonKeyTree, jsonKeyTreeLeafPaths, jsonKeyTreeLeavesUnder, jsonKeyTreeSeriesCount, MAX_JSON_KEY_SERIES, visibleJsonKeyTree, } from './jsonKeyTree';
const jsonKeyBadgeTone = (dataType) => dataType === 'NUMBER' ? 'badge-info' : dataType === 'STRING' ? 'badge-success' : 'badge-muted';
const JsonKeyTypeGlyph = ({ node }) => {
    if (!node.leaf)
        return node.preview.startsWith('array') ? <VscSymbolArray /> : <VscSymbolNamespace />;
    if (node.dataType === 'NUMBER')
        return <VscSymbolNumeric />;
    if (node.dataType === 'BOOLEAN')
        return <VscSymbolBoolean />;
    return <VscSymbolString />;
};
const TREE_INDENT_STEP = 16;
const TREE_INDENT_BUDGET = 200;
export const JsonKeyPickerModal = ({ tagName, baseLabel, document, valueColumn = 'VALUE', initialSelected, initialView, onViewChange, onClose, onConfirm }) => {
    const nodes = useMemo(() => buildJsonKeyTree(document, valueColumn), [document, valueColumn]);
    const closeOnOutside = onClose;
    const dialogRef = useModalDialog(`Choose keys from ${tagName}`);
    const [filter, setFilter] = useState(() => initialView?.filter ?? '');
    const [collapsed, setCollapsed] = useState(() => new Set(initialView?.collapsed ?? []));
    const [selected, setSelected] = useState(() => (initialSelected ?? []).filter((path) => nodes.some((node) => node.leaf && node.queryable && node.path === path)));
    const indentStep = useMemo(() => {
        const deepest = nodes.reduce((max, node) => Math.max(max, node.depth), 0);
        if (deepest === 0)
            return TREE_INDENT_STEP;
        return Math.max(2, Math.min(TREE_INDENT_STEP, Math.floor(TREE_INDENT_BUDGET / deepest)));
    }, [nodes]);
    const filtering = filter.trim().length > 0;
    const filtered = useMemo(() => filterJsonKeyTree(nodes, filter), [filter, nodes]);
    const visible = useMemo(() => (filtering ? filtered : visibleJsonKeyTree(filtered, collapsed)), [collapsed, filtered, filtering]);
    const documentKeyCount = useMemo(() => jsonKeyTreeLeafPaths(nodes).length, [nodes]);
    const seriesCount = useMemo(() => jsonKeyTreeSeriesCount(nodes, selected), [nodes, selected]);
    const toggleCollapsed = (path) => setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(path))
            next.delete(path);
        else
            next.add(path);
        return next;
    });
    const toggle = (node) => setSelected((current) => {
        const leaves = jsonKeyTreeLeavesUnder(nodes, node.path);
        if (leaves.length === 0)
            return current;
        const picked = new Set(current);
        const allPicked = leaves.every((path) => picked.has(path));
        if (allPicked)
            return current.filter((path) => !leaves.includes(path));
        return Array.from(new Set([...current, ...leaves]));
    });
    const clearAll = () => setSelected([]);
    const viewChangeRef = useRef(onViewChange);
    viewChangeRef.current = onViewChange;
    useEffect(() => {
        viewChangeRef.current?.({ filter, collapsed: Array.from(collapsed) });
    }, [collapsed, filter]);
    const renderRow = (node) => {
        const indent = { '--tree-indent': filtering ? '0px' : `${node.depth * indentStep}px` };
        const isCollapsed = collapsed.has(node.path);
        const leaves = jsonKeyTreeLeavesUnder(nodes, node.path);
        const pickedCount = leaves.filter((path) => selected.includes(path)).length;
        const checked = leaves.length > 0 && pickedCount === leaves.length;
        const partial = pickedCount > 0 && !checked;
        const label = (<span className="json-key-name json-key-name-leaf">
                {filtering && node.parentDotted ? <span className="json-key-prefix">{node.parentDotted}.</span> : null}
                {displayJsonPathSegments([node.label])}
            </span>);
        const box = (<span className="node-tree-toggle">
                <input type="checkbox" checked={checked} ref={(element) => {
                if (element)
                    element.indeterminate = partial;
            }} onChange={() => toggle(node)} aria-label={node.dotted} disabled={leaves.length === 0}/>
            </span>);
        const rowClass = `json-key-row${checked ? ' is-active' : ''}${partial ? ' is-partial' : ''}`;
        if (node.leaf) {
            return (<label key={node.path} className={rowClass} style={indent} title={node.queryable ? node.dotted : 'This JSON key cannot be queried.'}>
                    <span className="json-key-caret"/>
                    {box}

                    {label}
                    {node.dataType ? <span className={`badge ${jsonKeyBadgeTone(node.dataType)}`}>{node.dataType.toLowerCase()}</span> : null}
                    <span className="json-key-preview">{node.preview}</span>
                </label>);
        }
        return (<div key={node.path} className={rowClass} style={indent}>
                <button type="button" className="json-key-caret json-key-caret-button" onClick={() => toggleCollapsed(node.path)} disabled={filtering} aria-expanded={!isCollapsed} aria-label={`${node.dotted} ${isCollapsed ? 'expand' : 'collapse'}`}>
                    {filtering ? null : isCollapsed ? <VscChevronRight className="icon-sm"/> : <VscChevronDown className="icon-sm"/>}
                </button>

                {box}


                <div className="json-key-open" role="presentation" onClick={filtering ? undefined : () => toggleCollapsed(node.path)} title={node.dotted}>
                    <span className="json-key-glyph">
                        <JsonKeyTypeGlyph node={node}/>
                    </span>
                    {label}
                    <span className="badge badge-muted">{node.preview}</span>
                </div>
            </div>);
    };
    return (<DataViewerModalPortal>
            <Modal pIsDarkMode className="json-key-modal json-key-picker-modal" onOutSideClose={closeOnOutside}>
                <div ref={dialogRef} className="modal-header json-key-picker-header">
                    <div className="modal-header-title">Select keys</div>
                    <span className="json-key-modal-sub">{[tagName, `${documentKeyCount} keys`, baseLabel].filter(Boolean).join(' · ')}</span>
                    <button type="button" className="btn-icon-sm" onClick={onClose} aria-label="Close">
                        <VscClose />
                    </button>
                </div>

                <div className="modal-body json-key-modal-body json-key-picker-body">
                    <div className="json-key-picker-tree-col">
                        <div className="json-key-modal-toolbar">
                            <input className="json-key-modal-filter" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter keys — any depth" aria-label="Filter keys"/>
                        </div>

                        <div className="json-key-modal-tree">
                            {nodes.length === 0 ? <div className="empty-state">This row does not hold a JSON document.</div> : null}
                            {nodes.length > 0 && visible.length === 0 ? <div className="empty-state">No keys match.</div> : null}
                            {visible.map(renderRow)}
                        </div>
                    </div>


                    <div className="json-key-picker-selected">
                        <div className="json-key-picker-selected-head">
                            <span className="json-key-picker-selected-title">
                                <VscListSelection className="icon-sm"/> SELECTED · {selected.length}
                            </span>
                            <button type="button" className="btn-icon-sm" onClick={clearAll} disabled={selected.length === 0} title="Clear selection" aria-label="Clear selection">
                                <VscClearAll />
                            </button>
                        </div>

                        <div className="json-key-picker-selected-list">
                            {selected.length === 0 ? <div className="empty-state">Nothing picked yet.</div> : null}
                            {selected.map((path) => {
            const node = nodes.find((entry) => entry.path === path);
            const name = jsonKeyPathLabel(path) || node?.dotted || path;
            return (<span key={path} className={`json-key-picker-chip${node?.numeric ? '' : ' is-flat'}`} title={name}>
                                        <span className="json-key-picker-chip-name">{name}</span>
                                        <button type="button" onClick={() => setSelected((current) => current.filter((entry) => entry !== path))} aria-label={`Remove ${name}`} title={`Remove ${name}`}>
                                            <VscChromeClose />
                                        </button>
                                    </span>);
        })}
                        </div>
                    </div>
                </div>

                <div className="modal-footer json-key-modal-footer">
                        <span className="json-key-modal-count">
                            {`${selected.length} ${selected.length === 1 ? 'key' : 'keys'} selected · ${seriesCount > MAX_JSON_KEY_SERIES ? `${MAX_JSON_KEY_SERIES} of ${seriesCount} drawn` : `${seriesCount} series`}`}
                        </span>
                        <div className="json-key-modal-buttons">
                            <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
                                Cancel
                            </button>

                            <button type="button" className="btn btn-sm btn-primary" onClick={() => onConfirm(selected)} disabled={selected.length === 0}>
                                View detail
                            </button>
                        </div>
                </div>
            </Modal>
        </DataViewerModalPortal>);
};
export default JsonKeyPickerModal;
