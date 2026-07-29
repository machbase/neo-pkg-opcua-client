import { useState, useEffect, useRef, useMemo } from 'react'
import Icon from '../common/Icon'
import {
  SUPPORTED_FUNCTIONS,
  SUPPORTED_CONSTANTS,
  EXPRESSION_LIMITS,
  extractAliases,
} from './derivedTag.js'
import { validateExpression } from '../../api/collectors'
import { ApiError } from '../../api/client'

// String expression editor: an editable, syntax-coloured single-line surface + an insert
// palette (functions and constants) + a debounced backend-validated banner.
//
// Grammar validity is authoritative on the backend — this component never parses the grammar,
// it only colours variables/numbers and counts declared aliases. No live values are shown:
// at authoring time the bound nodes have not been read yet.
//
// Props:
//   value:              expression string
//   onChange(next):     emit the next expression string
//   variables:          [{ alias, node }]  — declared aliases + their node map
//   onValidationChange(state): { status:'idle'|'checking'|'ok'|'error', error, data }

const MAX_LEN = EXPRESSION_LIMITS.maxExpressionLength

// Keep focus in the editor when a palette button is pressed, so the caret is preserved.
const preventBlur = (e) => e.preventDefault()

// Display tokens only: <CONST>, single-letter aliases, numbers (incl. exponent form).
const TOKEN_RE = /<[A-Za-z][A-Za-z0-9]*>|[A-Z]|(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/g

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }
const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ESCAPES[c])

// Variables render in the accent colour, numeric literals (and the numeric constants
// <PI>/<E>) in the success colour. Everything else stays default text.
function highlightHtml(text) {
  let out = ''
  let last = 0
  let m
  TOKEN_RE.lastIndex = 0
  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) out += escapeHtml(text.slice(last, m.index))
    const token = m[0]
    const cls = /^[A-Z]$/.test(token) ? 'expr-tok-var' : 'expr-tok-num'
    out += `<span class="${cls}">${escapeHtml(token)}</span>`
    last = m.index + token.length
  }
  out += escapeHtml(text.slice(last))
  return out
}

// Caret position as a plain-text offset from the start of the editor, or null when the
// selection is elsewhere.
function readCaret(el) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!el.contains(range.startContainer)) return null
  const probe = range.cloneRange()
  probe.selectNodeContents(el)
  probe.setEnd(range.startContainer, range.startOffset)
  return probe.toString().length
}

// Place the caret at a plain-text offset, walking the re-rendered token spans.
function writeCaret(el, offset) {
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null)
  let remaining = offset
  let node = walker.nextNode()
  while (node) {
    const len = node.textContent.length
    if (remaining <= len) {
      range.setStart(node, remaining)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
      return
    }
    remaining -= len
    node = walker.nextNode()
  }
  range.selectNodeContents(el)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

