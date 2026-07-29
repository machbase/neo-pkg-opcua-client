import { useMemo } from 'react'
import Icon from '../common/Icon'
import { nextAlias, EXPRESSION_LIMITS } from './derivedTag.js'

// Alias <-> node mapping rows for a derived-tag expression.
//
// A row reads as [alias badge][bound OPC UA node id][data type][remove]. The node cell is a
// chrome-less select whose option labels are the collector's tag names — the row shows the
// node id of whatever is bound, so the table matches what the OPC UA server is polled for.
//
// Aliases are STABLE: adding a variable takes the next free A-Z letter, and deleting a
// variable never reindexes the survivors. A deleted-but-still-referenced alias becomes an
// expression validation error the user fixes — this editor never rewrites the expression.
export default function VariablesEditor({ variables = [], onChange, nodes = [], disabled = false }) {
  // name -> node, for resolving the bound node's id and data type.
  const nodeByName = useMemo(() => {
    const map = new Map()
    for (const n of nodes) {
      if (n && n.name) map.set(String(n.name), n)
    }
    return map
  }, [nodes])

  const nodeNames = useMemo(() => [...nodeByName.keys()], [nodeByName])

  // Node names bound to more than one row — surfaced as a non-blocking hint only.
  const duplicateNodes = useMemo(() => {
    const counts = new Map()
    for (const v of variables) {
      const node = v && v.node ? String(v.node) : ''
      if (!node) continue
      counts.set(node, (counts.get(node) || 0) + 1)
    }
    return [...counts.entries()].filter(([, c]) => c > 1).map(([node]) => node)
  }, [variables])

  const alias = nextAlias(variables)
  const atLimit =
    variables.length >= EXPRESSION_LIMITS.maxVariablesPerExpression || alias === ''
  const addDisabled = disabled || atLimit

  const addVariable = () => {
    if (addDisabled) return
    onChange([...variables, { alias, node: '' }])
  }

  const updateNode = (idx, node) => {
    onChange(variables.map((v, i) => (i === idx ? { ...v, node } : v)))
  }

  const removeVariable = (idx) => {
    // No realias / reindex — stable aliases by contract.
    onChange(variables.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-8">
      {variables.length > 0 && (
        <div className="dt-var-table">
          {variables.map((v, idx) => {
            const name = v && v.node ? String(v.node) : ''
            const bound = name ? nodeByName.get(name) : null
            const missing = Boolean(name) && !bound
            return (
              <div key={v.alias || idx} className="dt-var-row">
                <span className="dt-var-alias">
                  <span className="dt-var-badge">{v.alias || '?'}</span>
                </span>
                <select
                  value={name}
                  onChange={(e) => updateNode(idx, e.target.value)}
                  disabled={disabled}
                  className={`dt-var-node${name ? '' : ' is-empty'}${missing ? ' is-missing !border-error' : ''}`}
                  title={
                    missing
                      ? `'${name}' is not one of this collector's nodes — pick another node`
                      : bound
                        ? `${name}${bound.nodeId ? `  ·  ${bound.nodeId}` : ''}`
                        : name || 'Select a node'
                  }
                >
                  <option value="" disabled>
                    Select a node…
                  </option>
                  {missing && <option value={name}>{name} (missing)</option>}
                  {nodeNames.map((n) => {
                    const node = nodeByName.get(n)
                    return (
                      <option key={n} value={n}>
                        {node && node.nodeId ? `${n}  ·  ${node.nodeId}` : n}
                      </option>
                    )
                  })}
                </select>
                <span className={`dt-var-type${missing ? ' is-missing' : ''}`}>
                  {missing ? (
                    <>
                      <Icon name="error" className="icon-sm" />
                      missing
                    </>
                  ) : (
                    (bound && bound.dataType) || ''
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => removeVariable(idx)}
                  disabled={disabled}
                  className="btn-icon-sm dt-var-remove"
                  title="Remove variable"
                >
                  <Icon name="delete" className="icon-sm" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-8">
        <button
          type="button"
          onClick={addVariable}
          disabled={addDisabled}
          className="btn btn-sm btn-ghost"
        >
          <Icon name="add" className="icon-sm" />
          Add variable
        </button>
        {atLimit && !disabled && (
          <span className="dt-helper">
            {variables.length >= EXPRESSION_LIMITS.maxVariablesPerExpression
              ? `Maximum ${EXPRESSION_LIMITS.maxVariablesPerExpression} variables reached.`
              : 'All alias letters (A–Z) are in use.'}
          </span>
        )}
      </div>

      {duplicateNodes.length > 0 && (
        <div className="dt-helper">
          {duplicateNodes.length === 1 ? 'Node' : 'Nodes'} {duplicateNodes.join(', ')}{' '}
          {duplicateNodes.length === 1 ? 'is' : 'are'} referenced by more than one variable.
        </div>
      )}
    </div>
  )
}
