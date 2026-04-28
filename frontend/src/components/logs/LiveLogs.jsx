import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "../common/Icon";

const MAX_LINES = 100;
const API_BASE = import.meta.env.VITE_API_BASE ?? "/public/neo-pkg-opcua-client";

const KNOWN_LEVELS = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"];
const LEVEL_RE = new RegExp(`\\[(${KNOWN_LEVELS.join("|")})\\]`);

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

export default function LiveLogs({ collectorId }) {
    const [lines, setLines] = useState([]);
    const [connected, setConnected] = useState(false);
    const [paused, setPaused] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const bodyRef = useRef(null);
    const pausedRef = useRef(paused);
    const stickToBottomRef = useRef(true);

    pausedRef.current = paused;

    useEffect(() => {
        if (!collectorId || !expanded) return undefined;

        setLines([]);
        stickToBottomRef.current = true;

        const append = (text) => {
            if (pausedRef.current) return;
            setLines((prev) => {
                const base = prev.length >= MAX_LINES ? prev.slice(prev.length - MAX_LINES + 1) : prev;
                return [...base, { key: `${Date.now()}-${Math.random()}`, text }];
            });
        };

        const url = `${API_BASE}/cgi-bin/api/log/tail?name=${encodeURIComponent(collectorId)}&intervalMs=500`;
        const es = new EventSource(url);
        const onLine = (e) => append(e.data);

        es.onopen = () => setConnected(true);
        es.addEventListener("line", onLine);
        es.onerror = () => setConnected(false);

        return () => {
            es.removeEventListener("line", onLine);
            es.close();
            setConnected(false);
        };
    }, [collectorId, expanded]);

    useLayoutEffect(() => {
        const el = bodyRef.current;
        if (!el || !stickToBottomRef.current) return;
        el.scrollTop = el.scrollHeight;
    }, [lines]);

    const handleScroll = () => {
        const el = bodyRef.current;
        if (!el) return;
        stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 5;
    };

    return (
        <section className="form-card live-logs-card collapse-card">
            <button
                type="button"
                className="collapse-card-header"
                onClick={() => setExpanded((v) => !v)}
            >
                <div className="flex items-center gap-12">
                    <div className="flex items-center gap-8">
                        <Icon name="terminal" className="text-primary" />
                        <span className="collapse-card-summary">LIVE LOGS</span>
                    </div>
                    {expanded && (
                        <>
                            <span
                                className={`repl-dot ${connected ? "repl-dot--active" : "repl-dot--stopped"}`}
                            />
                            <span className="live-logs-meta">
                                {connected ? "CONNECTED" : "DISCONNECTED"}
                            </span>
                        </>
                    )}
                </div>
                <Icon
                    name="keyboard_arrow_down"
                    className={`collapse-card-toggle ${expanded ? "collapse-card-toggle--open" : ""}`}
                />
            </button>
            {expanded && (
                <>
                    <div
                        className="live-logs-header"
                        style={{ borderTop: "1px solid var(--color-border)" }}
                    >
                        <span className="live-logs-meta">
                            {lines.length}/{MAX_LINES}
                        </span>
                        <div className="flex gap-8">
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
                        </div>
                    </div>
                    <div ref={bodyRef} onScroll={handleScroll} className="live-logs-body">
                        {lines.length === 0 ? (
                            <div className="live-logs-empty">Waiting for logs...</div>
                        ) : (
                            lines.map((line) => <div key={line.key}>{renderLine(line.text)}</div>)
                        )}
                    </div>
                </>
            )}
        </section>
    );
}
