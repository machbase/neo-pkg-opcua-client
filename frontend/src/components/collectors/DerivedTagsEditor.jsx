import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../common/Icon'
import { koToEn } from '../../utils/korean'
import VariablesEditor from './VariablesEditor'
import ExpressionInput from './ExpressionInput'
import {
  emptyDerivedTag,
  timeSourceOptions,
  ON_ERROR_OPTIONS,
  ON_ERROR_LABELS,
  EXPRESSION_LIMITS,
  validateDerivedTagLocal,
} from './derivedTag.js'

// Dots are allowed so dotted TAG names ("line1.power") can be authored — same as source nodes.
const cleanTagName = (value) => koToEn(String(value || '')).replace(/[^a-zA-Z0-9_.]/g, '')

// Deep-clone a form-shape derived tag so draft edits never mutate the saved entry.
// Missing fields fall back to emptyDerivedTag() defaults (legacy / partial configs).
function cloneDraft(dt) {
  return {
    ...emptyDerivedTag(),
    ...(dt || {}),
    variables: Array.isArray(dt && dt.variables) ? dt.variables.map((v) => ({ ...v })) : [],
  }
}

// One numbered step: 22px number column + content column.
function Step({ index, title, children }) {
  return (
    <div className="dt-step">
      <span className="dt-step-num">{index}</span>
      <div className="min-w-0">
        <div className="dt-step-title mb-8">{title}</div>
        {children}
      </div>
    </div>
  )
}

