import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "../common/Icon";

const MAX_LINES = 100;
const API_BASE = import.meta.env.VITE_API_BASE ?? "/public/neo-pkg-opcua-client";

const KNOWN_LEVELS = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"];
const LEVEL_RE = new RegExp(`\\[(${KNOWN_LEVELS.join("|")})\\]`);

const DEFAULT_WIDTH = 460;
const DEFAULT_HEIGHT = 360;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 220;
const VIEWPORT_MARGIN = 24;

function renderLine(text) {
    const match = text.match(LEVEL_RE);
    if (!match) return text;
    const level = match[1];
    const before = text.slice(0, match.index);
    const after = text.slice(match.index + match[0].length);
    return (
        <>
            {before}
            <span className={`log-level-tag level-${level.toLowerCase()}`}>[{level}]</span>
            {after}
        </>
    );
}

function clampSize(width, height) {
    if (typeof window === "undefined") return { width, height };
    const maxW = Math.max(MIN_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
    const maxH = Math.max(MIN_HEIGHT, window.innerHeight - VIEWPORT_MARGIN * 2);
    return {
        width: Math.min(Math.max(MIN_WIDTH, width), maxW),
        height: Math.min(Math.max(MIN_HEIGHT, height), maxH),
    };
}

function defaultPosition(size) {
    if (typeof window === "undefined") return { x: VIEWPORT_MARGIN, y: VIEWPORT_MARGIN };
    return {
        x: Math.max(VIEWPORT_MARGIN, window.innerWidth - size.width - VIEWPORT_MARGIN),
        y: Math.max(VIEWPORT_MARGIN, window.innerHeight - size.height - VIEWPORT_MARGIN),
    };
}

export default function LiveLogs({ collectorId, open, onClose }) {
    const [lines, setLines] = useState([]);
    const [connected, setConnected] = useState(false);
    const [paused, setPaused] = useState(false);
    const [size, setSize] = useState(() => clampSize(DEFAULT_WIDTH, DEFAULT_HEIGHT));
    const [pos, setPos] = useState(() => defaultPosition(clampSize(DEFAULT_WIDTH, DEFAULT_HEIGHT)));
    const panelRef = useRef(null);
    const bodyRef = useRef(null);
    const pausedRef = useRef(paused);
    const stickToBottomRef = useRef(true);
    const dragRef = useRef(null);
    const startDragRef = useRef(() => {});
    const resizeRef = useRef(null);
    const startResizeRef = useRef(() => {});
    const sizeRef = useRef(size);

    pausedRef.current = paused;
    sizeRef.current = size;

    useEffect(() => {
        if (!collectorId || !open) return undefined;

        setLines([]);
        stickToBottomRef.current = true;

        let es = null;
        let retryTimer = null;
        let attempt = 0;
        let stopped = false;

        const append = (text) => {
            if (pausedRef.current) return;
            setLines((prev) => {
                const base = prev.length >= MAX_LINES ? prev.slice(prev.length - MAX_LINES + 1) : prev;
                return [...base, { key: `${Date.now()}-${Math.random()}`, text }];
            });
        };
        // Catch both the named "line" event and unnamed default "message" events.
        const onLine = (e) => {
            attempt = 0;
            append(e.data);
        };

        // Fully tear down the current stream so we never leave a dangling connection.
        const closeStream = () => {
            if (!es) return;
            es.onopen = null;
            es.onmessage = null;
            es.onerror = null;
            es.removeEventListener("line", onLine);
            es.close();
            es = null;
        };

        const url = `${API_BASE}/cgi-bin/api/log/tail?name=${encodeURIComponent(collectorId)}&intervalMs=500`;

        const connect = () => {
            if (stopped) return;
            closeStream();
            es = new EventSource(url);
            es.onopen = () => {
                attempt = 0;
                setConnected(true);
            };
            es.addEventListener("line", onLine);
            es.onmessage = onLine;
            es.onerror = () => {
                setConnected(false);
                // Take over reconnection: closing here disables EventSource's built-in
                // immediate retry (which would spawn a new server stream every ~1.5s and
                // exhaust the SSE/connection limit). Reconnect with capped backoff instead.
                closeStream();
                if (stopped) return;
                attempt += 1;
                const delay = Math.min(1500 * 2 ** (attempt - 1), 15000);
                retryTimer = setTimeout(connect, delay);
            };
        };

        connect();

        return () => {
            stopped = true;
            if (retryTimer) clearTimeout(retryTimer);
            closeStream();
            setConnected(false);
        };
    }, [collectorId, open]);

    // Re-anchor on-screen each time the popup is opened, clamping size to the viewport.
    useEffect(() => {
        if (!open) return;
        const next = clampSize(sizeRef.current.width, sizeRef.current.height);
        setSize(next);
        setPos(defaultPosition(next));
    }, [open]);

    useLayoutEffect(() => {
        const el = bodyRef.current;
        if (!el || !stickToBottomRef.current) return;
        el.scrollTop = el.scrollHeight;
    }, [lines]);

    // Header drag: clamp the panel inside the viewport and clean up listeners on unmount.
    useEffect(() => {
        const onMove = (e) => {
            const drag = dragRef.current;
            const panel = panelRef.current;
            if (!drag || !panel) return;
            const rect = panel.getBoundingClientRect();
            const maxX = Math.max(0, window.innerWidth - rect.width);
            const maxY = Math.max(0, window.innerHeight - rect.height);
            const nextX = Math.min(Math.max(0, e.clientX - drag.offsetX), maxX);
            const nextY = Math.min(Math.max(0, e.clientY - drag.offsetY), maxY);
            setPos({ x: nextX, y: nextY });
        };
        const onUp = () => {
            dragRef.current = null;
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
        startDragRef.current = (e) => {
            // Buttons in the header own their clicks; don't start a drag from them.
            if (e.target.closest("button")) return;
            const panel = panelRef.current;
            if (!panel) return;
            const rect = panel.getBoundingClientRect();
            dragRef.current = { offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
        };
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, []);

    // Edge/corner resize: anchored top-left, clamped to a minimum size and the viewport.
    useEffect(() => {
        const onMove = (e) => {
            const r = resizeRef.current;
            if (!r) return;
            let width = r.startWidth;
            let height = r.startHeight;
            if (r.dir.includes("e")) width = r.startWidth + (e.clientX - r.startX);
            if (r.dir.includes("s")) height = r.startHeight + (e.clientY - r.startY);
            const maxW = Math.max(MIN_WIDTH, window.innerWidth - r.left - VIEWPORT_MARGIN);
            const maxH = Math.max(MIN_HEIGHT, window.innerHeight - r.top - VIEWPORT_MARGIN);
            setSize({
                width: Math.min(Math.max(MIN_WIDTH, width), maxW),
                height: Math.min(Math.max(MIN_HEIGHT, height), maxH),
            });
        };
        const onUp = () => {
            resizeRef.current = null;
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
        startResizeRef.current = (e, dir) => {
            e.preventDefault();
            e.stopPropagation();
            const panel = panelRef.current;
            if (!panel) return;
            const rect = panel.getBoundingClientRect();
            resizeRef.current = {
                dir,
                startX: e.clientX,
                startY: e.clientY,
                startWidth: rect.width,
                startHeight: rect.height,
                left: rect.left,
                top: rect.top,
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
        };
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, []);

    const handleScroll = () => {
        const el = bodyRef.current;
        if (!el) return;
        stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 5;
    };

    if (!open) return null;

    return (
        <section
            ref={panelRef}
            className="live-logs-floating"
            style={{ left: pos.x, top: pos.y, width: size.width, height: size.height }}
        >
            <div className="live-logs-floating-header" onMouseDown={(e) => startDragRef.current(e)}>
                <div className="live-logs-floating-title">
                    <Icon name="terminal" className="text-primary icon-sm" />
                    <span className="live-logs-floating-name">Live Logs</span>
                    <span className={`repl-dot ${connected ? "repl-dot--active" : "repl-dot--stopped"}`} />
                    <span className="live-logs-meta live-logs-floating-status">
                        {connected ? "CONNECTED" : "DISCONNECTED"}
                    </span>
                    <span className="live-logs-meta live-logs-floating-count">
                        {lines.length}/{MAX_LINES}
                    </span>
                </div>
                <div className="flex gap-8 items-center">
                    <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => setPaused((prev) => !prev)}
                    >
                        <Icon name={paused ? "play_arrow" : "pause"} className="icon-sm" />
                        <span>{paused ? "Resume" : "Pause"}</span>
                    </button>
                    <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => setLines([])}
                    >
                        <Icon name="delete_sweep" className="icon-sm" />
                        <span>Clear</span>
                    </button>
                    <button
                        type="button"
                        className="btn btn-sm btn-ghost btn-icon"
                        aria-label="Close live logs"
                        onClick={onClose}
                    >
                        <Icon name="close" className="icon-sm" />
                    </button>
                </div>
            </div>
            <div ref={bodyRef} onScroll={handleScroll} className="live-logs-body">
                {lines.length === 0 ? (
                    <div className="live-logs-empty">Waiting for logs...</div>
                ) : (
                    lines.map((line) => <div key={line.key}>{renderLine(line.text)}</div>)
                )}
            </div>
            <span
                className="live-logs-resize live-logs-resize-e"
                onMouseDown={(e) => startResizeRef.current(e, "e")}
                aria-hidden="true"
            />
            <span
                className="live-logs-resize live-logs-resize-s"
                onMouseDown={(e) => startResizeRef.current(e, "s")}
                aria-hidden="true"
            />
            <span
                className="live-logs-resize live-logs-resize-se"
                onMouseDown={(e) => startResizeRef.current(e, "se")}
                aria-hidden="true"
            />
        </section>
    );
}
