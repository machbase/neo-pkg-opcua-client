import { useEffect, useRef } from "react";
import useCollectors from "./hooks/useCollectors";
import { useApp } from "./context/AppContext";
import Sidebar from "./components/layout/Sidebar";

const CHANNEL_NAME = "app:neo-opcua-collector";

export default function SideApp() {
    const { collectors, toggleCollector, installCollector, refreshCollectors } = useCollectors();
    const { selectedCollectorId, setSelectedCollectorId } = useApp();
    const channelRef = useRef(null);

    useEffect(() => {
        const ch = new BroadcastChannel(CHANNEL_NAME);
        channelRef.current = ch;
        return () => ch.close();
    }, []);

    const send = (type, payload) => {
        channelRef.current?.postMessage({ type, payload });
    };

    return (
        <Sidebar
            collectors={collectors}
            selectedCollectorId={selectedCollectorId}
            onSelectCollector={(id) => {
                setSelectedCollectorId(id);
                send("selectCollector", { collectorId: id });
            }}
            onNewCollector={() => {
                setSelectedCollectorId(null);
                send("navigate", { path: "/collectors/new" });
            }}
            onToggleCollector={toggleCollector}
            onInstallCollector={installCollector}
            onRefresh={refreshCollectors}
            onServerSettings={() => send("openServerSettings", {})}
        />
    );
}