export default function DerivedTagsEditor({
  derivedTags = [],
  onChange,
  nodes = [],
  storageMode = 'default',
  timePolicy = 'sourceTime',
  summarizedValueColumn = false,
  tableName = '',
}) {
  const [mode, setMode] = useState('list') // 'list' | 'form'
  const [editingIndex, setEditingIndex] = useState(null) // null = add
  const [draft, setDraft] = useState(emptyDerivedTag())
  const [exprState, setExprState] = useState({ status: 'idle' }) // from ExpressionInput
  const [touched, setTouched] = useState(false)
  const overlayDownRef = useRef(false) // overlay click must start AND end on the overlay

  const nodeNames = useMemo(() => nodes.map((n) => n && n.name).filter(Boolean), [nodes])
  const derivedNames = useMemo(
    () => derivedTags.map((c, i) => (i === editingIndex ? null : c && c.name)).filter(Boolean),
    [derivedTags, editingIndex]
  )

  const local = useMemo(
    () => validateDerivedTagLocal(draft, { nodeNames, derivedNames, summarizedValueColumn }),
    [draft, nodeNames, derivedNames, summarizedValueColumn]
  )

  const requestTime = timePolicy === 'requestTime'
  const atLimit = derivedTags.length >= EXPRESSION_LIMITS.maxDerivedTagsPerCollector
  const canSave = local.ok && exprState && exprState.status === 'ok'
  const open = mode === 'form'

  const closeForm = () => {
    setMode('list')
    setEditingIndex(null)
    setDraft(emptyDerivedTag())
    setExprState({ status: 'idle' })
    setTouched(false)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeForm()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // string-only storage: derived tags are not collected — show only the note.
  if (storageMode === 'string') {
    return (
      <div className="text-xs text-on-surface-tertiary flex items-start gap-6">
        <Icon name="info" className="icon-sm shrink-0 mt-1" />
        <span>Derived tags are not collected in string-only mode.</span>
      </div>
    )
  }

  const patch = (p) => {
    setTouched(true)
    setDraft((d) => ({ ...d, ...p }))
  }

  const openAdd = () => {
    setDraft(emptyDerivedTag())
    setExprState({ status: 'idle' })
    setTouched(false)
    setEditingIndex(null)
    setMode('form')
  }

  const openEdit = (idx) => {
    setDraft(cloneDraft(derivedTags[idx]))
    setExprState({ status: 'idle' })
    setTouched(true) // pre-existing entry: surface any validation issues immediately
    setEditingIndex(idx)
    setMode('form')
  }

  const removeTag = (idx) => {
    onChange(derivedTags.filter((_, i) => i !== idx))
    if (editingIndex === null) return
    if (editingIndex === idx) closeForm()
    else if (idx < editingIndex) setEditingIndex((v) => v - 1)
  }

  const submit = () => {
    if (!canSave) return
    const next = { ...draft, name: cleanTagName(draft.name) }
    if (editingIndex === null) onChange([...derivedTags, next])
    else onChange(derivedTags.map((c, i) => (i === editingIndex ? next : c)))
    closeForm()
  }

  return (
    <div className="space-y-12">
      <div className="flex items-center gap-8 text-sm text-on-surface-tertiary">
        <span>{derivedTags.length} derived tag{derivedTags.length === 1 ? '' : 's'} created</span>
      </div>

      <div>
        <button
          type="button"
          onClick={openAdd}
          disabled={atLimit}
          className="w-full flex items-center justify-center gap-6 py-10 rounded-base border border-dashed border-border text-sm text-on-surface-secondary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon name="add" className="icon-sm" /> New derived tag
        </button>
        {atLimit && (
          <p className="dt-helper mt-4">
            Maximum {EXPRESSION_LIMITS.maxDerivedTagsPerCollector} derived tags reached.
          </p>
        )}
      </div>

      {derivedTags.length > 0 && (
        <table className="table">
          <thead>
            {/* Same columns and wording as the read-only detail view. Casing comes from
                `.table th`, so the labels stay title case here. */}
            <tr>
              <th className="col-head-tag">Tag Name</th>
              <th>Expression</th>
              <th>Variables</th>
              <th>Base Time</th>
              <th>On Error</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {derivedTags.map((dt, i) => {
              const vars = (dt.variables || [])
                .map((v) => `${v.alias}=${v.node}`)
                .join(', ')
              return (
                <tr key={i}>
                  <td className="font-medium">{dt.name}</td>
                  <td className="mono">{dt.expression}</td>
                  <td className="text-on-surface-secondary">{vars || '—'}</td>
                  <td>
                    {requestTime ? (
                      <span
                        className="line-through text-on-surface-tertiary"
                        title="Ignored while the collector stamps rows with the request time"
                      >
                        {dt.timeSource}
                      </span>
                    ) : (
                      dt.timeSource
                    )}
                  </td>
                  <td>
                    {ON_ERROR_LABELS[dt.onError] || dt.onError}
                    {dt.onError === 'value' ? ` (${dt.errorValue})` : ''}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button type="button" className="btn-icon btn-icon-sm" onClick={() => openEdit(i)} title="Edit">
                        <Icon name="edit" className="icon-sm" />
                      </button>
                      <button type="button" className="btn-icon btn-icon-sm" onClick={() => removeTag(i)} title="Delete">
                        <Icon name="delete" className="icon-sm" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {open && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => { overlayDownRef.current = e.target === e.currentTarget }}
          onMouseUp={(e) => {
            // Only a click that both started and ended on the overlay closes the modal —
            // a drag that ends outside must not.
            if (overlayDownRef.current && e.target === e.currentTarget) closeForm()
            overlayDownRef.current = false
          }}
        >
          <div className="modal modal-lg dt-form dt-modal">
            <div className="modal-header">
              <div className="modal-header-title">
                <span className="section-dot" />
                <span className="dt-modal-title">
                  {editingIndex === null ? 'New derived tag' : `Edit ${draft.name || 'derived tag'}`}
                </span>
              </div>
            </div>

            <div className="modal-body">
              <Step index={1} title="Name the tag">
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => patch({ name: cleanTagName(e.target.value) })}
                  className={`w-full ${touched && local.errors.name ? '!border-error' : ''}`}
                  style={{ maxWidth: 340 }}
                  placeholder="e.g. line1.power"
                  autoFocus
                />
                {touched && local.errors.name ? (
                  <p className="text-error text-xs mt-4">{local.errors.name}</p>
                ) : (
                  <p className="dt-helper mt-4">
                    Stored as a TAG in {tableName || 'the collector table'}
                  </p>
                )}
              </Step>

              <hr className="dt-step-divider" />

              <Step index={2} title="Bind OPC UA nodes">
                <VariablesEditor
                  variables={draft.variables}
                  nodes={nodes}
                  onChange={(vs) => patch({ variables: vs })}
                />
                {touched && local.errors.variables && (
                  <p className="text-error text-xs mt-4">{local.errors.variables}</p>
                )}
              </Step>

              <hr className="dt-step-divider" />

              <Step index={3} title="Write the expression">
                <ExpressionInput
                  value={draft.expression}
                  variables={draft.variables}
                  onChange={(s) => patch({ expression: s })}
                  onValidationChange={setExprState}
                />
                {touched && local.errors.expression && (
                  <p className="text-error text-xs mt-4">{local.errors.expression}</p>
                )}
              </Step>

              <hr className="dt-step-divider" />

              <Step index={4} title="Collection options">
                <div className="flex flex-wrap items-start gap-16">
                  <div>
                    <label className="form-label">TIME SOURCE</label>
                    {/* Stays editable under requestTime: the backend keeps the stored value
                        (applyNormalizedDerivedConfig) and only warns that it is unused, so the
                        setting is preserved for whenever the policy goes back to sourceTime. */}
                    <select
                      value={draft.timeSource}
                      onChange={(e) => patch({ timeSource: e.target.value })}
                      style={{ width: 180 }}
                    >
                      {timeSourceOptions(draft).map((opt) => {
                        if (opt === 'latest') {
                          return <option key="latest" value="latest">latest</option>
                        }
                        const v = draft.variables.find((x) => x && x.alias === opt)
                        return (
                          <option key={opt} value={opt}>
                            {v && v.node ? `${opt} = ${v.node}` : opt}
                          </option>
                        )
                      })}
                    </select>
                    {requestTime && (
                      <p className="dt-helper mt-4">
                        Unused while Time policy is requestTime — every row is stamped with the
                        read time. Kept for when the policy returns to sourceTime.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="form-label">ON ERROR</label>
                    <div className="flex items-center gap-8">
                      <select
                        value={draft.onError}
                        onChange={(e) => patch({ onError: e.target.value })}
                        style={{ width: 180 }}
                      >
                        {ON_ERROR_OPTIONS.map((opt) => (
                          <option
                            key={opt}
                            value={opt}
                            disabled={opt === 'null' && summarizedValueColumn}
                          >
                            {ON_ERROR_LABELS[opt] || opt}
                          </option>
                        ))}
                      </select>
                      {draft.onError === 'value' && (
                        <input
                          type="number"
                          step="any"
                          value={draft.errorValue}
                          onChange={(e) => patch({ errorValue: e.target.value })}
                          className={`w-[120px] ${touched && local.errors.errorValue ? '!border-error' : ''}`}
                          placeholder="fallback"
                        />
                      )}
                    </div>
                    {summarizedValueColumn && (
                      <p className="dt-helper mt-4">
                        "write null" is unavailable on a SUMMARIZED value column.
                      </p>
                    )}
                    {touched && local.errors.errorValue && (
                      <p className="text-error text-xs mt-4">{local.errors.errorValue}</p>
                    )}
                  </div>
                </div>
              </Step>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={!canSave} onClick={submit}>
                {editingIndex === null ? 'Add derived tag' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
