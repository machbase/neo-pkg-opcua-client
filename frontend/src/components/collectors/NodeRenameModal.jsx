import { useState, useEffect, useMemo } from 'react'
import Icon from '../common/Icon'
import { koToEn } from '../../utils/korean'
import { NAME_PATTERN } from './tagName'
import {
  maskLastSegment,
  maskCommonPrefix,
  maskTrimChained,
  nameFromMask,
  commonPrefixLength,
  commonPrefixApplicable,
} from './renameRules.js'

const cleanTagName = (value) => koToEn(String(value || '')).replace(/[^a-zA-Z0-9_]/g, '')

function pathOf(item) {
  return item.treePath && item.treePath.length ? item.treePath : [item.originalName || item.nodeId || '']
}

// Breadcrumb with struck-through (removed) vs kept segments; last segment bold.
function Breadcrumb({ treePath, mask }) {
  const last = treePath.length - 1
  return (
    <span className="inline-flex flex-wrap items-center gap-4 text-sm min-w-0">
      {treePath.map((seg, i) => (
        <span key={i} className="inline-flex items-center gap-4">
          {i > 0 && <span className="text-on-surface-disabled">›</span>}
          <span
            className={
              mask[i]
                ? 'line-through text-on-surface-disabled'
                : i === last
                  ? 'font-semibold text-on-surface'
                  : 'text-on-surface-secondary'
            }
          >
            {seg}
          </span>
        </span>
      ))}
      <span className="badge badge-muted badge-xs">depth {treePath.length}</span>
    </span>
  )
}

// Preview of a rule: original breadcrumb (removed segments struck) → resulting name.
function RulePreview({ treePath, mask }) {
  return (
    <div className="flex flex-wrap items-center gap-8 mb-8">
      <Breadcrumb treePath={treePath} mask={mask} />
      <Icon name="arrow_forward" className="icon-sm text-on-surface-tertiary" />
      <span className="font-medium text-sm">{nameFromMask(treePath, mask) || '(empty)'}</span>
    </div>
  )
}

