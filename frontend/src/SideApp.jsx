import { useState, useEffect, useRef } from "react";
import Icon from "./components/common/Icon";

const CHANNEL_NAME = "app:neo-opcua-collector";

export default function SideApp() {
    const [ready, setReady] = useState(false);
    const [collectors, setCollectors] = useState([]);
    const [selectedCollectorId, setSelectedCollectorId] = useState(null);
    const channelRef = useRef(null);

    useEffect(() => {
        const ch = new BroadcastChannel(CHANNEL_NAME);
        channelRef.current = ch;

        ch.onmessage = (e) => {
            const msg = e.data;
            if (!msg || !msg.type) return;
            switch (msg.type) {
                case "ready":
                    setReady(true);
                    break;
                case "collectorsData":
                    setCollectors(msg.payload.collectors);
                    break;
                case "collectorSelected":
                    setSelectedCollectorId(msg.payload.collectorId);
                    break;
            }
        };

        ch.postMessage({ type: "requestReady" });
        return () => ch.close();
    }, []);

    const send = (type, payload) => {
        channelRef.current?.postMessage({ type, payload });
    };

    if (!ready) {
        return (
            <div className="side h-screen opacity-50">
                <div className="side-header">
                    <Icon name="sensors" className="text-primary shrink-0" />
                    <span>OPC UA Collector</span>
                </div>
                <p className="px-4 py-3 text-sm text-on-surface-disabled">Loading...</p>
            </div>
        );
    }

    return (
        <div className="side h-screen">
            <div className="side-header">
                <Icon name="sensors" className="text-primary shrink-0" />
                <span className="truncate flex-1">OPC UA Collector</span>
                <button
                    onClick={() => send("navigate", { path: "/collectors/new" })}
                    className="side-header-action"
                    title="New Collector"
                >
                    <Icon name="add" className="icon-sm" />
                </button>
            </div>

            <div className="side-body">
                <div className="side-section-title">Collectors</div>
                <nav className="side-list">
                    {collectors.map((c) => (
                        <div
                            key={c.id}
                            onClick={() => send("selectCollector", { collectorId: c.id })}
                            className={`side-item ${selectedCollectorId === c.id ? "active" : ""}`}
                        >
                            <span className="flex-1 truncate min-w-0">{c.id}</span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    send("toggleCollector", { collectorId: c.id });
                                }}
                                className={`switch shrink-0 ml-1 ${c.status === "running" ? "active" : ""}`}
                            >
                                <div className="switch-thumb" />
                            </button>
                        </div>
                    ))}
                    {collectors.length === 0 && <p className="side-empty">No collectors</p>}
                </nav>
            </div>
        </div>
    );
}
