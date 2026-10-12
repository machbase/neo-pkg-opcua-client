import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VscCheck, VscChevronDown, VscChevronUp, VscClose, VscCopy, VscError } from './JsonKeyIcons';
import Modal from './JsonKeyModal';
import DataViewerModalPortal from './DataViewerModalPortal';
import useModalDialog from '../../hooks/useModalDialog';
// Same row-inspector behavior as neo-web PR #737: read-only fields, copy and row navigation.
const COPY_HINT_MS = 1600;
/** How far one arrow press rolls the body. Sized to what a reader's eye follows, not to a row. */
const ARROW_SCROLL_STEP = 80;
/** Pretty-print a value that is a JSON document, or return null when it is not one. */
const prettyJson = (value) => {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('['))
        return null;
    try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
    }
    catch {
        return null;
    }
};
/**
 * Arrow keys move between rows — except inside a text entry, where they belong to the caret.
 *
 * There is no input in this modal today. The guard is here because the day a search box or an
 * editable field is added, row navigation would silently start stealing the caret.
 */
const isTextEntry = (element) => {
    const node = element;
    if (!node || !node.tagName)
        return false;
    const tag = node.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable === true;
};
/**
 * Put the value on the clipboard, and say whether it got there.
 *
 * `navigator.clipboard` exists only in a secure context and refuses even then when the document is
 * not focused — `NotAllowedError: Document is not focused`. Swallowing that rejection is what makes
 * the button look like it does nothing, which is exactly what it did. The deprecated path is tried
 * next, and a failure is reported rather than hidden.
 */
