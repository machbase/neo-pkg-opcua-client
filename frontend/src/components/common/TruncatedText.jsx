import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Truncated text with a hover tooltip carrying the full value.
//
// The shared `.tooltip` class cannot be used inside the detail tables: it is an absolutely
// positioned ::after with `white-space: nowrap`, so within `.detail-table-scroll`
// (`overflow-y: auto`) a long derived expression is both clipped by the scroll box and forced
// onto a single line. A portal + `position: fixed` escapes the scroll container, and the
// tooltip wraps instead of running off screen.
//
// The tooltip only appears when the text is actually cut off — a fully visible cell has
// nothing to reveal.

// Keep in sync with `.cell-tooltip { max-width }` in index.css — used to keep the tooltip
// inside the viewport before it has been measured.
const TOOLTIP_MAX_WIDTH = 420;
const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 4;
// Rough tooltip height used only to decide whether to flip above the cell.
const FLIP_THRESHOLD = 120;

export default function TruncatedText({ text, className = "", placeholder = "–" }) {
    const ref = useRef(null);
    const [anchor, setAnchor] = useState(null);
    const value = text === null || text === undefined || text === "" ? "" : String(text);

    const show = useCallback(() => {
        const el = ref.current;
        if (!el || el.scrollWidth <= el.clientWidth) return;
        const rect = el.getBoundingClientRect();
        const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, window.innerWidth - TOOLTIP_MAX_WIDTH - VIEWPORT_MARGIN));
        const flip = rect.bottom + FLIP_THRESHOLD > window.innerHeight;
        setAnchor({
            left,
            top: flip ? rect.top - ANCHOR_GAP : rect.bottom + ANCHOR_GAP,
            flip,
        });
    }, []);

    const hide = useCallback(() => setAnchor(null), []);

    // The tooltip is fixed while the cell scrolls with the table, so any scroll invalidates
    // its position. Capture phase catches scrolling containers, not just the window.
    useEffect(() => {
        if (!anchor) return undefined;
        window.addEventListener("scroll", hide, true);
        window.addEventListener("resize", hide);
        return () => {
            window.removeEventListener("scroll", hide, true);
            window.removeEventListener("resize", hide);
        };
    }, [anchor, hide]);

    if (!value) return <span className={`cell-truncate ${className}`}>{placeholder}</span>;

    return (
        <>
            <span
                ref={ref}
                className={`cell-truncate ${className}`}
                tabIndex={0}
                onMouseEnter={show}
                onMouseLeave={hide}
                onFocus={show}
                onBlur={hide}
            >
                {value}
            </span>
            {anchor &&
                createPortal(
                    <div
                        role="tooltip"
                        className="cell-tooltip"
                        style={{
                            left: anchor.left,
                            top: anchor.top,
                            transform: anchor.flip ? "translateY(-100%)" : undefined,
                        }}
                    >
                        {value}
                    </div>,
                    document.body
                )}
        </>
    );
}
