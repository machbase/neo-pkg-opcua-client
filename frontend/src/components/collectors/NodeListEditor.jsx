import { useState } from 'react'
import Icon from '../common/Icon'

export default function NodeListEditor({ nodes, onChange }) {
  const [nodeId, setNodeId] = useState('')
  const [name, setName] = useState('')

  const addNode = () => {
    const trimmedId = nodeId.trim()
    const trimmedName = name.trim()
    if (!trimmedId || !trimmedName) return
    onChange([...nodes, { nodeId: trimmedId, name: trimmedName }])
    setNodeId('')
    setName('')
  }

  const removeNode = (index) => {
    onChange(nodes.filter((_, i) => i !== index))
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addNode()
    }
  }

  return (
    <div className="pt-2">
      <div className="form-label mb-5">Active Node Mapping</div>

      {/* Add row */}
      <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: '1fr 1fr 48px' }}>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full min-w-0"
          placeholder="Node Name"
        />
        <input
          type="text"
          value={nodeId}
          onChange={e => setNodeId(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full min-w-0"
          placeholder="ns=3;i=1001"
        />
        <button
          type="button"
          onClick={addNode}
          disabled={!nodeId.trim() || !name.trim()}
          className="btn btn-content btn-primary shrink-0"
        >
          <Icon name="add" className="icon-sm" />
        </button>
      </div>

      {/* Node table */}
      {nodes.length > 0 && (
        <div className="grid mt-3" style={{ gridTemplateColumns: '1fr 1fr 48px' }}>
          <span className="px-3 py-1.5 text-xs text-on-surface-disabled uppercase tracking-wide">Node Name</span>
          <span className="px-3 py-1.5 text-xs text-on-surface-disabled uppercase tracking-wide">Address</span>
          <span />
          {nodes.map((node, i) => (
            <>
              <span key={`n-${i}`} className="px-3 py-2 border-t border-border truncate min-w-0">{node.name}</span>
              <span key={`a-${i}`} className="px-3 py-2 border-t border-border font-mono text-on-surface-secondary truncate min-w-0">{node.nodeId}</span>
              <span key={`d-${i}`} className="px-3 py-2 border-t border-border flex justify-center">
                <button
                  type="button"
                  onClick={() => removeNode(i)}
                  className="opacity-40 hover:opacity-100 hover:text-error transition-opacity"
                >
                  <Icon name="delete" className="icon-sm" />
                </button>
              </span>
            </>
          ))}
        </div>
      )}
    </div>
  )
}
