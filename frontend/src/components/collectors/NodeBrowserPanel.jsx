import { useState, useEffect, useCallback, useRef } from 'react'
import Icon from '../common/Icon'
import NodeTreeItem from './NodeTreeItem'
import { browseNodeChildren } from '../../api/collectors'

const ROOT_NODE = 'ns=0;i=85'

export default function NodeBrowserPanel({ endpoint, existingNodes, filter, onAdd, onClose, containerRef }) {
  const [rootChildren, setRootChildren] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(new Map()) // nodeId → { path, node }
  const panelRef = useRef(null)

  const existingIds = new Set(existingNodes.map(n => n.nodeId))
  const selectedIds = new Set(selected.keys())

  // Load root on mount
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await browseNodeChildren(endpoint, ROOT_NODE)
        if (!cancelled) setRootChildren(data || [])
      } catch (e) {
        if (!cancelled) setError(e.reason || e.message || 'Failed to connect')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [endpoint])

  // Close on outside click (exclude the trigger container)
  useEffect(() => {
    function handleClick(e) {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        containerRef?.current && !containerRef.current.contains(e.target)
      ) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose, containerRef])

  // Close on Escape
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleToggle = useCallback((nodeId, path, node) => {
    setSelected(prev => {
      const next = new Map(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.set(nodeId, { path, node })
      }
      return next
    })
  }, [])

  const handleAdd = () => {
    const nodes = Array.from(selected.entries()).map(([nodeId, { path }]) => ({
      nodeId,
      name: path,
    }))
    onAdd(nodes)
    onClose()
  }

  const handleRetry = () => {
    setError(null)
    setLoading(true)
    browseNodeChildren(endpoint, ROOT_NODE)
      .then(data => setRootChildren(data || []))
      .catch(e => setError(e.reason || e.message || 'Failed to connect'))
      .finally(() => setLoading(false))
  }

  // Filter visible root children by displayName/browseName/nodeId
  const filteredChildren = rootChildren
    ? rootChildren.filter(child => {
        if (!filter?.trim()) return true
        const q = filter.toLowerCase()
        return (
          (child.displayName || '').toLowerCase().includes(q) ||
          (child.browseName || '').toLowerCase().includes(q) ||
          child.nodeId.toLowerCase().includes(q)
        )
      })
    : null

  const SkeletonTree = () => (
    <div className="node-tree-skeleton" style={{ padding: '8px' }}>
      {[70, 50, 60, 40, 55].map((w, i) => (
        <div key={i} className="skeleton-row">
          <span className="skeleton-bar" style={{ width: `${w}%` }} />
          <span className="skeleton-bar" style={{ width: `${90 - w}%` }} />
        </div>
      ))}
    </div>
  )

  return (
    <div ref={panelRef} className="node-browser-panel animate-fade-in">
      {/* Header */}
      <div className="node-browser-header">
        <Icon name="account_tree" className="icon-sm text-primary" />
        <span className="font-semibold">Node Browser</span>
        <span className="text-on-surface-disabled text-xs ml-1">
          — click folders to expand, check variables to select
        </span>
        <button type="button" className="ml-auto opacity-60 hover:opacity-100" onClick={onClose}>
          <Icon name="close" className="icon-sm" />
        </button>
      </div>

      {/* Tree body */}
      <div className="node-browser-body">
        {loading && <SkeletonTree />}

        {error && (
          <div className="node-browser-error">
            <Icon name="error" className="icon-sm text-error" />
            <span>{error}</span>
            <button type="button" className="btn btn-sm btn-ghost ml-auto" onClick={handleRetry}>
              Retry
            </button>
          </div>
        )}

        {filteredChildren && filteredChildren.length === 0 && !loading && (
          <div className="node-browser-empty">
            {filter ? 'No matching nodes' : 'No child nodes found'}
          </div>
        )}

        {filteredChildren && filteredChildren.map(child => (
          <NodeTreeItem
            key={child.nodeId}
            node={child}
            depth={0}
            endpoint={endpoint}
            selectedIds={selectedIds}
            onToggle={handleToggle}
            existingIds={existingIds}
            parentPath=""
            visitedIds={new Set([ROOT_NODE])}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="node-browser-footer">
        <span className="text-on-surface-tertiary text-sm">
          {selected.size > 0 ? `${selected.size} node(s) selected` : 'Select variable nodes to add'}
        </span>
        <div className="flex gap-2">
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={selected.size === 0}
            onClick={handleAdd}
          >
            <Icon name="add" className="icon-sm" />
            Add Selected
          </button>
        </div>
      </div>
    </div>
  )
}