export default function ExpressionInput({ value, onChange, variables = [], onValidationChange }) {
  const editorRef = useRef(null)
  const caretRef = useRef(null) // last known caret as a plain-text offset
  const composingRef = useRef(false) // IME composition in flight — do not touch the DOM

  const [status, setStatus] = useState('idle') // 'idle' | 'checking' | 'ok' | 'error'
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const expr = value == null ? '' : String(value)

  // Stable identity for the declared variable map so the validation effect only re-runs on a
  // real content change (parents may hand us a fresh `variables` array every render).
  const variablesKey = useMemo(
    () => JSON.stringify((variables || []).map((v) => [v && v.alias, v && v.node])),
    [variables]
  )
  // Aliases offered as insert chips. Alias-less rows can't be referenced, so they are skipped.
  const declaredVariables = useMemo(
    () => (variables || []).filter((v) => v && v.alias),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [variablesKey]
  )

  const variablesMap = useMemo(() => {
    const map = {}
    for (const v of variables || []) {
      if (v && v.alias && v.node != null && String(v.node).trim() !== '') {
        map[v.alias] = String(v.node).trim()
      }
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variablesKey])

  // ── editable surface ────────────────────────────────────────────────────────────
  // Re-render the highlighted markup and put the caret back where the user left it.
  const syncDom = (text) => {
    const el = editorRef.current
    if (!el || composingRef.current) return
    const html = highlightHtml(text)
    if (el.innerHTML === html) return
    const focused = document.activeElement === el
    el.innerHTML = html
    if (focused && caretRef.current != null) {
      writeCaret(el, Math.min(caretRef.current, text.length))
    }
  }

  useEffect(() => {
    syncDom(expr)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expr])

  const handleInput = () => {
    const el = editorRef.current
    if (!el || composingRef.current) return
    let text = el.textContent.replace(/[\r\n]/g, '') // single-line expression
    if (text.length > MAX_LEN) text = text.slice(0, MAX_LEN) // hard cap: block extra input
    const offset = readCaret(el)
    caretRef.current = offset == null ? text.length : Math.min(offset, text.length)
    // A clamped or no-op edit leaves `value` unchanged, so the sync effect will not fire —
    // repaint the surface here instead.
    if (text === expr) syncDom(text)
    else onChange(text)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') e.preventDefault()
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const text = (e.clipboardData && e.clipboardData.getData('text/plain')) || ''
    insertAtCaret(text.replace(/[\r\n]+/g, ' '))
  }

  const insertAtCaret = (text, caretOffset) => {
    const el = editorRef.current
    let start = expr.length
    if (el && document.activeElement === el) {
      const offset = readCaret(el)
      if (offset != null) start = offset
    } else if (caretRef.current != null) {
      start = Math.min(caretRef.current, expr.length)
    }
    const next = expr.slice(0, start) + text + expr.slice(start)
    if (next.length > MAX_LEN) return // refuse rather than truncate the inserted token
    caretRef.current = start + (caretOffset == null ? text.length : caretOffset)
    if (el) el.focus()
    if (next === expr) syncDom(next)
    else onChange(next)
  }

  // ── debounced backend validation ────────────────────────────────────────────────
  useEffect(() => {
    const hasVars = Object.keys(variablesMap).length > 0
    if (!expr.trim() || !hasVars) {
      setStatus('idle')
      setError(null)
      setData(null)
      return
    }

    setStatus('checking')
    setError(null)

    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const result = await validateExpression({ expression: expr, variables: variablesMap })
        if (cancelled) return
        setStatus('ok')
        setError(null)
        setData(result)
      } catch (e) {
        if (cancelled) return
        setStatus('error')
        setError(e instanceof ApiError ? e.reason : (e && e.message) || 'Validation failed')
        setData(null)
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [expr, variablesMap])

  // Report validation state to the parent whenever it changes.
  useEffect(() => {
    if (onValidationChange) onValidationChange({ status, error, data })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, error, data])

  const usedCount =
    data && Array.isArray(data.usedVariables)
      ? data.usedVariables.length
      : extractAliases(expr).length

  return (
    <div className="space-y-8">
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Expression"
        spellCheck={false}
        data-placeholder="e.g. (A * B) / 1000"
        className={`expr-editor${status === 'error' ? ' is-error' : ''}`}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCompositionStart={() => { composingRef.current = true }}
        onCompositionEnd={() => { composingRef.current = false; handleInput() }}
        onBlur={() => { const el = editorRef.current; if (el) caretRef.current = readCaret(el) ?? caretRef.current }}
      />

      {/* Insert palette — bound nodes first (the tokens actually written by hand most often),
          then every supported function and constant, no folding */}
      <div className="expr-palette">
        {declaredVariables.length > 0 && (
          <>
            <div className="expr-palette-row">
              {declaredVariables.map((v) => (
                <button
                  key={v.alias}
                  type="button"
                  className="expr-chip expr-chip-var"
                  onMouseDown={preventBlur}
                  onClick={() => insertAtCaret(v.alias)}
                  title={v.node ? `Insert ${v.alias} — ${v.node}` : `Insert ${v.alias} — no node bound`}
                >
                  {v.alias}
                  {v.node ? (
                    <span className="expr-chip-var-node">{v.node}</span>
                  ) : (
                    <span className="expr-chip-var-missing">unbound</span>
                  )}
                </button>
              ))}
            </div>
            <div className="expr-palette-divider" />
          </>
        )}
        <div className="expr-palette-row">
        {SUPPORTED_FUNCTIONS.map((fn) => (
          <button
            key={fn}
            type="button"
            className="expr-chip"
            onMouseDown={preventBlur}
            onClick={() => insertAtCaret(`${fn}()`, fn.length + 1)}
            title={`Insert ${fn}()`}
          >
            {fn}
          </button>
        ))}
        {SUPPORTED_CONSTANTS.map((c) => (
          <button
            key={c}
            type="button"
            className="expr-chip"
            onMouseDown={preventBlur}
            onClick={() => insertAtCaret(`<${c}>`)}
            title={`Insert <${c}>`}
          >
            {c}
          </button>
        ))}
        </div>
      </div>

      {/* Validation banner — syntax and variable binding only, never a computed value */}
      {status === 'ok' && (
        <div className="expr-banner expr-banner-ok">
          <Icon name="check_circle" className="icon-sm shrink-0" />
          <span>
            Valid expression · {usedCount} variable{usedCount === 1 ? '' : 's'} referenced
          </span>
        </div>
      )}
      {status === 'error' && (
        <div className="expr-banner expr-banner-error">
          <Icon name="warning" className="icon-sm shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {status === 'checking' && (
        <div className="expr-banner expr-banner-muted">
          <Icon name="hourglass_empty" className="icon-sm shrink-0" />
          <span>Checking…</span>
        </div>
      )}
      {status === 'idle' && (
        <div className="expr-banner expr-banner-muted">
          <Icon name="info" className="icon-sm shrink-0" />
          <span>Bind at least one node and write an expression to validate.</span>
        </div>
      )}
    </div>
  )
}
