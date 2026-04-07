import { useState, useCallback } from 'react'
import Icon from '../common/Icon'
import { browseNodeChildren } from '../../api/collectors'

const NODE_CLASS_OBJECT = 1
const SHOW_MORE_STEP = 50

function getLabel(node) {
  return node.displayName || node.browseName || node.nodeId
}

function SkeletonRows() {
  return (
    <div className="node-tree-skeleton">
      <div className="skeleton-row"><span className="skeleton-bar" style={{ width: '60%' }} /><span className="skeleton-bar" style={{ width: '25%' }} /></div>
      <div className="skeleton-row"><span className="skeleton-bar" style={{ width: '45%' }} /><span className="skeleton-bar" style={{ width: '30%' }} /></div>
      <div className="skeleton-row"><span className="skeleton-bar" style={{ width: '55%' }} /><span className="skeleton-bar" style={{ width: '20%' }} /></div>
    </div>
  )
}

export default function NodeTreeItem({
  node,
  depth,
  endpoint,
  selectedIds,
  onToggle,
  existingIds,
  parentPath,
  visitedIds,
}) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [visibleCount, setVisibleCount] = useState(SHOW_MORE_STEP)

  const isObject = node.nodeClass === NODE_CLASS_OBJECT
  const label = getLabel(node)
  const currentPath = parentPath ? `${parentPath}.${label}` : label
  const alreadyAdded = existingIds.has(node.nodeId)
  const isSelected = selectedIds.has(node.nodeId)
  const isCycle = visitedIds.has(node.nodeId)

  const handleExpand = useCallback(async () => {
    if (!isObject || isCycle) return

    if (expanded) {
      setExpanded(false)
      return
    }

    if (children !== null) {
      setExpanded(true)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await browseNodeChildren(endpoint, node.nodeId)
      setChildren(data || [])
      setExpanded(true)
    } catch (e) {
      setError(e.reason || e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [isObject, isCycle, expanded, children, endpoint, node.nodeId])

  const handleCheck = () => {
    if (alreadyAdded) return
    onToggle(node.nodeId, currentPath, node)
  }

  const nextVisited = isObject ? new Set([...visitedIds, node.nodeId]) : visitedIds
  const visibleChildren = children ? children.slice(0, visibleCount) : []
  const hasMore = children && children.length > visibleCount

  return (
    <div>
      <div
        className={`node-tree-row ${isObject ? 'node-tree-row-folder' : ''}`}
        style={{ paddingLeft: depth * 16 + 8 }}
      >
        {/* expand/collapse or spacer */}
        {isObject ? (
          <button
            type="button"
            className="node-tree-toggle"
            onClick={handleExpand}
            disabled={isCycle}
            title={isCycle ? 'Circular reference detected' : undefined}
          >
            <Icon name={loading ? 'more_horiz' : expanded ? 'expand_more' : 'chevron_right'} className="icon-sm" />
          </button>
        ) : (
          <span className="node-tree-toggle-spacer" />
        )}

        {/* checkbox for non-object nodes */}
        {!isObject && (
          <input
            type="checkbox"
            checked={isSelected || alreadyAdded}
            disabled={alreadyAdded}
            onChange={handleCheck}
            title={alreadyAdded ? 'Already added' : undefined}
          />
        )}

        {/* label */}
        <button
          type="button"
          className="node-tree-label"
          onClick={isObject ? handleExpand : handleCheck}
          disabled={!isObject && alreadyAdded}
          title={node.nodeId}
        >
          <span className="truncate">{label}</span>
          <span className="node-tree-nodeid">{node.nodeId}</span>
        </button>

        {/* type badge */}
        <span className={`badge ${isObject ? 'badge-muted' : 'badge-primary'}`} style={{ fontSize: 10, padding: '2px 5px' }}>
          {isObject ? 'OBJ' : 'VAR'}
        </span>
      </div>

      {/* error */}
      {error && (
        <div className="node-tree-error" style={{ paddingLeft: (depth + 1) * 16 + 8 }}>
          <span>{error}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={handleExpand}>Retry</button>
        </div>
      )}

      {/* loading skeleton */}
      {loading && (
        <div style={{ paddingLeft: (depth + 1) * 16 + 8 }}>
          <SkeletonRows />
        </div>
      )}

      {/* children */}
      {expanded && children && (
        <div>
          {children.length === 0 && (
            <div className="node-tree-empty" style={{ paddingLeft: (depth + 1) * 16 + 8 }}>
              No child nodes
            </div>
          )}
          {visibleChildren.map((child) => (
            <NodeTreeItem
              key={child.nodeId}
              node={child}
              depth={depth + 1}
              endpoint={endpoint}
              selectedIds={selectedIds}
              onToggle={onToggle}
              existingIds={existingIds}
              parentPath={currentPath}
              visitedIds={nextVisited}
            />
          ))}
          {hasMore && (
            <div style={{ paddingLeft: (depth + 1) * 16 + 8, padding: '4px 8px' }}>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setVisibleCount(c => c + SHOW_MORE_STEP)}
              >
                Show more ({children.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