export default function NodeRenameModal({ items = [], allNodeNames = [], derivedNames = [], onApply, onClose }) {
  const initialRows = useMemo(
    () =>
      items.map((it) => {
        const treePath = pathOf(it)
        return { nodeIdx: it.nodeIdx, treePath, originalName: it.originalName || '', name: it.originalName || '', mask: treePath.map(() => false) }
      }),
    [items]
  )
  const [rows, setRows] = useState(initialRows)
  const [panel, setPanel] = useState(null) // 'numbering' | 'trim' | null
  const [prefix, setPrefix] = useState('tag')
  const [trim, setTrim] = useState({ fromStart: 1, countStart: 0, fromEnd: 1, countEnd: 0 })
  const [errors, setErrors] = useState({})

  useEffect(() => setRows(initialRows), [initialRows])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const treePaths = useMemo(() => rows.map((r) => r.treePath), [rows])
  const prefixApplicable = commonPrefixApplicable(treePaths)
  const changedCount = rows.filter((r) => r.name !== r.originalName).length
  const invalidCount = Object.keys(errors).length

  const applyMasks = (maskFn) => {
    setRows((prev) => prev.map((r) => {
      const mask = maskFn(r.treePath)
      return { ...r, mask, name: nameFromMask(r.treePath, mask) }
    }))
    setErrors({})
  }

  const applyFullPath = () => { setPanel(null); applyMasks((p) => p.map(() => false)) }
  const applyLast = () => { setPanel(null); applyMasks((p) => maskLastSegment(p)) }
  const applyPrefix = () => {
    if (!prefixApplicable) return
    const n = commonPrefixLength(treePaths)
    setPanel(null)
    applyMasks((p) => maskCommonPrefix(p, n))
  }
  const applyNumberingNow = () => {
    setRows((prev) => prev.map((r, i) => ({ ...r, mask: r.treePath.map(() => false), name: `${prefix || 'tag'}_${i + 1}` })))
    setErrors({})
  }
  // Trim chains: each Apply cuts further into the previous result (accumulates on the mask).
  const applyTrimNow = () => {
    setRows((prev) => prev.map((r) => {
      const mask = maskTrimChained(r.treePath, r.mask, trim)
      return { ...r, mask, name: nameFromMask(r.treePath, mask) }
    }))
    setErrors({})
  }

  const resetAll = () => {
    setRows((prev) => prev.map((r) => ({ ...r, mask: r.treePath.map(() => false), name: r.originalName })))
    setPanel(null)
    setErrors({})
  }
  const resetRow = (idx) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, mask: r.treePath.map(() => false), name: r.originalName } : r)))
  }
  const editName = (idx, value) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, name: cleanTagName(value) } : r)))
  }

  const save = () => {
    const nextErrors = {}
    const seen = new Set(allNodeNames)
    const derived = new Set(derivedNames)
    const withinBatch = new Set()
    rows.forEach((r, i) => {
      const name = r.name
      if (!name) nextErrors[i] = 'Enter a name.'
      else if (!NAME_PATTERN.test(name)) nextErrors[i] = 'Letters, digits, underscores only; cannot start with a digit.'
      else if (seen.has(name)) nextErrors[i] = `'${name}' conflicts with another node.`
      else if (derived.has(name)) nextErrors[i] = `'${name}' conflicts with a derived tag.`
      else if (withinBatch.has(name)) nextErrors[i] = `'${name}' is duplicated in this list.`
      withinBatch.add(name)
    })
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }
    onApply(rows.map((r) => ({ nodeIdx: r.nodeIdx, name: r.name })))
    onClose()
  }

  const ruleBtn = (label, onClick, { disabled = false, active = false } = {}) => (
    <button
      type="button"
      className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  )

  const numField = (key, label) => (
    <label className="flex items-center gap-6 text-sm">
      <span className="text-on-surface-secondary">{label}</span>
      <input
        type="number"
        min="0"
        value={trim[key]}
        onChange={(e) => setTrim((t) => ({ ...t, [key]: Math.max(0, Number(e.target.value) || 0) }))}
        className="w-[64px]"
      />
    </label>
  )

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-lg" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-title">
            <Icon name="edit" className="text-primary" />
            Rename tags
            <span className="badge badge-primary ml-8">{rows.length} selected</span>
          </div>
          <button type="button" className="p-4 hover:bg-surface-hover rounded-base tooltip" data-tooltip="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        <div className="modal-body">
          <div className="flex items-center justify-between mb-8">
            <span className="text-sm text-on-surface-tertiary">Apply to all selected</span>
            <button type="button" className="btn btn-sm btn-secondary" onClick={resetAll}>
              <Icon name="restart_alt" className="icon-sm" /> Reset all
            </button>
          </div>

          <div className="flex flex-wrap gap-6 mb-8">
            {ruleBtn('Use full path', () => setPanel(panel === 'fullPath' ? null : 'fullPath'), { active: panel === 'fullPath' })}
            {ruleBtn('Use last segment', () => setPanel(panel === 'lastSegment' ? null : 'lastSegment'), { active: panel === 'lastSegment' })}
            {ruleBtn('Remove common prefix', () => setPanel(panel === 'removeCommonPrefix' ? null : 'removeCommonPrefix'), { disabled: !prefixApplicable, active: panel === 'removeCommonPrefix' })}
            {ruleBtn('Number sequence', () => setPanel(panel === 'numbering' ? null : 'numbering'), { active: panel === 'numbering' })}
            {ruleBtn('Trim segments', () => setPanel(panel === 'trim' ? null : 'trim'), { active: panel === 'trim' })}
          </div>

          {panel === 'fullPath' && (
            <div className="rename-panel">
              <div className="text-sm text-on-surface-secondary mb-8">Restores the complete path name — nothing is removed. Use this to start over from the full path after an earlier rename.</div>
              {rows[0] && <RulePreview treePath={rows[0].treePath} mask={rows[0].treePath.map(() => false)} />}
              <div className="flex justify-end">
                <button type="button" className="btn btn-sm btn-primary" onClick={applyFullPath}>Apply</button>
              </div>
            </div>
          )}

          {panel === 'lastSegment' && (
            <div className="rename-panel">
              <div className="text-sm text-on-surface-secondary mb-8">Keeps only each node's last path segment (the unique identifier).</div>
              {rows[0] && <RulePreview treePath={rows[0].treePath} mask={maskLastSegment(rows[0].treePath)} />}
              {rows.length > 1 && <div className="text-xs text-on-surface-tertiary mb-8">Example based on the first node; each node keeps its own last segment.</div>}
              <div className="flex justify-end">
                <button type="button" className="btn btn-sm btn-primary" onClick={applyLast}>Apply</button>
              </div>
            </div>
          )}

          {panel === 'removeCommonPrefix' && (
            <div className="rename-panel">
              <div className="text-sm text-on-surface-secondary mb-8">
                Removes the {commonPrefixLength(treePaths)}-segment prefix shared by all selected nodes.
              </div>
              {rows[0] && <RulePreview treePath={rows[0].treePath} mask={maskCommonPrefix(rows[0].treePath, commonPrefixLength(treePaths))} />}
              <div className="flex justify-end">
                <button type="button" className="btn btn-sm btn-primary" onClick={applyPrefix}>Apply</button>
              </div>
            </div>
          )}

          {panel === 'numbering' && (
            <div className="rename-panel flex items-center gap-8">
              <label className="flex items-center gap-6 text-sm">
                <span className="text-on-surface-secondary">Prefix</span>
                <input type="text" value={prefix} onChange={(e) => setPrefix(cleanTagName(e.target.value))} className="w-[140px]" />
              </label>
              <button type="button" className="btn btn-sm btn-primary ml-auto" onClick={applyNumberingNow}>Apply</button>
            </div>
          )}

          {panel === 'trim' && (
            <div className="rename-panel">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
                <div>
                  <div className="text-sm text-on-surface-secondary mb-6">Remove from front</div>
                  <div className="flex items-center gap-6">{numField('fromStart', 'from #')}{numField('countStart', 'count')}</div>
                </div>
                <div>
                  <div className="text-sm text-on-surface-secondary mb-6">Remove from end (except last)</div>
                  <div className="flex items-center gap-6">{numField('fromEnd', 'from #')}{numField('countEnd', 'count')}</div>
                </div>
              </div>
              <div className="flex justify-end mt-8">
                <button type="button" className="btn btn-sm btn-primary" onClick={applyTrimNow}>Apply</button>
              </div>
            </div>
          )}

          <div className="flex items-start gap-6 text-xs text-on-surface-tertiary mb-12">
            <Icon name="info" className="icon-sm shrink-0" />
            <span>
              The last segment (unique identifier) is always preserved
              {!prefixApplicable && ' · selected nodes share no common parent path, so prefix removal is unavailable'}
            </span>
          </div>

          <div className="space-y-12">
            {rows.map((r, i) => {
              const modified = r.name !== r.originalName || r.mask.some(Boolean)
              return (
                <div key={r.nodeIdx}>
                  {/* min-w-0 lets a long breadcrumb wrap instead of widening the row and
                      forcing a horizontal scrollbar on .modal-body. */}
                  <div className="flex items-center gap-8 mb-4 min-w-0">
                    <Breadcrumb treePath={r.treePath} mask={r.mask} />
                    {modified && <span className="badge badge-primary badge-xs shrink-0">modified</span>}
                    {/* Native title, not .tooltip: that pseudo-element is absolutely positioned
                        and centred, so on a right-edge button it sticks out past .modal-body and
                        gives the scroll container a horizontal scrollbar. */}
                    {modified && (
                      <button
                        type="button"
                        className="btn-icon btn-icon-sm ml-auto shrink-0"
                        title="Revert to original"
                        onClick={() => resetRow(i)}
                      >
                        <Icon name="restart_alt" className="icon-sm" />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={r.name}
                    onChange={(e) => editName(i, e.target.value)}
                    className={`w-full ${errors[i] ? 'border-error' : ''}`}
                  />
                  {errors[i] && <p className="text-xs text-error mt-4">{errors[i]}</p>}
                </div>
              )
            })}
          </div>
        </div>

        <div className="modal-footer">
          {/* Counts reflect the current preview; names are validated on save, so the invalid
              count only appears after a save attempt found problems. */}
          <span className="rename-status">
            {changedCount} of {rows.length} tag{rows.length === 1 ? '' : 's'} will be renamed
            {invalidCount > 0 && <span className="text-error"> · {invalidCount} invalid name{invalidCount === 1 ? '' : 's'}</span>}
          </span>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save all</button>
        </div>
      </div>
    </div>
  )
}
