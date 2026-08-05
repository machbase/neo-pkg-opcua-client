import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../common/Icon'
import { nextAlias, EXPRESSION_LIMITS } from './derivedTag.js'

const optionLabel = (name, node) => (node && node.nodeId ? `${name}  ·  ${node.nodeId}` : name)

// Searchable node picker for one variable row.
//
// A collector can poll hundreds of nodes, and a native <select> only lets the user scroll to
// find one. This is the same type-to-filter combo as the Table field in DbSection
// (`.table-combo`), with one difference: only an existing node can be bound, so typed text is
// a filter and never a value — leaving the field without picking an option restores the bound
// node.
function NodeCombo({ value, nodes, nodeByName, missing, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef(null)
  const menuRef = useRef(null)
  const inputRef = useRef(null)

  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return nodes
    return nodes.filter((n) => {
      const node = nodeByName.get(n)
      return n.toLowerCase().includes(q) || String((node && node.nodeId) || '').toLowerCase().includes(q)
    })
  }, [nodes, nodeByName, query])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  useEffect(() => {
    if (!open) return
    const onOutside = (e) => {
      if (!wrapRef.current?.contains(e.target)) close()
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  // Keep the highlighted option inside the scroll box while arrowing through a long list.
  useEffect(() => {
    if (!open) return
    menuRef.current?.children[highlight]?.scrollIntoView({ block: 'nearest' })
  }, [open, highlight])

  const select = (name) => {
    onChange(name)
    close()
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && open) {
      // The derived-tag modal closes on Escape from a document listener — swallow the key so
      // dismissing the dropdown does not also discard the whole draft.
      e.preventDefault()
      e.stopPropagation()
      close()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        setHighlight(0)
        return
      }
      if (options.length === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setHighlight((i) => (i + step + options.length) % options.length)
      return
    }
    if (e.key === 'Enter' && open) {
      e.preventDefault()
      const picked = options[highlight]
      if (picked) select(picked)
    }
  }

  return (
    <div ref={wrapRef} className="dt-var-combo table-combo">
      <div className="table-combo-control">
        <input
          ref={inputRef}
          type="text"
          value={open ? query : value}
          onChange={(e) => {
            setQuery(e.target.value)
            setHighlight(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          // Options preventDefault on mousedown, so picking one never blurs the input — a real
          // blur means the user left the field, and the typed filter is dropped.
          onBlur={close}
          onKeyDown={onKeyDown}
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          className={`table-combo-input dt-var-node${value ? '' : ' is-empty'}${missing ? ' is-missing !border-error' : ''}`}
          placeholder={open && value ? value : 'Select a node…'}
          title={
            missing
              ? `'${value}' is not one of this collector's nodes — pick another node`
              : value
                ? optionLabel(value, nodeByName.get(value))
                : 'Select a node'
          }
        />
        <button
          type="button"
          className="table-combo-trigger"
          onMouseDown={(e) => e.preventDefault()} // keep focus on the input so it does not blur-close first
          onClick={() => {
            if (open) {
              close()
              return
            }
            setOpen(true)
            inputRef.current?.focus()
          }}
          disabled={disabled}
          aria-label="Toggle node list"
        >
          <Icon
            name="keyboard_arrow_down"
            className={`icon-sm table-combo-chevron ${open ? 'table-combo-chevron--open' : ''}`}
          />
        </button>
      </div>
      {open && (
        <div ref={menuRef} className="table-combo-menu" role="listbox">
          {options.length > 0 ? (
            options.map((n, i) => (
              <button
                type="button"
                key={n}
                role="option"
                aria-selected={n === value}
                className={`table-combo-option${n === value ? ' table-combo-option--selected' : ''}${
                  i === highlight ? ' is-highlighted' : ''
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => select(n)}
                title={optionLabel(n, nodeByName.get(n))}
              >
                <span className="table-combo-option-label">{optionLabel(n, nodeByName.get(n))}</span>
                {n === value && <Icon name="check" className="icon-sm" />}
              </button>
            ))
          ) : (
            <div className="table-combo-empty">
              {nodes.length === 0 ? 'This collector has no nodes yet.' : 'No matching node.'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Alias <-> node mapping rows for a derived-tag expression.
//
// A row reads as [alias badge][bound OPC UA node id][data type][remove]. The node cell is a
// searchable combo whose options are the collector's tag names — the row shows the node id of
// whatever is bound, so the table matches what the OPC UA server is polled for.
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
                <NodeCombo
                  value={name}
                  nodes={nodeNames}
                  nodeByName={nodeByName}
                  missing={missing}
                  disabled={disabled}
                  onChange={(next) => updateNode(idx, next)}
                />
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