const writeClipboard = async (text, host) => {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        }
        catch {
            /* not focused, or permission denied — fall through */
        }
    }
    try {
        const area = document.createElement('textarea');
        area.value = text;
        // Pushed off screen rather than hidden: `display: none` cannot be selected, and an
        // unselectable textarea cannot be copied from.
        area.setAttribute('readonly', '');
        area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
        const parent = host ?? document.body;
        const restore = document.activeElement;
        parent.appendChild(area);
        let ok = false;
        try {
            area.select();
            ok = document.execCommand('copy');
        }
        finally {
            // Removed in `finally`: `execCommand` is deprecated and throws outright in some
            // environments, and a textarea left behind holds focus inside the dialog.
            area.remove();
            if (restore?.isConnected)
                restore.focus({ preventScroll: true });
        }
        return ok;
    }
    catch {
        return false;
    }
};
export const RawRowDetailModal = ({ title, position, subtitle, fields, hasPrevious, hasNext, onPrevious, onNext, onClose, }) => {
    // A drag that began inside and ended past the edge is still that gesture, not a click
    // outside — see `useOutsideCloseGuard`.
    const closeOnOutside = onClose;
    const [copied, setCopied] = useState(null);
    const copyTimer = useRef(0);
    const headRef = useRef(null);
    const bodyRef = useRef(null);
    const dialogOf = () => headRef.current?.closest('.modal');
    // Names the dialog, puts focus in it and keeps Tab inside. This behaviour was written here
    // first; the picker and the detail view needed the same, so it lives in the hook now.
    const dialogRef = useModalDialog(`Row detail — ${title}`);
    useEffect(() => () => window.clearTimeout(copyTimer.current), []);
    const copy = useCallback((key, label, text) => {
        writeClipboard(text, dialogOf()).then((ok) => {
            window.clearTimeout(copyTimer.current);
            setCopied({ key, label, ok });
            copyTimer.current = window.setTimeout(() => setCopied(null), COPY_HINT_MS);
        });
    }, []);
    /**
     * Arrows scroll what is on screen first, and only move rows once there is nothing left to
     * scroll — the order anything inside a scrolling box is expected to follow. Taking them
     * unconditionally makes a long payload unreadable: the view jumps to another row instead of
     * showing the rest of this one.
     */
    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
                return;
            if (isTextEntry(event.target))
                return;
            const down = event.key === 'ArrowDown';
            const body = bodyRef.current;
            if (body) {
                // The -1 absorbs device-pixel rounding. A body that does not scroll has
                // `scrollHeight === clientHeight`, so this is false and the row moves instead.
                const room = down ? body.scrollTop + body.clientHeight < body.scrollHeight - 1 : body.scrollTop > 0;
                if (room) {
                    // With focus inside the body the browser scrolls it already. The case that
                    // needs help is the default one: on open, focus sits on the dialog, which is
                    // the body's *parent*, and the browser will not scroll a child for it.
                    if (body.contains(event.target))
                        return;
                    event.preventDefault();
                    body.scrollBy({ top: down ? ARROW_SCROLL_STEP : -ARROW_SCROLL_STEP });
                    return;
                }
            }
            if (down ? hasNext : hasPrevious) {
                event.preventDefault();
                if (down)
                    onNext();
                else
                    onPrevious();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [hasNext, hasPrevious, onNext, onPrevious]);
    // A new row is a new set of values, so a copy hint from the previous one has to go — and the
    // body is the same DOM node between rows, so its scroll offset would otherwise carry over and
    // open the next row halfway down, with its first field off screen.
    useEffect(() => {
        window.clearTimeout(copyTimer.current);
        setCopied(null);
        // Assigning rather than `scrollTo`: the jump is instant either way, and the property is
        // there in every environment the tests run in.
        if (bodyRef.current)
            bodyRef.current.scrollTop = 0;
    }, [position, title]);
    const readable = useMemo(() => fields.map((field) => {
        const empty = field.value === null || field.value === undefined || field.value === '';
        const text = empty ? '' : String(field.value);
        return { ...field, empty, text, json: prettyJson(text) };
    }), [fields]);
    const rowJson = useMemo(() => JSON.stringify(Object.fromEntries(readable.map((field) => [field.label, field.empty ? null : field.text])), null, 2), [readable]);
    const copyIcon = (key) => {
        if (copied?.key !== key)
            return <VscCopy />;
        return copied.ok ? <VscCheck /> : <VscError />;
    };
    return (<DataViewerModalPortal>
            {/* `modal-header` / `modal-body` / `modal-footer` are the page's own modal parts
            (DataViewerPage.scss); the chrome comes from there rather than from a second set of
            rules. */}
            <Modal pIsDarkMode className="raw-row-modal modal-md" onOutSideClose={closeOnOutside}>
                <div className="modal-header raw-row-modal-header" ref={headRef}>
                    <div className="raw-row-modal-head">
                        <div className="raw-row-modal-crumbs">
                            {subtitle ? <span className="raw-row-modal-chip">{subtitle}</span> : null}
                            {position ? <span className="raw-row-modal-position">{position}</span> : null}
                        </div>
                        <div className="raw-row-modal-nav">
                            <button type="button" onClick={onPrevious} disabled={!hasPrevious} title="Previous row (↑)" aria-label="Previous row">
                                <VscChevronUp />
                            </button>
                            <button type="button" onClick={onNext} disabled={!hasNext} title="Next row (↓)" aria-label="Next row">
                                <VscChevronDown />
                            </button>
                            <span className="raw-row-modal-divider"/>
                            <button type="button" onClick={onClose} title="Close (Esc)" aria-label="Close">
                                <VscClose />
                            </button>
                        </div>
                    </div>
                    <div className="raw-row-modal-title" title={title}>
                        {title}
                    </div>
                </div>

                <div className="modal-body raw-row-modal-body" ref={dialogRef}>
                    <div className="raw-row-modal-fields" ref={bodyRef}>
                        {readable.map((field) => (<div key={field.key} className="raw-row-modal-field">
                                <div className="raw-row-modal-label">
                                    <span>{field.label}</span>
                                    {field.typeLabel ? <span className="raw-row-modal-type">{field.typeLabel}</span> : null}
                                </div>

                                {/* An empty box cannot say whether the value was NULL or blank, so
                the absence is written out. */}
                                <div className={`raw-row-modal-value${field.empty ? ' is-null' : ''}`}>
                                    {field.empty ? 'NULL' : field.json ? <pre className="raw-row-modal-json">{field.json}</pre> : field.text}
                                </div>

                                <button type="button" className={`raw-row-modal-copy${copied?.key === field.key ? (copied.ok ? ' is-copied' : ' is-failed') : ''}`} onClick={() => copy(field.key, field.label, field.text)} aria-label={`Copy ${field.label}`} title={`Copy ${field.label}`}>
                                    {copyIcon(field.key)}
                                </button>
                            </div>))}
                    </div>
                </div>

                <div className="modal-footer raw-row-modal-foot">
                    {/* A toast per copy would shake the page on every value read; it is said here. */}
                    <span className="raw-row-modal-hint">
                        {copied
            ? `${copied.label} ${copied.ok ? 'copied' : 'copy failed — select the value manually'}`
            : '↑ ↓ to move between rows · Esc to close'}
                    </span>
                    <div className="raw-row-modal-actions">
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => copy('__row', 'JSON', rowJson)}>
                            {copied?.key === '__row' ? (copied.ok ? 'Copied' : 'Failed') : 'Copy JSON'}
                        </button>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </div>
            </Modal>
        </DataViewerModalPortal>);
};
export default RawRowDetailModal;
